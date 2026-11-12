import type { AvalancheCenterId, ForecastProduct } from '../types/index.js';
import { fetchProducts } from './api-base.js';
export { fetchProducts, fetchProduct, type ProductsQuery } from './api-base.js';

/**
 * Fetch an avalanche center's forecasts for a specific date
 *
 * Note: The avalanche.org API doesn't return results when date_start === date_end,
 * so we query a 3-day range centered on the target date and filter client-side.
 *
 * @param centerId avalanche.org center ID (e.g., "NWAC")
 * @param date Date in ISO format (YYYY-MM-DD)
 * @returns Array of forecast products for that date
 */
export async function fetchForecastsForDate(
  centerId: AvalancheCenterId,
  date: string
): Promise<ForecastProduct[]> {
  // Calculate date range: target date ± 1 day
  const targetDate = new Date(date + 'T00:00:00Z');
  const dayBefore = new Date(targetDate);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const dayAfter = new Date(targetDate);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  const dateStart = dayBefore.toISOString().split('T')[0];
  const dateEnd = dayAfter.toISOString().split('T')[0];

  const products = await fetchProducts({
    avalanche_center_id: centerId,
    date_start: dateStart,
    date_end: dateEnd,
  });

  // Filter to only forecast products (not summaries) and match exact date
  return products.filter(p => {
    if (p.product_type !== 'forecast' || !p.start_date) {
      return false;
    }
    // Match date part of start_date (YYYY-MM-DD)
    const productDate = p.start_date.split('T')[0];
    return productDate === date;
  });
}

/**
 * Fetch NWAC forecasts for a specific date
 *
 * @param date Date in ISO format (YYYY-MM-DD)
 * @returns Array of forecast products for that date
 */
export async function fetchNWACForecastsForDate(date: string): Promise<ForecastProduct[]> {
  return fetchForecastsForDate('NWAC', date);
}

/**
 * Fetch the forecast for a specific zone and date
 *
 * Products are matched on the zone's stable `zone_id` slug rather than the
 * numeric avalanche.org zone ID, which is renumbered between seasons (#51).
 *
 * @param centerId avalanche.org center ID (e.g., "NWAC")
 * @param zoneId Center's stable zone identifier (e.g., '2' for NWAC Stevens Pass)
 * @param date Date in ISO format (YYYY-MM-DD)
 * @returns Forecast product if found, null otherwise
 */
export async function fetchForecastForZone(
  centerId: AvalancheCenterId,
  zoneId: string,
  date: string
): Promise<ForecastProduct | null> {
  const forecasts = await fetchForecastsForDate(centerId, date);

  const forecast = forecasts.find(f =>
    f.forecast_zone?.some(zone => zone.zone_id === zoneId)
  );

  return forecast ?? null;
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
