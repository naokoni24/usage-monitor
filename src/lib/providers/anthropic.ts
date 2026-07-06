import 'server-only';
import Decimal from 'decimal.js';
import { formatTokyoDate, tokyoMonthStart, tokyoTomorrowStart } from '@/lib/date/tokyo';
import { isMockMode, getMockScenario } from '@/lib/mock/scenario';
import { generateMockCostData } from '@/lib/mock/cost-providers';
import type { CostProviderOutcome, NormalizedDailyUsage } from './types';

/**
 * Anthropic Admin Usage & Cost API client (verified July 2026).
 *  - GET /v1/organizations/cost_report               (amount is a decimal STRING in cents)
 *  - GET /v1/organizations/usage_report/messages     (token counts; no request-count field is exposed)
 * Requires an Admin API key (ANTHROPIC_ADMIN_API_KEY) - NOT a regular Claude API key.
 */

const BASE_URL = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

interface CostBucket {
  starting_at: string;
  ending_at: string;
  results: Array<{ amount: string; currency: string }>;
}
interface CostReport {
  data: CostBucket[];
  has_more: boolean;
  next_page: string | null;
}

interface MessagesUsageBucket {
  starting_at: string;
  ending_at: string;
  results: Array<{
    uncached_input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation: { ephemeral_1h_input_tokens: number; ephemeral_5m_input_tokens: number };
  }>;
}
interface MessagesUsageReport {
  data: MessagesUsageBucket[];
  has_more: boolean;
  next_page: string | null;
}

class AnthropicApiError extends Error {
  constructor(
    message: string,
    public readonly status: 'error' | 'not_configured',
  ) {
    super(message);
  }
}

async function anthropicGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!apiKey) {
    throw new AnthropicApiError('ANTHROPIC_ADMIN_API_KEY is not set', 'not_configured');
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url, {
    headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new AnthropicApiError(
      `Anthropic API returned ${res.status}: Admin API keyでない、または権限不足の可能性があります`,
      'error',
    );
  }
  if (!res.ok) {
    throw new AnthropicApiError(`Anthropic API request failed: ${res.status} ${res.statusText}`, 'error');
  }
  return (await res.json()) as T;
}

async function fetchAllPages<T extends { has_more: boolean; next_page: string | null; data: unknown[] }>(
  path: string,
  baseParams: Record<string, string>,
): Promise<T['data']> {
  let page: string | undefined;
  const allData: T['data'] = [];
  for (let i = 0; i < 20; i++) {
    const params = { ...baseParams, ...(page ? { page } : {}) };
    const response = await anthropicGet<T>(path, params);
    allData.push(...response.data);
    if (!response.has_more || !response.next_page) break;
    page = response.next_page;
  }
  return allData;
}

export async function fetchAnthropicUsage(now: Date = new Date()): Promise<CostProviderOutcome> {
  if (isMockMode()) {
    const { getMonthlyBudgetJpy } = await import('@/lib/budget/monthly-budget');
    const { resolveCurrentFxRate } = await import('@/lib/currency/resolve');
    const budget = await getMonthlyBudgetJpy();
    const fx = await resolveCurrentFxRate();
    return generateMockCostData('anthropic', await getMockScenario(), budget, Number(fx?.rate ?? 150), now);
  }

  const startingAt = tokyoMonthStart(now).toISOString();
  const endingAt = tokyoTomorrowStart(now).toISOString();

  try {
    const [costBuckets, usageBuckets] = await Promise.all([
      fetchAllPages<CostReport>('/organizations/cost_report', {
        starting_at: startingAt,
        ending_at: endingAt,
        bucket_width: '1d',
        limit: '31',
      }),
      fetchAllPages<MessagesUsageReport>('/organizations/usage_report/messages', {
        starting_at: startingAt,
        ending_at: endingAt,
        bucket_width: '1d',
        limit: '31',
      }),
    ]);

    interface UsageTotals {
      uncached_input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens: number;
      cache_creation_tokens: number;
    }
    const usageByStart = new Map<string, UsageTotals>();
    for (const bucket of usageBuckets) {
      const totals = bucket.results.reduce(
        (acc, r) => ({
          uncached_input_tokens: acc.uncached_input_tokens + r.uncached_input_tokens,
          output_tokens: acc.output_tokens + r.output_tokens,
          cache_read_input_tokens: acc.cache_read_input_tokens + r.cache_read_input_tokens,
          cache_creation_tokens:
            acc.cache_creation_tokens +
            r.cache_creation.ephemeral_1h_input_tokens +
            r.cache_creation.ephemeral_5m_input_tokens,
        }),
        { uncached_input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_tokens: 0 },
      );
      usageByStart.set(bucket.starting_at, totals);
    }

    const days: NormalizedDailyUsage[] = costBuckets.map((bucket) => {
      // cost_report `amount` is a decimal string denominated in the lowest currency unit (cents for USD).
      const costUsd = bucket.results
        .reduce((sum, r) => sum.plus(new Decimal(r.amount)), new Decimal(0))
        .div(100);
      const usage = usageByStart.get(bucket.starting_at);
      const bucketDate = new Date(bucket.starting_at);

      return {
        usageDate: formatTokyoDate(bucketDate),
        costOriginal: costUsd.toString(),
        currencyOriginal: (bucket.results[0]?.currency ?? 'USD').toUpperCase(),
        inputTokens: usage?.uncached_input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        cachedInputTokens: usage ? usage.cache_read_input_tokens + usage.cache_creation_tokens : null,
        cachedOutputTokens: null,
        requestCount: null, // Anthropic's usage report does not expose a request-count field
        dataPeriodStart: new Date(bucket.starting_at),
        dataPeriodEnd: new Date(bucket.ending_at),
      };
    });

    return { ok: true, source: 'api', confidence: 'confirmed', isEstimated: false, days };
  } catch (err) {
    if (err instanceof AnthropicApiError) {
      return { ok: false, errorMessage: err.message, status: err.status };
    }
    return { ok: false, errorMessage: err instanceof Error ? err.message : String(err) };
  }
}
