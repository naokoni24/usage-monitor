import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireSession, requireSameOrigin } from '@/lib/auth/guard';
import { db } from '@/lib/database/client';
import { pushSubscriptions } from '@/lib/database/schema';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const badOrigin = await requireSameOrigin();
  if (badOrigin) return badOrigin;

  const body = await request.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent');
  const now = new Date();

  await db
    .insert(pushSubscriptions)
    .values({
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, userAgent, updatedAt: now },
    });

  return NextResponse.json({ ok: true });
}

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const badOrigin = await requireSameOrigin();
  if (badOrigin) return badOrigin;

  const body = await request.json().catch(() => null);
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }

  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint));
  return NextResponse.json({ ok: true });
}
