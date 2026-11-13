import { buildForecastUrl } from '@multifarious/forecast-api';
import type { AvalancheCenterId, ForecastProduct, DangerRating } from '@multifarious/forecast-api';

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
 * Options for formatForecast
 */
export interface FormatForecastOptions {
  /** Avalanche center that published the product (default: 'NWAC') */
  center?: AvalancheCenterId;
  /** Include the center prefix, e.g. 'NWAC ' (default: true) */
  includeCenter?: boolean;
  /** @deprecated Use `includeCenter`. */
  includeNWAC?: boolean;
  /** Which day to show: 'current' or 'tomorrow' (default: 'current') */
  day?: 'current' | 'tomorrow';
}

/**
 * Format forecast product to string representation
 *
 * Example output:
 * "NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/forecasts/avalanche/mt-hood#/forecast/10/166378)"
 * "UAC Salt Lake Zone forecast: 2🟨 (https://utahavalanchecenter.org/forecast/salt-lake/2/16/2026)"
 *
 * Products without elevation-band ratings (e.g. UAC on avalanche.org) fall back
 * to the overall `danger_rating` for the current day.
 *
 * @param product Forecast product from API
 * @param options Formatting options
 * @returns Formatted forecast string
 */
export function formatForecast(product: ForecastProduct, options: FormatForecastOptions = {}): string {
  const { center = 'NWAC', day = 'current' } = options;
  const includeCenter = options.includeCenter ?? options.includeNWAC ?? true;

  // Get zone information
  if (!product.forecast_zone || product.forecast_zone.length === 0) {
    throw new Error('Forecast product has no zone information');
  }

  const zoneName = product.forecast_zone[0].name;
  const dangerString = formatDangerForDay(product, day);
  const url = buildForecastUrl(product, center);
  const prefix = includeCenter ? `${center} ` : '';

  return `${prefix}${zoneName} Zone forecast: ${dangerString} (${url})`;
}

/**
 * Format the danger for a forecast day, by elevation band when available
 */
function formatDangerForDay(product: ForecastProduct, day: 'current' | 'tomorrow'): string {
  const dangerForDay = product.danger?.find(d => d.valid_day === day);
  if (dangerForDay) {
    return formatDangerRatings(dangerForDay);
  }

  // No elevation bands: fall back to the overall rating, which is for the current day only
  const hasBands = (product.danger?.length ?? 0) > 0;
  if (!hasBands && day === 'current' && typeof product.danger_rating === 'number') {
    return `${product.danger_rating}${getDangerSquare(product.danger_rating)}`;
  }

  if (!hasBands && day === 'current') {
    throw new Error('Forecast product has no danger rating information');
  }
  throw new Error(`No danger ratings found for day: ${day}`);
}

/**
 * Matches a forecast line written by formatForecast, for any supported center,
 * plus legacy lines that only carry the NWAC permalink
 * (e.g. "NWAC Mt Hood forecast: ... (https://nwac.us/avalanche-forecast/#/forecast/10/1)").
 */
const FORECAST_LINE = /^(?:(?:NWAC|UAC|CAIC) .+ Zone forecast: .*|.*https:\/\/nwac\.us\/avalanche-forecast\/#\/forecast\/.*)$/;

/**
 * Split a description into lines. Descriptions edited in Strava use CRLF line
 * endings, and `.` in FORECAST_LINE doesn't match a trailing `\r` (#71).
 */
function splitLines(description: string): string[] {
  return description.split(/\r?\n/);
}

/**
 * Whether a description already contains a forecast line added by this service
 */
export function hasForecastLine(description: string): boolean {
  return splitLines(description).some(line => FORECAST_LINE.test(line));
}

/**
 * Remove every forecast line added by this service, wherever it appears,
 * and tidy the blank lines left behind
 *
 * Keeps CRLF line endings if the description uses them.
 */
export function removeForecastLines(description: string): string {
  const eol = description.includes('\r\n') ? '\r\n' : '\n';
  const lines: string[] = [];
  for (const line of splitLines(description)) {
    if (FORECAST_LINE.test(line)) {
      continue;
    }
    // Collapse runs of blank lines to one
    if (line.trim() === '' && lines.length > 0 && lines[lines.length - 1].trim() === '') {
      continue;
    }
    lines.push(line);
  }
  return lines.join(eol).trim();
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
