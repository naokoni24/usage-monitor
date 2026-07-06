import type { Confidence, Provider } from '@/lib/database/schema';

/** One row of normalized daily usage, ready to upsert into `usage_daily`. */
export interface NormalizedDailyUsage {
  usageDate: string; // YYYY-MM-DD in Asia/Tokyo
  costOriginal: string; // decimal string
  currencyOriginal: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  cachedOutputTokens: number | null;
  requestCount: number | null;
  dataPeriodStart: Date | null;
  dataPeriodEnd: Date | null;
}

export interface NormalizedLimit {
  limitType: 'five_hour' | 'weekly';
  usedPercent: number;
  remainingPercent: number;
  resetAt: Date | null;
}

export type ProviderSource = 'api' | 'manual' | 'experimental-parser' | 'mock';

/** Result contract every cost-provider client (OpenAI/Anthropic/Gemini) must return. */
export interface CostProviderResult {
  ok: true;
  source: ProviderSource;
  confidence: Confidence;
  isEstimated: boolean;
  days: NormalizedDailyUsage[];
}

export interface CostProviderError {
  ok: false;
  errorMessage: string;
  /** Hints which connection status to record; defaults to 'error' when omitted. */
  status?: 'error' | 'not_configured';
}

export type CostProviderOutcome = CostProviderResult | CostProviderError;

/** Result contract every rate-limit provider client (Codex/Claude Code) must return. */
export interface LimitProviderResult {
  ok: true;
  source: ProviderSource;
  confidence: Confidence;
  limits: NormalizedLimit[];
  planInfo: string | null;
}

export interface LimitProviderError {
  ok: false;
  errorMessage: string;
  status?: 'error' | 'not_configured';
}

export type LimitProviderOutcome = LimitProviderResult | LimitProviderError;

export interface ProviderClient {
  readonly provider: Provider;
  isConfigured(): boolean;
}
