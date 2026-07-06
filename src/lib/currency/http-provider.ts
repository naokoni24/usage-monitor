import type { ExchangeRateProvider } from './types';

/**
 * Generic HTTP exchange-rate provider. Expects a JSON response containing a
 * numeric USD->JPY rate somewhere in the payload. Configure FX_API_URL to an
 * endpoint that returns `{ "rates": { "JPY": 150.2 } }` or a similar shape;
 * this reads a handful of common shapes so most public FX APIs work without code changes.
 */
export class HttpExchangeRateProvider implements ExchangeRateProvider {
  readonly name = 'http';

  constructor(
    private readonly url: string,
    private readonly apiKey?: string,
  ) {}

  async fetchUsdJpyRate(): Promise<string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    const res = await fetch(this.url, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      throw new Error(`FX API request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as unknown;
    const rate = extractJpyRate(data);
    if (rate === null || !Number.isFinite(rate) || rate <= 0) {
      throw new Error('FX API response did not contain a usable USD/JPY rate');
    }
    return rate.toString();
  }
}

function extractJpyRate(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const obj = data as Record<string, unknown>;

  if (typeof obj.rates === 'object' && obj.rates !== null) {
    const rates = obj.rates as Record<string, unknown>;
    if (typeof rates.JPY === 'number') return rates.JPY;
  }
  if (typeof obj.JPY === 'number') return obj.JPY;
  if (typeof obj.rate === 'number') return obj.rate;
  if (typeof obj.conversion_rate === 'number') return obj.conversion_rate;
  if (typeof obj.result === 'object' && obj.result !== null) {
    const result = obj.result as Record<string, unknown>;
    if (typeof result.JPY === 'number') return result.JPY;
  }
  return null;
}
