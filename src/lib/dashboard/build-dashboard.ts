import 'server-only';
import Decimal from 'decimal.js';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import {
  providerConnections,
  usageDaily,
  subscriptionLimits,
  pushSubscriptions,
  notificationEvents,
  type Provider,
} from '@/lib/database/schema';
import { getMonthlyBudgetJpy } from '@/lib/budget/monthly-budget';
import { resolveCurrentFxRate, convertUsdToJpy } from '@/lib/currency/resolve';
import { getAppSetting, APP_SETTING_KEYS } from '@/lib/database/app-settings';
import {
  formatTokyoDate,
  tokyoMonthStart,
  tokyoNextMonthStart,
  tokyoYearMonth,
} from '@/lib/date/tokyo';
import type {
  DashboardResponse,
  ProviderUsageCard,
  SubscriptionLimitCard,
  ConnectionStatus,
  LimitWindow,
} from '@/types/dashboard';

const COST_PROVIDERS: Extract<Provider, 'openai' | 'anthropic' | 'gemini'>[] = [
  'openai',
  'anthropic',
  'gemini',
];
const LIMIT_PROVIDERS: Extract<Provider, 'codex' | 'claude-code'>[] = ['codex', 'claude-code'];

const FX_STALE_MS = 3 * 24 * 60 * 60 * 1000;
const GEMINI_BILLING_STALE_MS = 48 * 60 * 60 * 1000;
const SYNC_STALE_MS = 24 * 60 * 60 * 1000;

function dedupeByDate<T extends { usageDate: string; lastSyncedAt: Date }>(rows: T[]): T[] {
  const byDate = new Map<string, T>();
  for (const row of rows) {
    const existing = byDate.get(row.usageDate);
    if (!existing || row.lastSyncedAt > existing.lastSyncedAt) {
      byDate.set(row.usageDate, row);
    }
  }
  return [...byDate.values()];
}

interface SubscriptionFee {
  jpy: number | null;
  original: string | null;
  currency: string | null;
  name: string | null;
}

const NO_SUBSCRIPTION_FEE: SubscriptionFee = {
  jpy: null,
  original: null,
  currency: null,
  name: null,
};

async function getMonthlySubscriptionFee(
  provider: (typeof COST_PROVIDERS)[number],
  usdJpyRate: string | null,
): Promise<SubscriptionFee> {
  if (provider === 'openai') {
    // ChatGPT Plus/Pro billed in JPY.
    const raw = await getAppSetting(APP_SETTING_KEYS.openaiMonthlySubscriptionJpy);
    const value = raw ? Number(raw) : null;
    if (!value || !Number.isFinite(value) || value <= 0) return NO_SUBSCRIPTION_FEE;
    const name = (await getAppSetting(APP_SETTING_KEYS.openaiSubscriptionName)) || 'ChatGPT Plus';
    return { jpy: value, original: String(value), currency: 'JPY', name };
  }
  if (provider === 'anthropic') {
    // Claude Pro/Max billed in USD - convert using the same rate as API costs.
    const raw = await getAppSetting(APP_SETTING_KEYS.anthropicMonthlySubscriptionUsd);
    const value = raw ? Number(raw) : null;
    if (!value || !Number.isFinite(value) || value <= 0) return NO_SUBSCRIPTION_FEE;
    const jpy = usdJpyRate ? Number(convertUsdToJpy(String(value), usdJpyRate)) : null;
    const name = (await getAppSetting(APP_SETTING_KEYS.anthropicSubscriptionName)) || 'Claude Pro';
    return { jpy, original: String(value), currency: 'USD', name };
  }
  return NO_SUBSCRIPTION_FEE; // Gemini has no equivalent flat subscription fee
}

async function getRemainingCreditUsd(
  provider: (typeof COST_PROVIDERS)[number],
): Promise<string | null> {
  const key =
    provider === 'openai'
      ? APP_SETTING_KEYS.openaiRemainingCreditUsd
      : provider === 'anthropic'
        ? APP_SETTING_KEYS.anthropicRemainingCreditUsd
        : APP_SETTING_KEYS.geminiRemainingCreditUsd;
  const raw = await getAppSetting(key);
  if (raw === null || raw.trim() === '') return null;
  try {
    const value = new Decimal(raw);
    return value.isFinite() && value.gte(0) ? value.toString() : null;
  } catch {
    return null;
  }
}

async function getGeminiAiStudioMonthTotalJpy(): Promise<string | null> {
  const raw = await getAppSetting(APP_SETTING_KEYS.geminiAiStudioMonthTotalJpy);
  if (raw === null || raw.trim() === '') return null;
  try {
    const value = new Decimal(raw);
    return value.isFinite() && value.gte(0) ? value.toDecimalPlaces(2).toString() : null;
  } catch {
    return null;
  }
}

