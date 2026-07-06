import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/auth/session';

describe('session token verification (unauthenticated access must be rejected)', () => {
  it('rejects a missing token', () => {
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken(null)).toBe(false);
    expect(verifySessionToken('')).toBe(false);
  });

  it('rejects a malformed token', () => {
    expect(verifySessionToken('not-a-real-token')).toBe(false);
    expect(verifySessionToken('a.b')).toBe(false);
  });

  it('rejects a token with a tampered signature', () => {
    const token = createSessionToken();
    const [body] = token.split('.');
    expect(verifySessionToken(`${body}.tamperedsignature`)).toBe(false);
  });

  it('accepts a freshly created valid token', () => {
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
  });
});
