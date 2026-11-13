import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import type { Coordinate, DangerRating, ForecastProduct, ZoneWithBoundary } from '../types/index.js';
import { areaId, type AvidArea, type AvidDangerDay, type AvidForecast, type CaicDayForecasts } from './avid.js';

export const CAIC_SITE_URL = 'https://avalanche.state.co.us/';

/** AvID danger values; noRating/noForecast are shown as 0 (no rating) */
const DANGER_LEVELS: Record<string, number> = {
  noRating: 0,
  noForecast: 0,
  low: 1,
  moderate: 2,
  considerable: 3,
  high: 4,
  extreme: 5,
};

/** Decimal places for link coordinates (about 100 m) */
const LINK_PRECISION = 3;

/**
 * Find the forecast area containing a point, and its forecast
 *
 * @returns null if the point is outside every area, or its area has no forecast
 */
export function findCaicForecast(
  day: CaicDayForecasts,
  coordinate: Coordinate
): { area: AvidArea; forecast: AvidForecast } | null {
  const pt = point([coordinate.longitude, coordinate.latitude]);

  for (const feature of day.areas.features) {
    const area = feature as AvidArea;
    if (!booleanPointInPolygon(pt, area)) {
      continue;
    }
    const id = areaId(area);
    const forecast = day.forecasts.find(f => f.areaId === id);
    if (forecast) {
      return { area, forecast };
    }
  }

  return null;
}

/**
 * Convert an AvID forecast to the forecast shape the formatter uses
 *
 * The zone (name and ID) is our regional CAIC boundary, since AvID areas have
 * no names. The link opens CAIC's forecast for the date at a fixed point
 * inside the area, not the activity's location, so it doesn't reveal where
 * the activity started (e.g. inside a Strava privacy zone).
 *
 * @param date The forecast date (YYYY-MM-DD), the date the areas were fetched for
 * @returns null if CAIC issued no rating for that date
 */
export function toCaicForecastProduct(
  zone: ZoneWithBoundary,
  area: AvidArea,
  forecast: AvidForecast,
  date: string
): ForecastProduct | null {
  const days = forecast.dangerRatings?.days ?? [];
  const today = days.find(d => d.date?.slice(0, 10) === date);
  if (!today || isUnrated(today)) {
    return null;
  }

  const danger: DangerRating[] = [toDangerRating(today, 'current')];
  const tomorrow = days.find(d => d.position === today.position + 1);
  if (tomorrow && !isUnrated(tomorrow)) {
    danger.push(toDangerRating(tomorrow, 'tomorrow'));
  }
  const current = danger[0];

  return {
    id: forecast.id,
    product_type: 'forecast',
    published_time: forecast.issueDateTime,
    start_date: date,
    end_date: date,
    expires_time: forecast.expiryDateTime,
    danger_rating: Math.max(current.upper, current.middle, current.lower),
    danger,
    bottom_line: forecast.avalancheSummary?.days?.[0]?.content ?? null,
    hazard_discussion: null,
    weather_discussion: null,
    status: 'published',
    author: '',
    avalanche_center: {
      id: 'CAIC',
      name: 'Colorado Avalanche Information Center',
      url: CAIC_SITE_URL,
    },
    forecast_zone: [
      {
        id: zone.id,
        zone_id: zone.zone_id,
        name: zone.name,
        url: buildCaicForecastUrl(linkPoint(area), date),
        config: null,
      },
    ],
  };
}

/**
 * Link to CAIC's forecast for a point and date, e.g.
 * https://avalanche.state.co.us/?lat=37.879&lng=-107.816&date=2026-02-16
 */
export function buildCaicForecastUrl([lng, lat]: Position, date: string): string {
  return `${CAIC_SITE_URL}?lat=${lat}&lng=${lng}&date=${date}`;
}

/**
 * A fixed point inside an area, rounded for use in a link
 *
 * Uses the center of the area's largest polygon when that's inside the area
 * (CAIC's own `centroid` isn't always), otherwise the middle of the widest
 * east-west span across the polygon. Coordinates are rounded to 3 decimal
 * places, and only kept if the rounded point is still inside the area.
 */
export function linkPoint(area: AvidArea): Position {
  const geometry = area.geometry;
  const polygon = largestPolygon(geometry);
  const candidates = [ringCentroid(polygon[0]), ...scanlineMidpoints(polygon)];

  for (const candidate of candidates) {
    const rounded = candidate.map(c => round(c, LINK_PRECISION));
    if (booleanPointInPolygon(rounded, geometry)) {
      return rounded;
    }
  }

  // Only reachable for slivers narrower than the rounding: keep more digits
  const inside = candidates.find(c => booleanPointInPolygon(c, geometry)) ?? polygon[0][0];
  return inside.map(c => round(c, 5));
}

function isUnrated(day: AvidDangerDay): boolean {
  return [day.alp, day.tln, day.btl].every(rating => toDangerLevel(rating) === 0);
}

function toDangerRating(day: AvidDangerDay, validDay: DangerRating['valid_day']): DangerRating {
  return {
    upper: toDangerLevel(day.alp),
    middle: toDangerLevel(day.tln),
    lower: toDangerLevel(day.btl),
    valid_day: validDay,
  };
}

function toDangerLevel(rating: string): number {
  const level = DANGER_LEVELS[rating];
  if (level === undefined) {
    throw new Error(`Unknown CAIC danger rating: ${JSON.stringify(rating)}`);
  }
  return level;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** The polygon with the largest area (outer ring minus holes) */
function largestPolygon(geometry: Polygon | MultiPolygon): Position[][] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let best = polygons[0];
  let bestArea = -Infinity;
  for (const polygon of polygons) {
    const area = Math.abs(ringArea(polygon[0])) - polygon.slice(1).reduce((sum, hole) => sum + Math.abs(ringArea(hole)), 0);
    if (area > bestArea) {
      best = polygon;
      bestArea = area;
    }
  }
  return best;
}

/** Signed area of a ring (shoelace formula, in squared degrees) */
function ringArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

/** Area-weighted center of a ring */
function ringCentroid(ring: Position[]): Position {
  let cx = 0;
  let cy = 0;
  let twiceArea = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (twiceArea === 0) {
    return ring[0];
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

/**
 * Midpoints of the widest inside span along horizontal lines across a
 * polygon: through its center first, then at even steps across its extent
 */
function scanlineMidpoints(polygon: Position[][]): Position[] {
  const lats = polygon[0].map(p => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const steps = 20;
  const scanLats = [ringCentroid(polygon[0])[1]];
  for (let k = 1; k < steps; k++) {
    scanLats.push(minLat + ((maxLat - minLat) * k) / steps);
  }

  const midpoints: Position[] = [];
  for (const lat of scanLats) {
    const crossings: number[] = [];
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [x0, y0] = ring[i];
        const [x1, y1] = ring[i + 1];
        if (y0 > lat !== y1 > lat) {
          crossings.push(x0 + ((lat - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
    }
    crossings.sort((a, b) => a - b);

    let widest: [number, number] | null = null;
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const span: [number, number] = [crossings[i], crossings[i + 1]];
      if (!widest || span[1] - span[0] > widest[1] - widest[0]) {
        widest = span;
      }
    }
    if (widest) {
      midpoints.push([(widest[0] + widest[1]) / 2, lat]);
    }
  }
  return midpoints;
}
