import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireSession, requireSameOrigin } from '@/lib/auth/guard';
import { db } from '@/lib/database/client';
import { providerConnections, notificationRules, PROVIDERS } from '@/lib/database/schema';
import { getMonthlyBudgetJpy, setMonthlyBudgetJpy } from '@/lib/budget/monthly-budget';
import { saveManualFxRate, resolveCurrentFxRate } from '@/lib/currency/resolve';
import { setAppSetting, getAllAppSettings, APP_SETTING_KEYS } from '@/lib/database/app-settings';
import { tokyoYearMonth } from '@/lib/date/tokyo';
import { writeRunCatMetric } from '@/lib/runcat/write-metric';
import { logger } from '@/lib/logging/logger';
import { getGeminiCumulativeUsageJpy, getCumulativeUsageUsd } from '@/lib/credits/gemini-credit';

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const budgetJpy = await getMonthlyBudgetJpy();
  const fx = await resolveCurrentFxRate();
  const connections = await db.select().from(providerConnections);
  const rules = await db.select().from(notificationRules);
  const appSettings = await getAllAppSettings();

  return NextResponse.json({
    monthlyBudgetJpy: budgetJpy,
    fx: {
      rate: fx?.rate ?? null,
      source: fx?.source ?? null,
      fetchedAt: fx?.fetchedAt?.toISOString() ?? null,
    },
    syncIntervalMinutes: Number(
      appSettings[APP_SETTING_KEYS.syncIntervalMinutes] ?? process.env.SYNC_INTERVAL_MINUTES ?? 15,
    ),
    providers: connections.map((c) => ({
      provider: c.provider,
      enabled: c.enabled,
      status: c.status,
    })),
    notificationRules: rules.map((r) => ({
      ruleType: r.ruleType,
      threshold: r.threshold,
      enabled: r.enabled,
    })),
    notificationRepeatAfterDrop:
      appSettings[APP_SETTING_KEYS.notificationRepeatAfterDrop] === 'true',
    geminiServiceFilters:
      appSettings[APP_SETTING_KEYS.geminiServiceFilters] ??
      process.env.GCP_GEMINI_SERVICE_FILTERS ??
      '',
    mockScenario:
      appSettings[APP_SETTING_KEYS.mockScenario] ?? process.env.MOCK_SCENARIO ?? 'normal',
    claudeCodeManualMemo: appSettings[APP_SETTING_KEYS.claudeCodeManualMemo] ?? '',
    useMockData: process.env.USE_MOCK_DATA === 'true',
    // Non-secret identifiers, editable from the settings UI.
    openaiOrganizationId:
      appSettings[APP_SETTING_KEYS.openaiOrganizationId] ??
      process.env.OPENAI_ORGANIZATION_ID ??
      '',
    gcpBillingProjectId:
      appSettings[APP_SETTING_KEYS.gcpBillingProjectId] ?? process.env.GCP_BILLING_PROJECT_ID ?? '',
    gcpBillingDataset:
      appSettings[APP_SETTING_KEYS.gcpBillingDataset] ?? process.env.GCP_BILLING_DATASET ?? '',
    gcpBillingTable:
      appSettings[APP_SETTING_KEYS.gcpBillingTable] ?? process.env.GCP_BILLING_TABLE ?? '',
    openaiMonthlySubscriptionJpy: Number(
      appSettings[APP_SETTING_KEYS.openaiMonthlySubscriptionJpy] ?? 0,
    ),
    anthropicMonthlySubscriptionUsd: Number(
      appSettings[APP_SETTING_KEYS.anthropicMonthlySubscriptionUsd] ?? 0,
    ),
    openaiSubscriptionRenewalDay: appSettings[APP_SETTING_KEYS.openaiSubscriptionRenewalDay] ?? '',
    anthropicSubscriptionRenewalDay:
      appSettings[APP_SETTING_KEYS.anthropicSubscriptionRenewalDay] ?? '',
    openaiSubscriptionName: appSettings[APP_SETTING_KEYS.openaiSubscriptionName] || 'ChatGPT Plus',
    anthropicSubscriptionName:
      appSettings[APP_SETTING_KEYS.anthropicSubscriptionName] || 'Claude Pro',
    openaiRemainingCreditUsd: appSettings[APP_SETTING_KEYS.openaiRemainingCreditUsd] ?? '',
    anthropicRemainingCreditUsd: appSettings[APP_SETTING_KEYS.anthropicRemainingCreditUsd] ?? '',
    geminiRemainingCreditJpy: appSettings[APP_SETTING_KEYS.geminiRemainingCreditJpy] ?? '',
    geminiAiStudioMonthTotalJpy: appSettings[APP_SETTING_KEYS.geminiAiStudioMonthTotalJpy] ?? '',
    // Secret/credential presence only - never the values themselves.
    secrets: {
      openaiAdminKeyConfigured: Boolean(process.env.OPENAI_ADMIN_API_KEY),
      anthropicAdminKeyConfigured: Boolean(process.env.ANTHROPIC_ADMIN_API_KEY),
      googleServiceAccountConfigured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      vapidConfigured: Boolean(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY &&
        process.env.VAPID_SUBJECT,
      ),
      fxApiConfigured: Boolean(process.env.FX_API_URL),
    },
  });
}

