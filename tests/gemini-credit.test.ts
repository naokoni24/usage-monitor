import { describe, expect, it } from 'vitest';
import { calculateEstimatedGeminiCredit } from '@/lib/credits/gemini-credit';

describe('Gemini estimated remaining credit', () => {
  it('subtracts only usage added after the real balance was entered', () => {
    expect(calculateEstimatedGeminiCredit('318', '43.99', '48.99')).toBe('313');
  });

  it('does not double-subtract when a sync reports the same cumulative usage', () => {
    const first = calculateEstimatedGeminiCredit('318', '43.99', '48.99');
    const repeated = calculateEstimatedGeminiCredit('318', '43.99', '48.99');
    expect(repeated).toBe(first);
  });

  it('does not increase the entered balance when billing data is corrected downward', () => {
    expect(calculateEstimatedGeminiCredit('318', '43.99', '40')).toBe('318');
  });

  it('never reports a negative balance', () => {
    expect(calculateEstimatedGeminiCredit('3', '10', '20')).toBe('0');
  });

  it('keeps the entered balance when no baseline exists yet', () => {
    expect(calculateEstimatedGeminiCredit('318', null, '48.99')).toBe('318');
  });

  it('returns null for an unset or invalid entered balance', () => {
    expect(calculateEstimatedGeminiCredit('', '10', '20')).toBeNull();
    expect(calculateEstimatedGeminiCredit('invalid', '10', '20')).toBeNull();
  });
});
