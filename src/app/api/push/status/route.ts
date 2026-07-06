import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guard';
import { db } from '@/lib/database/client';
import { pushSubscriptions } from '@/lib/database/schema';

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const rows = await db.select().from(pushSubscriptions);
  const vapidConfigured = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT,
  );

  return NextResponse.json({
    vapidConfigured,
    subscriptionCount: rows.length,
    subscriptions: rows.map((r) => ({
      id: r.id,
      origin: safeOrigin(r.endpoint),
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
      lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: r.lastErrorAt?.toISOString() ?? null,
    })),
  });
}

function safeOrigin(endpoint: string): string {
  try {
    return new URL(endpoint).origin;
  } catch {
    return 'unknown';
  }
}
