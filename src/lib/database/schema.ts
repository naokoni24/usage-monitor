import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// provider identifiers used across the whole app
export const PROVIDERS = ['openai', 'anthropic', 'gemini', 'codex', 'claude-code'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const CONFIDENCE_LEVELS = ['confirmed', 'estimated', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const LIMIT_TYPES = ['five_hour', 'weekly'] as const;
export type LimitType = (typeof LIMIT_TYPES)[number];

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
};

export const providerConnections = sqliteTable(
  'provider_connections',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull().$type<Provider>(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    status: text('status').notNull().default('not_configured'),
    lastSuccessAt: integer('last_success_at', { mode: 'timestamp_ms' }),
    lastErrorAt: integer('last_error_at', { mode: 'timestamp_ms' }),
    lastErrorMessage: text('last_error_message'),
    ...timestamps,
  },
  (table) => [uniqueIndex('provider_connections_provider_idx').on(table.provider)],
);

// cost/token amounts are stored as decimal strings (not float) to avoid rounding drift;
// callers must parse them with decimal.js.
export const usageDaily = sqliteTable(
  'usage_daily',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull().$type<Provider>(),
    usageDate: text('usage_date').notNull(), // YYYY-MM-DD in `timezone`
    timezone: text('timezone').notNull().default('Asia/Tokyo'),
    costOriginal: text('cost_original').notNull(),
    currencyOriginal: text('currency_original').notNull(),
    costJpy: text('cost_jpy').notNull(),
    fxRate: text('fx_rate').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cachedInputTokens: integer('cached_input_tokens'),
    cachedOutputTokens: integer('cached_output_tokens'),
    requestCount: integer('request_count'),
    source: text('source').notNull(), // api | manual | experimental-parser | mock
    confidence: text('confidence').notNull().$type<Confidence>(),
    isEstimated: integer('is_estimated', { mode: 'boolean' }).notNull().default(false),
    dataPeriodStart: integer('data_period_start', { mode: 'timestamp_ms' }),
    dataPeriodEnd: integer('data_period_end', { mode: 'timestamp_ms' }),
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('usage_daily_provider_date_source_idx').on(
      table.provider,
      table.usageDate,
      table.source,
    ),
    index('usage_daily_provider_idx').on(table.provider),
  ],
);

export const subscriptionLimits = sqliteTable(
  'subscription_limits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull().$type<Provider>(),
    limitType: text('limit_type').notNull().$type<LimitType>(),
    usedPercent: real('used_percent').notNull(),
    remainingPercent: real('remaining_percent').notNull(),
    resetAt: integer('reset_at', { mode: 'timestamp_ms' }),
    source: text('source').notNull(),
    confidence: text('confidence').notNull().$type<Confidence>(),
    collectedAt: integer('collected_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('subscription_limits_provider_type_idx').on(table.provider, table.limitType)],
);

export const fxRates = sqliteTable('fx_rates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  baseCurrency: text('base_currency').notNull().default('USD'),
  quoteCurrency: text('quote_currency').notNull().default('JPY'),
  rate: text('rate').notNull(),
  source: text('source').notNull(), // api | manual | env | cache
  isManual: integer('is_manual', { mode: 'boolean' }).notNull().default(false),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
});

export const monthlyBudgets = sqliteTable(
  'monthly_budgets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    yearMonth: text('year_month').notNull(), // YYYY-MM
    budgetJpy: integer('budget_jpy').notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex('monthly_budgets_year_month_idx').on(table.yearMonth)],
);

export const notificationRules = sqliteTable(
  'notification_rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ruleType: text('rule_type').notNull(),
    threshold: real('threshold').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex('notification_rules_type_threshold_idx').on(table.ruleType, table.threshold)],
);

// `provider` is NOT NULL (sentinel 'all' for non-provider-specific rules) so the
// uniqueness constraint below actually dedupes: SQLite unique indexes treat
// NULL as distinct from NULL, which would otherwise let duplicates slip through.
export const notificationEvents = sqliteTable(
  'notification_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ruleType: text('rule_type').notNull(),
    threshold: real('threshold').notNull(),
    yearMonth: text('year_month').notNull(),
    provider: text('provider').notNull().default('all'),
    message: text('message').notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    status: text('status').notNull(), // sent | failed
    errorMessage: text('error_message'),
  },
  (table) => [
    uniqueIndex('notification_events_dedupe_idx').on(
      table.ruleType,
      table.threshold,
      table.yearMonth,
      table.provider,
    ),
  ],
);

export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    lastSuccessAt: integer('last_success_at', { mode: 'timestamp_ms' }),
    lastErrorAt: integer('last_error_at', { mode: 'timestamp_ms' }),
  },
  (table) => [uniqueIndex('push_subscriptions_endpoint_idx').on(table.endpoint)],
);

// Generic key/value store for runtime-editable settings that don't warrant
// their own table (sync interval, Gemini service filters, mock scenario
// override, Claude Code manual-input memo). Never stores API keys/secrets.
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
});

export const syncRuns = sqliteTable(
  'sync_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull().$type<Provider>(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    status: text('status').notNull(), // running | success | partial | error
    errorMessage: text('error_message'),
    recordsUpdated: integer('records_updated').notNull().default(0),
  },
  (table) => [index('sync_runs_provider_idx').on(table.provider)],
);
