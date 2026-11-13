import { describe, it, expect } from 'vitest';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { ZoneWithBoundary } from '../types/index.js';
import { buildCaicForecastUrl, findCaicForecast, linkPoint, toCaicForecastProduct } from './forecast.js';
import { area, box, dangerDay, day, forecast } from './test-fixtures.js';

const DATE = '2026-02-16';

const zone = {
  id: 3004,
  zone_id: 'northern-san-juan',
  name: 'Northern San Juan',
  center_id: 'CAIC',
} as ZoneWithBoundary;

const west = area('west', [box([-108, 37.5], [-107.5, 38])]);
const east = area('east', [box([-107.5, 37.5], [-107, 38])]);

describe('findCaicForecast', () => {
  const forecasts = [
    forecast('west', [dangerDay(1, DATE, 'moderate')]),
    forecast('east', [dangerDay(1, DATE, 'low')]),
  ];

  it('finds the area containing the point and its forecast', () => {
    const match = findCaicForecast(day([west, east], forecasts), { latitude: 37.8, longitude: -107.2 });
    expect(match?.area).toBe(east);
    expect(match?.forecast.areaId).toBe('east');
  });

  it('returns null outside every area', () => {
    expect(findCaicForecast(day([west, east], forecasts), { latitude: 39, longitude: -107.2 })).toBeNull();
  });

  it('returns null when the area has no forecast', () => {
    expect(findCaicForecast(day([west, east], forecasts.slice(0, 1)), { latitude: 37.8, longitude: -107.2 })).toBeNull();
  });
});

describe('toCaicForecastProduct', () => {
  it('maps day 1 and day 2 ratings by elevation band', () => {
    const product = toCaicForecastProduct(
      zone,
      west,
      forecast('west', [
        dangerDay(1, DATE, 'considerable', 'moderate', 'low'),
        dangerDay(2, '2026-02-17', 'high', 'considerable', 'extreme'),
      ]),
      DATE
    );

    expect(product?.danger).toEqual([
      { upper: 3, middle: 2, lower: 1, valid_day: 'current' },
      { upper: 4, middle: 3, lower: 5, valid_day: 'tomorrow' },
    ]);
    expect(product?.danger_rating).toBe(3);
    expect(product?.start_date).toBe(DATE);
    expect(product?.id).toBe('forecast-west');
    expect(product?.published_time).toBe('2026-02-15T23:30:00Z');
    expect(product?.bottom_line).toBe('<p>Summary</p>');
  });

  it('names the zone from our regional boundary and links to a point inside the area', () => {
    const product = toCaicForecastProduct(zone, west, forecast('west', [dangerDay(1, DATE, 'low')]), DATE);

    expect(product?.forecast_zone).toEqual([
      {
        id: 3004,
        zone_id: 'northern-san-juan',
        name: 'Northern San Juan',
        url: 'https://avalanche.state.co.us/?lat=37.75&lng=-107.75&date=2026-02-16',
        config: null,
      },
    ]);
  });

  it('shows noRating bands as 0 when other bands are rated', () => {
    const product = toCaicForecastProduct(zone, west, forecast('west', [dangerDay(1, DATE, 'moderate', 'low', 'noRating')]), DATE);
    expect(product?.danger?.[0]).toEqual({ upper: 2, middle: 1, lower: 0, valid_day: 'current' });
  });

  it('returns null when no band is rated', () => {
    expect(toCaicForecastProduct(zone, west, forecast('west', [dangerDay(1, DATE, 'noForecast')]), DATE)).toBeNull();
    expect(toCaicForecastProduct(zone, west, forecast('west', [dangerDay(1, DATE, 'noRating', 'noForecast')]), DATE)).toBeNull();
  });

  it('returns null when no forecast day matches the date', () => {
    expect(toCaicForecastProduct(zone, west, forecast('west', [dangerDay(1, '2026-02-15', 'low')]), DATE)).toBeNull();
  });

  it('leaves out an unrated second day', () => {
    const product = toCaicForecastProduct(
      zone,
      west,
      forecast('west', [dangerDay(1, DATE, 'low'), dangerDay(2, '2026-02-17', 'noForecast')]),
      DATE
    );
    expect(product?.danger).toHaveLength(1);
  });

  it('throws on a rating it does not know', () => {
    expect(() => toCaicForecastProduct(zone, west, forecast('west', [dangerDay(1, DATE, 'severe')]), DATE)).toThrow(
      'Unknown CAIC danger rating: "severe"'
    );
  });
});

describe('linkPoint', () => {
  it('uses the center of a simple area, rounded to 3 decimal places', () => {
    expect(linkPoint(area('a', [box([-107.12345, 37.12345], [-107.02345, 37.22345])]))).toEqual([-107.073, 37.173]);
  });

  it('uses the largest polygon of a MultiPolygon', () => {
    const small = box([-106.01, 39.01], [-106, 39.02]);
    const large = box([-108, 37.5], [-107.5, 38]);
    expect(linkPoint(area('a', [small], [large]))).toEqual([-107.75, 37.75]);
  });

  it('finds a point inside an area whose center is outside it', () => {
    // A U shape open to the north: its center falls in the gap
    const u = area('u', [
      [
        [-108, 37],
        [-107, 37],
        [-107, 38],
        [-107.2, 38],
        [-107.2, 37.2],
        [-107.8, 37.2],
        [-107.8, 38],
        [-108, 38],
        [-108, 37],
      ],
    ]);

    const pt = linkPoint(u);
    expect(booleanPointInPolygon(pt, u)).toBe(true);
    pt.forEach(c => expect(Number(c.toFixed(3))).toBe(c));
  });

  it('avoids holes', () => {
    const ring = area('ring', [box([-108, 37], [-107, 38]), box([-107.9, 37.1], [-107.1, 37.9])]);
    expect(booleanPointInPolygon(linkPoint(ring), ring)).toBe(true);
  });
});

describe('buildCaicForecastUrl', () => {
  it('links to CAIC’s map for the point and date', () => {
    expect(buildCaicForecastUrl([-107.816, 37.879], DATE)).toBe(
      'https://avalanche.state.co.us/?lat=37.879&lng=-107.816&date=2026-02-16'
    );
  });
});
