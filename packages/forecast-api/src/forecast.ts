import { findZoneForCoordinate } from './zones/index.js';
import { SUPPORTED_CENTERS } from './zones/config.js';
import { fetchForecastForZone, buildForecastUrl } from './api/index.js';
import { getCache, getCachedZoneForecast, cacheZoneForecast } from './cache/index.js';
import type {
  Coordinate,
  ForecastResponseZone,
  ZoneWithBoundary,
  ForecastResponse,
  ForecastProduct,
  ForecastProductResponse,
  GetForecastOptions,
} from './types/index.js';

// Overload signatures
export async function getForecastForCoordinate(
  coordinate: Coordinate,
  date: string,
  options: { includeProduct: true; useCache?: boolean }
): Promise<ForecastProductResponse>;
export async function getForecastForCoordinate(
  coordinate: Coordinate,
  date: string,
  options?: { includeProduct?: false; useCache?: boolean }
): Promise<ForecastResponse>;
/**
 * Get avalanche forecast for a GPS coordinate on a specific date
 *
 * Uses a read-through cache strategy:
 * 1. Check cache first
 * 2. On cache miss, fetch from API
 * 3. Store in cache (both positive and negative results)
 * 4. Return data
 *
 * @param coordinate GPS coordinate
 * @param date Date in ISO format (YYYY-MM-DD)
 * @param options Options for the query
 * @returns Forecast response with zone and forecast data
 */
export async function getForecastForCoordinate(
  coordinate: Coordinate,
  date: string,
  options: GetForecastOptions = {}
): Promise<ForecastResponse | ForecastProductResponse> {
  // Step 1: Find which zone contains this coordinate
  const { useCache = true, includeProduct = false } = options;
  const zone = await findZoneForCoordinate(coordinate);

  if (!zone) {
    return {
      zone: {
        id: 0,
        zone_id: '',
        name: 'Unknown',
      },
      forecast: null,
      product: null,
      error: 'Coordinate is outside all supported forecast zones',
    };
  }

  // Zones whose center we can't fetch/format yet get an explicit error rather
  // than a misleading "no forecast available" (#52, #53)
  if (!SUPPORTED_CENTERS.has(zone.center_id)) {
    return {
      zone: toResponseZone(zone),
      forecast: null,
      product: null,
      error: `Forecasts for ${zone.center_id} zones are not yet supported`,
    };
  }

  // Step 2: Try cache first (if enabled)
  if (useCache) {
    try {
      const cached = await getCachedZoneForecast(getCache(), zone.id, date);

      if (cached) {
        console.log(`Cache HIT for zone ${zone.id}, date ${date} (${cached.reason})`);
        return includeProduct
          ? buildForecastProductResponse(toResponseZone(zone), cached.value)
          : buildForecastResponse(toResponseZone(zone), cached.value);
      }

      console.log(`Cache MISS for zone ${zone.id}, date ${date}`);
    } catch (error) {
      // Cache errors shouldn't break the API - just log and continue
      console.error('Cache read error:', error);
    }
  }

  // Step 3: Fetch from API (cache miss or cache disabled)
  try {
    const product = await fetchForecastForZone(zone.center_id, zone.zone_id, date);

    // Step 4: Store in cache (both positive and negative results)
    if (useCache) {
      try {
        await cacheZoneForecast(getCache(), zone.id, date, product);
        console.log(`Cached forecast for zone ${zone.id}, date ${date}: ${product ? 'found' : 'not found'}`);
      } catch (error) {
        // Cache write errors shouldn't break the API - just log
        console.error('Cache write error:', error);
      }
    }

    return includeProduct
      ? buildForecastProductResponse(toResponseZone(zone), product)
      : buildForecastResponse(toResponseZone(zone), product);
  } catch (error) {
    return {
      zone: toResponseZone(zone),
      forecast: null,
      product: null,
      error: error instanceof Error ? error.message : 'Unknown error fetching forecast',
    };
  }
}

/**
 * Summarize a zone for API responses (drops the boundary geometry)
 */
function toResponseZone(zone: ZoneWithBoundary): ForecastResponseZone {
  return {
    id: zone.id,
    zone_id: zone.zone_id,
    name: zone.name,
    center_id: zone.center_id,
  };
}

/**
 * Build forecast response from zone and product
 */
function buildForecastResponse(
  zone: ForecastResponseZone,
  product: ForecastProduct | null
): ForecastResponse {
  if (!product) {
    return {
      zone,
      forecast: null,
      error: `No forecast available for ${zone.name}`,
    };
  }

  const url = buildForecastUrl(product, zone.center_id);

  return {
    zone,
    forecast: {
      product_id: product.id,
      date: product.start_date,
      published_time: product.published_time,
      danger_rating: product.danger_rating,
      bottom_line: product.bottom_line,
      url,
    },
  };
}

/**
 * Build forecast product response from zone and product
 */
function buildForecastProductResponse(
  zone: ForecastResponseZone,
  product: ForecastProduct | null
): ForecastProductResponse {
  if (!product) {
    return {
      zone,
      product: null,
      error: `No forecast available for ${zone.name}`,
    };
  }

  return {
    zone,
    product,
  };
}

/**
 * Validate date format (YYYY-MM-DD)
 */
export function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    return false;
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return false;
  }

  // Verify the date didn't roll over (e.g., 2025-02-30 becomes 2025-03-02)
  const [year, month, day] = dateString.split('-').map(Number);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

/**
 * Validate coordinate
 */
export function isValidCoordinate(coordinate: Coordinate): boolean {
  const { latitude, longitude } = coordinate;

  // Check latitude bounds
  if (latitude < -90 || latitude > 90) {
    return false;
  }

  // Check longitude bounds
  if (longitude < -180 || longitude > 180) {
    return false;
  }

  return true;
}
