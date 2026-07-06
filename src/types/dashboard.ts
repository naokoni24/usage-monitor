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
  todayCostOriginal: string | null;
  todayCostJpy: string | null;
  monthCostOriginal: string | null;
  monthCostJpy: string | null;
  currencyOriginal: string | null;
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
  todayTotalJpy: string;
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
