import { describe, it, expect } from 'vitest';
import {
  getDangerSquare,
  formatDangerRatings,
  formatForecast,
  getDangerLevelName,
  hasForecastLine,
  removeForecastLines,
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
        'NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/forecasts/avalanche/mt-hood#/forecast/10/166378)'
      );
    });

    it('should format without NWAC prefix when requested', () => {
      const result = formatForecast(mockProduct, { includeNWAC: false });
      expect(result).toBe(
        'Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/forecasts/avalanche/mt-hood#/forecast/10/166378)'
      );
    });

    it('should format tomorrow forecast', () => {
      const result = formatForecast(mockProduct, { day: 'tomorrow' });
      expect(result).toBe(
        'NWAC Mt Hood Zone forecast: 2🟨/2🟨/1🟩 (https://nwac.us/forecasts/avalanche/mt-hood#/forecast/10/166378)'
      );
    });

    it('should throw error if no zone information', () => {
      const badProduct = {
        ...mockProduct,
        forecast_zone: [],
      };

      expect(() => formatForecast(badProduct)).toThrow('no zone information');
    });

    it('should fall back to the overall rating when there are no elevation bands', () => {
      const noBands = { ...mockProduct, danger: [] };

      expect(formatForecast(noBands)).toBe(
        'NWAC Mt Hood Zone forecast: 3🟧 (https://nwac.us/forecasts/avalanche/mt-hood#/forecast/10/166378)'
      );
    });

    it('should throw error if no danger ratings at all', () => {
      const badProduct = {
        ...mockProduct,
        danger: [],
        danger_rating: undefined as unknown as number,
      };

      expect(() => formatForecast(badProduct)).toThrow('no danger rating information');
    });

    it('should not use the overall rating for tomorrow', () => {
      const noBands = { ...mockProduct, danger: [] };

      expect(() => formatForecast(noBands, { day: 'tomorrow' })).toThrow(
        'No danger ratings found for day: tomorrow'
      );
    });

    it('should format a UAC forecast with the zone page URL (#53)', () => {
      // Shape of a UAC product on avalanche.org: no elevation bands, zone URL provided
      const uacProduct: ForecastProduct = {
        ...mockProduct,
        id: 180600,
        danger_rating: 2,
        danger: [],
        avalanche_center: { name: 'Utah Avalanche Center' },
        forecast_zone: [
          {
            id: 1738,
            zone_id: 'salt-lake',
            name: 'Salt Lake',
            url: 'https://utahavalanchecenter.org/forecast/salt-lake',
            config: null,
          },
        ],
      };

      expect(formatForecast(uacProduct, { center: 'UAC' })).toBe(
        'UAC Salt Lake Zone forecast: 2🟨 (https://utahavalanchecenter.org/forecast/salt-lake/4/9/2025)'
      );
    });

    it('should honor includeCenter: false', () => {
      expect(formatForecast(mockProduct, { includeCenter: false })).toMatch(/^Mt Hood Zone forecast: /);
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

  describe('hasForecastLine / removeForecastLines', () => {
    const nwacLine =
      'NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)';
    const uacLine = 'UAC Salt Lake Zone forecast: 2🟨 (https://utahavalanchecenter.org/forecast/salt-lake)';
    const legacyLine =
      'NWAC Mt Hood forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)';

    it.each([
      ['current NWAC format', nwacLine],
      ['NWAC format with a zone page link', 'NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/forecasts/avalanche/mt-hood#/forecast/10/166378)'],
      ['UAC format with a dated link', 'UAC Salt Lake Zone forecast: 2🟨 (https://utahavalanchecenter.org/forecast/salt-lake/2/16/2026)'],
      ['UAC format', uacLine],
      ['legacy NWAC format without "Zone"', legacyLine],
      ['NWAC format with a rewritten link', 'NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://strava.app.link/xyz)'],
    ])('should recognize the %s', (_label, line) => {
      expect(hasForecastLine(`Great day!\n\n${line}`)).toBe(true);
    });

    it('should not treat a natural mention of a center as a forecast line', () => {
      expect(hasForecastLine('Checked the NWAC forecast before heading out. UAC said moderate.')).toBe(false);
    });

    it('should remove forecast lines after other text', () => {
      expect(removeForecastLines(`Great day!\n\n${nwacLine}`)).toBe('Great day!');
    });

    it('should remove a forecast line at the very start of the description', () => {
      expect(removeForecastLines(`${uacLine}\n\nNotes after`)).toBe('Notes after');
    });

    it('should remove multiple forecast lines and tidy blank lines', () => {
      expect(removeForecastLines(`Top\n\n${legacyLine}\n\nMiddle\n\n${nwacLine}`)).toBe('Top\n\nMiddle');
    });

    it('should leave descriptions without forecasts unchanged', () => {
      expect(removeForecastLines('Line one\n\nLine two')).toBe('Line one\n\nLine two');
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
