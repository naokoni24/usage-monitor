import 'server-only';
import { z } from 'zod';
import { db } from '@/lib/database/client';
import { subscriptionLimits } from '@/lib/database/schema';
import { setAppSetting, APP_SETTING_KEYS } from '@/lib/database/app-settings';

export const claudeCodeManualInputSchema = z.object({
  fiveHourUsedPercent: z.number().min(0).max(100),
  weeklyUsedPercent: z.number().min(0).max(100),
  fiveHourResetAt: z.string().datetime().nullable().optional(),
  weeklyResetAt: z.string().datetime().nullable().optional(),
  memo: z.string().max(2000).optional(),
});

export type ClaudeCodeManualInput = z.infer<typeof claudeCodeManualInputSchema>;

export async function saveClaudeCodeManualInput(input: ClaudeCodeManualInput): Promise<void> {
  const now = new Date();
  await db.insert(subscriptionLimits).values([
    {
      provider: 'claude-code',
      limitType: 'five_hour',
      usedPercent: input.fiveHourUsedPercent,
      remainingPercent: Math.max(0, 100 - input.fiveHourUsedPercent),
      resetAt: input.fiveHourResetAt ? new Date(input.fiveHourResetAt) : null,
      source: 'manual',
      confidence: 'estimated',
      collectedAt: now,
      expiresAt: null,
    },
    {
      provider: 'claude-code',
      limitType: 'weekly',
      usedPercent: input.weeklyUsedPercent,
      remainingPercent: Math.max(0, 100 - input.weeklyUsedPercent),
      resetAt: input.weeklyResetAt ? new Date(input.weeklyResetAt) : null,
      source: 'manual',
      confidence: 'estimated',
      collectedAt: now,
      expiresAt: null,
    },
  ]);

  if (input.memo !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.claudeCodeManualMemo, input.memo);
  }
}
