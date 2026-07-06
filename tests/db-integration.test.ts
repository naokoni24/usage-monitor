import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/database/client';
import { usageDaily, pushSubscriptions, notificationEvents } from '@/lib/database/schema';

describe('usage_daily re-sync deduplication', () => {
  beforeEach(async () => {
    await db.delete(usageDaily);
  });

  const baseRow = {
    provider: 'openai' as const,
    usageDate: '2026-03-05',
    timezone: 'Asia/Tokyo',
    costOriginal: '1.00',
    currencyOriginal: 'USD',
    costJpy: '150',
    fxRate: '150',
    inputTokens: 100,
    outputTokens: 50,
    cachedInputTokens: null,
    cachedOutputTokens: null,
    requestCount: 1,
    source: 'api',
    confidence: 'confirmed' as const,
    isEstimated: false,
    dataPeriodStart: null,
    dataPeriodEnd: null,
    lastSyncedAt: new Date(),
  };

  it('does not create a duplicate row when re-syncing the same provider/date/source', async () => {
    await db.insert(usageDaily).values(baseRow);
    await db
      .insert(usageDaily)
      .values({ ...baseRow, costOriginal: '2.00', costJpy: '300' })
      .onConflictDoUpdate({
        target: [usageDaily.provider, usageDaily.usageDate, usageDaily.source],
        set: { costOriginal: '2.00', costJpy: '300', lastSyncedAt: new Date() },
      });

    const rows = await db.select().from(usageDaily).where(eq(usageDaily.provider, 'openai'));
    expect(rows).toHaveLength(1);
    expect(rows[0].costOriginal).toBe('2.00');
  });

  it('allows the same provider/date with a different source to coexist', async () => {
    await db.insert(usageDaily).values(baseRow);
    await db.insert(usageDaily).values({ ...baseRow, source: 'mock' });

    const rows = await db.select().from(usageDaily).where(eq(usageDaily.provider, 'openai'));
    expect(rows).toHaveLength(2);
  });
});

describe('push subscription persistence', () => {
  beforeEach(async () => {
    await db.delete(pushSubscriptions);
  });

  it('saves a subscription and upserts on re-subscribe with the same endpoint', async () => {
    const endpoint = 'https://push.example.com/abc';
    await db.insert(pushSubscriptions).values({
      endpoint,
      p256dh: 'key1',
      auth: 'auth1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db
      .insert(pushSubscriptions)
      .values({ endpoint, p256dh: 'key2', auth: 'auth2', createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: 'key2', auth: 'auth2' } });

    const rows = await db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe('key2');
  });

  it('removes a subscription reported as gone by the push service', async () => {
    const endpoint = 'https://push.example.com/gone';
    await db.insert(pushSubscriptions).values({
      endpoint,
      p256dh: 'key',
      auth: 'auth',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));

    const rows = await db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(0);
  });
});

describe('notification_events deduplication', () => {
  beforeEach(async () => {
    await db.delete(notificationEvents);
  });

  it('prevents a second insert for the same rule/threshold/month/provider', async () => {
    const event = {
      ruleType: 'budget',
      threshold: 80,
      yearMonth: '2026-03',
      provider: 'all',
      message: 'test',
      sentAt: new Date(),
      status: 'sent',
    };
    await db.insert(notificationEvents).values(event);

    await expect(db.insert(notificationEvents).values(event)).rejects.toThrow();

    const rows = await db.select().from(notificationEvents);
    expect(rows).toHaveLength(1);
  });

  it('allows the same rule/threshold in a different month', async () => {
    await db.insert(notificationEvents).values({
      ruleType: 'budget',
      threshold: 80,
      yearMonth: '2026-03',
      provider: 'all',
      message: 'march',
      sentAt: new Date(),
      status: 'sent',
    });
    await db.insert(notificationEvents).values({
      ruleType: 'budget',
      threshold: 80,
      yearMonth: '2026-04',
      provider: 'all',
      message: 'april',
      sentAt: new Date(),
      status: 'sent',
    });

    const rows = await db.select().from(notificationEvents);
    expect(rows).toHaveLength(2);
  });
});