const putSchema = z.object({
  monthlyBudgetJpy: z.number().int().positive().optional(),
  fxManualRate: z.string().optional(),
  syncIntervalMinutes: z.number().int().min(1).max(1440).optional(),
  providerToggles: z.record(z.enum(PROVIDERS), z.boolean()).optional(),
  notificationRules: z
    .array(z.object({ ruleType: z.string(), threshold: z.number(), enabled: z.boolean() }))
    .optional(),
  notificationRepeatAfterDrop: z.boolean().optional(),
  geminiServiceFilters: z.string().optional(),
  mockScenario: z.string().optional(),
  openaiOrganizationId: z.string().optional(),
  gcpBillingProjectId: z.string().optional(),
  gcpBillingDataset: z.string().optional(),
  gcpBillingTable: z.string().optional(),
  openaiMonthlySubscriptionJpy: z.number().int().min(0).optional(),
  anthropicMonthlySubscriptionUsd: z.number().min(0).optional(),
  openaiSubscriptionRenewalDay: z
    .string()
    .regex(/^([1-9]|1[0-9]|2[0-8])?$/)
    .optional(),
  anthropicSubscriptionRenewalDay: z
    .string()
    .regex(/^([1-9]|1[0-9]|2[0-8])?$/)
    .optional(),
  openaiSubscriptionName: z.string().max(50).optional(),
  anthropicSubscriptionName: z.string().max(50).optional(),
  openaiRemainingCreditUsd: z
    .string()
    .regex(/^$|^\d+(\.\d+)?$/)
    .optional(),
  anthropicRemainingCreditUsd: z
    .string()
    .regex(/^$|^\d+(\.\d+)?$/)
    .optional(),
  geminiRemainingCreditJpy: z
    .string()
    .regex(/^$|^\d+(\.\d+)?$/)
    .optional(),
  geminiAiStudioMonthTotalJpy: z
    .string()
    .regex(/^$|^\d+(\.\d+)?$/)
    .optional(),
});

