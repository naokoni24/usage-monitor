import Decimal from 'decimal.js';
import { formatTokyoDate, tokyoDateInfoForMock } from '@/lib/date/tokyo';
import type { CostProviderOutcome, NormalizedDailyUsage } from '@/lib/providers/types';
import { seededRandom } from './random';
import type { MockScenario } from './scenario';

type CostProvider = 'openai' | 'anthropic' | 'gemini';

const PROVIDER_WEIGHT: Record<CostProvider, number> = {
  openai: 0.5,
  anthropic: 0.3,
  gemini: 0.2,
};

const BUDGET_TARGET_PERCENT: Partial<Record<MockScenario, number>> = {
  budget_50: 0.5,
  budget_80: 0.8,
  budget_100: 1.0,
};

function targetPercentForScenario(scenario: MockScenario): number {
  return BUDGET_TARGET_PERCENT[scenario] ?? 0.55;
}

function distributeAcrossDays(totalUsd: Decimal, days: number, seed: string): Decimal[] {
  const rand = seededRandom(seed);
  const weights = Array.from({ length: days }, () => 0.5 + rand());
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => totalUsd.mul(w / weightSum));
}

export function generateMockCostData(
  provider: CostProvider,
  scenario: MockScenario,
  monthlyBudgetJpy: number,
  fxRateJpy: number,
  now: Date = new Date(),
): CostProviderOutcome {
  if (provider === 'openai' && scenario === 'openai_error') {
    return { ok: false, errorMessage: 'OpenAI Admin API returned 401 Unauthorized (mock)', status: 'error' };
  }
  if (provider === 'anthropic' && scenario === 'anthropic_not_configured') {
    return {
      ok: false,
      errorMessage: 'ANTHROPIC_ADMIN_API_KEY is not set (mock)',
      status: 'not_configured',
    };
  }

  const { year, month, day } = tokyoDateInfoForMock(now);
  const daysElapsed = day;
  const targetPercent = targetPercentForScenario(scenario);
  const providerJpy = monthlyBudgetJpy * targetPercent * PROVIDER_WEIGHT[provider];
  const providerUsd = new Decimal(providerJpy).div(fxRateJpy);

  const dailyUsd = distributeAcrossDays(providerUsd, daysElapsed, `${provider}-${year}-${month}`);

  const isGeminiDelay = provider === 'gemini' && scenario === 'gemini_billing_delay';
  const dataPeriodEnd = isGeminiDelay
    ? new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    : now;

  const days: NormalizedDailyUsage[] = dailyUsd.map((usd, index) => {
    const dayOfMonth = index + 1;
    const date = new Date(Date.UTC(year, month - 1, dayOfMonth, 12, 0, 0));
    const costOriginal = usd.toDecimalPlaces(4).toString();
    const inputTokens = Math.round(usd.toNumber() * 100_000);
    const outputTokens = Math.round(usd.toNumber() * 20_000);

    return {
      usageDate: formatTokyoDate(date),
      costOriginal,
      currencyOriginal: 'USD',
      inputTokens,
      outputTokens,
      cachedInputTokens: Math.round(inputTokens * 0.3),
      cachedOutputTokens: 0,
      requestCount: Math.round(usd.toNumber() * 50) + 1,
      dataPeriodStart: null,
      dataPeriodEnd,
    };
  });

  return {
    ok: true,
    source: 'mock',
    confidence: provider === 'gemini' ? 'estimated' : 'confirmed',
    isEstimated: provider === 'gemini',
    days,
  };
}
