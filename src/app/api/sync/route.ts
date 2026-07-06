import { NextResponse } from 'next/server';
import { requireSession, requireSameOrigin } from '@/lib/auth/guard';
import { runFullSync } from '@/lib/scheduler/sync-engine';

export async function POST() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const badOrigin = await requireSameOrigin();
  if (badOrigin) return badOrigin;

  try {
    await runFullSync();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'sync failed' },
      { status: 500 },
    );
  }
}
