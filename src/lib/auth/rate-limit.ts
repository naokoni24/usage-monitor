import 'server-only';

/**
 * In-memory sliding-window rate limiter. Fine for a single-user, single-process
 * personal deployment; do not reuse this for a multi-instance production service.
 */
const attempts = new Map<string, number[]>();

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;
  const existing = (attempts.get(key) ?? []).filter((t) => t > windowStart);

  if (existing.length >= maxAttempts) {
    attempts.set(key, existing);
    return false;
  }

  existing.push(now);
  attempts.set(key, existing);
  return true;
}
