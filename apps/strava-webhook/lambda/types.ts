/**
 * Type definitions for Strava API and DynamoDB structures
 */

// ============================================
// Strava Webhook Event
// ============================================

export interface StravaWebhookEvent {
  /** Type of object (activity, athlete) */
  object_type: 'activity' | 'athlete';
  /** ID of the activity or athlete */
  object_id: number;
  /** Type of event (create, update, delete) */
  aspect_type: 'create' | 'update' | 'delete';
  /** Strava athlete/owner ID */
  owner_id: number;
  /** Subscription ID from Strava */
  subscription_id: number;
  /** Unix timestamp of event */
  event_time: number;
  /** Update details (for update events) */
  updates?: Record<string, unknown>;
}

// ============================================
// Strava OAuth
// ============================================

export interface StravaTokenResponse {
  /** Access token (expires in 6 hours) */
  access_token: string;
  /** Refresh token (never expires, single-use) */
  refresh_token: string;
  /** Token expiration time (unix timestamp) */
  expires_at: number;
  /** Seconds until expiration */
  expires_in: number;
  /** Athlete summary */
  athlete: {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
    [key: string]: unknown;
  };
}

// ============================================
// Strava Activity
// ============================================

export interface StravaActivity {
  /** Activity ID */
  id: number;
  /** Activity type */
  type: string;
  /** Activity name/title */
  name: string;
  /** Start time (ISO 8601) */
  start_date: string;
  /** Start time in local timezone (ISO 8601) */
  start_date_local: string;
  /** Start location [latitude, longitude] or null */
  start_latlng: [number, number] | null;
  /** End location [latitude, longitude] or null */
  end_latlng: [number, number] | null;
  /** Activity description */
  description: string | null;
  /** Distance in meters */
  distance: number;
  /** Moving time in seconds */
  moving_time: number;
  /** Elapsed time in seconds */
  elapsed_time: number;
  /** Total elevation gain in meters */
  total_elevation_gain: number;
  /** Activity visibility */
  visibility: 'everyone' | 'followers_only' | 'only_me';
  /** Privacy settings */
  private: boolean;
  /** Many other fields... */
  [key: string]: unknown;
}

// ============================================
// DynamoDB User Record
// ============================================

export interface StravaUser {
  /** Strava athlete ID (partition key) */
  athlete_id: number;
  /** Strava access token (6-hour lifetime) */
  access_token: string;
  /** Strava refresh token (never expires, single-use) */
  refresh_token: string;
  /** Token expiration timestamp (unix seconds) */
  expires_at: number;
  /** Athlete username */
  username?: string;
  /** Athlete first name */
  firstname?: string;
  /** Athlete last name */
  lastname?: string;
  /** Record creation time (ISO 8601) */
  created_at: string;
  /** Record last update time (ISO 8601) */
  updated_at: string;
}

// ============================================
// Lambda Event/Response Types
// ============================================

export interface APIGatewayProxyEventV2 {
  version: string;
  routeKey: string;
  rawPath: string;
  rawQueryString: string;
  headers: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  requestContext: {
    accountId: string;
    apiId: string;
    domainName: string;
    domainPrefix: string;
    http: {
      method: string;
      path: string;
      protocol: string;
      sourceIp: string;
      userAgent: string;
    };
    requestId: string;
    routeKey: string;
    stage: string;
    time: string;
    timeEpoch: number;
  };
  body?: string;
  isBase64Encoded: boolean;
}

export interface APIGatewayProxyResultV2 {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}
