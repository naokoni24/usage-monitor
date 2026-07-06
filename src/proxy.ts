import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/health']);

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE.name)?.value;
  const authenticated = verifySessionToken(token);

  if (!authenticated) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|icons|manifest.webmanifest|sw.js|offline.html|favicon.ico|apple-touch-icon.*\\.png).*)',
  ],
};
