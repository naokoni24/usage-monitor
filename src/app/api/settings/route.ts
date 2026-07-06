import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireSession, requireSameOrigin } from '@/lib/auth/guard';
import { db } from '@/lib/database/client';
import { providerConnections, notificationRules, PROVIDERS } from '@/lib/database/schema';
import { getMonthlyBudgetJpy, setMonthlyBudgetJpy } from '@/lib/budget/monthly-budget';
import { saveManualFxRate, resolveCurrentFxRate } from '@/lib/currency/resolve';
import { setAppSetting, getAllAppSettings, APP_SETTING_KEYS } from '@/lib/database/app-settings';
import { tokyoYearMonth } from '@/lib/date/tokyo';

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const budgetJpy = await getMonthlyBudgetJpy();
  const fx = await resolveCurrentFxRate();
  const connections = await db.select().from(providerConnections);
  const rules = await db.select().from(notificationRules);
  const appSettings = await getAllAppSettings();

  return NextResponse.json({
    monthlyBudgetJpy: budgetJpy,
    fx: { rate: fx?.rate ?? null, source: fx?.source ?? null, fetchedAt: fx?.fetchedAt?.toISOString() ?? null },
    syncIntervalMinutes: Number(
      appSettings[APP_SETTING_KEYS.syncIntervalMinutes] ?? process.env.SYNC_INTERVAL_MINUTES ?? 15,
    ),
    providers: connections.map((c) => ({ provider: c.provider, enabled: c.enabled, status: c.status })),
    notificationRules: rules.map((r) => ({ ruleType: r.ruleType, threshold: r.threshold, enabled: r.enabled })),
    notificationRepeatAfterDrop: appSettings[APP_SETTING_KEYS.notificationRepeatAfterDrop] === 'true',
    geminiServiceFilters: appSettings[APP_SETTING_KEYS.geminiServiceFilters] ?? process.env.GCP_GEMINI_SERVICE_FILTERS ?? '',
    mockScenario: appSettings[APP_SETTING_KEYS.mockScenario] ?? process.env.MOCK_SCENARIO ?? 'normal',
    claudeCodeManualMemo: appSettings[APP_SETTING_KEYS.claudeCodeManualMemo] ?? '',
    useMockData: process.env.USE_MOCK_DATA === 'true',
  });
}

const putSchema = z.object({
  monthlyBudgetJpy: z.number().int().positive().optional(),
  fxManualRate: z.string().optional(),
  syncIntervalMinutes: z.number().int().min(1).max(1440).optional(),
  providerToggles: z.record(z.enum(PROVIDERS), z.boolean()).optional(),
  notificationRules: z
    .array(z.object({ ruleType: z.string(), threshold: z.number(), enabled: z.boolean() }))
    .optional(),
  notificationRepeatAfterDrop: z.boolean().optional(),
  geminiServiceFilters: z.string().optional(),
  mockScenario: z.string().optional(),
});

export async function PUT(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const badOrigin = await requireSameOrigin();
  if (badOrigin) return badOrigin;

  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (data.monthlyBudgetJpy !== undefined) {
    await setMonthlyBudgetJpy(data.monthlyBudgetJpy, tokyoYearMonth());
  }
  if (data.fxManualRate !== undefined) {
    await saveManualFxRate(data.fxManualRate);
  }
  if (data.syncIntervalMinutes !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.syncIntervalMinutes, String(data.syncIntervalMinutes));
  }
  if (data.providerToggles) {
    for (const [provider, enabled] of Object.entries(data.providerToggles)) {
      await db
        .insert(providerConnections)
        .values({ provider: provider as (typeof PROVIDERS)[number], enabled, status: 'not_configured' })
        .onConflictDoUpdate({ target: providerConnections.provider, set: { enabled, updatedAt: new Date() } });
    }
  }
  if (data.notificationRules) {
    for (const rule of data.notificationRules) {
      await db
        .update(notificationRules)
        .set({ enabled: rule.enabled, updatedAt: new Date() })
        .where(eq(notificationRules.ruleType, rule.ruleType));
    }
  }
  if (data.notificationRepeatAfterDrop !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.notificationRepeatAfterDrop, String(data.notificationRepeatAfterDrop));
  }
  if (data.geminiServiceFilters !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.geminiServiceFilters, data.geminiServiceFilters);
  }
  if (data.mockScenario !== undefined) {
    await setAppSetting(APP_SETTING_KEYS.mockScenario, data.mockScenario);
  }

  return NextResponse.json({ ok: true });
}