async function buildProviderCard(
  provider: (typeof COST_PROVIDERS)[number],
  now: Date,
  warnings: string[],
  usdJpyRate: string | null,
): Promise<ProviderUsageCard> {
  const [connection] = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.provider, provider))
    .limit(1);

  const monthStart = formatTokyoDate(tokyoMonthStart(now));
  const monthEnd = formatTokyoDate(tokyoNextMonthStart(now));

  const monthRowsRaw = await db
    .select()
    .from(usageDaily)
    .where(
      and(
        eq(usageDaily.provider, provider),
        gte(usageDaily.usageDate, monthStart),
        lt(usageDaily.usageDate, monthEnd),
      ),
    );
  const monthRows = dedupeByDate(monthRowsRaw);
  // Provider data lags by hours to a day (and OpenAI/Anthropic bucket by UTC),
  // so "today" is almost always empty during JST daytime - surface the most
  // recent day that actually has data instead.
  const latestRow = monthRows.reduce<(typeof monthRows)[number] | null>(
    (latest, r) => (!latest || r.usageDate > latest.usageDate ? r : latest),
    null,
  );

  const hasData = monthRows.length > 0;
  const monthCostOriginal = monthRows.reduce((sum, r) => sum.plus(r.costOriginal), new Decimal(0));
  const monthCostJpy = monthRows.reduce((sum, r) => sum.plus(r.costJpy), new Decimal(0));
  const sumField = (key: 'inputTokens' | 'outputTokens' | 'requestCount'): number | null => {
    const values = monthRows.map((r) => r[key]).filter((v): v is number => v !== null);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
  };

  const lastFetchedAt =
    monthRows.length > 0
      ? new Date(Math.max(...monthRows.map((r) => r.lastSyncedAt.getTime())))
      : (connection?.lastSuccessAt ?? null);

  let status: ConnectionStatus = (connection?.status as ConnectionStatus) ?? 'not_configured';
  const enabled = connection?.enabled ?? true;

  if (status === 'ok' && lastFetchedAt && now.getTime() - lastFetchedAt.getTime() > SYNC_STALE_MS) {
    status = 'degraded';
    warnings.push(`${provider}: 最終更新から24時間以上経過しています`);
  }

  if (provider === 'gemini' && latestRow?.dataPeriodEnd) {
    if (now.getTime() - latestRow.dataPeriodEnd.getTime() > GEMINI_BILLING_STALE_MS) {
      warnings.push(
        'Google Billingの請求データが48時間以上更新されていません(反映待ちの可能性があります)',
      );
    }
  }

  if (status === 'error' && connection?.lastErrorMessage) {
    warnings.push(`${provider}: ${connection.lastErrorMessage}`);
  }

  const [subscriptionFee, remainingCreditUsd, geminiAiStudioMonthTotalJpy] = await Promise.all([
    getMonthlySubscriptionFee(provider, usdJpyRate),
    getRemainingCreditUsd(provider),
    provider === 'gemini' ? getGeminiAiStudioMonthTotalJpy() : Promise.resolve(null),
  ]);
  const monthCostManuallyEntered = geminiAiStudioMonthTotalJpy !== null;

  return {
    provider,
    enabled,
    status,
    latestDayDate: latestRow?.usageDate ?? null,
    latestDayCostOriginal: latestRow?.costOriginal ?? null,
    latestDayCostJpy: latestRow?.costJpy ?? null,
    monthCostOriginal: monthCostManuallyEntered
      ? null
      : hasData
        ? monthCostOriginal.toString()
        : null,
    monthCostJpy: monthCostManuallyEntered
      ? geminiAiStudioMonthTotalJpy
      : hasData
        ? monthCostJpy.toString()
        : null,
    monthCostManuallyEntered,
    monthlySubscriptionJpy: subscriptionFee.jpy,
    monthlySubscriptionOriginal: subscriptionFee.original,
    monthlySubscriptionCurrency: subscriptionFee.currency,
    monthlySubscriptionName: subscriptionFee.name,
    remainingCreditUsd,
    currencyOriginal: monthRows[0]?.currencyOriginal ?? null,
    inputTokens: sumField('inputTokens'),
    outputTokens: sumField('outputTokens'),
    requestCount: sumField('requestCount'),
    lastFetchedAt: lastFetchedAt ? lastFetchedAt.toISOString() : null,
    confidence: (latestRow?.confidence ?? null) as ProviderUsageCard['confidence'],
    isEstimated: latestRow?.isEstimated ?? false,
    errorMessage: connection?.lastErrorMessage ?? null,
  };
}

