import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { getForecastForCoordinate } from './forecast.js';
import { getCacheKey, CACHE_KEY_VERSION } from './cache/zone-forecast.js';
import { getCache, resetCache } from './cache/index.js';
import { getCaicCacheKey } from './cache/caic-forecast.js';
import * as api from './api/index.js';
import * as avid from './caic/avid.js';
import { area, box, dangerDay, day, forecast } from './caic/test-fixtures.js';
import type { ForecastProduct } from './types/index.js';

vi.mock('./api/index.js', async () => {
  const actual = (await vi.importActual('./api/index.js')) as typeof api;
  return { ...actual, fetchForecastForZone: vi.fn() };
});

vi.mock('./caic/avid.js', async () => {
  const actual = (await vi.importActual('./caic/avid.js')) as typeof avid;
  return { ...actual, fetchCaicForecasts: vi.fn() };
});

// Breckenridge, CO (our Vail & Summit County region), inside a made-up AvID area
const breckenridge = { latitude: 39.4817, longitude: -106.0384 };
const caicDay = day(
  [area('summit', [box([-106.2, 39.3], [-105.9, 39.6])])],
  [forecast('summit', [dangerDay(1, '2026-02-16', 'considerable', 'moderate', 'low')])]
);

describe('getForecastForCoordinate (hermetic)', () => {
  beforeEach(() => {
    vi.mocked(api.fetchForecastForZone).mockReset();
    vi.mocked(avid.fetchCaicForecasts).mockReset();
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

  it('looks up CAIC zones in CAIC’s statewide forecasts for the date (#52)', async () => {
    vi.mocked(avid.fetchCaicForecasts).mockResolvedValue(caicDay);

    const result = await getForecastForCoordinate(breckenridge, '2026-02-16', { includeProduct: true, useCache: false });

    expect(avid.fetchCaicForecasts).toHaveBeenCalledWith('2026-02-16');
    expect(api.fetchForecastForZone).not.toHaveBeenCalled();
    expect(result.zone).toEqual({ id: 3009, zone_id: 'vail-and-summit-county', name: 'Vail & Summit County', center_id: 'CAIC' });
    expect(result.product?.danger?.[0]).toEqual({ upper: 3, middle: 2, lower: 1, valid_day: 'current' });
    expect(result.product?.forecast_zone[0].url).toBe('https://avalanche.state.co.us/?lat=39.45&lng=-106.05&date=2026-02-16');
  });

  it('reports no forecast for CAIC points outside every forecast area', async () => {
    vi.mocked(avid.fetchCaicForecasts).mockResolvedValue(day([area('elsewhere', [box([-108, 37], [-107, 38])])], caicDay.forecasts));

    const result = await getForecastForCoordinate(breckenridge, '2026-02-16', { includeProduct: true, useCache: false });

    expect(result.product).toBeNull();
    expect(result.error).toBe('No forecast available for Vail & Summit County');
  });

  it('reports CAIC fetch errors', async () => {
    vi.mocked(avid.fetchCaicForecasts).mockRejectedValue(new Error('Failed to fetch CAIC forecasts: 503 Service Unavailable'));

    const result = await getForecastForCoordinate(breckenridge, '2026-02-16', { includeProduct: true, useCache: false });

    expect(result.product).toBeNull();
    expect(result.error).toBe('Failed to fetch CAIC forecasts: 503 Service Unavailable');
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
    vi.mocked(avid.fetchCaicForecasts).mockReset();
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

  it('caches CAIC’s statewide forecasts once per date and finds each point’s area on read', async () => {
    vi.mocked(avid.fetchCaicForecasts).mockResolvedValue(caicDay);

    const first = await getForecastForCoordinate(breckenridge, '2026-02-16', { includeProduct: true });
    const second = await getForecastForCoordinate(breckenridge, '2026-02-16', { includeProduct: true });

    expect(avid.fetchCaicForecasts).toHaveBeenCalledTimes(1);
    expect(second.product).toEqual(first.product);
    expect(await readdir(cacheDir)).toEqual([`${getCaicCacheKey('2026-02-16')}.json`]);
  });

  it('does not cache CAIC fetch errors', async () => {
    vi.mocked(avid.fetchCaicForecasts).mockRejectedValueOnce(new Error('CAIC down'));
    vi.mocked(avid.fetchCaicForecasts).mockResolvedValueOnce(caicDay);

    const first = await getForecastForCoordinate(breckenridge, '2026-02-16', { includeProduct: true });
    const second = await getForecastForCoordinate(breckenridge, '2026-02-16', { includeProduct: true });

    expect(first.error).toBe('CAIC down');
    expect(second.product).not.toBeNull();
    expect(avid.fetchCaicForecasts).toHaveBeenCalledTimes(2);
  });
});
