import 'server-only';
import Decimal from 'decimal.js';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { APP_SETTING_KEYS, getAppSetting } from '@/lib/database/app-settings';
import { usageDaily, type Provider } from '@/lib/database/schema';

function parseNonNegativeDecimal(raw: string | null): Decimal | null {
  if (raw === null || raw.trim() === '') return null;
  try {
    const value = new Decimal(raw);
    return value.isFinite() && value.gte(0) ? value : null;
  } catch {
    return null;
  }
}

// Despite the name, this math is provider-agnostic (balance minus usage accrued
// since the balance was last entered) - Gemini was just the first provider that
// needed it. OpenAI/Anthropic reuse it below rather than duplicating the logic.
export function calculateEstimatedGeminiCredit(
  balanceAtBaselineRaw: string | null,
  usageAtBaselineRaw: string | null,
  currentCumulativeUsageRaw: string | null,
): string | null {
  const balanceAtBaseline = parseNonNegativeDecimal(balanceAtBaselineRaw);
  if (balanceAtBaseline === null) return null;

  const usageAtBaseline = parseNonNegativeDecimal(usageAtBaselineRaw);
  const currentCumulativeUsage = parseNonNegativeDecimal(currentCumulativeUsageRaw);
  if (usageAtBaseline === null || currentCumulativeUsage === null) {
    return balanceAtBaseline.toString();
  }

  const usageSinceBaseline = Decimal.max(currentCumulativeUsage.minus(usageAtBaseline), 0);
  return Decimal.max(balanceAtBaseline.minus(usageSinceBaseline), 0).toDecimalPlaces(6).toString();
}

export async function getGeminiCumulativeUsageJpy(): Promise<string> {
  const source = process.env.USE_MOCK_DATA === 'true' ? 'mock' : 'api';
  const rows = await db
    .select({ costJpy: usageDaily.costJpy })
    .from(usageDaily)
    .where(and(eq(usageDaily.provider, 'gemini'), eq(usageDaily.source, source)));

  return rows.reduce((total, row) => total.plus(row.costJpy), new Decimal(0)).toString();
}

export async function getEstimatedGeminiRemainingCredit(): Promise<string | null> {
  const [balanceAtBaseline, usageAtBaseline, currentCumulativeUsage] = await Promise.all([
    getAppSetting(APP_SETTING_KEYS.geminiRemainingCreditJpy),
    getAppSetting(APP_SETTING_KEYS.geminiRemainingCreditBaselineUsageJpy),
    getGeminiCumulativeUsageJpy(),
  ]);
  return calculateEstimatedGeminiCredit(balanceAtBaseline, usageAtBaseline, currentCumulativeUsage);
}

// costOriginal is already USD for both openai and anthropic, so no FX conversion is needed here.
export async function getCumulativeUsageUsd(provider: Extract<Provider, 'openai' | 'anthropic'>): Promise<string> {
  const source = process.env.USE_MOCK_DATA === 'true' ? 'mock' : 'api';
  const rows = await db
    .select({ costOriginal: usageDaily.costOriginal })
    .from(usageDaily)
    .where(and(eq(usageDaily.provider, provider), eq(usageDaily.source, source)));

  return rows.reduce((total, row) => total.plus(row.costOriginal), new Decimal(0)).toString();
}

export async function getEstimatedRemainingCreditUsd(
  provider: Extract<Provider, 'openai' | 'anthropic'>,
): Promise<string | null> {
  const [balanceKey, baselineKey] =
    provider === 'openai'
      ? [APP_SETTING_KEYS.openaiRemainingCreditUsd, APP_SETTING_KEYS.openaiRemainingCreditBaselineUsageUsd]
      : [APP_SETTING_KEYS.anthropicRemainingCreditUsd, APP_SETTING_KEYS.anthropicRemainingCreditBaselineUsageUsd];

  const [balanceAtBaseline, usageAtBaseline, currentCumulativeUsage] = await Promise.all([
    getAppSetting(balanceKey),
    getAppSetting(baselineKey),
    getCumulativeUsageUsd(provider),
  ]);
  return calculateEstimatedGeminiCredit(balanceAtBaseline, usageAtBaseline, currentCumulativeUsage);
}
