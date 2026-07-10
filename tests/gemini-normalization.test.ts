import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const queryMock = vi.fn();
const listTimeSeriesMock = vi.fn();

vi.mock('@google-cloud/bigquery', () => ({
  BigQuery: vi.fn().mockImplementation(function BigQueryMock() {
    return { query: queryMock };
  }),
}));

vi.mock('@google-cloud/monitoring', () => ({
  MetricServiceClient: vi.fn().mockImplementation(function MetricServiceClientMock() {
    return { listTimeSeries: listTimeSeriesMock };
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
    listTimeSeriesMock.mockReset();
    listTimeSeriesMock.mockResolvedValue([[]]);
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('applies credits (stored as negative amounts) on top of pre-credit cost', async () => {
    listTimeSeriesMock
      .mockResolvedValueOnce([
        [
          {
            points: [
              {
                interval: { startTime: { seconds: 1773500400 } }, // 2026-03-15 00:00 JST
                value: { int64Value: '37' },
              },
            ],
          },
        ],
      ])
      .mockResolvedValueOnce([[]]);
    queryMock.mockResolvedValue([
      [
        {
          usage_date: '2026-03-15',
          cost_before_credits: 10,
          credits_amount: -2, // credits are negative in the billing export
          currency: 'USD',
          latest_usage_end: { value: '2026-03-15T09:00:00Z' },
          input_tokens: 20210,
          output_tokens: 74064,
          cached_input_tokens: 0,
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
      expect(result.days[0].inputTokens).toBe(20210);
      expect(result.days[0].outputTokens).toBe(74064);
      // 0 means "no matching SKU" and must surface as unknown, never as a stored 0
      expect(result.days[0].cachedInputTokens).toBeNull();
      expect(result.days[0].requestCount).toBe(37);
      expect(listTimeSeriesMock.mock.calls[0][0].filter).not.toContain('metric.labels.method');
    }
  });

  it('continues to return billing data when Cloud Monitoring is unavailable', async () => {
    listTimeSeriesMock.mockRejectedValueOnce(new Error('Monitoring API is disabled'));
    queryMock.mockResolvedValue([
      [
        {
          usage_date: '2026-03-15', cost_before_credits: 1, credits_amount: 0, currency: 'USD',
          latest_usage_end: null, input_tokens: 1, output_tokens: 1, cached_input_tokens: 0,
        },
      ],
    ]);

    const { fetchGeminiUsage } = await import('@/lib/providers/gemini');
    const result = await fetchGeminiUsage(FIXED_NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.days[0].requestCount).toBeNull();
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
