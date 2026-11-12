import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getForecastForCoordinate } from './forecast.js';
import { getCacheKey, CACHE_KEY_VERSION } from './cache/types.js';
import * as api from './api/index.js';

vi.mock('./api/index.js', async () => {
  const actual = (await vi.importActual('./api/index.js')) as typeof api;
  return { ...actual, fetchForecastForZone: vi.fn() };
});

describe('getForecastForCoordinate (hermetic)', () => {
  beforeEach(() => {
    vi.mocked(api.fetchForecastForZone).mockReset();
  });

  it('looks up NWAC zones by center and stable zone_id (#51)', async () => {
    vi.mocked(api.fetchForecastForZone).mockResolvedValue(null);

    // Stevens Pass ski area
    await getForecastForCoordinate(
      { latitude: 47.7455, longitude: -121.0886 },
      '2026-02-16',
      { includeProduct: true, useCache: false }
    );

    expect(api.fetchForecastForZone).toHaveBeenCalledWith('NWAC', '2', '2026-02-16');
  });

  it('looks up UAC zones by center and slug, and reports the center (#53)', async () => {
    vi.mocked(api.fetchForecastForZone).mockResolvedValue(null);

    // Alta, UT (Salt Lake zone)
    const result = await getForecastForCoordinate(
      { latitude: 40.5884, longitude: -111.6386 },
      '2026-02-16',
      { includeProduct: true, useCache: false }
    );

    expect(api.fetchForecastForZone).toHaveBeenCalledWith('UAC', 'salt-lake', '2026-02-16');
    expect(result.zone).toEqual({ id: 2005, zone_id: 'salt-lake', name: 'Salt Lake', center_id: 'UAC' });
  });

  it('returns an explicit "not yet supported" error for CAIC zones without calling the API', async () => {
    // Breckenridge, CO (Vail & Summit County)
    const result = await getForecastForCoordinate(
      { latitude: 39.4817, longitude: -106.0384 },
      '2026-02-16',
      { includeProduct: true, useCache: false }
    );

    expect(result.product).toBeNull();
    expect(result.error).toBe('Forecasts for CAIC zones are not yet supported');
    expect(api.fetchForecastForZone).not.toHaveBeenCalled();
  });
});

describe('getCacheKey', () => {
  it('is versioned so stale negative entries from stale zone IDs are never read (#51)', () => {
    expect(CACHE_KEY_VERSION).toBe('v2');
    expect(getCacheKey(1646, '2026-02-16')).toBe('v2-zone-1646-date-2026-02-16');
  });
});
