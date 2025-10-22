/**
 * Strava API utility functions
 */

import type { StravaActivity, StravaTokenResponse } from './types.js';
import { getUser, updateUserTokens } from './db.js';

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID!;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET!;

/**
 * Sanitize sensitive data for logging
 * Truncates long strings and removes sensitive fields from activity data
 */
export function sanitizeForLogging(data: any): any {
  if (typeof data === 'string') {
    // Truncate long strings to 50 chars
    return data.length > 50 ? data.substring(0, 50) + '...' : data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeForLogging);
  }

  if (data && typeof data === 'object') {
    const sanitized: any = {};

    // List of fields to keep from activity objects
    const allowedFields = ['id', 'athlete', 'name', 'type', 'sport_type', 'start_date', 'moving_time', 'elapsed_time'];

    for (const [key, value] of Object.entries(data)) {
      // Skip sensitive fields
      if (key === 'access_token' || key === 'refresh_token') {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // For activity-like objects, only include safe fields
      if ('id' in data && 'athlete' in data && !allowedFields.includes(key)) {
        continue;
      }

      // Recursively sanitize nested objects
      sanitized[key] = sanitizeForLogging(value);
    }

    return sanitized;
  }

  return data;
}

/**
 * Check if access token is expired or will expire soon (within 1 hour)
 */
export function isTokenExpired(expiresAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const oneHour = 60 * 60;
  return expiresAt <= now + oneHour;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<StravaTokenResponse> {
  const response = await fetch('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${response.status} ${error}`);
  }

  return response.json() as Promise<StravaTokenResponse>;
}

/**
 * Get valid access token for user (refreshes if needed)
 */
export async function getValidAccessToken(athleteId: number): Promise<string> {
  const user = await getUser(athleteId);

  if (!user) {
    throw new Error(`User ${athleteId} not found`);
  }

  console.log(`Token for athlete ${athleteId} - expires: ${new Date(user.expires_at * 1000).toISOString()}`);

  // Check if token needs refresh
  if (isTokenExpired(user.expires_at)) {
    console.log(`Refreshing token for athlete ${athleteId}`);

    const tokenResponse = await refreshAccessToken(user.refresh_token);

    // Update tokens in database
    await updateUserTokens(
      athleteId,
      tokenResponse.access_token,
      tokenResponse.refresh_token,
      tokenResponse.expires_at
    );

    return tokenResponse.access_token;
  }

  return user.access_token;
}

/**
 * Get activity details from Strava API
 */
export async function getActivity(
  activityId: number,
  athleteId: number
): Promise<StravaActivity> {
  const accessToken = await getValidAccessToken(athleteId);

  const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get activity: ${response.status} ${error}`);
  }

  return response.json() as Promise<StravaActivity>;
}

/**
 * Update activity description
 */
export async function updateActivityDescription(
  activityId: number,
  athleteId: number,
  description: string
): Promise<void> {
  const accessToken = await getValidAccessToken(athleteId);

  console.log(`Updating activity ${activityId} for athlete ${athleteId} with description (${description.length} chars)`);

  const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description }),
  });

  console.log(`Strava API response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const error = await response.text();
    console.error(`Strava API error response: ${error}`);
    throw new Error(`Failed to update activity: ${response.status} ${error}`);
  }

  const responseData = (await response.json()) as StravaActivity;
  console.log(`Updated activity ${responseData.id} (type: ${responseData.type || responseData.sport_type})`);
}

/**
 * Update activity title and/or description
 */
export async function updateActivity(
  activityId: number,
  athleteId: number,
  updates: { name?: string; description?: string }
): Promise<void> {
  const accessToken = await getValidAccessToken(athleteId);

  const fieldsUpdated = Object.keys(updates).join(', ');
  console.log(`Updating activity ${activityId} for athlete ${athleteId} - fields: ${fieldsUpdated}`);

  const response = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  console.log(`Strava API response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const error = await response.text();
    console.error(`Strava API error response: ${error}`);
    throw new Error(`Failed to update activity: ${response.status} ${error}`);
  }

  const responseData = (await response.json()) as StravaActivity;
  console.log(`Updated activity ${responseData.id} successfully`);
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const response = await fetch('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for token: ${response.status} ${error}`);
  }

  return response.json() as Promise<StravaTokenResponse>;
}
