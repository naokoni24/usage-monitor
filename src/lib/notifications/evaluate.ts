import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { notificationRules, notificationEvents } from '@/lib/database/schema';
import { getAppSetting, APP_SETTING_KEYS } from '@/lib/database/app-settings';
import { tokyoYearMonth } from '@/lib/date/tokyo';
import { buildDashboard } from '@/lib/dashboard/build-dashboard';
import type { DashboardResponse } from '@/types/dashboard';
import { sendPushToAllSubscriptions } from './web-push';
import { logger } from '@/lib/logging/logger';

interface Trigger {
  ruleType: string;
  provider: string; // 'all' for non-provider-specific rules
  currentValue: number; // compared against each matching rule's configured threshold
  message: string;
}

function yenFormat(n: number): string {
  return `${Math.round(n).toLocaleString('ja-JP')}円`;
}

function buildTriggers(dashboard: DashboardResponse, warnings: string[]): Trigger[] {
  const triggers: Trigger[] = [];

  triggers.push({
    ruleType: 'budget',
    provider: 'all',
    currentValue: dashboard.budgetUsedPercent,
    message: `今月のAI利用料が上限に達しました。\n現在:${yenFormat(Number(dashboard.monthTotalJpy))}\n上限:${yenFormat(dashboard.monthlyBudgetJpy)}`,
  });

  for (const card of dashboard.subscriptionLimits) {
    if (card.fiveHour) {
      triggers.push({
        ruleType: card.provider === 'codex' ? 'codex_five_hour' : 'claude_code_five_hour',
        provider: card.provider,
        currentValue: card.fiveHour.usedPercent,
        message: `${card.provider}の5時間枠が${Math.round(card.fiveHour.usedPercent)}%に達しました。${
          card.fiveHour.resetAt ? `\nリセット予定:${new Date(card.fiveHour.resetAt).toLocaleString('ja-JP')}` : ''
        }`,
      });
    }
    if (card.weekly) {
      triggers.push({
        ruleType: card.provider === 'codex' ? 'codex_weekly' : 'claude_code_weekly',
        provider: card.provider,
        currentValue: card.weekly.usedPercent,
        message: `${card.provider}の週間枠が${Math.round(card.weekly.usedPercent)}%に達しました。`,
      });
    }
  }

  const systemChecks: Array<[string, string]> = [
    ['system_sync_failure_12h', '12時間以上失敗'],
    ['system_stale_24h', '24時間以上経過'],
    ['system_fx_stale_3d', '為替レートが3日以上'],
    ['system_billing_stale_48h', '48時間以上更新されていません'],
  ];
  for (const [ruleType, keyword] of systemChecks) {
    const matched = warnings.find((w) => w.includes(keyword));
    if (matched) {
      triggers.push({ ruleType, provider: 'all', currentValue: 100, message: matched });
    }
  }

  return triggers;
}

export async function evaluateAndSendNotifications(now: Date = new Date()): Promise<void> {
  const dashboard = await buildDashboard(now);
  const triggers = buildTriggers(dashboard, dashboard.warnings);
  const yearMonth = tokyoYearMonth(now);
  const repeatAfterDrop = (await getAppSetting(APP_SETTING_KEYS.notificationRepeatAfterDrop)) === 'true';

  const rules = await db.select().from(notificationRules).where(eq(notificationRules.enabled, true));

  for (const rule of rules) {
    const candidates = triggers.filter((t) => t.ruleType === rule.ruleType);
    for (const trigger of candidates) {
      const dedupeKey = and(
        eq(notificationEvents.ruleType, rule.ruleType),
        eq(notificationEvents.threshold, rule.threshold),
        eq(notificationEvents.yearMonth, yearMonth),
        eq(notificationEvents.provider, trigger.provider),
      );

      if (trigger.currentValue < rule.threshold) {
        if (repeatAfterDrop) {
          // Allow this rule/threshold to fire again later this month once the value has dropped back down.
          await db.delete(notificationEvents).where(dedupeKey!);
        }
        continue;
      }

      const [existing] = await db.select().from(notificationEvents).where(dedupeKey!).limit(1);
      if (existing) continue; // already sent this month for this rule/threshold/provider

      const message = `AI Usage Monitor\n\n${trigger.message}`;
      try {
        const summary = await sendPushToAllSubscriptions({ title: 'AI Usage Monitor', body: trigger.message });
        await db.insert(notificationEvents).values({
          ruleType: rule.ruleType,
          threshold: rule.threshold,
          yearMonth,
          provider: trigger.provider,
          message,
          sentAt: new Date(),
          status: summary.sent > 0 || summary.failed === 0 ? 'sent' : 'failed',
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('notification send failed', { ruleType: rule.ruleType, error: errorMessage });
        await db.insert(notificationEvents).values({
          ruleType: rule.ruleType,
          threshold: rule.threshold,
          yearMonth,
          provider: trigger.provider,
          message,
          sentAt: null,
          status: 'failed',
          errorMessage,
        });
      }
    }
  }
}
