import { describe, it, expect } from 'vitest';
import {
  getDangerSquare,
  formatDangerRatings,
  formatForecast,
  getDangerLevelName,
} from './index.js';
import type { ForecastProduct, DangerRating } from '@multifarious/forecast-api';

describe('Forecast Formatter', () => {
  describe('getDangerSquare', () => {
    it('should return correct squares for each danger level', () => {
      expect(getDangerSquare(-1)).toBe('⬜'); // No Rating
      expect(getDangerSquare(0)).toBe('⬜');  // No Rating
      expect(getDangerSquare(1)).toBe('🟩');  // Low
      expect(getDangerSquare(2)).toBe('🟨');  // Moderate
      expect(getDangerSquare(3)).toBe('🟧');  // Considerable
      expect(getDangerSquare(4)).toBe('🟥');  // High
      expect(getDangerSquare(5)).toBe('⬛');  // Extreme
    });

    it('should return gray square for unknown levels', () => {
      expect(getDangerSquare(999)).toBe('⬜');
      expect(getDangerSquare(-999)).toBe('⬜');
    });
  });

  describe('formatDangerRatings', () => {
    it('should format danger ratings correctly', () => {
      const danger: DangerRating = {
        upper: 3,
        middle: 3,
        lower: 2,
        valid_day: 'current',
      };

      expect(formatDangerRatings(danger)).toBe('3🟧/3🟧/2🟨');
    });

    it('should handle all low ratings', () => {
      const danger: DangerRating = {
        upper: 1,
        middle: 1,
        lower: 1,
        valid_day: 'current',
      };

      expect(formatDangerRatings(danger)).toBe('1🟩/1🟩/1🟩');
    });

    it('should handle all extreme ratings', () => {
      const danger: DangerRating = {
        upper: 5,
        middle: 5,
        lower: 5,
        valid_day: 'current',
      };

      expect(formatDangerRatings(danger)).toBe('5⬛/5⬛/5⬛');
    });

    it('should handle mixed ratings', () => {
      const danger: DangerRating = {
        upper: 4,
        middle: 2,
        lower: 1,
        valid_day: 'current',
      };

      expect(formatDangerRatings(danger)).toBe('4🟥/2🟨/1🟩');
    });
  });

  describe('formatForecast', () => {
    const mockProduct: ForecastProduct = {
      id: 166378,
      product_type: 'forecast',
      published_time: '2025-04-09T01:37:00+00:00',
      start_date: '2025-04-09',
      end_date: '2025-04-10',
      expires_time: '2025-04-10T01:30:00+00:00',
      danger_rating: 3,
      danger: [
        {
          upper: 3,
          middle: 3,
          lower: 2,
          valid_day: 'current',
        },
        {
          upper: 2,
          middle: 2,
          lower: 1,
          valid_day: 'tomorrow',
        },
      ],
      bottom_line: 'Test forecast',
      hazard_discussion: null,
      weather_discussion: null,
      status: 'published',
      author: 'Test Author',
      avalanche_center: {
        id: 'NWAC',
        name: 'Northwest Avalanche Center',
      },
      forecast_zone: [
        {
          id: 1657,
          zone_id: '10',
          name: 'Mt Hood',
          url: 'https://example.com',
          config: null,
        },
      ],
    };

    it('should format Mt Hood forecast correctly', () => {
      const result = formatForecast(mockProduct);
      expect(result).toBe(
        'NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)'
      );
    });

    it('should format without NWAC prefix when requested', () => {
      const result = formatForecast(mockProduct, { includeNWAC: false });
      expect(result).toBe(
        'Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)'
      );
    });

    it('should format tomorrow forecast', () => {
      const result = formatForecast(mockProduct, { day: 'tomorrow' });
      expect(result).toBe(
        'NWAC Mt Hood Zone forecast: 2🟨/2🟨/1🟩 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)'
      );
    });

    it('should throw error if no zone information', () => {
      const badProduct = {
        ...mockProduct,
        forecast_zone: [],
      };

      expect(() => formatForecast(badProduct)).toThrow('no zone information');
    });

    it('should throw error if no danger ratings', () => {
      const badProduct = {
        ...mockProduct,
        danger: [],
      };

      expect(() => formatForecast(badProduct)).toThrow('no danger rating information');
    });

    it('should throw error if requested day not found', () => {
      const badProduct = {
        ...mockProduct,
        danger: [
          {
            upper: 3,
            middle: 3,
            lower: 2,
            valid_day: 'current' as const,
          },
        ],
      };

      expect(() => formatForecast(badProduct, { day: 'tomorrow' })).toThrow(
        'No danger ratings found for day: tomorrow'
      );
    });
  });

  describe('getDangerLevelName', () => {
    it('should return correct names for each level', () => {
      expect(getDangerLevelName(-1)).toBe('No Rating');
      expect(getDangerLevelName(0)).toBe('No Rating');
      expect(getDangerLevelName(1)).toBe('Low');
      expect(getDangerLevelName(2)).toBe('Moderate');
      expect(getDangerLevelName(3)).toBe('Considerable');
      expect(getDangerLevelName(4)).toBe('High');
      expect(getDangerLevelName(5)).toBe('Extreme');
    });

    it('should return Unknown for invalid levels', () => {
      expect(getDangerLevelName(999)).toBe('Unknown');
    });
  });
});
