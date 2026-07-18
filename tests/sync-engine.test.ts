import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { providerConnections, syncRuns } from '@/lib/database/schema';
import { runFullSync } from '@/lib/scheduler/sync-engine';

const ORIGINAL_ENV = { ...process.env };

describe('sync engine: one provider failing does not block the others', () => {
  beforeEach(async () => {
    await db.delete(providerConnections);
    await db.delete(syncRuns);
    process.env.USE_MOCK_DATA = 'true';
    process.env.MOCK_SCENARIO = 'openai_error';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('marks openai as error while the other providers still sync successfully', async () => {
    await runFullSync();

    const connections = await db.select().from(providerConnections);
    const byProvider = Object.fromEntries(connections.map((c) => [c.provider, c]));

    expect(byProvider.openai.status).toBe('error');
    expect(byProvider.anthropic.status).toBe('ok');
    expect(byProvider.gemini.status).toBe('ok');
    expect(byProvider.codex.status).toBe('ok');
    expect(byProvider['claude-code'].status).toBe('ok');
  });

  it('records a sync_runs row per provider with the right outcome', async () => {
    await runFullSync();
    const runs = await db.select().from(syncRuns).where(eq(syncRuns.provider, 'openai'));
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.at(-1)?.status).toBe('error');

    const anthropicRuns = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.provider, 'anthropic'));
    expect(anthropicRuns.at(-1)?.status).toBe('success');
  });

  it('writes RunCat usage and remaining-credit cards to isolated test files', async () => {
    await runFullSync();

    const usageMetric = JSON.parse(fs.readFileSync(process.env.RUNCAT_METRIC_FILE!, 'utf8'));
    const creditMetric = JSON.parse(
      fs.readFileSync(process.env.RUNCAT_CREDIT_METRIC_FILE!, 'utf8'),
    );

    expect(usageMetric.title).toBe('AI Usage Monitor');
    expect(usageMetric.metrics.map((metric: { title: string }) => metric.title)).toEqual([
      '今月',
      'サブスク / API',
      expect.stringMatching(/^\(\d{1,2}\/\d{1,2}$/),
    ]);
    expect(usageMetric.metrics[2].formattedValue).toMatch(/^¥[\d,]+\)$/);
    expect(creditMetric.title).toBe('API Usage');
    expect(creditMetric.metrics.map((metric: { title: string }) => metric.title)).toEqual([
      'OpenAI',
      'Claude API',
      'Gemini',
    ]);
  });
});
