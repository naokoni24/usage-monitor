import 'server-only';
import Decimal from 'decimal.js';
import { BigQuery } from '@google-cloud/bigquery';
import { tokyoMonthStart, tokyoTomorrowStart } from '@/lib/date/tokyo';
import { isMockMode, getMockScenario } from '@/lib/mock/scenario';
import { generateMockCostData } from '@/lib/mock/cost-providers';
import { getAppSetting, APP_SETTING_KEYS } from '@/lib/database/app-settings';
import type { CostProviderOutcome, NormalizedDailyUsage } from './types';

/**
 * Gemini / Vertex AI cost via the Google Cloud Billing BigQuery export
 * (standard or detailed usage cost export schema:
 * https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage).
 * Billing export data lands with a delay of several hours to ~1 day, so
 * results are always marked `isEstimated` and `confidence: 'estimated'`
 * until the caller has independently confirmed finalization.
 */

class GeminiBillingError extends Error {
  constructor(
    message: string,
    public readonly status: 'error' | 'not_configured',
  ) {
    super(message);
  }
}

async function parseServiceFilters(): Promise<string[]> {
  const override = await getAppSetting(APP_SETTING_KEYS.geminiServiceFilters);
  const raw = (override ?? process.env.GCP_GEMINI_SERVICE_FILTERS)?.trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through to comma-splitting
    }
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Non-secret identifiers: settings-UI override wins, falling back to env.
async function getBillingIdentifiers(): Promise<{ projectId: string | null; dataset: string | null; table: string | null }> {
  const [projectIdOverride, datasetOverride, tableOverride] = await Promise.all([
    getAppSetting(APP_SETTING_KEYS.gcpBillingProjectId),
    getAppSetting(APP_SETTING_KEYS.gcpBillingDataset),
    getAppSetting(APP_SETTING_KEYS.gcpBillingTable),
  ]);
  return {
    projectId: projectIdOverride ?? process.env.GCP_BILLING_PROJECT_ID ?? null,
    dataset: datasetOverride ?? process.env.GCP_BILLING_DATASET ?? null,
    table: tableOverride ?? process.env.GCP_BILLING_TABLE ?? null,
  };
}

function getBigQueryClient(projectId: string): BigQuery {
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credsJson) {
    throw new GeminiBillingError('GOOGLE_SERVICE_ACCOUNT_JSON is not set', 'not_configured');
  }
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(credsJson);
  } catch {
    throw new GeminiBillingError('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON', 'not_configured');
  }
  return new BigQuery({ projectId, credentials });
}

interface BillingRow {
  usage_date: string; // produced via FORMAT_DATE, so the client returns a plain string
  cost_before_credits: number;
  credits_amount: number;
  currency: string;
  latest_usage_end: { value: string } | null; // raw TIMESTAMP column - client wraps it in { value }
}

export async function fetchGeminiUsage(now: Date = new Date()): Promise<CostProviderOutcome> {
  if (isMockMode()) {
    const { getMonthlyBudgetJpy } = await import('@/lib/budget/monthly-budget');
    const { resolveCurrentFxRate } = await import('@/lib/currency/resolve');
    const budget = await getMonthlyBudgetJpy();
    const fx = await resolveCurrentFxRate();
    return generateMockCostData('gemini', await getMockScenario(), budget, Number(fx?.rate ?? 150), now);
  }

  const { projectId, dataset, table } = await getBillingIdentifiers();
  if (!projectId || !dataset || !table) {
    return {
      ok: false,
      errorMessage: 'GCPプロジェクトID・データセット・テーブル名が未設定です(設定画面から入力してください)',
      status: 'not_configured',
    };
  }

  const filters = await parseServiceFilters();
  if (filters.length === 0) {
    return {
      ok: false,
      errorMessage: 'Geminiサービスフィルターが未設定です(対象サービス/SKUを設定画面から指定してください)',
      status: 'not_configured',
    };
  }

  try {
    const bigquery = getBigQueryClient(projectId);

    const filterConditions = filters.map((_, i) => `(service.description LIKE @f${i} OR sku.description LIKE @f${i})`);
    const params: Record<string, string> = {
      start: tokyoMonthStart(now).toISOString(),
      end: tokyoTomorrowStart(now).toISOString(),
    };
    filters.forEach((f, i) => {
      params[`f${i}`] = `%${f}%`;
    });

    const query = `
      SELECT
        FORMAT_DATE('%Y-%m-%d', DATE(usage_start_time, 'Asia/Tokyo')) AS usage_date,
        SUM(cost) AS cost_before_credits,
        SUM((SELECT IFNULL(SUM(c.amount), 0) FROM UNNEST(credits) c)) AS credits_amount,
        ANY_VALUE(currency) AS currency,
        MAX(usage_end_time) AS latest_usage_end
      FROM \`${projectId}.${dataset}.${table}\`
      WHERE usage_start_time >= TIMESTAMP(@start)
        AND usage_start_time < TIMESTAMP(@end)
        AND (${filterConditions.join(' OR ')})
      GROUP BY usage_date
      ORDER BY usage_date
    `;

    const [rows] = await bigquery.query({ query, params });
    const typedRows = rows as BillingRow[];

    const days: NormalizedDailyUsage[] = typedRows.map((row) => {
      const costBeforeCredits = new Decimal(row.cost_before_credits ?? 0);
      const credits = new Decimal(row.credits_amount ?? 0);
      const costAfterCredits = costBeforeCredits.plus(credits); // credits are stored as negative amounts
      const latestUsageEnd = row.latest_usage_end?.value ? new Date(row.latest_usage_end.value) : null;

      return {
        usageDate: row.usage_date,
        costOriginal: costAfterCredits.toString(),
        currencyOriginal: (row.currency ?? 'USD').toUpperCase(),
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        cachedOutputTokens: null,
        requestCount: null,
        dataPeriodStart: null,
        dataPeriodEnd: latestUsageEnd,
      };
    });

    return { ok: true, source: 'api', confidence: 'estimated', isEstimated: true, days };
  } catch (err) {
    if (err instanceof GeminiBillingError) {
      return { ok: false, errorMessage: err.message, status: err.status };
    }
    return { ok: false, errorMessage: err instanceof Error ? err.message : String(err) };
  }
}