async function buildLimitCard(
  provider: (typeof LIMIT_PROVIDERS)[number],
  now: Date,
  warnings: string[],
): Promise<SubscriptionLimitCard> {
  const [connection] = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.provider, provider))
    .limit(1);

  const rows = await db
    .select()
    .from(subscriptionLimits)
    .where(eq(subscriptionLimits.provider, provider))
    .orderBy(desc(subscriptionLimits.collectedAt))
    .limit(20);

  const fiveHourRow = rows.find((r) => r.limitType === 'five_hour') ?? null;
  const weeklyRow = rows.find((r) => r.limitType === 'weekly') ?? null;

  const toWindow = (row: typeof fiveHourRow): LimitWindow | null =>
    row
      ? {
          usedPercent: row.usedPercent,
          remainingPercent: row.remainingPercent,
          resetAt: row.resetAt ? row.resetAt.toISOString() : null,
        }
      : null;

  const lastFetchedAt = rows[0]?.collectedAt ?? connection?.lastSuccessAt ?? null;
  let status: ConnectionStatus = (connection?.status as ConnectionStatus) ?? 'not_configured';

  if (rows.length > 0 && rows[0].expiresAt && rows[0].expiresAt.getTime() < now.getTime()) {
    status = 'degraded';
    warnings.push(`${provider}: データ期限切れです`);
  }
  if (status === 'error' && connection?.lastErrorMessage) {
    warnings.push(`${provider}: ${connection.lastErrorMessage}`);
  }

  return {
    provider,
    enabled: connection?.enabled ?? true,
    status,
    fiveHour: toWindow(fiveHourRow),
    weekly: toWindow(weeklyRow),
    source: rows[0]?.source ?? null,
    confidence: (rows[0]?.confidence ?? null) as SubscriptionLimitCard['confidence'],
    lastFetchedAt: lastFetchedAt ? lastFetchedAt.toISOString() : null,
    errorMessage: connection?.lastErrorMessage ?? null,
  };
}

export async function buildDashboard(now: Date = new Date()): Promise<DashboardResponse> {
  const warnings: string[] = [];
  const yearMonth = tokyoYearMonth(now);

  const budgetJpy = await getMonthlyBudgetJpy(yearMonth);
  const fx = await resolveCurrentFxRate();
  if (!fx) {
    warnings.push('為替レートが取得できていません(FX_USD_JPYまたは手動レートを設定してください)');
  } else if (
    fx.source === 'api' &&
    fx.fetchedAt &&
    now.getTime() - fx.fetchedAt.getTime() > FX_STALE_MS
  ) {
    warnings.push('為替レートが3日以上更新されていません');
  }

  const providerCards = await Promise.all(
    COST_PROVIDERS.map((p) => buildProviderCard(p, now, warnings, fx?.rate ?? null)),
  );
  const limitCards = await Promise.all(
    LIMIT_PROVIDERS.map((p) => buildLimitCard(p, now, warnings)),
  );

  const monthTotalJpy = providerCards.reduce((sum, c) => {
    if (!c.enabled) return sum;
    return sum.plus(c.monthCostJpy ?? 0).plus(c.monthlySubscriptionJpy ?? 0);
  }, new Decimal(0));
  const latestDayTotalJpy = providerCards.reduce(
    (sum, c) => (c.latestDayCostJpy ? sum.plus(c.latestDayCostJpy) : sum),
    new Decimal(0),
  );
  const latestDayDate = providerCards.reduce<string | null>(
    (latest, c) =>
      c.latestDayDate && (!latest || c.latestDayDate > latest) ? c.latestDayDate : latest,
    null,
  );
  const budgetUsedPercent =
    budgetJpy > 0 ? monthTotalJpy.div(budgetJpy).mul(100).toDecimalPlaces(1).toNumber() : 0;

  const subscriptions = await db.select().from(pushSubscriptions);
  const recentEvents = await db
    .select()
    .from(notificationEvents)
    .orderBy(desc(notificationEvents.id))
    .limit(10);

  const allConnections = await db.select().from(providerConnections);
  const lastSyncedAt = allConnections
    .map((c) => c.lastSuccessAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  for (const conn of allConnections) {
    if (
      conn.enabled &&
      conn.status === 'error' &&
      conn.lastErrorAt &&
      now.getTime() - conn.lastErrorAt.getTime() > 12 * 60 * 60 * 1000
    ) {
      warnings.push(`${conn.provider}: 同期が12時間以上失敗しています`);
    }
  }

  const webPushConfigured = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );

  return {
    latestDayTotalJpy: latestDayTotalJpy.toDecimalPlaces(0).toString(),
    latestDayDate,
    monthTotalJpy: monthTotalJpy.toDecimalPlaces(0).toString(),
    monthlyBudgetJpy: budgetJpy,
    budgetUsedPercent,
    fxRate: {
      rate: fx?.rate ?? null,
      source: fx?.source ?? null,
      fetchedAt: fx?.fetchedAt ? fx.fetchedAt.toISOString() : null,
    },
    providers: providerCards.filter((c) => c.enabled),
    subscriptionLimits: limitCards.filter(
      (c) => c.enabled && c.source !== null && c.source !== 'manual',
    ),
    notifications: {
      webPushEnabled: webPushConfigured && subscriptions.length > 0,
      subscriptionCount: subscriptions.length,
      recentEvents: recentEvents.map((e) => ({
        ruleType: e.ruleType,
        threshold: e.threshold,
        message: e.message,
        sentAt: e.sentAt ? e.sentAt.toISOString() : null,
        status: e.status,
      })),
    },
    lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
    warnings,
  };
}
