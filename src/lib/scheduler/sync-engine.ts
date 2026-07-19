import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import {
  providerConnections,
  usageDaily,
  subscriptionLimits,
  syncRuns,
} from '@/lib/database/schema';
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
import { writeRunCatMetric } from '@/lib/runcat/write-metric';

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
  update: {
    status: string;
    lastSuccessAt?: Date;
    lastErrorAt?: Date;
    lastErrorMessage?: string | null;
  },
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

    await markConnection(provider, {
      status: 'ok',
      lastSuccessAt: new Date(),
      lastErrorMessage: null,
    });
    await db
      .update(syncRuns)
      .set({ finishedAt: new Date(), status: 'success', recordsUpdated })
      .where(eq(syncRuns.id, run.id));
    logger.info('provider sync succeeded', { provider, recordsUpdated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markConnection(provider, {
      status: 'error',
      lastErrorAt: new Date(),
      lastErrorMessage: message,
    });
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

    // A development mock sync may have populated rows before the real provider
    // was configured. Those rows have a separate `source` key and would
    // otherwise remain for dates that the real export does not yet cover,
    // inflating the dashboard total by mixing simulated and actual costs.
    if (result.source !== 'mock' && result.days.length > 0) {
      await db
        .delete(usageDaily)
        .where(and(eq(usageDaily.provider, provider), eq(usageDaily.source, 'mock')));
    }

    for (const day of result.days) {
      const { costJpy, appliedRate } = convertToJpy(
        day.costOriginal,
        day.currencyOriginal,
        fx?.rate ?? null,
      );
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
  let updated = 0;
  for (const limit of result.limits) {
    // After macOS wakes from sleep, Codex App Server can briefly return a
    // stale percentage while retaining the same reset timestamp. A large drop
    // within that same window cannot be a fresh reading, so retain the last
    // known value until the next normal sync.
    if (provider === 'codex') {
      const [previous] = await db
        .select()
        .from(subscriptionLimits)
        .where(
          and(
            eq(subscriptionLimits.provider, provider),
            eq(subscriptionLimits.limitType, limit.limitType),
          ),
        )
        .orderBy(desc(subscriptionLimits.collectedAt))
        .limit(1);
      const sameWindow =
        previous?.resetAt &&
        limit.resetAt &&
        Math.abs(previous.resetAt.getTime() - limit.resetAt.getTime()) < 60_000;
      if (previous && sameWindow && limit.usedPercent < previous.usedPercent - 15) {
        logger.warn('ignored stale Codex limit after wake', {
          limitType: limit.limitType,
          previousUsedPercent: previous.usedPercent,
          reportedUsedPercent: limit.usedPercent,
        });
        continue;
      }
    }

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
    updated++;
  }
  return updated;
}

async function notify(): Promise<void> {
  await evaluateAndSendNotifications().catch((err) =>
    logger.error('notification evaluation failed', {
      error: err instanceof Error ? err.message : String(err),
    }),
  );
}

/**
 * Cost providers (OpenAI/Anthropic/Gemini) only publish data with an
 * hours-to-a-day lag upstream, so this is meant to run infrequently
 * (see SYNC_INTERVAL_MINUTES) rather than every few minutes.
 * Claude Code rides along here too since it has no live API to poll.
 */
export async function syncCostProviders(): Promise<void> {
  if (isMockMode()) {
    await syncMockFxRate(await getMockScenario());
  } else {
    await syncFxRateIfDue().catch((err) =>
      logger.warn('fx rate sync failed', {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  await Promise.allSettled([
    syncOneProvider('openai', fetchOpenAiUsage),
    syncOneProvider('anthropic', fetchAnthropicUsage),
    syncOneProvider('gemini', fetchGeminiUsage),
    syncOneProvider('claude-code', fetchClaudeCodeLimits),
  ]);

  // Keep RunCat Neo tied to the completed database sync instead of polling the
  // database from a separate launch agent (which cannot access Desktop under
  // macOS privacy controls).
  await writeRunCatMetric().catch((err) =>
    logger.warn('RunCat metric update failed', {
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  await notify();
}

/**
 * Codex rate limits shift with every request, so this is meant to run on a
 * much shorter cadence (see CODEX_SYNC_INTERVAL_MINUTES) than the cost sync.
 */
export async function syncCodex(): Promise<void> {
  await syncOneProvider('codex', fetchCodexLimits);
  await notify();
}

/** Runs everything once (used by the manual "sync now" button and the CLI script). */
export async function runFullSync(): Promise<void> {
  await Promise.allSettled([syncCostProviders(), syncCodex()]);
}

export { COST_PROVIDERS, LIMIT_PROVIDERS };
