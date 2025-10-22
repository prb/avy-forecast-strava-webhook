/**
 * Test fixtures for Strava webhook tests
 */

import type { StravaWebhookEvent, StravaActivity, StravaUser, StravaTokenResponse } from '../types.js';
import type { ForecastProduct } from '@multifarious/forecast-api';

/**
 * Mock webhook event for BackcountrySki activity creation
 */
export const mockWebhookEvent: StravaWebhookEvent = {
  object_type: 'activity',
  object_id: 123456789,
  aspect_type: 'create',
  owner_id: 987654321,
  subscription_id: 1,
  event_time: 1712707200, // April 10, 2025
};

/**
 * Mock webhook event for non-BackcountrySki activity
 */
export const mockRunWebhookEvent: StravaWebhookEvent = {
  object_type: 'activity',
  object_id: 123456790,
  aspect_type: 'create',
  owner_id: 987654321,
  subscription_id: 1,
  event_time: 1712707200,
};

/**
 * Mock webhook event for activity update (should be ignored)
 */
export const mockUpdateWebhookEvent: StravaWebhookEvent = {
  object_type: 'activity',
  object_id: 123456789,
  aspect_type: 'update',
  owner_id: 987654321,
  subscription_id: 1,
  event_time: 1712707200,
  updates: { title: 'Updated title' },
};

/**
 * Mock BackcountrySki activity at Mt Hood
 */
export const mockBackcountryActivity: StravaActivity = {
  id: 123456789,
  type: 'BackcountrySki',
  start_date: '2025-04-09T14:30:00Z',
  start_date_local: '2025-04-09T07:30:00Z',
  start_latlng: [45.4, -121.7], // Mt Hood coordinates
  end_latlng: [45.41, -121.71],
  description: 'Great day on Mt Hood!',
  name: 'Morning Ski',
  distance: 5000,
  moving_time: 7200,
  elapsed_time: 7200,
  total_elevation_gain: 1000,
  visibility: 'everyone',
  private: false,
};

/**
 * Mock BackcountrySki activity without location
 */
export const mockActivityNoLocation: StravaActivity = {
  id: 123456789,
  type: 'BackcountrySki',
  start_date: '2025-04-09T14:30:00Z',
  start_date_local: '2025-04-09T07:30:00Z',
  start_latlng: null,
  end_latlng: null,
  description: 'Indoor ski workout',
  name: 'Indoor Training',
  distance: 0,
  moving_time: 3600,
  elapsed_time: 3600,
  total_elevation_gain: 0,
  visibility: 'everyone',
  private: false,
};

/**
 * Mock Run activity (should be filtered out)
 */
export const mockRunActivity: StravaActivity = {
  id: 123456790,
  type: 'Run',
  start_date: '2025-04-09T14:30:00Z',
  start_date_local: '2025-04-09T07:30:00Z',
  start_latlng: [45.4, -121.7],
  end_latlng: [45.41, -121.71],
  description: 'Morning run',
  name: 'Morning Run',
  distance: 5000,
  moving_time: 1800,
  elapsed_time: 1800,
  total_elevation_gain: 100,
  visibility: 'everyone',
  private: false,
};

/**
 * Mock activity with existing forecast in description
 */
export const mockActivityWithForecast: StravaActivity = {
  id: 123456789,
  type: 'BackcountrySki',
  start_date: '2025-04-09T14:30:00Z',
  start_date_local: '2025-04-09T07:30:00Z',
  start_latlng: [45.4, -121.7],
  end_latlng: [45.41, -121.71],
  description: 'Great day on Mt Hood!\n\nNWAC Mt Hood forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)',
  name: 'Morning Ski',
  distance: 5000,
  moving_time: 7200,
  elapsed_time: 7200,
  total_elevation_gain: 1000,
  visibility: 'everyone',
  private: false,
};

/**
 * Mock activity that crosses UTC midnight boundary
 * Local time: April 9, 2025 at 11:30 PM Pacific (UTC-7)
 * UTC time: April 10, 2025 at 6:30 AM
 * Should use local date (April 9) for forecast lookup
 */
