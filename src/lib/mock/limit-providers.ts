import type { LimitProviderOutcome } from '@/lib/providers/types';
import type { MockScenario } from './scenario';

export function generateMockCodexLimits(scenario: MockScenario, now: Date = new Date()): LimitProviderOutcome {
  if (scenario === 'codex_five_hour_90') {
    return {
      ok: true,
      source: 'mock',
      confidence: 'confirmed',
      planInfo: 'Codex (mock plan)',
      limits: [
        {
          limitType: 'five_hour',
          usedPercent: 90,
          remainingPercent: 10,
          resetAt: new Date(now.getTime() + 45 * 60 * 1000),
        },
        {
          limitType: 'weekly',
          usedPercent: 55,
          remainingPercent: 45,
          resetAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        },
      ],
    };
  }

  if (scenario === 'codex_reset_soon') {
    return {
      ok: true,
      source: 'mock',
      confidence: 'confirmed',
      planInfo: 'Codex (mock plan)',
      limits: [
        {
          limitType: 'five_hour',
          usedPercent: 72,
          remainingPercent: 28,
          resetAt: new Date(now.getTime() + 30 * 60 * 1000),
        },
        {
          limitType: 'weekly',
          usedPercent: 40,
          remainingPercent: 60,
          resetAt: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
        },
      ],
    };
  }

  return {
    ok: true,
    source: 'mock',
    confidence: 'confirmed',
    planInfo: 'Codex (mock plan)',
    limits: [
      {
        limitType: 'five_hour',
        usedPercent: 32,
        remainingPercent: 68,
        resetAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      },
      {
        limitType: 'weekly',
        usedPercent: 21,
        remainingPercent: 79,
        resetAt: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      },
    ],
  };
}

export function generateMockClaudeCodeLimits(
  scenario: MockScenario,
  now: Date = new Date(),
): LimitProviderOutcome {
  if (scenario === 'claude_code_unavailable') {
    return {
      ok: false,
      errorMessage: '取得不可(mock): Claude Codeの利用状況を取得できませんでした',
      status: 'error',
    };
  }

  if (scenario === 'claude_code_manual') {
    return {
      ok: true,
      source: 'manual',
      confidence: 'estimated',
      planInfo: null,
      limits: [
        {
          limitType: 'five_hour',
          usedPercent: 60,
          remainingPercent: 40,
          resetAt: new Date(now.getTime() + 90 * 60 * 1000),
        },
        {
          limitType: 'weekly',
          usedPercent: 48,
          remainingPercent: 52,
          resetAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        },
      ],
    };
  }

  return {
    ok: true,
    source: 'mock',
    confidence: 'confirmed',
    planInfo: 'Claude Code (mock plan)',
    limits: [
      {
        limitType: 'five_hour',
        usedPercent: 45,
        remainingPercent: 55,
        resetAt: new Date(now.getTime() + 105 * 60 * 1000),
      },
      {
        limitType: 'weekly',
        usedPercent: 38,
        remainingPercent: 62,
        resetAt: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
      },
    ],
  };
}
