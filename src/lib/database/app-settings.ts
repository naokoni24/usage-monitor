import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from './client';
import { appSettings } from './schema';

export const APP_SETTING_KEYS = {
  syncIntervalMinutes: 'syncIntervalMinutes',
  geminiServiceFilters: 'geminiServiceFilters',
  mockScenario: 'mockScenario',
  claudeCodeManualMemo: 'claudeCodeManualMemo',
  notificationRepeatAfterDrop: 'notificationRepeatAfterDrop',
} as const;

export async function getAppSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

export async function getAllAppSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
