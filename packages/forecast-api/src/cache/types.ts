import type { ForecastProduct } from '../types/index.js';

/**
 * Cached forecast entry with metadata
 */
export interface CachedForecast {
  /** The forecast data, or null if no forecast was found */
  forecast: ForecastProduct | null;
  /** ISO timestamp when this was cached */
  cachedAt: string;
  /** ISO timestamp when this expires, or null for permanent cache */
  expiresAt: string | null;
  /** Human-readable reason for the cache entry (for debugging) */
  reason?: string;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Cache type: 's3', 'local', or 'memory' */
  type: 'local' | 's3' | 'memory';
  /** S3 bucket name (for S3 cache) */
  s3Bucket?: string;
  /** S3 key prefix (for S3 cache) */
  s3Prefix?: string;
  /** AWS region (for S3 cache) */
  awsRegion?: string;
  /** Local cache directory (for local cache) */
  localCacheDir?: string;
}

/**
 * Forecast cache interface
 */
export interface ForecastCache {
  /**
   * Get a forecast from cache
   * @returns Cached forecast if found and not expired, null otherwise
   */
  get(zoneId: number, date: string): Promise<CachedForecast | null>;

  /**
   * Store a forecast in cache with appropriate TTL
   * @param forecast The forecast to cache, or null for negative cache
   */
  set(zoneId: number, date: string, forecast: ForecastProduct | null): Promise<void>;

  /**
   * Delete a specific cache entry
   */
  delete(zoneId: number, date: string): Promise<void>;

  /**
   * Clear all cache entries
   */
  clear(): Promise<void>;
}

/**
 * Cache key schema version.
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
 * Generate cache key from zone ID and date
 */
export function getCacheKey(zoneId: number, date: string): string {
  return `${CACHE_KEY_VERSION}-zone-${zoneId}-date-${date}`;
}
