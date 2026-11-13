import { describe, it, expect, vi, afterEach } from 'vitest';
import { avidDatetime, fetchCaicForecasts, parseCaicDayForecasts } from './avid.js';
import { area, box, dangerDay, forecast } from './test-fixtures.js';

const areas = { type: 'FeatureCollection', features: [area('a', [box([-108, 37], [-107, 38])])] };
const forecasts = [forecast('a', [dangerDay(1, '2026-02-16', 'low')])];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('avidDatetime', () => {
  it('uses the time CAIC’s site sends for a date', () => {
    expect(avidDatetime('2026-02-16')).toBe('2026-02-16T21:30:00.000Z');
  });
});

describe('parseCaicDayForecasts', () => {
  it('accepts areas and forecasts in the expected shape', () => {
    expect(parseCaicDayForecasts(areas, forecasts)).toEqual({ areas, forecasts });
  });

  it('accepts a date with no areas or forecasts', () => {
    const empty = { type: 'FeatureCollection', features: [] };
    expect(parseCaicDayForecasts(empty, [])).toEqual({ areas: empty, forecasts: [] });
  });

  it('rejects responses in another shape, so they are never cached', () => {
    expect(() => parseCaicDayForecasts({ features: [] }, forecasts)).toThrow('not a FeatureCollection');
    expect(() => parseCaicDayForecasts(areas, { forecasts })).toThrow('not an array');
    expect(() => parseCaicDayForecasts(areas, [{ id: 'x' }])).toThrow('no id or areaId');
    expect(() =>
      parseCaicDayForecasts({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point' } }] }, [])
    ).toThrow('unexpected geometry: Point');
    expect(() =>
      parseCaicDayForecasts(
        { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: areas.features[0].geometry }] },
        []
      )
    ).toThrow('area has no id');
  });
});

describe('fetchCaicForecasts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the areas and forecasts for the date', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.includes('/area?') ? jsonResponse(areas) : jsonResponse(forecasts)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCaicForecasts('2026-02-16')).resolves.toEqual({ areas, forecasts });

    const query = 'productType=avalancheforecast&datetime=2026-02-16T21%3A30%3A00.000Z';
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      `https://avalanche.state.co.us/avid/products/all/area?${query}`,
      `https://avalanche.state.co.us/avid/products/all?${query}`,
    ]);
  });

  it('throws on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503, statusText: 'Service Unavailable' })));
    await expect(fetchCaicForecasts('2026-02-16')).rejects.toThrow('Failed to fetch CAIC forecasts: 503 Service Unavailable');
  });

  it('throws on a response that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    await expect(fetchCaicForecasts('2026-02-16')).rejects.toThrow('response is not JSON');
  });
});