export const mockMidnightCrossingActivity: StravaActivity = {
  id: 123456791,
  type: 'BackcountrySki',
  start_date: '2025-04-10T06:30:00Z',        // April 10 in UTC
  start_date_local: '2025-04-09T23:30:00',   // April 9 in local time
  start_latlng: [45.4, -121.7], // Mt Hood coordinates
  end_latlng: [45.41, -121.71],
  description: 'Late evening tour',
  name: 'Sunset Ski',
  distance: 3000,
  moving_time: 5400,
  elapsed_time: 5400,
  total_elevation_gain: 800,
  visibility: 'everyone',
  private: false,
};

/**
 * Mock Strava user with valid tokens
 */
export const mockUser: StravaUser = {
  athlete_id: 987654321,
  access_token: 'mock_access_token_abc123',
  refresh_token: 'mock_refresh_token_xyz789',
  expires_at: Math.floor(Date.now() / 1000) + 21600, // 6 hours from now
  username: 'test_athlete',
  created_at: '2025-04-01T00:00:00Z',
  updated_at: '2025-04-09T00:00:00Z',
};

/**
 * Mock user with expired token
 */
export const mockUserExpiredToken: StravaUser = {
  athlete_id: 987654321,
  access_token: 'mock_expired_token',
  refresh_token: 'mock_refresh_token_xyz789',
  expires_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
  username: 'test_athlete',
  created_at: '2025-04-01T00:00:00Z',
  updated_at: '2025-04-08T00:00:00Z',
};

/**
 * Mock token refresh response
 */
export const mockTokenResponse: StravaTokenResponse = {
  access_token: 'new_access_token_def456',
  refresh_token: 'new_refresh_token_uvw123',
  expires_at: Math.floor(Date.now() / 1000) + 21600,
  expires_in: 21600,
  athlete: {
    id: 987654321,
    username: 'test_athlete',
    firstname: 'Test',
    lastname: 'Athlete',
  },
};

/**
 * Mock Mt Hood forecast product with danger ratings
 */
export const mockMtHoodForecast: ForecastProduct = {
  id: 166378,
  product_type: 'forecast',
  published_time: '2025-04-09T06:00:00Z',
  expires_time: '2025-04-10T06:00:00Z',
  start_date: '2025-04-09',
  end_date: '2025-04-09',
  danger_rating: 3,
  status: 'published',
  avalanche_center: {
    id: 'NWAC',
    name: 'Northwest Avalanche Center',
  },
  forecast_zone: [
    {
      id: 3476,
      zone_id: '10',
      name: 'Mt Hood',
      url: 'https://nwac.us/avalanche-forecast/#/mt-hood',
      config: null,
    },
  ],
  bottom_line: '<p>Avalanche conditions are <strong>CONSIDERABLE</strong> above treeline. Watch for wind slabs.</p>',
  hazard_discussion: '<p>Recent snow and wind have created unstable slabs on leeward slopes.</p>',
  weather_discussion: '<p>Clear skies with light winds expected today.</p>',
  danger: [
    {
      valid_day: 'current',
      upper: 3,
      middle: 3,
      lower: 2,
    },
  ],
  author: 'NWAC Forecaster',
};

/**
 * Mock forecast product with extreme danger
 */
export const mockExtremeDangerForecast: ForecastProduct = {
  ...mockMtHoodForecast,
  id: 166379,
  danger: [
    {
      valid_day: 'current',
      upper: 5,
      middle: 4,
      lower: 3,
    },
  ],
};

/**
 * Mock forecast product with low danger
 */
export const mockLowDangerForecast: ForecastProduct = {
  ...mockMtHoodForecast,
  id: 166380,
  danger: [
    {
      valid_day: 'current',
      upper: 2,
      middle: 1,
      lower: 1,
    },
  ],
};

/**
 * Expected formatted forecast string for Mt Hood
 */
export const expectedMtHoodForecastText = 'NWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://nwac.us/avalanche-forecast/#/forecast/10/166378)';

/**
 * Expected formatted forecast for extreme danger
 */
export const expectedExtremeDangerText = 'NWAC Mt Hood Zone forecast: 5⬛/4🟥/3🟧 (https://nwac.us/avalanche-forecast/#/forecast/10/166379)';

/**
 * Expected formatted forecast for low danger
 */
export const expectedLowDangerText = 'NWAC Mt Hood Zone forecast: 2🟨/1🟩/1🟩 (https://nwac.us/avalanche-forecast/#/forecast/10/166380)';
