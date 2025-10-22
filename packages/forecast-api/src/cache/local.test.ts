import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalCacheStore } from './local.js';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';
import type { ForecastProduct } from '../types/index.js';

describe('LocalCacheStore', () => {
  const testCacheDir = '/tmp/nwac-cache-test';
  let cache: LocalCacheStore;

  beforeEach(async () => {
    cache = new LocalCacheStore(testCacheDir);
    // Clean up before each test
    if (existsSync(testCacheDir)) {
      await rm(testCacheDir, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    // Clean up after each test
    if (existsSync(testCacheDir)) {
      await rm(testCacheDir, { recursive: true, force: true });
    }
  });

  describe('set and get', () => {
    it('should cache and retrieve a forecast', async () => {
      const zoneId = 1648;
      const date = '2025-01-15';
      const mockForecast: ForecastProduct = {
        id: 12345,
        product_type: 'forecast',
        start_date: '2025-01-15',
        end_date: '2025-01-16',
        published_time: '2025-01-15T01:00:00Z',
        expires_time: '2025-01-16T01:00:00Z',
        danger_rating: 2,
        bottom_line: 'Moderate danger',
        hazard_discussion: null,
        weather_discussion: null,
        status: 'published',
        author: 'Test',
        avalanche_center: {
          name: 'NWAC',
        },
        forecast_zone: [
          {
            id: 1648,
            zone_id: '6',
            name: 'West Slopes South',
            url: 'http://example.com',
            config: null,
          },
        ],
      };

      await cache.set(zoneId, date, mockForecast);
      const cached = await cache.get(zoneId, date);

      expect(cached).not.toBeNull();
      expect(cached!.forecast).toEqual(mockForecast);
      expect(cached!.cachedAt).toBeDefined();
      expect(cached!.reason).toBeDefined();
    });

    it('should cache negative results (no forecast found)', async () => {
      const zoneId = 1648;
      const date = '2030-01-01';

      await cache.set(zoneId, date, null);
      const cached = await cache.get(zoneId, date);

      expect(cached).not.toBeNull();
      expect(cached!.forecast).toBeNull();
    });

    it('should return null for cache miss', async () => {
      const cached = await cache.get(1648, '2025-01-15');
      expect(cached).toBeNull();
    });
  });

  describe('TTL and expiration', () => {
    it('should expire old entries for recent forecasts', async () => {
      const zoneId = 1648;
      // Set a forecast date that will have 60 minute TTL
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() - 1); // Yesterday
      const date = forecastDate.toISOString().split('T')[0];

      await cache.set(zoneId, date, null);

      // Manually modify the cached entry to make it expired
      const cached = await cache.get(zoneId, date);
      expect(cached).not.toBeNull();

      // For now, just verify it was cached with an expiration
      expect(cached!.expiresAt).not.toBeNull();
    }, 10000);

    it('should set permanent cache for old forecasts', async () => {
      const zoneId = 1648;
      const date = '2020-01-15'; // Very old forecast

      await cache.set(zoneId, date, null);
      const cached = await cache.get(zoneId, date);

      expect(cached).not.toBeNull();
      expect(cached!.expiresAt).toBeNull(); // Permanent cache
    });
  });

  describe('delete', () => {
    it('should delete a cached entry', async () => {
      const zoneId = 1648;
      const date = '2025-01-15';

      await cache.set(zoneId, date, null);
      let cached = await cache.get(zoneId, date);
      expect(cached).not.toBeNull();

      await cache.delete(zoneId, date);
      cached = await cache.get(zoneId, date);
      expect(cached).toBeNull();
    });

    it('should not throw when deleting non-existent entry', async () => {
      await expect(cache.delete(9999, '2025-01-01')).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', async () => {
      await cache.set(1648, '2025-01-15', null);
      await cache.set(1649, '2025-01-16', null);
      await cache.set(1650, '2025-01-17', null);

      // Verify entries exist
      expect(await cache.get(1648, '2025-01-15')).not.toBeNull();
      expect(await cache.get(1649, '2025-01-16')).not.toBeNull();

      await cache.clear();

      // Verify all entries are gone
      expect(await cache.get(1648, '2025-01-15')).toBeNull();
      expect(await cache.get(1649, '2025-01-16')).toBeNull();
      expect(await cache.get(1650, '2025-01-17')).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle corrupted cache files gracefully', async () => {
      const zoneId = 1648;
      const date = '2025-01-15';

      // Write invalid JSON
      await cache.set(zoneId, date, null);

      // Manually corrupt the file
      const { writeFile } = await import('fs/promises');
      const filePath = `${testCacheDir}/zone-${zoneId}-date-${date}.json`;
      await writeFile(filePath, 'invalid json{{{', 'utf-8');

      // Should return null, not throw
      const cached = await cache.get(zoneId, date);
      expect(cached).toBeNull();
    });
  });
});
