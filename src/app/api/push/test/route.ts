import { NextResponse } from 'next/server';
import { requireSession, requireSameOrigin } from '@/lib/auth/guard';
import { sendPushToAllSubscriptions } from '@/lib/notifications/web-push';

export async function POST() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const badOrigin = await requireSameOrigin();
  if (badOrigin) return badOrigin;

  const summary = await sendPushToAllSubscriptions({
    title: 'AI Usage Monitor',
    body: 'テスト通知です。この通知が届けば設定は正常です。',
  });

  return NextResponse.json({ ok: true, ...summary });
}
