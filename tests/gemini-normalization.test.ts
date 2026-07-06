import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('@google-cloud/bigquery', () => ({
  BigQuery: vi.fn().mockImplementation(function BigQueryMock() {
    return { query: queryMock };
  }),
}));

const ORIGINAL_ENV = { ...process.env };
const FIXED_NOW = new Date('2026-03-15T03:00:00Z');

describe('Google Billing (BigQuery) usage normalization', () => {
  beforeEach(() => {
    process.env.USE_MOCK_DATA = 'false';
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'test@example.com', private_key: 'x' });
    process.env.GCP_BILLING_PROJECT_ID = 'test-project';
    process.env.GCP_BILLING_DATASET = 'billing_export';
    process.env.GCP_BILLING_TABLE = 'gcp_billing_export_v1_TEST';
    process.env.GCP_GEMINI_SERVICE_FILTERS = 'Generative Language API,Vertex AI API';
    queryMock.mockReset();
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('applies credits (stored as negative amounts) on top of pre-credit cost', async () => {
    queryMock.mockResolvedValue([
      [
        {
          usage_date: '2026-03-15',
          cost_before_credits: 10,
          credits_amount: -2, // credits are negative in the billing export
          currency: 'USD',
          latest_usage_end: { value: '2026-03-15T09:00:00Z' },
        },
      ],
    ]);

    const { fetchGeminiUsage } = await import('@/lib/providers/gemini');
    const result = await fetchGeminiUsage(FIXED_NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confidence).toBe('estimated');
      expect(result.isEstimated).toBe(true);
      expect(result.days).toHaveLength(1);
      expect(result.days[0].costOriginal).toBe('8'); // 10 + (-2)
      expect(result.days[0].currencyOriginal).toBe('USD');
      expect(result.days[0].dataPeriodEnd?.toISOString()).toBe('2026-03-15T09:00:00.000Z');
    }
  });

  it('reports not_configured when service filters are empty', async () => {
    process.env.GCP_GEMINI_SERVICE_FILTERS = '';
    const { fetchGeminiUsage } = await import('@/lib/providers/gemini');
    const result = await fetchGeminiUsage(FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe('not_configured');
  });

  it('reports not_configured when BigQuery credentials are missing', async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const { fetchGeminiUsage } = await import('@/lib/providers/gemini');
    const result = await fetchGeminiUsage(FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe('not_configured');
  });
});
