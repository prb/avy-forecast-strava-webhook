import { describe, it, expect, vi } from 'vitest';
import type { CacheStore } from './types.js';
import { cacheZoneForecast, getCachedZoneForecast, getCacheKey } from './zone-forecast.js';
import type { ForecastProduct } from '../types/index.js';

function mockStore(): CacheStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

describe('zone forecast cache helpers', () => {
  it('keeps the pre-#61 key format so existing entries are still read', () => {
    expect(getCacheKey(1649, '2026-02-16')).toBe('v2-zone-1649-date-2026-02-16');
  });

  it('reads with the zone/date key', async () => {
    const store = mockStore();
    await getCachedZoneForecast(store, 1649, '2026-02-16');
    expect(store.get).toHaveBeenCalledWith('v2-zone-1649-date-2026-02-16');
  });

  it('caches forecasts within the last 72 hours for 60 minutes', async () => {
    const store = mockStore();
    const now = new Date('2026-02-17T12:00:00Z');
    const product = { id: 180624 } as ForecastProduct;

    await cacheZoneForecast(store, 1649, '2026-02-16', product, now);

    expect(store.set).toHaveBeenCalledWith('v2-zone-1649-date-2026-02-16', product, {
      expiresAt: new Date('2026-02-17T13:00:00Z'),
      reason: expect.stringContaining('60 minutes'),
    });
  });

  it('caches older forecasts, including "no forecast", permanently', async () => {
    const store = mockStore();
    const now = new Date('2026-03-01T12:00:00Z');

    await cacheZoneForecast(store, 1649, '2026-02-16', null, now);

    expect(store.set).toHaveBeenCalledWith('v2-zone-1649-date-2026-02-16', null, {
      expiresAt: null,
      reason: expect.stringContaining('permanently'),
    });
  });
});
