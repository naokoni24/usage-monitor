import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { providerConnections, usageDaily, subscriptionLimits, syncRuns } from '@/lib/database/schema';
import type { Provider } from '@/lib/database/schema';
import type { CostProviderOutcome, LimitProviderOutcome } from '@/lib/providers/types';
import { withRetry } from './retry';
import { logger } from '@/lib/logging/logger';
import { fetchOpenAiUsage } from '@/lib/providers/openai';
import { fetchAnthropicUsage } from '@/lib/providers/anthropic';
import { fetchGeminiUsage } from '@/lib/providers/gemini';
import { fetchCodexLimits } from '@/lib/codex/sync';
import { fetchClaudeCodeLimits } from '@/lib/claude-code/sync';
import { syncFxRateIfDue, resolveCurrentFxRate, convertToJpy } from '@/lib/currency/resolve';
import { syncMockFxRate } from '@/lib/mock/fx';
import { isMockMode, getMockScenario } from '@/lib/mock/scenario';
import { evaluateAndSendNotifications } from '@/lib/notifications/evaluate';

const COST_PROVIDERS: Provider[] = ['openai', 'anthropic', 'gemini'];
const LIMIT_PROVIDERS: Provider[] = ['codex', 'claude-code'];

async function isProviderEnabled(provider: Provider): Promise<boolean> {
  const [row] = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.provider, provider))
    .limit(1);
  return row?.enabled ?? true; // default-enabled until the user explicitly disables it
}

async function ensureConnectionRow(provider: Provider): Promise<void> {
  await db
    .insert(providerConnections)
    .values({ provider, enabled: true, status: 'not_configured' })
    .onConflictDoNothing({ target: providerConnections.provider });
}

async function markConnection(
  provider: Provider,
  update: { status: string; lastSuccessAt?: Date; lastErrorAt?: Date; lastErrorMessage?: string | null },
): Promise<void> {
  await ensureConnectionRow(provider);
  await db
    .update(providerConnections)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(providerConnections.provider, provider));
}

async function syncOneProvider(
  provider: Provider,
  fetcher: () => Promise<CostProviderOutcome | LimitProviderOutcome>,
): Promise<void> {
  await ensureConnectionRow(provider);

  if (!(await isProviderEnabled(provider))) {
    await markConnection(provider, { status: 'disabled' });
    return;
  }

  const [run] = await db
    .insert(syncRuns)
    .values({ provider, startedAt: new Date(), status: 'running', recordsUpdated: 0 })
    .returning();

  try {
    const result = await withRetry(fetcher, { attempts: 3, baseDelayMs: 1000 });

    if (!result.ok) {
      await markConnection(provider, {
        status: result.status ?? 'error',
        lastErrorAt: new Date(),
        lastErrorMessage: result.errorMessage,
      });
      await db
        .update(syncRuns)
        .set({ finishedAt: new Date(), status: 'error', errorMessage: result.errorMessage })
        .where(eq(syncRuns.id, run.id));
      logger.warn('provider sync failed', { provider, error: result.errorMessage });
      return;
    }

    const recordsUpdated = await persistResult(provider, result);

    await markConnection(provider, { status: 'ok', lastSuccessAt: new Date(), lastErrorMessage: null });
    await db
      .update(syncRuns)
      .set({ finishedAt: new Date(), status: 'success', recordsUpdated })
      .where(eq(syncRuns.id, run.id));
    logger.info('provider sync succeeded', { provider, recordsUpdated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markConnection(provider, { status: 'error', lastErrorAt: new Date(), lastErrorMessage: message });
    await db
      .update(syncRuns)
      .set({ finishedAt: new Date(), status: 'error', errorMessage: message })
      .where(eq(syncRuns.id, run.id));
    logger.error('provider sync threw', { provider, error: message });
  }
}

async function persistResult(
  provider: Provider,
  result: Extract<CostProviderOutcome | LimitProviderOutcome, { ok: true }>,
): Promise<number> {
  if ('days' in result) {
    const fx = await resolveCurrentFxRate();
    let updated = 0;
    for (const day of result.days) {
      const { costJpy, appliedRate } = convertToJpy(day.costOriginal, day.currencyOriginal, fx?.rate ?? null);
      await db
        .insert(usageDaily)
        .values({
          provider,
          usageDate: day.usageDate,
          timezone: 'Asia/Tokyo',
          costOriginal: day.costOriginal,
          currencyOriginal: day.currencyOriginal,
          costJpy,
          fxRate: appliedRate,
          inputTokens: day.inputTokens,
          outputTokens: day.outputTokens,
          cachedInputTokens: day.cachedInputTokens,
          cachedOutputTokens: day.cachedOutputTokens,
          requestCount: day.requestCount,
          source: result.source,
          confidence: result.confidence,
          isEstimated: result.isEstimated,
          dataPeriodStart: day.dataPeriodStart,
          dataPeriodEnd: day.dataPeriodEnd,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [usageDaily.provider, usageDaily.usageDate, usageDaily.source],
          set: {
            costOriginal: day.costOriginal,
            currencyOriginal: day.currencyOriginal,
            costJpy,
            fxRate: appliedRate,
            inputTokens: day.inputTokens,
            outputTokens: day.outputTokens,
            cachedInputTokens: day.cachedInputTokens,
            cachedOutputTokens: day.cachedOutputTokens,
            requestCount: day.requestCount,
            confidence: result.confidence,
            isEstimated: result.isEstimated,
            dataPeriodStart: day.dataPeriodStart,
            dataPeriodEnd: day.dataPeriodEnd,
            lastSyncedAt: new Date(),
          },
        });
      updated++;
    }
    return updated;
  }

  // Limit provider (Codex / Claude Code). Manual-source results are already
  // persisted by the settings API - just re-affirm the connection is healthy.
  if (result.source === 'manual') return 0;

  const now = new Date();
  for (const limit of result.limits) {
    await db.insert(subscriptionLimits).values({
      provider,
      limitType: limit.limitType,
      usedPercent: limit.usedPercent,
      remainingPercent: limit.remainingPercent,
      resetAt: limit.resetAt,
      source: result.source,
      confidence: result.confidence,
      collectedAt: now,
      expiresAt: null,
    });
  }
  return result.limits.length;
}

export async function runFullSync(): Promise<void> {
  if (isMockMode()) {
    await syncMockFxRate(await getMockScenario());
  } else {
    await syncFxRateIfDue().catch((err) =>
      logger.warn('fx rate sync failed', { error: err instanceof Error ? err.message : String(err) }),
    );
  }

  await Promise.allSettled([
    syncOneProvider('openai', fetchOpenAiUsage),
    syncOneProvider('anthropic', fetchAnthropicUsage),
    syncOneProvider('gemini', fetchGeminiUsage),
    syncOneProvider('codex', fetchCodexLimits),
    syncOneProvider('claude-code', fetchClaudeCodeLimits),
  ]);

  await evaluateAndSendNotifications().catch((err) =>
    logger.error('notification evaluation failed', { error: err instanceof Error ? err.message : String(err) }),
  );
}

export { COST_PROVIDERS, LIMIT_PROVIDERS };
