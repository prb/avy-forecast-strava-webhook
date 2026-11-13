import { mkdir, readFile, writeFile, unlink, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { CacheEntry, CacheSetOptions, CacheStore } from './types.js';
import { assertValidCacheKey, buildCacheEntry, parseCacheEntry } from './types.js';
import { isExpired } from './ttl.js';

/**
 * Local filesystem cache implementation
 *
 * Stores each entry as a JSON file named after its key.
 * Good for development and testing without AWS dependencies.
 */
export class LocalCacheStore implements CacheStore {
  private cacheDir: string;

  constructor(cacheDir: string = '/tmp/nwac-cache') {
    this.cacheDir = cacheDir;
  }

  /**
   * Initialize cache directory
   */
  private async ensureCacheDir(): Promise<void> {
    if (!existsSync(this.cacheDir)) {
      await mkdir(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get file path for a cache entry
   */
  private getFilePath(key: string): string {
    assertValidCacheKey(key);
    return join(this.cacheDir, `${key}.json`);
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const filePath = this.getFilePath(key);
      if (!existsSync(filePath)) {
        return null;
      }

      const cached = parseCacheEntry<T>(await readFile(filePath, 'utf-8'));
      if (!cached) {
        return null;
      }

      if (isExpired(cached.expiresAt)) {
        await this.delete(key);
        return null;
      }

      return cached;
    } catch (error) {
      console.error(`Failed to read cache entry ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheSetOptions): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await this.ensureCacheDir();
      const entry = buildCacheEntry(value, options);
      await writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (error) {
      // Don't throw - cache failure shouldn't break the API
      console.error(`Failed to write cache entry ${key}:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete cache entry ${key}:`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      if (existsSync(this.cacheDir)) {
        await rm(this.cacheDir, { recursive: true, force: true });
        await this.ensureCacheDir();
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  /**
   * Get cache directory path
   */
  getCacheDir(): string {
    return this.cacheDir;
  }
}
