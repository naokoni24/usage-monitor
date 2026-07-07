import 'server-only';
import Decimal from 'decimal.js';
import { formatTokyoDate, tokyoMonthStart, tokyoTomorrowStart } from '@/lib/date/tokyo';
import { isMockMode, getMockScenario } from '@/lib/mock/scenario';
import { generateMockCostData } from '@/lib/mock/cost-providers';
import { getAppSetting, APP_SETTING_KEYS } from '@/lib/database/app-settings';
import type { CostProviderOutcome, NormalizedDailyUsage } from './types';

/**
 * OpenAI organization Usage & Costs API client.
 * Reference (verified July 2026):
 *  - GET /organization/costs              (bucket_width=1d, amount.value/currency, has_more/next_page)
 *  - GET /organization/usage/completions   (bucket_width=1d, input_tokens/output_tokens/num_model_requests)
 * Requires an Admin API key (OPENAI_ADMIN_API_KEY), not a regular project key.
 */

const BASE_URL = 'https://api.openai.com/v1';

interface CostsBucket {
  start_time: number;
  end_time: number;
  results: Array<{ amount: { value: number; currency: string } }>;
}
interface CostsResponse {
  data: CostsBucket[];
  has_more: boolean;
  next_page: string | null;
}

interface CompletionsBucket {
  end_time: number;
  results: Array<{
    input_tokens: number;
    output_tokens: number;
    input_cached_tokens: number;
    num_model_requests: number;
  }>;
}
interface CompletionsResponse {
  data: CompletionsBucket[];
  has_more: boolean;
  next_page: string | null;
}

class OpenAiApiError extends Error {
  constructor(
    message: string,
    public readonly status: 'error' | 'not_configured',
  ) {
    super(message);
  }
}

async function openAiGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.OPENAI_ADMIN_API_KEY;
  if (!apiKey) {
    throw new OpenAiApiError('OPENAI_ADMIN_API_KEY is not set', 'not_configured');
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  const organizationId = (await getAppSetting(APP_SETTING_KEYS.openaiOrganizationId)) ?? process.env.OPENAI_ORGANIZATION_ID;
  if (organizationId) {
    headers['OpenAI-Organization'] = organizationId;
  }

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (res.status === 401 || res.status === 403) {
    throw new OpenAiApiError(
      `OpenAI API returned ${res.status}: Admin API keyでない、または権限不足の可能性があります`,
      'error',
    );
  }
  if (!res.ok) {
    throw new OpenAiApiError(`OpenAI API request failed: ${res.status} ${res.statusText}`, 'error');
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
    const response = await openAiGet<T>(path, params);
    allData.push(...response.data);
    if (!response.has_more || !response.next_page) break;
    page = response.next_page;
  }
  return allData;
}

export async function fetchOpenAiUsage(now: Date = new Date()): Promise<CostProviderOutcome> {
  if (isMockMode()) {
    const { getMonthlyBudgetJpy } = await import('@/lib/budget/monthly-budget');
    const { resolveCurrentFxRate } = await import('@/lib/currency/resolve');
    const budget = await getMonthlyBudgetJpy();
    const fx = await resolveCurrentFxRate();
    return generateMockCostData('openai', await getMockScenario(), budget, Number(fx?.rate ?? 150), now);
  }

  const startTime = Math.floor(tokyoMonthStart(now).getTime() / 1000);
  const endTime = Math.floor(tokyoTomorrowStart(now).getTime() / 1000);

  try {
    const [costBuckets, usageBuckets] = await Promise.all([
      fetchAllPages<CostsResponse>('/organization/costs', {
        start_time: String(startTime),
        end_time: String(endTime),
        bucket_width: '1d',
        limit: '31',
      }),
      fetchAllPages<CompletionsResponse>('/organization/usage/completions', {
        start_time: String(startTime),
        end_time: String(endTime),
        bucket_width: '1d',
        limit: '31',
      }),
    ]);

    const usageByEndTime = new Map<number, CompletionsBucket['results'][number]>();
    for (const bucket of usageBuckets) {
      const totals = bucket.results.reduce(
        (acc, r) => ({
          input_tokens: acc.input_tokens + r.input_tokens,
          output_tokens: acc.output_tokens + r.output_tokens,
          input_cached_tokens: acc.input_cached_tokens + r.input_cached_tokens,
          num_model_requests: acc.num_model_requests + r.num_model_requests,
        }),
        { input_tokens: 0, output_tokens: 0, input_cached_tokens: 0, num_model_requests: 0 },
      );
      usageByEndTime.set(bucket.end_time, totals);
    }

    const days: NormalizedDailyUsage[] = costBuckets.map((bucket) => {
      const costUsd = bucket.results.reduce((sum, r) => sum.plus(r.amount.value), new Decimal(0));
      const usage = usageByEndTime.get(bucket.end_time);
      const bucketDate = new Date(bucket.start_time * 1000);
      return {
        usageDate: formatTokyoDate(bucketDate),
        costOriginal: costUsd.toString(),
        currencyOriginal: (bucket.results[0]?.amount.currency ?? 'usd').toUpperCase(),
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        cachedInputTokens: usage?.input_cached_tokens ?? null,
        cachedOutputTokens: null,
        requestCount: usage?.num_model_requests ?? null,
        dataPeriodStart: new Date(bucket.start_time * 1000),
        dataPeriodEnd: new Date(bucket.end_time * 1000),
      };
    });

    return { ok: true, source: 'api', confidence: 'confirmed', isEstimated: false, days };
  } catch (err) {
    if (err instanceof OpenAiApiError) {
      return { ok: false, errorMessage: err.message, status: err.status };
    }
    return { ok: false, errorMessage: err instanceof Error ? err.message : String(err) };
  }
}
