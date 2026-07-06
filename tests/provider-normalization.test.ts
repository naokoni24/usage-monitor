import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchOpenAiUsage } from '@/lib/providers/openai';
import { fetchAnthropicUsage } from '@/lib/providers/anthropic';

const ORIGINAL_ENV = { ...process.env };
const FIXED_NOW = new Date('2026-03-15T03:00:00Z'); // 2026-03-15 12:00 JST

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('OpenAI usage/cost normalization', () => {
  beforeEach(() => {
    process.env.USE_MOCK_DATA = 'false';
    process.env.OPENAI_ADMIN_API_KEY = 'sk-admin-test';
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it('sums bucket costs (already in USD) and merges token usage by end_time', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/organization/costs')) {
        return jsonResponse({
          object: 'page',
          data: [
            {
              object: 'bucket',
              start_time: 1741996800, // 2026-03-15 00:00:00Z
              end_time: 1742083200,
              results: [{ amount: { value: 0.5, currency: 'usd' } }, { amount: { value: 0.25, currency: 'usd' } }],
            },
          ],
          has_more: false,
          next_page: null,
        });
      }
      if (url.includes('/organization/usage/completions')) {
        return jsonResponse({
          object: 'page',
          data: [
            {
              object: 'bucket',
              end_time: 1742083200,
              results: [
                { input_tokens: 1000, output_tokens: 200, input_cached_tokens: 100, num_model_requests: 5 },
              ],
            },
          ],
          has_more: false,
          next_page: null,
        });
      }
      throw new Error(`unexpected URL in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchOpenAiUsage(FIXED_NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.confidence).toBe('confirmed');
      expect(result.days).toHaveLength(1);
      expect(result.days[0].costOriginal).toBe('0.75');
      expect(result.days[0].currencyOriginal).toBe('USD');
      expect(result.days[0].inputTokens).toBe(1000);
      expect(result.days[0].outputTokens).toBe(200);
      expect(result.days[0].requestCount).toBe(5);
    }
  });

  it('reports not_configured when the admin key is missing', async () => {
    delete process.env.OPENAI_ADMIN_API_KEY;
    const result = await fetchOpenAiUsage(FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe('not_configured');
  });

  it('reports error on a 401 (wrong key type / insufficient permission)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    );
    const result = await fetchOpenAiUsage(FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe('error');
  });
});

describe('Anthropic usage/cost normalization', () => {
  beforeEach(() => {
    process.env.USE_MOCK_DATA = 'false';
    process.env.ANTHROPIC_ADMIN_API_KEY = 'admin-test-key';
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it('converts cost_report amounts from cents to dollars and sums token usage', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/organizations/cost_report')) {
        return jsonResponse({
          data: [
            {
              starting_at: '2026-03-15T00:00:00Z',
              ending_at: '2026-03-16T00:00:00Z',
              results: [{ amount: '150.00', currency: 'USD' }], // 150 cents = $1.50
            },
          ],
          has_more: false,
          next_page: null,
        });
      }
      if (url.includes('/organizations/usage_report/messages')) {
        return jsonResponse({
          data: [
            {
              starting_at: '2026-03-15T00:00:00Z',
              ending_at: '2026-03-16T00:00:00Z',
              results: [
                {
                  uncached_input_tokens: 500,
                  output_tokens: 100,
                  cache_read_input_tokens: 50,
                  cache_creation: { ephemeral_1h_input_tokens: 10, ephemeral_5m_input_tokens: 5 },
                },
              ],
            },
          ],
          has_more: false,
          next_page: null,
        });
      }
      throw new Error(`unexpected URL in test: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAnthropicUsage(FIXED_NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.days).toHaveLength(1);
      expect(result.days[0].costOriginal).toBe('1.5');
      expect(result.days[0].inputTokens).toBe(500);
      expect(result.days[0].outputTokens).toBe(100);
      expect(result.days[0].cachedInputTokens).toBe(65); // 50 + 10 + 5
      expect(result.days[0].requestCount).toBeNull(); // Anthropic exposes no request-count field
    }
  });

  it('reports not_configured when the admin key is missing', async () => {
    delete process.env.ANTHROPIC_ADMIN_API_KEY;
    const result = await fetchAnthropicUsage(FIXED_NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe('not_configured');
  });
});
