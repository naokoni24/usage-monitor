import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal signed-cookie session, kept dependency-free on purpose.
 * If OAuth is added later, only this file and proxy.ts need to change -
 * route handlers only ever call verifySession()/createSession().
 */

const SESSION_COOKIE_NAME = 'session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface SessionPayload {
  authenticated: true;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is not set');
  }
  return secret;
}

function sign(value: string): string {
  return createHmac('sha256', getSecret()).update(value).digest('base64url');
}

export function createSessionToken(): string {
  const payload: SessionPayload = { authenticated: true, exp: Date.now() + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(body);
  return `${body}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [body, signature] = token.split('.');
  if (!body || !signature) return false;

  const expectedSignature = sign(body);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    return payload.authenticated === true && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export const SESSION_COOKIE = {
  name: SESSION_COOKIE_NAME,
  maxAgeSeconds: SESSION_TTL_MS / 1000,
};
