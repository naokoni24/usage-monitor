import 'server-only';
import Decimal from 'decimal.js';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { fxRates } from '@/lib/database/schema';
import { HttpExchangeRateProvider } from './http-provider';
import type { ResolvedFxRate } from './types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function latestRateBySource(source: 'api' | 'manual') {
  const [row] = await db
    .select()
    .from(fxRates)
    .where(eq(fxRates.source, source))
    .orderBy(desc(fxRates.fetchedAt))
    .limit(1);
  return row;
}

/**
 * Fetches a fresh rate from the external FX API if configured and if the last
 * successful fetch is more than a day old. Safe to call frequently (e.g. from
 * the periodic sync job) - it no-ops when called again within the same day.
 */
export async function isApiRateDue(): Promise<boolean> {
  const lastApiRow = await latestRateBySource('api');
  return !lastApiRow || Date.now() - lastApiRow.fetchedAt.getTime() >= ONE_DAY_MS;
}

export async function recordApiRate(rate: string): Promise<void> {
  await db.insert(fxRates).values({
    baseCurrency: 'USD',
    quoteCurrency: 'JPY',
    rate,
    source: 'api',
    isManual: false,
    fetchedAt: new Date(),
  });
}

export async function syncFxRateIfDue(): Promise<void> {
  const apiUrl = process.env.FX_API_URL;
  if (!apiUrl) return;
  if (!(await isApiRateDue())) return;

  const provider = new HttpExchangeRateProvider(apiUrl, process.env.FX_API_KEY);
  const rate = await provider.fetchUsdJpyRate();
  await recordApiRate(rate);
}

export async function saveManualFxRate(rate: string): Promise<void> {
  const parsed = new Decimal(rate);
  if (!parsed.isFinite() || parsed.lte(0)) {
    throw new Error('Manual FX rate must be a positive number');
  }
  await db.insert(fxRates).values({
    baseCurrency: 'USD',
    quoteCurrency: 'JPY',
    rate: parsed.toString(),
    source: 'manual',
    isManual: true,
    fetchedAt: new Date(),
  });
}

/**
 * Resolves the USD->JPY rate to use right now, following the priority chain:
 * 1) most recent successful external-API fetch (regardless of age)
 * 2) FX_USD_JPY environment variable
 * 3) most recent manually-entered rate from the settings screen
 * Returns null if none of these are available.
 */
export async function resolveCurrentFxRate(): Promise<ResolvedFxRate | null> {
  const apiRow = await latestRateBySource('api');
  if (apiRow) {
    return { rate: apiRow.rate, source: 'api', fetchedAt: apiRow.fetchedAt, isManual: false };
  }

  const envRate = process.env.FX_USD_JPY;
  if (envRate) {
    const parsed = new Decimal(envRate);
    if (parsed.isFinite() && parsed.gt(0)) {
      return { rate: parsed.toString(), source: 'env', fetchedAt: null, isManual: false };
    }
  }

  const manualRow = await latestRateBySource('manual');
  if (manualRow) {
    return { rate: manualRow.rate, source: 'manual', fetchedAt: manualRow.fetchedAt, isManual: true };
  }

  return null;
}

export function convertUsdToJpy(usdAmount: string, rate: string): string {
  return new Decimal(usdAmount).mul(new Decimal(rate)).toDecimalPlaces(2).toString();
}

/**
 * Converts a provider-reported amount to JPY, respecting its source currency.
 * Google Cloud Billing reports costs in the billing account's own currency
 * (JPY for Japanese accounts), so those amounts must NOT go through the
 * USD/JPY rate again. Returns the JPY amount and the fx rate actually applied.
 */
export function convertToJpy(
  amount: string,
  currency: string,
  usdJpyRate: string | null,
): { costJpy: string; appliedRate: string } {
  if (currency.toUpperCase() === 'JPY') {
    return { costJpy: new Decimal(amount).toDecimalPlaces(2).toString(), appliedRate: '1' };
  }
  if (!usdJpyRate) {
    return { costJpy: '0', appliedRate: '0' };
  }
  // USD and any other currency fall back to the USD/JPY rate (best effort for a personal tool).
  return { costJpy: convertUsdToJpy(amount, usdJpyRate), appliedRate: usdJpyRate };
}
