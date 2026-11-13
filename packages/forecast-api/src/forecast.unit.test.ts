import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { getForecastForCoordinate } from './forecast.js';
import { getCacheKey, CACHE_KEY_VERSION } from './cache/zone-forecast.js';
import { getCache, resetCache } from './cache/index.js';
import * as api from './api/index.js';
import type { ForecastProduct } from './types/index.js';

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

describe('getForecastForCoordinate caching', () => {
  // Stevens Pass ski area, NWAC zone 1649
  const stevens = { latitude: 47.7455, longitude: -121.0886 };
  let cacheDir: string;

  beforeEach(async () => {
    vi.mocked(api.fetchForecastForZone).mockReset();
    cacheDir = await mkdtemp(join(tmpdir(), 'forecast-cache-test-'));
    resetCache();
    getCache({ type: 'local', localCacheDir: cacheDir });
  });

  afterEach(async () => {
    resetCache();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('caches a fetched forecast under the zone/date key and serves it from cache next time', async () => {
    const product = { id: 180624, forecast_zone: [] } as unknown as ForecastProduct;
    vi.mocked(api.fetchForecastForZone).mockResolvedValue(product);

    const first = await getForecastForCoordinate(stevens, '2026-02-16', { includeProduct: true });
    const second = await getForecastForCoordinate(stevens, '2026-02-16', { includeProduct: true });

    expect(api.fetchForecastForZone).toHaveBeenCalledTimes(1);
    expect(first.product).toEqual(product);
    expect(second.product).toEqual(product);
    expect(await readdir(cacheDir)).toEqual([`${getCacheKey(1649, '2026-02-16')}.json`]);
  });

  it('caches "no forecast" results too', async () => {
    vi.mocked(api.fetchForecastForZone).mockResolvedValue(null);

    await getForecastForCoordinate(stevens, '2026-02-16', { includeProduct: true });
    const second = await getForecastForCoordinate(stevens, '2026-02-16', { includeProduct: true });

    expect(api.fetchForecastForZone).toHaveBeenCalledTimes(1);
    expect(second.product).toBeNull();
  });

  it('does not cache API errors', async () => {
    vi.mocked(api.fetchForecastForZone).mockRejectedValueOnce(new Error('API down'));
    vi.mocked(api.fetchForecastForZone).mockResolvedValueOnce(null);

    const first = await getForecastForCoordinate(stevens, '2026-02-16', { includeProduct: true });
    await getForecastForCoordinate(stevens, '2026-02-16', { includeProduct: true });

    expect(first.error).toBe('API down');
    expect(api.fetchForecastForZone).toHaveBeenCalledTimes(2);
  });
});
