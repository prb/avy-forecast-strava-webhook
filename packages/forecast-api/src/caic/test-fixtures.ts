import type { Position } from 'geojson';
import type { AvidArea, AvidDangerDay, AvidForecast, CaicDayForecasts } from './avid.js';

/**
 * Test helpers: small AvID-shaped areas and forecasts
 */

/** A rectangular ring, counter-clockwise, from its south-west and north-east corners */
export function box([west, south]: Position, [east, north]: Position): Position[] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

export function area(id: string, ...polygons: Position[][][]): AvidArea {
  return {
    type: 'Feature',
    id,
    properties: { id },
    geometry: { type: 'MultiPolygon', coordinates: polygons },
  };
}

export function dangerDay(
  position: number,
  date: string,
  alp: string,
  tln = alp,
  btl = tln
): AvidDangerDay {
  return { position, alp, tln, btl, date: `${date}T23:30:00Z` };
}

export function forecast(areaId: string, days: AvidDangerDay[]): AvidForecast {
  return {
    id: `forecast-${areaId}`,
    type: 'avalancheforecast',
    areaId,
    issueDateTime: '2026-02-15T23:30:00Z',
    expiryDateTime: '2026-02-16T23:30:00Z',
    dangerRatings: { days },
    avalancheSummary: { days: [{ date: '2026-02-16T23:30:00Z', content: '<p>Summary</p>' }] },
  };
}

export function day(areas: CaicDayForecasts['areas']['features'], forecasts: AvidForecast[]): CaicDayForecasts {
  return { areas: { type: 'FeatureCollection', features: areas }, forecasts };
}
