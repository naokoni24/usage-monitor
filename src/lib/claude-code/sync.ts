import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { subscriptionLimits } from '@/lib/database/schema';
import type { LimitProviderOutcome, NormalizedLimit } from '@/lib/providers/types';
import { isMockMode, getMockScenario } from '@/lib/mock/scenario';
import { generateMockClaudeCodeLimits } from '@/lib/mock/limit-providers';
import { runExperimentalClaudeCodeParser } from './experimental-parser';

async function latestManualLimits(): Promise<LimitProviderOutcome> {
  const rows = await db
    .select()
    .from(subscriptionLimits)
    .where(eq(subscriptionLimits.provider, 'claude-code'))
    .orderBy(desc(subscriptionLimits.collectedAt))
    .limit(10);

  const fiveHour = rows.find((r) => r.limitType === 'five_hour');
  const weekly = rows.find((r) => r.limitType === 'weekly');

  if (!fiveHour && !weekly) {
    return {
      ok: false,
      errorMessage: '未設定: 設定画面からClaude Codeの利用率を手動入力してください',
      status: 'not_configured',
    };
  }

  const limits: NormalizedLimit[] = [];
  for (const row of [fiveHour, weekly]) {
    if (!row) continue;
    limits.push({
      limitType: row.limitType,
      usedPercent: row.usedPercent,
      remainingPercent: row.remainingPercent,
      resetAt: row.resetAt,
    });
  }

  return {
    ok: true,
    source: 'manual',
    confidence: 'estimated',
    limits,
    planInfo: null,
  };
}

export async function fetchClaudeCodeLimits(): Promise<LimitProviderOutcome> {
  if (isMockMode()) {
    return generateMockClaudeCodeLimits(await getMockScenario());
  }

  if (process.env.CLAUDE_CODE_ENABLED !== 'true') {
    return { ok: false, errorMessage: 'Claude Code連携は設定で無効化されています', status: 'not_configured' };
  }

  if (process.env.ENABLE_CLAUDE_USAGE_PARSER === 'true') {
    const parsed = await runExperimentalClaudeCodeParser();
    if (parsed.ok) return parsed;
    // Fall back to the last manual entry (if any) rather than surfacing a hard error,
    // since manual input remains a valid data source even with the parser enabled.
  }

  return latestManualLimits();
}
