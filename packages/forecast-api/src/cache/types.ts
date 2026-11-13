/**
 * A cached value with its metadata
 */
export interface CacheEntry<T> {
  /** The cached value (may itself be null, e.g. a cached "no forecast") */
  value: T;
  /** ISO timestamp when this was cached */
  cachedAt: string;
  /** ISO timestamp when this expires, or null for permanent cache */
  expiresAt: string | null;
  /** Human-readable reason for the cache entry (for debugging) */
  reason?: string;
}

/**
 * How long to keep a value, chosen by the caller
 */
export interface CacheSetOptions {
  /** When the entry expires, or null to keep it permanently */
  expiresAt: Date | null;
  /** Human-readable reason for the expiry (for debugging) */
  reason?: string;
}

/**
 * Generic key/value cache store
 *
 * Stores and reads JSON-serializable values under string keys. Callers decide
 * the key, the expiry and whether a value is worth caching at all; the store
 * only stores, reads and drops expired entries.
 *
 * Implementations never throw: read failures are treated as a miss and write
 * failures are logged, so a cache problem can't break a forecast lookup.
 */
export interface CacheStore {
  /**
   * Read a value
   * @returns The entry if present and not expired, null otherwise
   */
  get<T>(key: string): Promise<CacheEntry<T> | null>;

  /**
   * Store a value
   */
  set<T>(key: string, value: T, options: CacheSetOptions): Promise<void>;

  /**
   * Delete a specific entry
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all entries
   */
  clear(): Promise<void>;
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
 * Cache keys are used as file names and S3 object names, so they're limited
 * to a safe character set (no slashes, so a key can't escape the cache
 * directory or prefix).
 */
const CACHE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Throw if a cache key contains characters that aren't safe in a file or
 * object name
 */
export function assertValidCacheKey(key: string): void {
  if (!CACHE_KEY_PATTERN.test(key) || key === '.' || key === '..') {
    throw new Error(`Invalid cache key: ${JSON.stringify(key)}`);
  }
}

/**
 * Parse a stored entry, accepting the pre-#61 zone forecast format
 * (`{ forecast, cachedAt, expiresAt, reason }`) as well as the generic one
 *
 * @returns The entry, or null if the content isn't a cache entry
 */
export function parseCacheEntry<T>(content: string): CacheEntry<T> | null {
  const raw: unknown = JSON.parse(content);
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  if (typeof entry.cachedAt !== 'string') {
    return null;
  }
  if (entry.expiresAt !== null && typeof entry.expiresAt !== 'string') {
    return null;
  }

  let value: unknown;
  if ('value' in entry) {
    value = entry.value;
  } else if ('forecast' in entry) {
    value = entry.forecast;
  } else {
    return null;
  }

  return {
    value: value as T,
    cachedAt: entry.cachedAt,
    expiresAt: entry.expiresAt,
    ...(typeof entry.reason === 'string' ? { reason: entry.reason } : {}),
  };
}

/**
 * Build the entry to store for a value
 */
export function buildCacheEntry<T>(
  value: T,
  options: CacheSetOptions,
  now: Date = new Date()
): CacheEntry<T> {
  return {
    value,
    cachedAt: now.toISOString(),
    expiresAt: options.expiresAt ? options.expiresAt.toISOString() : null,
    ...(options.reason ? { reason: options.reason } : {}),
  };
}
