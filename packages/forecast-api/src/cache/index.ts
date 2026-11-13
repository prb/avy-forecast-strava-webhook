/**
 * Forecast cache module
 *
 * A generic key/value store (local files or S3). Callers choose keys and
 * expiry; see zone-forecast.ts for avalanche.org zone forecasts:
 * - Recent forecasts (within 72 hours): 60 minute cache
 * - Older forecasts (>72 hours): Permanent cache
 */

import { LocalCacheStore } from './local.js';
import { S3CacheStore } from './s3.js';
import type { CacheStore, CacheConfig } from './types.js';

export { LocalCacheStore } from './local.js';
export { S3CacheStore } from './s3.js';
export * from './types.js';
export * from './ttl.js';
export * from './zone-forecast.js';

/**
 * Create a cache instance based on configuration
 *
 * @param config Cache configuration
 * @returns Configured cache instance
 */
export function createCache(config?: CacheConfig): CacheStore {
  const cacheType = config?.type || process.env.CACHE_TYPE || 'local';

  switch (cacheType) {
    case 's3': {
      const bucket = config?.s3Bucket || process.env.S3_BUCKET;
      if (!bucket) {
        throw new Error('S3_BUCKET must be configured for S3 cache');
      }

      const prefix = config?.s3Prefix || process.env.S3_PREFIX || 'forecasts/';
      const region = config?.awsRegion || process.env.AWS_REGION;

      console.log(`Initializing S3 cache: bucket=${bucket}, prefix=${prefix}, region=${region}`);
      return new S3CacheStore(bucket, prefix, region);
    }

    case 'local': {
      const cacheDir = config?.localCacheDir || process.env.LOCAL_CACHE_DIR || '/tmp/nwac-cache';
      console.log(`Initializing local file cache: dir=${cacheDir}`);
      return new LocalCacheStore(cacheDir);
    }

    case 'memory': {
      throw new Error('Memory cache not implemented yet');
    }

    default: {
      throw new Error(`Unknown cache type: ${cacheType}`);
    }
  }
}

/**
 * Global cache instance (singleton)
 */
let globalCache: CacheStore | null = null;

/**
 * Get the global cache instance
 *
 * Creates a cache on first call based on environment configuration.
 */
export function getCache(config?: CacheConfig): CacheStore {
  if (!globalCache) {
    globalCache = createCache(config);
  }
  return globalCache;
}

/**
 * Reset the global cache instance (for testing)
 */
export function resetCache(): void {
  globalCache = null;
}
