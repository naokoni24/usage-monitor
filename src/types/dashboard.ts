// Shared JSON contract for the dashboard API. Kept flat and Swift-Codable-friendly
// (no unions of object shapes, explicit null instead of undefined) so an iOS
// client can decode this directly in the future. See docs/IOS_FUTURE_PLAN.md.

export type ConnectionStatus = 'ok' | 'degraded' | 'error' | 'not_configured' | 'disabled';
export type Confidence = 'confirmed' | 'estimated' | 'low';
export type FxSource = 'api' | 'env' | 'manual';

export interface ProviderUsageCard {
  provider: 'openai' | 'anthropic' | 'gemini';
  enabled: boolean;
  status: ConnectionStatus;
  /** Most recent day for which this provider has data (YYYY-MM-DD), or null when none. */
  latestDayDate: string | null;
  latestDayCostOriginal: string | null;
  latestDayCostJpy: string | null;
  monthCostOriginal: string | null;
  monthCostJpy: string | null;
  /** True when Gemini's monthly cost is manually entered from AI Studio. */
  monthCostManuallyEntered: boolean;
  currencyOriginal: string | null;
  /**
   * Flat monthly subscription fee (ChatGPT Plus/Pro, Claude Pro/Max, etc.),
   * manually entered in settings. This is billed outside any usage API, so it
   * cannot be fetched automatically - null means none has been set.
   * `monthlySubscriptionOriginal`/`monthlySubscriptionCurrency` hold the value
   * as entered (JPY for OpenAI, USD for Anthropic); `monthlySubscriptionJpy`
   * is always the JPY-converted amount used in totals.
   */
  monthlySubscriptionJpy: number | null;
  monthlySubscriptionOriginal: string | null;
  monthlySubscriptionCurrency: string | null;
  /** User-editable plan name (e.g. "ChatGPT Plus"), since plan tiers vary per account. */
  monthlySubscriptionName: string | null;
  /** Prepaid API-credit balance, manually entered in settings because usage APIs do not expose it. */
  remainingCreditUsd: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  requestCount: number | null;
  lastFetchedAt: string | null;
  confidence: Confidence | null;
  isEstimated: boolean;
  errorMessage: string | null;
}

export interface LimitWindow {
  usedPercent: number;
  remainingPercent: number;
  resetAt: string | null;
}

export interface SubscriptionLimitCard {
  provider: 'codex' | 'claude-code';
  enabled: boolean;
  status: ConnectionStatus;
  fiveHour: LimitWindow | null;
  weekly: LimitWindow | null;
  source: string | null;
  confidence: Confidence | null;
  lastFetchedAt: string | null;
  errorMessage: string | null;
}

export interface FxRateInfo {
  rate: string | null;
  source: FxSource | null;
  fetchedAt: string | null;
}

export interface NotificationEventSummary {
  ruleType: string;
  threshold: number;
  message: string;
  sentAt: string | null;
  status: string;
}

export interface NotificationsInfo {
  webPushEnabled: boolean;
  subscriptionCount: number;
  recentEvents: NotificationEventSummary[];
}

export interface DashboardResponse {
  /** Sum of each provider's latest available day (may span slightly different dates). */
  latestDayTotalJpy: string;
  /** Most recent usage date across all providers (YYYY-MM-DD), or null when no data. */
  latestDayDate: string | null;
  monthTotalJpy: string;
  monthlyBudgetJpy: number;
  budgetUsedPercent: number;
  fxRate: FxRateInfo;
  providers: ProviderUsageCard[];
  subscriptionLimits: SubscriptionLimitCard[];
  notifications: NotificationsInfo;
  lastSyncedAt: string | null;
  warnings: string[];
}
