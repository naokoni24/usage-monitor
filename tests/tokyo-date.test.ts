import { describe, it, expect } from 'vitest';
import {
  formatTokyoDate,
  tokyoTodayStart,
  tokyoMonthStart,
  tokyoNextMonthStart,
  tokyoTomorrowStart,
  tokyoYearMonth,
} from '@/lib/date/tokyo';

describe('Asia/Tokyo date boundaries', () => {
  it('formats a UTC instant just before JST midnight as the previous day', () => {
    // 2026-03-04T14:59:59Z = 2026-03-04T23:59:59+09:00
    const date = new Date('2026-03-04T14:59:59Z');
    expect(formatTokyoDate(date)).toBe('2026-03-04');
  });

  it('formats a UTC instant exactly at JST midnight as the next day', () => {
    // 2026-03-04T15:00:00Z = 2026-03-05T00:00:00+09:00
    const date = new Date('2026-03-04T15:00:00Z');
    expect(formatTokyoDate(date)).toBe('2026-03-05');
  });

  it('computes todayStart as the UTC instant of JST midnight', () => {
    const now = new Date('2026-03-05T10:00:00Z'); // 19:00 JST on 2026-03-05
    const start = tokyoTodayStart(now);
    expect(start.toISOString()).toBe('2026-03-04T15:00:00.000Z');
    expect(formatTokyoDate(start)).toBe('2026-03-05');
  });

  it('computes tomorrowStart as exactly 24h after todayStart', () => {
    const now = new Date('2026-03-05T10:00:00Z');
    const today = tokyoTodayStart(now);
    const tomorrow = tokyoTomorrowStart(now);
    expect(tomorrow.getTime() - today.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('computes monthStart at the 1st of the month 00:00 JST', () => {
    const now = new Date('2026-03-15T10:00:00Z');
    const start = tokyoMonthStart(now);
    expect(formatTokyoDate(start)).toBe('2026-03-01');
  });

  it('computes nextMonthStart across a year boundary', () => {
    const now = new Date('2025-12-15T10:00:00Z');
    const next = tokyoNextMonthStart(now);
    expect(formatTokyoDate(next)).toBe('2026-01-01');
  });

  it('formats year-month strings', () => {
    expect(tokyoYearMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });
});
