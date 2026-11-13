import type { CaicDayForecasts } from '../caic/avid.js';
import type { CacheEntry, CacheStore } from './types.js';
import { calculateExpiration, getTTLReason } from './ttl.js';

/**
 * Cache key schema version for CAIC's statewide forecasts.
 *
 * Entries hold AvID's data as fetched and are converted on read, so changes
 * to the conversion don't need a bump. Bump it if cached entries may be wrong.
 */
export const CAIC_CACHE_KEY_VERSION = 'caic-v1';

/** How long to keep a date with no CAIC areas or forecasts (e.g. off season) */
const EMPTY_TTL_MINUTES = 60;

/**
 * CAIC's forecast areas and forecasts for one date
 */
export type CachedCaicForecasts = CacheEntry<CaicDayForecasts>;

/**
 * Cache key for CAIC's statewide forecasts for a date
 *
 * Keyed by date only: a regional zone can span several AvID areas, and the
 * areas change from day to day, so the area is found after reading.
 */
export function getCaicCacheKey(date: string): string {
  return `${CAIC_CACHE_KEY_VERSION}-date-${date}`;
}

/**
 * Read CAIC's cached forecasts for a date
 */
export function getCachedCaicForecasts(
  cache: CacheStore,
  date: string
): Promise<CachedCaicForecasts | null> {
  return cache.get<CaicDayForecasts>(getCaicCacheKey(date));
}

/**
 * Cache CAIC's forecasts for a date
 *
 * Same expiry as zone forecasts (60 minutes within 72 hours of the date,
 * permanent after that), except that a date with no areas or no forecasts is
 * only kept for 60 minutes, so an empty response is never kept permanently
 * (see #51).
 */
export function cacheCaicForecasts(
  cache: CacheStore,
  date: string,
  day: CaicDayForecasts,
  now: Date = new Date()
): Promise<void> {
  if (day.areas.features.length === 0 || day.forecasts.length === 0) {
    return cache.set(getCaicCacheKey(date), day, {
      expiresAt: new Date(now.getTime() + EMPTY_TTL_MINUTES * 60 * 1000),
      reason: `No CAIC forecasts: ${EMPTY_TTL_MINUTES} minute cache`,
    });
  }

  return cache.set(getCaicCacheKey(date), day, {
    expiresAt: calculateExpiration(date, now),
    reason: getTTLReason(date, now),
  });
}
