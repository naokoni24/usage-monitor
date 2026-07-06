import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';

const loginSchema = z.object({
  password: z.string().min(1).max(500),
});

export async function POST(request: NextRequest) {
  const headerList = await headers();
  const clientIp =
    headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('host') ?? 'unknown';

  if (!checkRateLimit(`login:${clientIp}`, 5, 60_000)) {
    return NextResponse.json({ error: 'too many attempts, try again later' }, { status: 429 });
  }

  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return NextResponse.json({ error: 'server is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }

  if (parsed.data.password !== appPassword) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE.name, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE.maxAgeSeconds,
    path: '/',
  });

  return NextResponse.json({ ok: true });
}
