import { describe, it, expect } from 'vitest';
import { classifyWindow } from '@/lib/codex/sync';

describe('Codex rate-limit window normalization', () => {
  it('classifies a ~5 hour window as five_hour', () => {
    const result = classifyWindow({ usedPercent: 42, windowDurationMins: 300, resetsAt: 1893456000 });
    expect(result.limitType).toBe('five_hour');
    expect(result.usedPercent).toBe(42);
    expect(result.remainingPercent).toBe(58);
    expect(result.resetAt?.toISOString()).toBe(new Date(1893456000 * 1000).toISOString());
  });

  it('classifies a weekly (10080 min) window as weekly', () => {
    const result = classifyWindow({ usedPercent: 90, windowDurationMins: 10080, resetsAt: null });
    expect(result.limitType).toBe('weekly');
    expect(result.remainingPercent).toBe(10);
    expect(result.resetAt).toBeNull();
  });

  it('treats a null window duration as five_hour by default', () => {
    const result = classifyWindow({ usedPercent: 10, windowDurationMins: null, resetsAt: null });
    expect(result.limitType).toBe('five_hour');
  });

  it('clamps remainingPercent at 0 when usedPercent exceeds 100', () => {
    const result = classifyWindow({ usedPercent: 105, windowDurationMins: 300, resetsAt: null });
    expect(result.remainingPercent).toBe(0);
  });
});
