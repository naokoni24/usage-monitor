import { describe, it, expect, beforeEach } from 'vitest';
import { convertUsdToJpy, resolveCurrentFxRate, recordApiRate, saveManualFxRate } from '@/lib/currency/resolve';
import { db } from '@/lib/database/client';
import { fxRates } from '@/lib/database/schema';

describe('convertUsdToJpy', () => {
  it('multiplies USD by the rate and rounds to 2 decimal places', () => {
    expect(convertUsdToJpy('10', '150')).toBe('1500');
    expect(convertUsdToJpy('1.2345', '150.5')).toBe('185.79');
  });
});

describe('resolveCurrentFxRate fallback priority', () => {
  beforeEach(async () => {
    await db.delete(fxRates);
  });

  it('falls back to FX_USD_JPY env var when no API rate has ever been recorded', async () => {
    // vitest.config.ts sets FX_USD_JPY=150
    const resolved = await resolveCurrentFxRate();
    expect(resolved?.source).toBe('env');
    expect(resolved?.rate).toBe('150');
  });

  it('falls back to the manual rate when neither API nor env are available', async () => {
    const originalEnv = process.env.FX_USD_JPY;
    delete process.env.FX_USD_JPY;
    try {
      await saveManualFxRate('142.5');
      const resolved = await resolveCurrentFxRate();
      expect(resolved?.source).toBe('manual');
      expect(resolved?.rate).toBe('142.5');
    } finally {
      process.env.FX_USD_JPY = originalEnv;
    }
  });

  it('prefers the last successful API rate over env and manual', async () => {
    await saveManualFxRate('999');
    await recordApiRate('151.2');
    const resolved = await resolveCurrentFxRate();
    expect(resolved?.source).toBe('api');
    expect(resolved?.rate).toBe('151.2');
  });
});
