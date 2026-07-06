import 'server-only';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './session';

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE.name)?.value);
}

/** Returns a 401 response if the request has no valid session; otherwise null. */
export async function requireSession(): Promise<NextResponse | null> {
  if (await isAuthenticated()) return null;
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

/**
 * Defense-in-depth CSRF check for state-changing requests: the SameSite=Lax
 * session cookie already blocks cross-site POSTs from being authenticated,
 * this additionally verifies same-origin as a second layer.
 */
export async function requireSameOrigin(): Promise<NextResponse | null> {
  const headerList = await headers();
  const origin = headerList.get('origin');
  if (!origin) return null; // same-origin requests from fetch() often omit Origin; cookie check remains primary defense
  const host = headerList.get('host');
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      return NextResponse.json({ error: 'invalid origin' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'invalid origin' }, { status: 403 });
  }
  return null;
}
