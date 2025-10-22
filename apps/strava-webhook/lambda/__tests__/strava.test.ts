/**
 * Tests for Strava API utility functions
 */

import { describe, it, expect } from 'vitest';
import { sanitizeForLogging } from '../strava.js';

describe('Strava API Utilities', () => {
  describe('sanitizeForLogging', () => {
    it('should truncate long strings to 50 characters', () => {
      const longString = 'a'.repeat(100);
      const result = sanitizeForLogging(longString);

      expect(result).toBe('a'.repeat(50) + '...');
      expect(result.length).toBe(53); // 50 chars + '...'
    });

    it('should not truncate short strings', () => {
      const shortString = 'Hello World';
      const result = sanitizeForLogging(shortString);

      expect(result).toBe('Hello World');
    });

    it('should redact access_token fields', () => {
      const data = {
        access_token: 'secret_token_12345',
        athlete_id: 123,
      };

      const result = sanitizeForLogging(data);

      expect(result.access_token).toBe('[REDACTED]');
      expect(result.athlete_id).toBe(123);
    });

    it('should redact refresh_token fields', () => {
      const data = {
        refresh_token: 'secret_refresh_12345',
        athlete_id: 123,
      };

      const result = sanitizeForLogging(data);

      expect(result.refresh_token).toBe('[REDACTED]');
      expect(result.athlete_id).toBe(123);
    });

    it('should filter activity objects to only safe fields', () => {
      const activity = {
        id: 12345,
        athlete: { id: 123 },
        name: 'Morning Run',
        type: 'Run',
        sport_type: 'Run',
        start_date: '2024-01-01T10:00:00Z',
        moving_time: 3600,
        elapsed_time: 3700,
        // These should be filtered out
        description: 'Secret training plan details',
        start_latlng: [47.6062, -122.3321],
        end_latlng: [47.6062, -122.3321],
        map: { summary_polyline: 'encoded_polyline_data' },
        device_name: 'Garmin Fenix 7',
        calories: 450,
        heartrate_average: 165,
      };

      const result = sanitizeForLogging(activity);

      // Should keep these fields
      expect(result.id).toBe(12345);
      expect(result.name).toBe('Morning Run');
      expect(result.type).toBe('Run');
      expect(result.sport_type).toBe('Run');
      expect(result.start_date).toBe('2024-01-01T10:00:00Z');
      expect(result.moving_time).toBe(3600);
      expect(result.elapsed_time).toBe(3700);

      // Should NOT have these fields
      expect(result.description).toBeUndefined();
      expect(result.start_latlng).toBeUndefined();
      expect(result.end_latlng).toBeUndefined();
      expect(result.map).toBeUndefined();
      expect(result.device_name).toBeUndefined();
      expect(result.calories).toBeUndefined();
      expect(result.heartrate_average).toBeUndefined();
    });

    it('should handle nested objects recursively', () => {
      const data = {
        athlete: {
          id: 123,
          access_token: 'secret',
          name: 'John Doe',
        },
        description: 'a'.repeat(100),
      };

      const result = sanitizeForLogging(data);

      expect(result.athlete.access_token).toBe('[REDACTED]');
      expect(result.athlete.id).toBe(123);
      expect(result.description).toBe('a'.repeat(50) + '...');
    });

    it('should handle arrays', () => {
      const data = ['short', 'a'.repeat(100), { access_token: 'secret', id: 1 }];

      const result = sanitizeForLogging(data);

      expect(result[0]).toBe('short');
      expect(result[1]).toBe('a'.repeat(50) + '...');
      expect(result[2].access_token).toBe('[REDACTED]');
      expect(result[2].id).toBe(1);
    });

    it('should handle primitive values', () => {
      expect(sanitizeForLogging(123)).toBe(123);
      expect(sanitizeForLogging(true)).toBe(true);
      expect(sanitizeForLogging(null)).toBe(null);
      expect(sanitizeForLogging(undefined)).toBe(undefined);
    });

    it('should not modify non-activity objects with all fields', () => {
      const regularObject = {
        foo: 'bar',
        baz: 123,
        nested: { key: 'value' },
      };

      const result = sanitizeForLogging(regularObject);

      expect(result.foo).toBe('bar');
      expect(result.baz).toBe(123);
      expect(result.nested.key).toBe('value');
    });
  });
});
