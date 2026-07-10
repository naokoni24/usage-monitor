import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { usageDaily, notificationRules, notificationEvents, monthlyBudgets, appSettings } from '@/lib/database/schema';
import { evaluateAndSendNotifications } from '@/lib/notifications/evaluate';
import { setAppSetting, APP_SETTING_KEYS } from '@/lib/database/app-settings';
import { formatTokyoDate, tokyoYearMonth } from '@/lib/date/tokyo';

const now = new Date();
const yearMonth = tokyoYearMonth(now);
const today = formatTokyoDate(now);

async function seedBudgetRules() {
  await db.insert(notificationRules).values([
    { ruleType: 'budget', threshold: 50, enabled: true },
    { ruleType: 'budget', threshold: 80, enabled: true },
    { ruleType: 'budget', threshold: 100, enabled: true },
  ]);
}

async function seedMonthCostJpy(costJpy: string) {
  await db.insert(monthlyBudgets).values({
    yearMonth,
    budgetJpy: 5000,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(usageDaily).values({
    provider: 'openai',
    usageDate: today,
    timezone: 'Asia/Tokyo',
    costOriginal: (Number(costJpy) / 150).toFixed(2),
    currencyOriginal: 'USD',
    costJpy,
    fxRate: '150',
    inputTokens: 1000,
    outputTokens: 200,
    cachedInputTokens: null,
    cachedOutputTokens: null,
    requestCount: 10,
    source: 'api',
    confidence: 'confirmed',
    isEstimated: false,
    dataPeriodStart: null,
    dataPeriodEnd: null,
    lastSyncedAt: now,
  });
}

async function budgetEventThresholds(): Promise<number[]> {
  const rows = await db.select().from(notificationEvents).where(eq(notificationEvents.ruleType, 'budget'));
  return rows.map((r) => r.threshold).sort((a, b) => a - b);
}

describe('monthly budget notification thresholds', () => {
  beforeEach(async () => {
    await db.delete(usageDaily);
    await db.delete(notificationRules);
    await db.delete(notificationEvents);
    await db.delete(monthlyBudgets);
    await seedBudgetRules();
  });

  it('fires the 50% rule once spend crosses 50%', async () => {
    await seedMonthCostJpy('2600'); // 52%
    await evaluateAndSendNotifications(now);
    expect(await budgetEventThresholds()).toEqual([50]);
  });

  it('fires both the 50% and 80% rules once spend crosses 80%', async () => {
    await seedMonthCostJpy('4100'); // 82%
    await evaluateAndSendNotifications(now);
    expect(await budgetEventThresholds()).toEqual([50, 80]);
  });

  it('fires all three rules once spend reaches 100%', async () => {
    await seedMonthCostJpy('5000'); // 100%
    await evaluateAndSendNotifications(now);
    expect(await budgetEventThresholds()).toEqual([50, 80, 100]);
  });

  it('does not send the same rule/threshold/month notification twice', async () => {
    await seedMonthCostJpy('5000');
    await evaluateAndSendNotifications(now);
    await evaluateAndSendNotifications(now); // second sync pass, still 100%

    const rows = await db.select().from(notificationEvents).where(eq(notificationEvents.ruleType, 'budget'));
    expect(rows).toHaveLength(3); // still just one row per threshold, not six
  });
});

describe('subscription renewal reminders', () => {
  const renewalDay = new Date('2026-03-05T03:00:00Z'); // 2026-03-05 12:00 JST -> day "5"
  const otherDay = new Date('2026-03-10T03:00:00Z'); // day "10"

  beforeEach(async () => {
    await db.delete(notificationRules);
    await db.delete(notificationEvents);
    await db.delete(appSettings);
    await db.insert(notificationRules).values([
      { ruleType: 'subscription_renewal_openai', threshold: 0, enabled: true },
      { ruleType: 'subscription_renewal_anthropic', threshold: 0, enabled: true },
    ]);
  });

  it('sends a reminder only on the configured renewal day', async () => {
    await setAppSetting(APP_SETTING_KEYS.openaiSubscriptionRenewalDay, '5');

    await evaluateAndSendNotifications(otherDay);
    expect(
      await db.select().from(notificationEvents).where(eq(notificationEvents.ruleType, 'subscription_renewal_openai')),
    ).toHaveLength(0);

    await evaluateAndSendNotifications(renewalDay);
    expect(
      await db.select().from(notificationEvents).where(eq(notificationEvents.ruleType, 'subscription_renewal_openai')),
    ).toHaveLength(1);
  });

  it('does not resend the same renewal reminder twice in the same month', async () => {
    await setAppSetting(APP_SETTING_KEYS.anthropicSubscriptionRenewalDay, '5');

    await evaluateAndSendNotifications(renewalDay);
    await evaluateAndSendNotifications(renewalDay);

    const rows = await db
      .select()
      .from(notificationEvents)
      .where(eq(notificationEvents.ruleType, 'subscription_renewal_anthropic'));
    expect(rows).toHaveLength(1);
  });

  it('does nothing when no renewal day is configured', async () => {
    await evaluateAndSendNotifications(renewalDay);
    const rows = await db.select().from(notificationEvents);
    expect(rows.filter((r) => r.ruleType.startsWith('subscription_renewal_'))).toHaveLength(0);
  });
});
