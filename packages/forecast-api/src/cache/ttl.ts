/**
 * TTL (Time-To-Live) calculation for forecast cache
 *
 * Strategy:
 * - Recent forecasts (within 72 hours): 60 minute TTL (may still be updated)
 * - Older forecasts (>72 hours old): Permanent cache (immutable)
 */

const RECENT_THRESHOLD_HOURS = 72;
const RECENT_TTL_MINUTES = 60;

/**
 * Calculate TTL for a forecast based on its date
 *
 * @param forecastDate Date of the forecast (YYYY-MM-DD)
 * @param now Current time (for testing)
 * @returns Expiration date, or null for permanent cache
 */
export function calculateExpiration(forecastDate: string, now: Date = new Date()): Date | null {
  const forecastDateTime = new Date(forecastDate);
  const ageInHours = (now.getTime() - forecastDateTime.getTime()) / (1000 * 60 * 60);

  // If forecast is within the past 72 hours, cache for 60 minutes
  if (ageInHours <= RECENT_THRESHOLD_HOURS) {
    const expiresAt = new Date(now);
    expiresAt.setMinutes(expiresAt.getMinutes() + RECENT_TTL_MINUTES);
    return expiresAt;
  }

  // Otherwise, cache permanently (no expiration)
  return null;
}

/**
 * Check if a cached entry is expired
 *
 * @param expiresAt Expiration timestamp, or null for permanent cache
 * @param now Current time (for testing)
 * @returns true if expired, false if still valid
 */
export function isExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (expiresAt === null) {
    return false; // Permanent cache never expires
  }

  const expirationDate = new Date(expiresAt);
  return now > expirationDate;
}

/**
 * Get a human-readable reason for the cache TTL
 */
export function getTTLReason(forecastDate: string, now: Date = new Date()): string {
  const forecastDateTime = new Date(forecastDate);
  const ageInHours = (now.getTime() - forecastDateTime.getTime()) / (1000 * 60 * 60);

  if (ageInHours <= RECENT_THRESHOLD_HOURS) {
    return `Recent forecast (${Math.floor(ageInHours)}h old) - cached for ${RECENT_TTL_MINUTES} minutes`;
  } else {
    return `Old forecast (${Math.floor(ageInHours)}h old) - cached permanently`;
  }
}
