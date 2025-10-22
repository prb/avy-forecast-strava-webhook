import { describe, it, expect } from 'vitest';
import { calculateExpiration, isExpired, getTTLReason } from './ttl.js';

describe('TTL Logic', () => {
  describe('calculateExpiration', () => {
    it('should return 60 minute expiration for recent forecast (within 72 hours)', () => {
      const now = new Date('2025-01-20T12:00:00Z');
      const forecastDate = '2025-01-19'; // 1 day old

      const expiration = calculateExpiration(forecastDate, now);

      expect(expiration).not.toBeNull();
      expect(expiration!.getTime()).toBeGreaterThan(now.getTime());

      // Should expire in approximately 60 minutes
      const minutesUntilExpiry = (expiration!.getTime() - now.getTime()) / (1000 * 60);
      expect(minutesUntilExpiry).toBeCloseTo(60, 0);
    });

    it('should return null (permanent) for old forecast (>72 hours)', () => {
      const now = new Date('2025-01-20T12:00:00Z');
      const forecastDate = '2025-01-10'; // 10 days old

      const expiration = calculateExpiration(forecastDate, now);

      expect(expiration).toBeNull(); // Permanent cache
    });

    it('should treat forecast exactly 72 hours old as recent', () => {
      const now = new Date('2025-01-20T12:00:00Z');
      const forecastDate = '2025-01-17T12:00:00Z'; // Exactly 72 hours

      const expiration = calculateExpiration(forecastDate, now);

      expect(expiration).not.toBeNull(); // Should still have TTL
    });

    it('should treat forecast 73 hours old as permanent', () => {
      const now = new Date('2025-01-20T13:00:00Z');
      const forecastDate = '2025-01-17T12:00:00Z'; // 73 hours

      const expiration = calculateExpiration(forecastDate, now);

      expect(expiration).toBeNull(); // Permanent
    });
  });

  describe('isExpired', () => {
    it('should return false for permanent cache (null expiration)', () => {
      const now = new Date('2025-01-20T12:00:00Z');
      expect(isExpired(null, now)).toBe(false);
    });

    it('should return false if expiration is in the future', () => {
      const now = new Date('2025-01-20T12:00:00Z');
      const expiresAt = '2025-01-20T13:00:00Z'; // 1 hour in future

      expect(isExpired(expiresAt, now)).toBe(false);
    });

    it('should return true if expiration is in the past', () => {
      const now = new Date('2025-01-20T12:00:00Z');
      const expiresAt = '2025-01-20T11:00:00Z'; // 1 hour in past

      expect(isExpired(expiresAt, now)).toBe(true);
    });

    it('should return true if expiration is exactly now', () => {
      const now = new Date('2025-01-20T12:00:00Z');
      const expiresAt = '2025-01-20T12:00:00Z';

      expect(isExpired(expiresAt, now)).toBe(false); // Not expired yet
    });
  });

  describe('getTTLReason', () => {
    it('should explain recent forecast TTL', () => {
      const now = new Date('2025-01-20T12:00:00Z');
      const forecastDate = '2025-01-19'; // 1 day old

      const reason = getTTLReason(forecastDate, now);

      expect(reason).toContain('Recent forecast');
      expect(reason).toContain('60 minutes');
    });

    it('should explain permanent cache for old forecast', () => {
      const now = new Date('2025-01-20T12:00:00Z');
      const forecastDate = '2025-01-10'; // 10 days old

      const reason = getTTLReason(forecastDate, now);

      expect(reason).toContain('Old forecast');
      expect(reason).toContain('permanently');
    });
  });
});
