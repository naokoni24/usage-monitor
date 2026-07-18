import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { buildDashboard } from '@/lib/dashboard/build-dashboard';
import { logger } from '@/lib/logging/logger';
import type { DashboardResponse, ProviderUsageCard } from '@/types/dashboard';

const DEFAULT_USAGE_OUTPUT = '/Users/nao/.runcat/ai-usage.json';
const DEFAULT_CREDIT_OUTPUT = '/Users/nao/.runcat/ai-credits.json';

const PROVIDER_LABEL: Record<ProviderUsageCard['provider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Claude API',
  gemini: 'Gemini',
};

interface RunCatMetric {
  title: string;
  symbol: string;
  metricsBarValue: string;
  metrics: Array<{
    title: string;
    formattedValue: string;
    normalizedValue?: number;
  }>;
  lastUpdatedDate: string;
}

function formatJpy(value: number): string {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function buildUsageMetric(dashboard: DashboardResponse, generatedAt: string): RunCatMetric {
  const subscriptionTotalJpy = dashboard.providers.reduce(
    (total, card) => total + (card.monthlySubscriptionJpy ?? 0),
    0,
  );
  const apiTotalJpy = dashboard.providers.reduce(
    (total, card) => total + Number(card.monthCostJpy ?? 0),
    0,
  );
  const latestDayLabel = dashboard.latestDayDate
    ? dashboard.latestDayDate
        .split('-')
        .slice(1)
        .map((part) => Number(part))
        .join('/')
    : '未反映';
  const budgetPart =
    dashboard.monthlyBudgetJpy > 0
      ? ` / ${formatJpy(dashboard.monthlyBudgetJpy)} (${Math.round(dashboard.budgetUsedPercent)}%)`
      : '';

  return {
    title: 'AI Usage Monitor',
    symbol: 'yensign',
    metricsBarValue:
      dashboard.monthlyBudgetJpy > 0
        ? `${Math.round(dashboard.budgetUsedPercent)}%`
        : formatJpy(Number(dashboard.latestDayTotalJpy)),
    metrics: [
      {
        title: '今月',
        formattedValue: `${formatJpy(Number(dashboard.monthTotalJpy))}${budgetPart}`,
        ...(dashboard.monthlyBudgetJpy > 0
          ? { normalizedValue: Math.min(dashboard.budgetUsedPercent / 100, 1) }
          : {}),
      },
      {
        title: 'サブスク / API',
        formattedValue: `${formatJpy(subscriptionTotalJpy)} / ${formatJpy(apiTotalJpy)}`,
      },
      {
        title: `(${latestDayLabel}`,
        formattedValue: `${formatJpy(Number(dashboard.latestDayTotalJpy))})`,
      },
    ],
    lastUpdatedDate: generatedAt,
  };
}

function buildCreditMetric(dashboard: DashboardResponse, generatedAt: string): RunCatMetric {
  const usdJpyRate = dashboard.fxRate.rate ? Number(dashboard.fxRate.rate) : null;
  let totalJpy = 0;
  let convertedCount = 0;

  const providerMetrics = dashboard.providers.map((card) => {
    const monthUsageJpy = Number(card.monthCostJpy ?? 0);
    const amount = card.remainingCreditOriginal ? Number(card.remainingCreditOriginal) : null;
    if (amount === null || !Number.isFinite(amount) || !card.remainingCreditCurrency) {
      return {
        title: PROVIDER_LABEL[card.provider],
        formattedValue: `使用 ${formatJpy(monthUsageJpy)} / 残 未設定`,
      };
    }

    let remainingJpy: number | null = null;
    let originalCurrencySuffix = '';
    if (card.remainingCreditCurrency === 'JPY') {
      remainingJpy = amount;
    } else if (usdJpyRate && Number.isFinite(usdJpyRate) && usdJpyRate > 0) {
      remainingJpy = amount * usdJpyRate;
      originalCurrencySuffix = ` · USD ${card.remainingCreditOriginal}`;
    }

    if (remainingJpy === null) {
      return {
        title: PROVIDER_LABEL[card.provider],
        formattedValue: `使用 ${formatJpy(monthUsageJpy)} / USD ${card.remainingCreditOriginal}`,
      };
    }

    totalJpy += remainingJpy;
    convertedCount++;
    const availableCreditJpy = monthUsageJpy + remainingJpy;
    const usagePercent = availableCreditJpy > 0 ? (monthUsageJpy / availableCreditJpy) * 100 : null;
    return {
      title: PROVIDER_LABEL[card.provider],
      formattedValue:
        usagePercent === null
          ? `使用 ${formatJpy(monthUsageJpy)} / 残 ${formatJpy(remainingJpy)}${originalCurrencySuffix}`
          : `使用 ${formatJpy(monthUsageJpy)} / 残 ${formatJpy(remainingJpy)} (${Math.round(usagePercent)}%)${originalCurrencySuffix}`,
      ...(usagePercent === null
        ? {}
        : { normalizedValue: Math.min(Math.max(usagePercent / 100, 0), 1) }),
    };
  });

  return {
    title: 'API Usage',
    symbol: 'creditcard',
    metricsBarValue: convertedCount > 0 ? formatJpy(totalJpy) : '未設定',
    metrics: providerMetrics,
    lastUpdatedDate: generatedAt,
  };
}

async function writeMetricIfChanged(output: string, metric: RunCatMetric): Promise<void> {
  try {
    const existing = JSON.parse(
      await readFile(/* turbopackIgnore: true */ output, 'utf8'),
    ) as Record<string, unknown>;
    const previousSnapshot = { ...existing };
    const nextSnapshot: Record<string, unknown> = { ...metric };
    delete previousSnapshot.lastUpdatedDate;
    delete nextSnapshot.lastUpdatedDate;
    if (JSON.stringify(previousSnapshot) === JSON.stringify(nextSnapshot)) {
      logger.info('RunCat metric unchanged; retained prior snapshot', { output });
      return;
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      logger.warn('Could not read existing RunCat metric; replacing it', {
        output,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const outputDirectory = dirname(/* turbopackIgnore: true */ output);
  await mkdir(outputDirectory, { recursive: true });
  const temporary = join(
    outputDirectory,
    `.runcat-${process.pid}-${Date.now()}-${basename(output)}`,
  );
  await writeFile(temporary, JSON.stringify(metric), 'utf8');
  await rename(temporary, output);
  logger.info('RunCat metric written', { output });
}

/** Publish RunCat cards after cost or credit settings have changed. */
export async function writeRunCatMetric(): Promise<void> {
  const dashboard = await buildDashboard();
  const generatedAt = new Date().toISOString();
  await Promise.all([
    writeMetricIfChanged(
      process.env.RUNCAT_METRIC_FILE || DEFAULT_USAGE_OUTPUT,
      buildUsageMetric(dashboard, generatedAt),
    ),
    writeMetricIfChanged(
      process.env.RUNCAT_CREDIT_METRIC_FILE || DEFAULT_CREDIT_OUTPUT,
      buildCreditMetric(dashboard, generatedAt),
    ),
  ]);
}
