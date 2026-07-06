import 'server-only';
import { getAppSetting, APP_SETTING_KEYS } from '@/lib/database/app-settings';
import { runFullSync } from './sync-engine';
import { logger } from '@/lib/logging/logger';

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

async function currentIntervalMs(): Promise<number> {
  const override = await getAppSetting(APP_SETTING_KEYS.syncIntervalMinutes);
  const minutes = Number(override ?? process.env.SYNC_INTERVAL_MINUTES ?? 15);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
  return safeMinutes * 60 * 1000;
}

async function tick(): Promise<void> {
  if (running) return; // never overlap two sync passes
  running = true;
  try {
    await runFullSync();
  } catch (err) {
    logger.error('scheduled sync crashed', { error: err instanceof Error ? err.message : String(err) });
  } finally {
    running = false;
  }
}

/** Starts the in-process periodic sync loop. Safe to call once per server instance. */
export function startPeriodicSync(): void {
  if (timer) return;

  void tick();

  const scheduleNext = async () => {
    const intervalMs = await currentIntervalMs();
    timer = setTimeout(() => {
      void tick().finally(scheduleNext);
    }, intervalMs);
  };
  void scheduleNext();
}
