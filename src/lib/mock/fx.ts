import 'server-only';
import { isApiRateDue, recordApiRate } from '@/lib/currency/resolve';
import { seededRandom } from './random';
import type { MockScenario } from './scenario';

export async function syncMockFxRate(scenario: MockScenario): Promise<void> {
  if (scenario === 'fx_api_failure') return; // simulate external FX API being unreachable

  if (!(await isApiRateDue())) return;
  const jitter = seededRandom(`fx-${new Date().toDateString()}`)();
  const rate = (150 + jitter * 4).toFixed(2);
  await recordApiRate(rate);
}
