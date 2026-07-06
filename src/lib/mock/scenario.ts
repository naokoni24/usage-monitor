import 'server-only';
import { getAppSetting, APP_SETTING_KEYS } from '@/lib/database/app-settings';

export const MOCK_SCENARIOS = [
  'normal',
  'openai_error',
  'anthropic_not_configured',
  'gemini_billing_delay',
  'budget_50',
  'budget_80',
  'budget_100',
  'codex_five_hour_90',
  'codex_reset_soon',
  'claude_code_manual',
  'claude_code_unavailable',
  'fx_api_failure',
  'push_invalid_subscription',
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export function isMockMode(): boolean {
  return process.env.USE_MOCK_DATA === 'true';
}

export async function getMockScenario(): Promise<MockScenario> {
  const override = await getAppSetting(APP_SETTING_KEYS.mockScenario);
  const value = override ?? process.env.MOCK_SCENARIO ?? 'normal';
  return (MOCK_SCENARIOS as readonly string[]).includes(value) ? (value as MockScenario) : 'normal';
}
