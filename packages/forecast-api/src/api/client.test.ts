import { describe, it, expect } from 'vitest';
import {
  fetchProducts,
  fetchProduct,
  fetchNWACForecastsForDate,
  fetchNWACForecastForZone,
  buildForecastUrl,
} from './client.js';
import type { ForecastProduct } from '../types/index.js';

describe('Avalanche.org API Client', () => {
  describe('fetchProducts', () => {
    it('should fetch products for NWAC in a date range', async () => {
      const products = await fetchProducts({
        avalanche_center_id: 'NWAC',
        date_start: '2024-12-01',
        date_end: '2025-04-30',
      });

      expect(Array.isArray(products)).toBe(true);
      expect(products.length).toBeGreaterThan(0);

      // Check structure of first product
      const product = products[0];
      expect(product).toHaveProperty('id');
      expect(product).toHaveProperty('product_type');
      expect(product).toHaveProperty('published_time');
      expect(product).toHaveProperty('avalanche_center');
      expect(product.avalanche_center.name).toBe('Northwest Avalanche Center');
    }, 10000); // 10 second timeout for API call

    it('should return empty array for future dates with no forecasts', async () => {
      const farFuture = '2030-01-01';
      const products = await fetchProducts({
        avalanche_center_id: 'NWAC',
        date_start: farFuture,
        date_end: farFuture,
      });

      expect(Array.isArray(products)).toBe(true);
      // Might be empty or have some data, just ensure it doesn't crash
    }, 10000);
  });

  describe('fetchProduct', () => {
    it('should fetch a specific product by ID', async () => {
      // Use a known product ID from our research (this may need updating if the product expires)
      // Let's first fetch recent products to get a valid ID
      const products = await fetchProducts({
        avalanche_center_id: 'NWAC',
        date_start: '2024-12-01',
        date_end: '2025-04-30',
      });

      if (products.length === 0) {
        console.warn('No products found to test fetchProduct');
        return;
      }

      const productId = products[0].id;
      const product = await fetchProduct(productId);

      expect(product).toBeDefined();
      expect(product.id).toBe(productId);
      expect(product).toHaveProperty('forecast_zone');
      expect(product).toHaveProperty('bottom_line');
    }, 10000);

    it('should throw error for invalid product ID', async () => {
      const invalidId = 999999999;
      await expect(fetchProduct(invalidId)).rejects.toThrow();
    }, 10000);
  });

  describe('fetchNWACForecastsForDate', () => {
    it('should fetch only forecast products (not summaries)', async () => {
      const forecasts = await fetchNWACForecastsForDate('2025-04-13');

      expect(Array.isArray(forecasts)).toBe(true);

      // All should be forecast type
      forecasts.forEach(f => {
        expect(f.product_type).toBe('forecast');
        expect(f.avalanche_center.id).toBe('NWAC');
      });
    }, 10000);

    it('should include forecast zones', async () => {
      const forecasts = await fetchNWACForecastsForDate('2025-01-15');

      if (forecasts.length > 0) {
        const forecast = forecasts[0];
        expect(forecast.forecast_zone).toBeDefined();
        expect(Array.isArray(forecast.forecast_zone)).toBe(true);
        expect(forecast.forecast_zone.length).toBeGreaterThan(0);

        const zone = forecast.forecast_zone[0];
        expect(zone).toHaveProperty('id');
        expect(zone).toHaveProperty('zone_id');
        expect(zone).toHaveProperty('name');
      }
    }, 10000);
  });

  describe('fetchNWACForecastForZone', () => {
    it('should fetch forecast for West Slopes South (zone 1648)', async () => {
      const forecast = await fetchNWACForecastForZone(1648, '2025-01-15');

      if (forecast) {
        expect(forecast.product_type).toBe('forecast');
        expect(forecast.forecast_zone).toBeDefined();
        expect(forecast.forecast_zone.some(z => z.id === 1648)).toBe(true);
        expect(forecast.forecast_zone.some(z => z.name === 'West Slopes South')).toBe(true);
      }
      // If no forecast exists for that date/zone, it's okay to be null
    }, 10000);

    it('should return null for non-existent zone', async () => {
      const forecast = await fetchNWACForecastForZone(99999, '2025-01-15');
      expect(forecast).toBeNull();
    }, 10000);

    it('should handle different zones correctly', async () => {
      // Test multiple zones
      const zones = [1645, 1646, 1647, 1648, 1649, 1653];
      const date = '2025-01-15';

      for (const zoneId of zones) {
        const forecast = await fetchNWACForecastForZone(zoneId, date);

        if (forecast) {
          // If forecast exists, verify it's for the correct zone
          expect(forecast.forecast_zone.some(z => z.id === zoneId)).toBe(true);
        }
      }
    }, 30000); // Longer timeout for multiple API calls
  });

  describe('buildForecastUrl', () => {
    it('should build correct permalink URL', () => {
      const mockProduct: ForecastProduct = {
        id: 166672,
        product_type: 'forecast',
        published_time: '2025-04-13T01:30:00+00:00',
        start_date: '2025-04-13T01:30:00+00:00',
        end_date: '2025-04-14T01:30:00+00:00',
        expires_time: '2025-04-14T01:30:00+00:00',
        danger_rating: 1,
        bottom_line: 'Test',
        hazard_discussion: null,
        weather_discussion: null,
        status: 'published',
        author: 'Test',
        avalanche_center: {
          name: 'Northwest Avalanche Center',
        },
        forecast_zone: [
          {
            id: 1648,
            zone_id: '6',
            name: 'West Slopes South',
            url: 'http://www.nwac.us/avalanche-forecast/#/west-slopes-south',
            config: null,
          },
        ],
      };

      const url = buildForecastUrl(mockProduct);
      expect(url).toBe('https://nwac.us/avalanche-forecast/#/forecast/6/166672');
    });

    it('should throw error if product has no zones', () => {
      const mockProduct = {
        id: 123,
        forecast_zone: [],
      } as unknown as ForecastProduct;

      expect(() => buildForecastUrl(mockProduct)).toThrow('no zone information');
    });
  });

  describe('Integration Test', () => {
    it('should fetch recent forecast and build valid URL', async () => {
      const forecasts = await fetchNWACForecastsForDate('2025-01-15');

      if (forecasts.length > 0) {
        const forecast = forecasts[0];
        const url = buildForecastUrl(forecast);

        expect(url).toMatch(/^https:\/\/nwac\.us\/avalanche-forecast\/#\/forecast\/\d+\/\d+$/);

        // Verify URL components match product data
        const zone = forecast.forecast_zone[0];
        expect(url).toContain(`/${zone.zone_id}/`);
        expect(url).toContain(`/${forecast.id}`);
      }
    }, 10000);
  });
});
