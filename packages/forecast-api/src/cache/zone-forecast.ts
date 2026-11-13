import type { ForecastProduct } from '../types/index.js';
import type { CacheEntry, CacheStore } from './types.js';
import { calculateExpiration, getTTLReason } from './ttl.js';

/**
 * Cache key schema version for zone forecasts.
 *
 * Bump this whenever previously cached entries may be wrong, so they're not
 * read again. Entries older than 72h are cached permanently, so there's no
 * other way for a bad entry to expire.
 *
 * - v2 (#51): v1 stored permanent negative results for the whole 2025-26 NWAC
 *   season because products were matched on stale zone IDs.
 */
export const CACHE_KEY_VERSION = 'v2';

/**
 * A cached avalanche.org forecast for one zone and date (null = no forecast)
 */
export type CachedZoneForecast = CacheEntry<ForecastProduct | null>;

/**
 * Cache key for an avalanche.org forecast for one zone and date
 *
 * The format is unchanged from before #61, so existing entries are still read.
 */
export function getCacheKey(zoneId: number, date: string): string {
  return `${CACHE_KEY_VERSION}-zone-${zoneId}-date-${date}`;
}

/**
 * Read a zone's cached forecast for a date
 */
export function getCachedZoneForecast(
  cache: CacheStore,
  zoneId: number,
  date: string
): Promise<CachedZoneForecast | null> {
  return cache.get<ForecastProduct | null>(getCacheKey(zoneId, date));
}

/**
 * Cache a zone's forecast (or the absence of one) for a date
 *
 * Expiry depends on the forecast date: 60 minutes while the date is within
 * the last 72 hours (forecasts may still be updated), permanent after that.
 */
export function cacheZoneForecast(
  cache: CacheStore,
  zoneId: number,
  date: string,
  forecast: ForecastProduct | null,
  now: Date = new Date()
): Promise<void> {
  return cache.set(getCacheKey(zoneId, date), forecast, {
    expiresAt: calculateExpiration(date, now),
    reason: getTTLReason(date, now),
  });
}
