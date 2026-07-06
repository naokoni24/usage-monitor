import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LimitProviderOutcome, NormalizedLimit } from '@/lib/providers/types';

const execFileAsync = promisify(execFile);

/**
 * Best-effort, unofficial local parser for Claude Code's usage output.
 *
 * There is no public API for Claude Code's personal 5-hour/weekly limits, so
 * this reads the plain-text output of a user-supplied command (e.g. a Claude
 * Code CLI usage screen) and regex-matches percentages. This is NOT a real
 * PTY capture (no native pty dependency is installed) - some CLI UIs only
 * render their interactive usage screen when attached to a real terminal, in
 * which case this will simply fail to match and return `ok: false` rather
 * than guessing. Gated behind ENABLE_CLAUDE_USAGE_PARSER; must never read
 * conversation content or prompts, only the usage-summary output.
 */

const ANSI_ESCAPE_PATTERN = /[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function stripAnsi(input: string): string {
  return input.replace(ANSI_ESCAPE_PATTERN, '');
}

function extractPercent(text: string, keywordPattern: RegExp): number | null {
  const match = text.match(keywordPattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export async function runExperimentalClaudeCodeParser(): Promise<LimitProviderOutcome> {
  if (process.env.ENABLE_CLAUDE_USAGE_PARSER !== 'true') {
    return { ok: false, errorMessage: '実験的解析は無効化されています (ENABLE_CLAUDE_USAGE_PARSER=false)', status: 'not_configured' };
  }

  const command = process.env.CLAUDE_CODE_USAGE_COMMAND?.trim();
  if (!command) {
    return {
      ok: false,
      errorMessage: 'CLAUDE_CODE_USAGE_COMMAND が未設定のため実験的解析を実行できません',
      status: 'not_configured',
    };
  }

  let stdout: string;
  try {
    const [cmd, ...args] = command.split(/\s+/);
    const result = await execFileAsync(cmd, args, { timeout: 15_000, maxBuffer: 1024 * 1024 });
    stdout = result.stdout;
  } catch (err) {
    return {
      ok: false,
      errorMessage: `非公式取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      status: 'error',
    };
  }

  const clean = stripAnsi(stdout);
  const fiveHourPercent = extractPercent(clean, /5[- ]?hour[^0-9]{0,20}(\d{1,3})\s*%/i);
  const weeklyPercent = extractPercent(clean, /weekly[^0-9]{0,20}(\d{1,3})\s*%/i);

  if (fiveHourPercent === null && weeklyPercent === null) {
    // Parsing failed entirely - never fabricate a 0% reading.
    return {
      ok: false,
      errorMessage: '非公式取得: 出力から利用率を解析できませんでした(Claude Codeの表示形式が変更された可能性があります)',
      status: 'error',
    };
  }

  const limits: NormalizedLimit[] = [];
  if (fiveHourPercent !== null) {
    limits.push({
      limitType: 'five_hour',
      usedPercent: fiveHourPercent,
      remainingPercent: Math.max(0, 100 - fiveHourPercent),
      resetAt: null,
    });
  }
  if (weeklyPercent !== null) {
    limits.push({
      limitType: 'weekly',
      usedPercent: weeklyPercent,
      remainingPercent: Math.max(0, 100 - weeklyPercent),
      resetAt: null,
    });
  }

  return { ok: true, source: 'experimental-parser', confidence: 'low', limits, planInfo: null };
}
