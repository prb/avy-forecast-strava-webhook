import type { ForecastProduct } from '../types/index.js';

/**
 * Avalanche.org Public API Client
 */

const API_BASE_URL = 'https://api.avalanche.org/v2/public';

/**
 * Query parameters for products endpoint
 */
export interface ProductsQuery {
  /** Avalanche center ID (e.g., "NWAC") */
  avalanche_center_id: string;
  /** Start date (ISO format: YYYY-MM-DD) */
  date_start: string;
  /** End date (ISO format: YYYY-MM-DD) */
  date_end: string;
}

/**
 * Fetch products from avalanche.org API
 *
 * @param query Query parameters
 * @returns Array of forecast products
 */
export async function fetchProducts(query: ProductsQuery): Promise<ForecastProduct[]> {
  const params = new URLSearchParams({
    avalanche_center_id: query.avalanche_center_id,
    date_start: query.date_start,
    date_end: query.date_end,
  });

  const url = `${API_BASE_URL}/products?${params}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('API response is not an array');
    }

    return data as ForecastProduct[];
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Fetch a single product by ID
 *
 * @param productId Product ID
 * @returns Forecast product
 */
export async function fetchProduct(productId: number): Promise<ForecastProduct> {
  const url = `${API_BASE_URL}/product/${productId}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data as ForecastProduct;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch product ${productId}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Fetch NWAC forecasts for a specific date
 *
 * Note: The avalanche.org API doesn't return results when date_start === date_end,
 * so we query a 3-day range centered on the target date and filter client-side.
 *
 * @param date Date in ISO format (YYYY-MM-DD)
 * @returns Array of forecast products for that date
 */
export async function fetchNWACForecastsForDate(date: string): Promise<ForecastProduct[]> {
  // Calculate date range: target date ± 1 day
  const targetDate = new Date(date + 'T00:00:00Z');
  const dayBefore = new Date(targetDate);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const dayAfter = new Date(targetDate);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  const dateStart = dayBefore.toISOString().split('T')[0];
  const dateEnd = dayAfter.toISOString().split('T')[0];

  const products = await fetchProducts({
    avalanche_center_id: 'NWAC',
    date_start: dateStart,
    date_end: dateEnd,
  });

  // Filter to only forecast products (not summaries) and match exact date
  return products.filter(p =>
    p.product_type === 'forecast' &&
    p.start_date &&
    p.start_date.startsWith(date)
  );
}

/**
 * Fetch NWAC forecast for a specific zone and date
 *
 * @param zoneId Zone ID from avalanche.org API (e.g., 1645-1657)
 * @param date Date in ISO format (YYYY-MM-DD)
 * @returns Forecast product if found, null otherwise
 */
export async function fetchNWACForecastForZone(
  zoneId: number,
  date: string
): Promise<ForecastProduct | null> {
  const forecasts = await fetchNWACForecastsForDate(date);

  // Find forecast for the specified zone
  const forecast = forecasts.find(f => {
    return f.forecast_zone && f.forecast_zone.some(zone => zone.id === zoneId);
  });

  return forecast || null;
}

/**
 * Build permalink URL for a forecast
 *
 * @param product Forecast product
 * @returns Permalink URL
 */
export function buildForecastUrl(product: ForecastProduct): string {
  if (!product.forecast_zone || product.forecast_zone.length === 0) {
    throw new Error('Forecast has no zone information');
  }

  const zone = product.forecast_zone[0];
  return `https://nwac.us/avalanche-forecast/#/forecast/${zone.zone_id}/${product.id}`;
}
