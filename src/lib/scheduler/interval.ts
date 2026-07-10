import 'server-only';
import { getAppSetting, APP_SETTING_KEYS } from '@/lib/database/app-settings';
import { syncCostProviders, syncCodex } from './sync-engine';
import { logger } from '@/lib/logging/logger';

/**
 * Two independent loops on different cadences:
 *  - cost providers (OpenAI/Anthropic/Gemini/Claude Code) publish data with an
 *    hours-to-a-day lag upstream, so a long interval is enough (default 60min,
 *    user-configurable as "同期間隔" in settings).
 *  - Codex rate limits shift with every request, so it runs much more often
 *    (CODEX_SYNC_INTERVAL_MINUTES, default 5min).
 */
function startLoop(
  name: string,
  runOnce: () => Promise<void>,
  getIntervalMs: () => Promise<number>,
): void {
  let running = false;

  async function tick(): Promise<void> {
    if (running) return; // never overlap two passes of the same loop
    running = true;
    try {
      await runOnce();
    } catch (err) {
      logger.error(`${name} sync loop crashed`, { error: err instanceof Error ? err.message : String(err) });
    } finally {
      running = false;
    }
  }

  const scheduleNext = async () => {
    const intervalMs = await getIntervalMs();
    setTimeout(() => {
      void tick().finally(scheduleNext);
    }, intervalMs);
  };

  void tick();
  void scheduleNext();
}

async function costSyncIntervalMs(): Promise<number> {
  const override = await getAppSetting(APP_SETTING_KEYS.syncIntervalMinutes);
  const minutes = Number(override ?? process.env.SYNC_INTERVAL_MINUTES ?? 60);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
  return safeMinutes * 60 * 1000;
}

async function codexSyncIntervalMs(): Promise<number> {
  const minutes = Number(process.env.CODEX_SYNC_INTERVAL_MINUTES ?? 5);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 5;
  return safeMinutes * 60 * 1000;
}

let started = false;

/** Starts both periodic sync loops. Safe to call once per server instance. */
export function startPeriodicSync(): void {
  if (started) return;
  started = true;

  startLoop('cost-providers', syncCostProviders, costSyncIntervalMs);
  startLoop('codex', syncCodex, codexSyncIntervalMs);
}
