import { describe, it, expect, vi } from 'vitest';
import type { CacheStore } from './types.js';
import { cacheCaicForecasts, getCachedCaicForecasts, getCaicCacheKey } from './caic-forecast.js';
import { area, box, dangerDay, day, forecast } from '../caic/test-fixtures.js';

function mockStore(): CacheStore {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

const full = day([area('a', [box([-108, 37], [-107, 38])])], [forecast('a', [dangerDay(1, '2026-02-16', 'low')])]);

describe('CAIC forecast cache helpers', () => {
  it('keys statewide forecasts by date', async () => {
    const store = mockStore();
    expect(getCaicCacheKey('2026-02-16')).toBe('caic-v1-date-2026-02-16');
    await getCachedCaicForecasts(store, '2026-02-16');
    expect(store.get).toHaveBeenCalledWith('caic-v1-date-2026-02-16');
  });

  it('caches dates within the last 72 hours for 60 minutes', async () => {
    const store = mockStore();
    const now = new Date('2026-02-17T12:00:00Z');
    await cacheCaicForecasts(store, '2026-02-16', full, now);
    expect(store.set).toHaveBeenCalledWith('caic-v1-date-2026-02-16', full, expect.objectContaining({
      expiresAt: new Date('2026-02-17T13:00:00Z'),
    }));
  });

  it('caches older dates permanently', async () => {
    const store = mockStore();
    await cacheCaicForecasts(store, '2026-02-16', full, new Date('2026-11-13T12:00:00Z'));
    expect(store.set).toHaveBeenCalledWith('caic-v1-date-2026-02-16', full, expect.objectContaining({ expiresAt: null }));
  });

  it('never caches a date with no areas or no forecasts permanently (#51)', async () => {
    const now = new Date('2026-11-13T12:00:00Z');
    for (const empty of [day([], []), day(full.areas.features, []), day([], full.forecasts)]) {
      const store = mockStore();
      await cacheCaicForecasts(store, '2026-07-04', empty, now);
      expect(store.set).toHaveBeenCalledWith('caic-v1-date-2026-07-04', empty, expect.objectContaining({
        expiresAt: new Date('2026-11-13T13:00:00Z'),
      }));
    }
  });
});
