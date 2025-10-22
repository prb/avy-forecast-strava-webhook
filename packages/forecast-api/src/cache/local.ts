import { mkdir, readFile, writeFile, unlink, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { ForecastProduct } from '../types/index.js';
import type { ForecastCache, CachedForecast } from './types.js';
import { getCacheKey } from './types.js';
import { calculateExpiration, isExpired, getTTLReason } from './ttl.js';

/**
 * Local filesystem cache implementation
 *
 * Stores cache entries as JSON files in a local directory.
 * Good for development and testing without AWS dependencies.
 */
export class LocalCacheStore implements ForecastCache {
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
  private getFilePath(zoneId: number, date: string): string {
    const key = getCacheKey(zoneId, date);
    return join(this.cacheDir, `${key}.json`);
  }

  async get(zoneId: number, date: string): Promise<CachedForecast | null> {
    const filePath = this.getFilePath(zoneId, date);

    try {
      if (!existsSync(filePath)) {
        return null;
      }

      const content = await readFile(filePath, 'utf-8');
      const cached = JSON.parse(content) as CachedForecast;

      // Check if expired
      if (isExpired(cached.expiresAt)) {
        // Delete expired entry
        await this.delete(zoneId, date);
        return null;
      }

      return cached;
    } catch (error) {
      console.error(`Failed to read cache for zone ${zoneId}, date ${date}:`, error);
      return null;
    }
  }

  async set(zoneId: number, date: string, forecast: ForecastProduct | null): Promise<void> {
    await this.ensureCacheDir();

    const filePath = this.getFilePath(zoneId, date);
    const now = new Date();
    const expiresAt = calculateExpiration(date, now);

    const cached: CachedForecast = {
      forecast,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      reason: getTTLReason(date, now),
    };

    try {
      await writeFile(filePath, JSON.stringify(cached, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to write cache for zone ${zoneId}, date ${date}:`, error);
      // Don't throw - cache failure shouldn't break the API
    }
  }

  async delete(zoneId: number, date: string): Promise<void> {
    const filePath = this.getFilePath(zoneId, date);

    try {
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete cache for zone ${zoneId}, date ${date}:`, error);
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
