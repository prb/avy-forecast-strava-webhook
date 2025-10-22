import { describe, it, expect } from 'vitest';
import { getForecastForCoordinate, isValidDate, isValidCoordinate } from './forecast.js';
import type { Coordinate } from './types/index.js';

describe('Forecast Query', () => {
  describe('getForecastForCoordinate', () => {
    it('should get forecast for Stevens Pass area', async () => {
      const coordinate: Coordinate = {
        latitude: 47.7455,
        longitude: -121.0886,
      };
      const date = '2025-01-15';

      const result = await getForecastForCoordinate(coordinate, date);

      expect(result.zone.name).toBe('Stevens Pass');
      expect(result.zone.zone_id).toBe('2');

      if (result.forecast) {
        expect(result.forecast.product_id).toBeGreaterThan(0);
        expect(result.forecast.url).toMatch(/^https:\/\/nwac\.us\/avalanche-forecast\/#\/forecast\/2\/\d+$/);
        expect(result.forecast.danger_rating).toBeGreaterThanOrEqual(-1);
        expect(result.forecast.danger_rating).toBeLessThanOrEqual(5);
      } else {
        // No forecast available for this date
        expect(result.error).toBeDefined();
      }
    }, 15000);

    it('should get forecast for Mt Rainier (West Slopes South)', async () => {
      const coordinate: Coordinate = {
        latitude: 46.7865,
        longitude: -121.7361,
      };
      const date = '2025-01-15';

      const result = await getForecastForCoordinate(coordinate, date);

      expect(result.zone.name).toBe('West Slopes South');
      expect(result.zone.zone_id).toBe('6');

      if (result.forecast) {
        expect(result.forecast.url).toMatch(/^https:\/\/nwac\.us\/avalanche-forecast\/#\/forecast\/6\/\d+$/);
      }
    }, 15000);

    it('should return error for coordinates outside all zones', async () => {
      const coordinate: Coordinate = {
        latitude: 47.6062, // Seattle
        longitude: -122.3321,
      };
      const date = '2025-01-15';

      const result = await getForecastForCoordinate(coordinate, date);

      expect(result.forecast).toBeNull();
      expect(result.error).toContain('outside all NWAC forecast zones');
    }, 15000);

    it('should handle multiple different zones', async () => {
      const testCases: Array<{ name: string; coord: Coordinate; expectedZone: string }> = [
        {
          name: 'Olympics',
          coord: { latitude: 47.8, longitude: -123.5 },
          expectedZone: 'Olympics',
        },
        {
          name: 'Mt Baker',
          coord: { latitude: 48.8608, longitude: -121.6747 },
          expectedZone: 'West Slopes North',
        },
        {
          name: 'East Slopes Central',
          coord: { latitude: 47.5, longitude: -120.7 },
          expectedZone: 'East Slopes Central',
        },
      ];

      const date = '2025-01-15';

      for (const testCase of testCases) {
        const result = await getForecastForCoordinate(testCase.coord, date);
        expect(result.zone.name).toBe(testCase.expectedZone);
      }
    }, 30000);
  });

  describe('isValidDate', () => {
    it('should accept valid dates', () => {
      expect(isValidDate('2025-01-15')).toBe(true);
      expect(isValidDate('2024-12-31')).toBe(true);
      expect(isValidDate('2025-02-28')).toBe(true);
    });

    it('should reject invalid date formats', () => {
      expect(isValidDate('2025-1-15')).toBe(false); // Single digit month
      expect(isValidDate('2025/01/15')).toBe(false); // Wrong separator
      expect(isValidDate('01-15-2025')).toBe(false); // Wrong order
      expect(isValidDate('2025-01')).toBe(false); // Missing day
      expect(isValidDate('not a date')).toBe(false);
    });

    it('should reject invalid dates', () => {
      expect(isValidDate('2025-13-01')).toBe(false); // Invalid month
      expect(isValidDate('2025-02-30')).toBe(false); // Invalid day for February
      expect(isValidDate('2025-00-01')).toBe(false); // Month 0
    });
  });

  describe('isValidCoordinate', () => {
    it('should accept valid coordinates', () => {
      expect(isValidCoordinate({ latitude: 47.7455, longitude: -121.0886 })).toBe(true);
      expect(isValidCoordinate({ latitude: 0, longitude: 0 })).toBe(true);
      expect(isValidCoordinate({ latitude: 90, longitude: 180 })).toBe(true);
      expect(isValidCoordinate({ latitude: -90, longitude: -180 })).toBe(true);
    });

    it('should reject invalid latitudes', () => {
      expect(isValidCoordinate({ latitude: 91, longitude: 0 })).toBe(false);
      expect(isValidCoordinate({ latitude: -91, longitude: 0 })).toBe(false);
      expect(isValidCoordinate({ latitude: 100, longitude: 0 })).toBe(false);
    });

    it('should reject invalid longitudes', () => {
      expect(isValidCoordinate({ latitude: 0, longitude: 181 })).toBe(false);
      expect(isValidCoordinate({ latitude: 0, longitude: -181 })).toBe(false);
      expect(isValidCoordinate({ latitude: 0, longitude: 200 })).toBe(false);
    });
  });
});