export async function PUT(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const badOrigin = await requireSameOrigin();
  if (badOrigin) return badOrigin;

  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (data.monthlyBudgetJpy !== undefined) {
    await setMonthlyBudgetJpy(data.monthlyBudgetJpy, tokyoYearMonth());
  }
  if (data.fxManualRate !== undefined) {
    await saveManualFxRate(data.fxManualRate);
  }
  if (data.syncIntervalMinutes !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.syncIntervalMinutes, String(data.syncIntervalMinutes));
  }
  if (data.providerToggles) {
    for (const [provider, enabled] of Object.entries(data.providerToggles)) {
      await db
        .insert(providerConnections)
        .values({
          provider: provider as (typeof PROVIDERS)[number],
          enabled,
          status: 'not_configured',
        })
        .onConflictDoUpdate({
          target: providerConnections.provider,
          set: { enabled, updatedAt: new Date() },
        });
    }
  }
  if (data.notificationRules) {
    for (const rule of data.notificationRules) {
      await db
        .update(notificationRules)
        .set({ enabled: rule.enabled, updatedAt: new Date() })
        .where(eq(notificationRules.ruleType, rule.ruleType));
    }
  }
  if (data.notificationRepeatAfterDrop !== undefined) {
    await setAppSetting(
      APP_SETTING_KEYS.notificationRepeatAfterDrop,
      String(data.notificationRepeatAfterDrop),
    );
  }
  if (data.geminiServiceFilters !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.geminiServiceFilters, data.geminiServiceFilters);
  }
  if (data.mockScenario !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.mockScenario, data.mockScenario);
  }
  if (data.openaiOrganizationId !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.openaiOrganizationId, data.openaiOrganizationId);
  }
  if (data.gcpBillingProjectId !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.gcpBillingProjectId, data.gcpBillingProjectId);
  }
  if (data.gcpBillingDataset !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.gcpBillingDataset, data.gcpBillingDataset);
  }
  if (data.gcpBillingTable !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.gcpBillingTable, data.gcpBillingTable);
  }
  if (data.openaiMonthlySubscriptionJpy !== undefined) {
    await setAppSetting(
      APP_SETTING_KEYS.openaiMonthlySubscriptionJpy,
      String(data.openaiMonthlySubscriptionJpy),
    );
  }
  if (data.anthropicMonthlySubscriptionUsd !== undefined) {
    await setAppSetting(
      APP_SETTING_KEYS.anthropicMonthlySubscriptionUsd,
      String(data.anthropicMonthlySubscriptionUsd),
    );
  }
  if (data.openaiSubscriptionRenewalDay !== undefined) {
    await setAppSetting(
      APP_SETTING_KEYS.openaiSubscriptionRenewalDay,
      data.openaiSubscriptionRenewalDay,
    );
  }
  if (data.anthropicSubscriptionRenewalDay !== undefined) {
    await setAppSetting(
      APP_SETTING_KEYS.anthropicSubscriptionRenewalDay,
      data.anthropicSubscriptionRenewalDay,
    );
  }
  if (data.openaiSubscriptionName !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.openaiSubscriptionName, data.openaiSubscriptionName);
  }
  if (data.anthropicSubscriptionName !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.anthropicSubscriptionName, data.anthropicSubscriptionName);
  }
  if (data.openaiRemainingCreditUsd !== undefined) {
    const baselineUsageUsd =
      data.openaiRemainingCreditUsd.trim() === '' ? '' : await getCumulativeUsageUsd('openai');
    await Promise.all([
      setAppSetting(APP_SETTING_KEYS.openaiRemainingCreditUsd, data.openaiRemainingCreditUsd),
      setAppSetting(APP_SETTING_KEYS.openaiRemainingCreditBaselineUsageUsd, baselineUsageUsd),
    ]);
  }
  if (data.anthropicRemainingCreditUsd !== undefined) {
    const baselineUsageUsd =
      data.anthropicRemainingCreditUsd.trim() === '' ? '' : await getCumulativeUsageUsd('anthropic');
    await Promise.all([
      setAppSetting(APP_SETTING_KEYS.anthropicRemainingCreditUsd, data.anthropicRemainingCreditUsd),
      setAppSetting(APP_SETTING_KEYS.anthropicRemainingCreditBaselineUsageUsd, baselineUsageUsd),
    ]);
  }
  if (data.geminiRemainingCreditJpy !== undefined) {
    const baselineUsageJpy =
      data.geminiRemainingCreditJpy.trim() === '' ? '' : await getGeminiCumulativeUsageJpy();
    await Promise.all([
      setAppSetting(APP_SETTING_KEYS.geminiRemainingCreditJpy, data.geminiRemainingCreditJpy),
      setAppSetting(APP_SETTING_KEYS.geminiRemainingCreditBaselineUsageJpy, baselineUsageJpy),
    ]);
  }
  if (data.geminiAiStudioMonthTotalJpy !== undefined) {
    await Promise.all([
      setAppSetting(APP_SETTING_KEYS.geminiAiStudioMonthTotalJpy, data.geminiAiStudioMonthTotalJpy),
      setAppSetting(
        APP_SETTING_KEYS.geminiAiStudioMonthTotalYearMonth,
        data.geminiAiStudioMonthTotalJpy.trim() === '' ? '' : tokyoYearMonth(),
      ),
    ]);
  }

  const remainingCreditChanged =
    data.openaiRemainingCreditUsd !== undefined ||
    data.anthropicRemainingCreditUsd !== undefined ||
    data.geminiRemainingCreditJpy !== undefined;
  if (remainingCreditChanged) {
    await writeRunCatMetric().catch((err) =>
      logger.warn('RunCat credit metric update failed', {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return NextResponse.json({ ok: true });
}
