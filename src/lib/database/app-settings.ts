import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { appSettings } from './schema';

export const APP_SETTING_KEYS = {
  syncIntervalMinutes: 'syncIntervalMinutes',
  geminiServiceFilters: 'geminiServiceFilters',
  mockScenario: 'mockScenario',
  claudeCodeManualMemo: 'claudeCodeManualMemo',
  notificationRepeatAfterDrop: 'notificationRepeatAfterDrop',
  // Non-secret identifiers only (never API keys/credentials) - safe to edit from the settings UI.
  openaiOrganizationId: 'openaiOrganizationId',
  gcpBillingProjectId: 'gcpBillingProjectId',
  gcpBillingDataset: 'gcpBillingDataset',
  gcpBillingTable: 'gcpBillingTable',
  // Flat monthly subscription fees (ChatGPT Plus/Pro, Claude Pro/Max, etc.) - these are
  // billed outside the Admin API entirely, so there is nothing to fetch automatically.
  // ChatGPT Plus/Pro is billed in JPY for JP accounts; Claude Pro/Max bills in
  // USD regardless of region, so it's stored in USD and converted to JPY at
  // display time using the same FX rate as the API costs.
  openaiMonthlySubscriptionJpy: 'openaiMonthlySubscriptionJpy',
  anthropicMonthlySubscriptionUsd: 'anthropicMonthlySubscriptionUsd',
  // Day of month (1-28) the subscription renews - used to send a reminder push
  // asking the user to re-check/re-enter the fee, since it cannot be fetched.
  openaiSubscriptionRenewalDay: 'openaiSubscriptionRenewalDay',
  anthropicSubscriptionRenewalDay: 'anthropicSubscriptionRenewalDay',
  // Display name for each subscription (plan tiers vary per account, e.g. "ChatGPT Plus"
  // vs "ChatGPT Pro"), editable since it can't be inferred from any API.
  openaiSubscriptionName: 'openaiSubscriptionName',
  anthropicSubscriptionName: 'anthropicSubscriptionName',
  // Prepaid API-credit balances are not exposed by the usage-report APIs, so
  // they are entered manually and shown on the corresponding dashboard card.
  openaiRemainingCreditUsd: 'openaiRemainingCreditUsd',
  anthropicRemainingCreditUsd: 'anthropicRemainingCreditUsd',
  // Cumulative OpenAI/Anthropic API usage (USD) when the balance above was last
  // entered - later cost-sync deltas are subtracted from it, same mechanism as
  // geminiRemainingCreditBaselineUsageJpy below.
  openaiRemainingCreditBaselineUsageUsd: 'openaiRemainingCreditBaselineUsageUsd',
  anthropicRemainingCreditBaselineUsageUsd: 'anthropicRemainingCreditBaselineUsageUsd',
  // Gemini/AI Studio credit is typically topped up in JPY for JP accounts, so unlike
  // the other two this is entered and stored directly in JPY (no FX conversion needed).
  geminiRemainingCreditJpy: 'geminiRemainingCreditJpy',
  // Cumulative Gemini API usage when the user last entered the real AI Studio balance.
  // Later API-cost deltas are subtracted from that balance without double-counting syncs.
  geminiRemainingCreditBaselineUsageJpy: 'geminiRemainingCreditBaselineUsageJpy',
  // AI Studio has no public cost-reporting API. When its displayed monthly
  // total differs from the Cloud Billing export, this value takes precedence.
  geminiAiStudioMonthTotalJpy: 'geminiAiStudioMonthTotalJpy',
  // Tokyo year-month (YYYY-MM) the value above was entered for. Once the
  // current month moves past this, the override is stale (it described a
  // month that has already ended) and must be ignored rather than bleeding
  // into the new month's total.
  geminiAiStudioMonthTotalYearMonth: 'geminiAiStudioMonthTotalYearMonth',
} as const;

export async function getAppSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function getAllAppSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
