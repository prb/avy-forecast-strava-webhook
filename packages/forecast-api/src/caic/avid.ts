import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/**
 * CAIC's AvID API, which backs the forecast map on avalanche.state.co.us
 *
 * This isn't a documented public API, so it may change without notice (#52).
 * Requests mirror what CAIC's site sends for a past date: the forecast in
 * effect at 21:30 UTC that day.
 */
export const AVID_BASE_URL = 'https://avalanche.state.co.us/avid';

/**
 * A forecast area: CAIC regroups its small forecast polygons into new areas,
 * with new IDs, from day to day, and the areas have no names.
 */
export type AvidArea = Feature<Polygon | MultiPolygon, { id?: string; centroid?: [number, number] }>;

/** Danger by elevation band for one forecast day */
export interface AvidDangerDay {
  /** 1 = the requested date, 2 = the next day */
  position: number;
  /** Above treeline, e.g. 'low', 'moderate', 'noRating', 'noForecast' */
  alp: string;
  /** Near treeline */
  tln: string;
  /** Below treeline */
  btl: string;
  /** End of the forecast day, e.g. '2026-02-16T23:30:00Z' */
  date: string;
}

/**
 * A forecast for one area. Only the fields we read are typed; the cache keeps
 * the whole object as AvID returned it.
 */
export interface AvidForecast {
  id: string;
  type: string;
  areaId: string;
  issueDateTime: string;
  expiryDateTime: string;
  dangerRatings?: { days?: AvidDangerDay[] };
  avalancheSummary?: { days?: Array<{ date?: string; content?: string }> };
  [key: string]: unknown;
}

/** Everything CAIC published for one date: the areas and their forecasts */
export interface CaicDayForecasts {
  areas: FeatureCollection<Polygon | MultiPolygon>;
  forecasts: AvidForecast[];
}

/**
 * The `datetime` CAIC's site sends for a date
 */
export function avidDatetime(date: string): string {
  return `${date}T21:30:00.000Z`;
}

/**
 * Fetch CAIC's forecast areas and forecasts for a date
 *
 * @param date Date in ISO format (YYYY-MM-DD)
 * @throws If either request fails or returns something other than the
 *   expected shape (so a bad response is never cached)
 */
export async function fetchCaicForecasts(date: string): Promise<CaicDayForecasts> {
  const query = `productType=avalancheforecast&datetime=${encodeURIComponent(avidDatetime(date))}`;

  const [areas, forecasts] = await Promise.all([
    fetchAvid(`products/all/area?${query}`),
    fetchAvid(`products/all?${query}`),
  ]);

  return parseCaicDayForecasts(areas, forecasts);
}

/**
 * Check the shape of AvID's area and forecast responses
 *
 * Only the fields we use are checked; everything else is kept as is.
 */
export function parseCaicDayForecasts(areas: unknown, forecasts: unknown): CaicDayForecasts {
  const collection = areas as Partial<FeatureCollection> | null;
  if (
    !collection ||
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features)
  ) {
    throw new Error('CAIC forecast areas response is not a FeatureCollection');
  }
  for (const feature of collection.features) {
    const type = feature?.geometry?.type;
    if (type !== 'Polygon' && type !== 'MultiPolygon') {
      throw new Error(`CAIC forecast area has unexpected geometry: ${type}`);
    }
    if (areaId(feature as AvidArea) === undefined) {
      throw new Error('CAIC forecast area has no id');
    }
  }

  if (!Array.isArray(forecasts)) {
    throw new Error('CAIC forecasts response is not an array');
  }
  for (const forecast of forecasts) {
    const f = forecast as Partial<AvidForecast> | null;
    if (!f || typeof f.areaId !== 'string' || typeof f.id !== 'string') {
      throw new Error('CAIC forecast has no id or areaId');
    }
  }

  return {
    areas: collection as FeatureCollection<Polygon | MultiPolygon>,
    forecasts: forecasts as AvidForecast[],
  };
}

/**
 * An area's ID (AvID puts it both on the feature and in its properties)
 */
export function areaId(area: AvidArea): string | undefined {
  const id = area.id ?? area.properties?.id;
  return id === undefined || id === null ? undefined : String(id);
}

async function fetchAvid(path: string): Promise<unknown> {
  const url = `${AVID_BASE_URL}/${path}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`Failed to fetch CAIC forecasts: ${error instanceof Error ? error.message : error}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch CAIC forecasts: ${response.status} ${response.statusText}`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error('Failed to fetch CAIC forecasts: response is not JSON');
  }
}
