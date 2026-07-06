import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { runExperimentalClaudeCodeParser } from '@/lib/claude-code/experimental-parser';

const ORIGINAL_ENV = { ...process.env };
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('experimental Claude Code parser', () => {
  it('reports not_configured when the feature flag is off', async () => {
    process.env.ENABLE_CLAUDE_USAGE_PARSER = 'false';
    const result = await runExperimentalClaudeCodeParser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe('not_configured');
  });

  it('reports not_configured when no usage command is set', async () => {
    process.env.ENABLE_CLAUDE_USAGE_PARSER = 'true';
    delete process.env.CLAUDE_CODE_USAGE_COMMAND;
    const result = await runExperimentalClaudeCodeParser();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe('not_configured');
  });

  it('never fabricates a 0% reading when the output cannot be parsed', async () => {
    process.env.ENABLE_CLAUDE_USAGE_PARSER = 'true';
    process.env.CLAUDE_CODE_USAGE_COMMAND = path.join(FIXTURES_DIR, 'claude-usage-garbage.sh');
    const result = await runExperimentalClaudeCodeParser();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe('error');
      expect(result.errorMessage).not.toContain('0%');
    }
  });

  it('parses percentages when present in the (ANSI-stripped) output', async () => {
    process.env.ENABLE_CLAUDE_USAGE_PARSER = 'true';
    process.env.CLAUDE_CODE_USAGE_COMMAND = path.join(FIXTURES_DIR, 'claude-usage-fixture.sh');
    const result = await runExperimentalClaudeCodeParser();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('experimental-parser');
      expect(result.confidence).toBe('low');
      const fiveHour = result.limits.find((l) => l.limitType === 'five_hour');
      const weekly = result.limits.find((l) => l.limitType === 'weekly');
      expect(fiveHour?.usedPercent).toBe(63);
      expect(weekly?.usedPercent).toBe(41);
    }
  });
});
