import 'server-only';
import { db } from '@/lib/database/client';
import { notificationRules } from '@/lib/database/schema';

const DEFAULT_RULES: Array<{ ruleType: string; threshold: number }> = [
  { ruleType: 'budget', threshold: 50 },
  { ruleType: 'budget', threshold: 80 },
  { ruleType: 'budget', threshold: 100 },
  { ruleType: 'codex_five_hour', threshold: 80 },
  { ruleType: 'codex_five_hour', threshold: 90 },
  { ruleType: 'codex_weekly', threshold: 90 },
  { ruleType: 'claude_code_five_hour', threshold: 80 },
  { ruleType: 'claude_code_five_hour', threshold: 90 },
  { ruleType: 'claude_code_weekly', threshold: 90 },
  { ruleType: 'system_sync_failure_12h', threshold: 0 },
  { ruleType: 'system_stale_24h', threshold: 0 },
  { ruleType: 'system_fx_stale_3d', threshold: 0 },
  { ruleType: 'system_billing_stale_48h', threshold: 0 },
];

export async function seedDefaultNotificationRules(): Promise<void> {
  for (const rule of DEFAULT_RULES) {
    await db
      .insert(notificationRules)
      .values({ ruleType: rule.ruleType, threshold: rule.threshold, enabled: true })
      .onConflictDoNothing({ target: [notificationRules.ruleType, notificationRules.threshold] });
  }
}
