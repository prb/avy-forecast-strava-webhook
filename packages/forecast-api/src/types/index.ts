import type { Feature, Polygon, MultiPolygon } from 'geojson';
import type { AvalancheCenterId } from '../zones/config.js';

export type { AvalancheCenterId };

/**
 * NWAC Zone information from avalanche.org API
 */
export interface NWACZone {
  /** Zone ID from avalanche.org (renumbered between seasons; don't persist or match on it) */
  id: number;
  /** Center's stable zone identifier used in URLs (e.g., '1'-'10' for NWAC) */
  zone_id: string;
  /** Human-readable zone name */
  name: string;
  /** URL to zone forecast page */
  url: string;
  config: null;
}

/**
 * Danger rating by elevation band
 */
export interface DangerRating {
  /** Above treeline danger rating (0-5) */
  upper: number;
  /** Near treeline danger rating (0-5) */
  middle: number;
  /** Below treeline danger rating (0-5) */
  lower: number;
  /** Which forecast day: 'current' or 'tomorrow' */
  valid_day: 'current' | 'tomorrow';
}

/**
 * Avalanche forecast product from avalanche.org API
 */
export interface ForecastProduct {
  /** Unique product ID (numeric on avalanche.org; a UUID string for CAIC's AvID forecasts) */
  id: number | string;
  /** Product type (e.g., "forecast", "summary") */
  product_type: string;
  /** Publication timestamp */
  published_time: string;
  /** Start date of forecast validity */
  start_date: string;
  /** End date of forecast validity */
  end_date: string;
  /** Expiration timestamp */
  expires_time: string;
  /** Overall danger rating (-1 to 5) */
  danger_rating: number;
  /** Danger ratings by elevation band for current and next day */
  danger?: DangerRating[];
  /** Bottom line summary (HTML) */
  bottom_line: string | null;
  /** Hazard discussion (HTML) */
  hazard_discussion: string | null;
  /** Weather discussion (HTML) */
  weather_discussion: string | null;
  /** Forecast status */
  status: string;
  /** Author name */
  author: string;
  /** Avalanche center info */
  avalanche_center: {
    name: string;
    id?: string;
    url?: string;
    city?: string;
    state?: string;
  };
  /** Zone(s) this forecast applies to */
  forecast_zone: NWACZone[];
}

/**
 * Zone boundary GeoJSON feature
 */
export interface ZoneBoundary extends Feature<Polygon | MultiPolygon> {
  properties: {
    title: string;
    description?: string;
    [key: string]: unknown;
  };
}

/**
 * Zone with boundary geometry
 */
export interface ZoneWithBoundary {
  /** Internal numeric zone key (not the current avalanche.org zone ID; see zones/config.ts) */
  id: number;
  /** Center's stable zone identifier used in URLs (e.g., '1'-'10' for NWAC) */
  zone_id: string;
  /** Human-readable zone name */
  name: string;
  /** Avalanche center that publishes forecasts for this zone */
  center_id: AvalancheCenterId;
  /** GeoJSON boundary */
  boundary: ZoneBoundary;
}

/**
 * GPS coordinate
 */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Zone summary included in forecast query responses
 */
export interface ForecastResponseZone {
  id: number;
  zone_id: string;
  name: string;
  /** Avalanche center for the zone; absent when the coordinate is outside all zones */
  center_id?: AvalancheCenterId;
}

/**
 * API response for forecast query
 */
export interface ForecastResponse {
  zone: ForecastResponseZone;
  forecast: {
    product_id: number | string;
    date: string;
    published_time: string;
    danger_rating: number;
    bottom_line: string | null;
    url: string;
  } | null;
  error?: string;
}

/**
 * API response for forecast query that includes the full forecast product
 */
export interface ForecastProductResponse {
  zone: ForecastResponseZone;
  product: ForecastProduct | null;
  error?: string;
}

/**
 * Options for getForecastForCoordinate
 */
export interface GetForecastOptions {
  useCache?: boolean;
  includeProduct?: boolean;
}
