import type { ForecastProduct, DangerRating } from '@multifarious/forecast-api';

/**
 * Map danger level (0-5) to colored unicode square
 *
 * @param level Danger level (0-5, or -1 for unknown)
 * @returns Colored unicode square
 */
export function getDangerSquare(level: number): string {
  const squares: Record<number, string> = {
    '-1': '⬜', // Gray - Unknown/No Rating
    '0': '⬜',  // Gray - No Rating
    '1': '🟩',  // Green - Low
    '2': '🟨',  // Yellow - Moderate
    '3': '🟧',  // Orange - Considerable
    '4': '🟥',  // Red - High
    '5': '⬛',  // Black - Extreme
  };

  return squares[level] || '⬜';
}

/**
 * Format danger ratings by elevation band
 * Format: "upper🟧/middle🟧/lower🟨"
 *
 * @param danger Danger rating object with upper/middle/lower
 * @returns Formatted string like "3🟧/3🟧/2🟨"
 */
export function formatDangerRatings(danger: DangerRating): string {
  const { upper, middle, lower } = danger;

  return [
    `${upper}${getDangerSquare(upper)}`,
    `${middle}${getDangerSquare(middle)}`,
    `${lower}${getDangerSquare(lower)}`,
  ].join('/');
}

/**
 * Format forecast product to string representation
 *
 * Example output:
 * "NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)"
 *
 * @param product Forecast product from API
 * @param options Formatting options
 * @returns Formatted forecast string
 */
export function formatForecast(
  product: ForecastProduct,
  options?: {
    /** Include 'NWAC' prefix (default: true) */
    includeNWAC?: boolean;
    /** Which day to show: 'current' or 'tomorrow' (default: 'current') */
    day?: 'current' | 'tomorrow';
  }
): string {
  const { includeNWAC = true, day = 'current' } = options || {};

  // Get zone information
  if (!product.forecast_zone || product.forecast_zone.length === 0) {
    throw new Error('Forecast product has no zone information');
  }

  const zone = product.forecast_zone[0];
  const zoneName = zone.name;

  // Get danger ratings for the specified day
  if (!product.danger || product.danger.length === 0) {
    throw new Error('Forecast product has no danger rating information');
  }

  const dangerForDay = product.danger.find(d => d.valid_day === day);
  if (!dangerForDay) {
    throw new Error(`No danger ratings found for day: ${day}`);
  }

  // Build URL
  const url = `https://nwac.us/avalanche-forecast/#/forecast/${zone.zone_id}/${product.id}`;

  // Format the string
  const prefix = includeNWAC ? 'NWAC ' : '';
  const dangerString = formatDangerRatings(dangerForDay);

  return `${prefix}${zoneName} Zone forecast: ${dangerString} (${url})`;
}

/**
 * Get human-readable danger level name
 *
 * @param level Danger level (0-5)
 * @returns Danger level name
 */
export function getDangerLevelName(level: number): string {
  const names: Record<number, string> = {
    '-1': 'No Rating',
    '0': 'No Rating',
    '1': 'Low',
    '2': 'Moderate',
    '3': 'Considerable',
    '4': 'High',
    '5': 'Extreme',
  };

  return names[level] || 'Unknown';
}
