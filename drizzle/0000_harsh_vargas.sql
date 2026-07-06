CREATE TABLE `fx_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`base_currency` text DEFAULT 'USD' NOT NULL,
	`quote_currency` text DEFAULT 'JPY' NOT NULL,
	`rate` text NOT NULL,
	`source` text NOT NULL,
	`is_manual` integer DEFAULT false NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year_month` text NOT NULL,
	`budget_jpy` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_budgets_year_month_idx` ON `monthly_budgets` (`year_month`);--> statement-breakpoint
CREATE TABLE `notification_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_type` text NOT NULL,
	`threshold` real NOT NULL,
	`year_month` text NOT NULL,
	`provider` text DEFAULT 'all' NOT NULL,
	`message` text NOT NULL,
	`sent_at` integer,
	`status` text NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_events_dedupe_idx` ON `notification_events` (`rule_type`,`threshold`,`year_month`,`provider`);--> statement-breakpoint
CREATE TABLE `notification_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_type` text NOT NULL,
	`threshold` real NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_rules_type_threshold_idx` ON `notification_rules` (`rule_type`,`threshold`);--> statement-breakpoint
CREATE TABLE `provider_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'not_configured' NOT NULL,
	`last_success_at` integer,
	`last_error_at` integer,
	`last_error_message` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_connections_provider_idx` ON `provider_connections` (`provider`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_success_at` integer,
	`last_error_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_idx` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `subscription_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`limit_type` text NOT NULL,
	`used_percent` real NOT NULL,
	`remaining_percent` real NOT NULL,
	`reset_at` integer,
	`source` text NOT NULL,
	`confidence` text NOT NULL,
	`collected_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE INDEX `subscription_limits_provider_type_idx` ON `subscription_limits` (`provider`,`limit_type`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`error_message` text,
	`records_updated` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_runs_provider_idx` ON `sync_runs` (`provider`);--> statement-breakpoint
CREATE TABLE `usage_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`usage_date` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Tokyo' NOT NULL,
	`cost_original` text NOT NULL,
	`currency_original` text NOT NULL,
	`cost_jpy` text NOT NULL,
	`fx_rate` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`cached_input_tokens` integer,
	`cached_output_tokens` integer,
	`request_count` integer,
	`source` text NOT NULL,
	`confidence` text NOT NULL,
	`is_estimated` integer DEFAULT false NOT NULL,
	`data_period_start` integer,
	`data_period_end` integer,
	`last_synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_daily_provider_date_source_idx` ON `usage_daily` (`provider`,`usage_date`,`source`);--> statement-breakpoint
CREATE INDEX `usage_daily_provider_idx` ON `usage_daily` (`provider`);