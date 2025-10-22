/**
 * Tests for OAuth handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../oauth.js';

// Mock the database module
vi.mock('../db.js', () => ({
  createOAuthState: vi.fn(),
  validateAndConsumeOAuthState: vi.fn(),
  createUserRecord: vi.fn(),
  saveUser: vi.fn(),
}));

// Mock the Strava API module
vi.mock('../strava.js', () => ({
  exchangeCodeForToken: vi.fn(),
}));

import * as db from '../db.js';
import * as strava from '../strava.js';

describe('OAuth Handler', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Set up default environment
    process.env.STRAVA_CLIENT_ID = 'test_client_id';
    process.env.STRAVA_CLIENT_SECRET = 'test_client_secret';
  });

  describe('GET /connect - Start OAuth flow', () => {
    it('should generate state and redirect to Strava with state parameter', async () => {
      const mockState = 'a'.repeat(64); // 64 hex chars
      vi.mocked(db.createOAuthState).mockResolvedValue(mockState);

      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/connect',
        headers: {
          Host: 'api.example.com',
          'X-Forwarded-Proto': 'https',
        },
        requestContext: {
          stage: 'prod',
        } as any,
      } as any;

      const result = await handler(event);

      // Should create OAuth state
      expect(db.createOAuthState).toHaveBeenCalledTimes(1);

      // Should return redirect
      expect(result.statusCode).toBe(302);
      expect(result.headers?.Location).toBeDefined();

      const location = new URL(result.headers!.Location);
      expect(location.hostname).toBe('www.strava.com');
      expect(location.pathname).toBe('/oauth/authorize');
      expect(location.searchParams.get('client_id')).toBe('test_client_id');
      expect(location.searchParams.get('state')).toBe(mockState);
      expect(location.searchParams.get('response_type')).toBe('code');
      expect(location.searchParams.get('scope')).toBe('read,activity:read_all,activity:write');
    });

    it('should handle state generation failures gracefully', async () => {
      vi.mocked(db.createOAuthState).mockRejectedValue(new Error('DB error'));

      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/connect',
        headers: {
          Host: 'api.example.com',
        },
        requestContext: {
          stage: 'prod',
        } as any,
      } as any;

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(result.body).toContain('Error');
    });
  });

  describe('GET /callback - OAuth callback', () => {
    const mockTokenResponse = {
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: Math.floor(Date.now() / 1000) + 21600,
      expires_in: 21600,
      athlete: {
        id: 12345,
        username: 'testuser',
        firstname: 'Test',
        lastname: 'User',
      },
    };

    const mockUserRecord = {
      athlete_id: 12345,
      access_token: 'test_access_token',
      refresh_token: 'test_refresh_token',
      expires_at: mockTokenResponse.expires_at,
      username: 'testuser',
      firstname: 'Test',
      lastname: 'User',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('should validate state and exchange code for token on successful callback', async () => {
      const testState = 'valid_state_token';
      const testCode = 'test_auth_code';

      vi.mocked(db.validateAndConsumeOAuthState).mockResolvedValue(true);
      vi.mocked(strava.exchangeCodeForToken).mockResolvedValue(mockTokenResponse);
      vi.mocked(db.createUserRecord).mockReturnValue(mockUserRecord);
      vi.mocked(db.saveUser).mockResolvedValue(undefined);

      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/callback',
        queryStringParameters: {
          code: testCode,
          state: testState,
        },
      } as any;

      const result = await handler(event);

      // Should validate state
      expect(db.validateAndConsumeOAuthState).toHaveBeenCalledWith(testState);

      // Should exchange code for token
      expect(strava.exchangeCodeForToken).toHaveBeenCalledWith(testCode);

      // Should save user
      expect(db.createUserRecord).toHaveBeenCalledWith(mockTokenResponse);
      expect(db.saveUser).toHaveBeenCalledWith(mockUserRecord);

      // Should return success page
      expect(result.statusCode).toBe(200);
      expect(result.body).toContain('Successfully Connected');
      expect(result.body).toContain('Test User');
    });

    it('should reject callback with invalid state', async () => {
      vi.mocked(db.validateAndConsumeOAuthState).mockResolvedValue(false);

      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/callback',
        queryStringParameters: {
          code: 'test_code',
          state: 'invalid_state',
        },
      } as any;

      const result = await handler(event);

      // Should validate state
      expect(db.validateAndConsumeOAuthState).toHaveBeenCalledWith('invalid_state');

      // Should NOT exchange code
      expect(strava.exchangeCodeForToken).not.toHaveBeenCalled();

      // Should return 403
      expect(result.statusCode).toBe(403);
      expect(result.body).toContain('Security Error');
      expect(result.body).toContain('Invalid or expired authorization request');
    });

    it('should reject callback with missing state', async () => {
      vi.mocked(db.validateAndConsumeOAuthState).mockResolvedValue(false);

      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/callback',
        queryStringParameters: {
          code: 'test_code',
          // state is missing
        },
      } as any;

      const result = await handler(event);

      // Should validate empty state
      expect(db.validateAndConsumeOAuthState).toHaveBeenCalledWith('');

      // Should NOT exchange code
      expect(strava.exchangeCodeForToken).not.toHaveBeenCalled();

      // Should return 403
      expect(result.statusCode).toBe(403);
    });

    it('should reject callback when user denies authorization', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/callback',
        queryStringParameters: {
          error: 'access_denied',
        },
      } as any;

      const result = await handler(event);

      // Should not validate state or exchange code
      expect(db.validateAndConsumeOAuthState).not.toHaveBeenCalled();
      expect(strava.exchangeCodeForToken).not.toHaveBeenCalled();

      // Should return 400
      expect(result.statusCode).toBe(400);
      expect(result.body).toContain('Authorization Failed');
    });

    it('should reject callback with missing code', async () => {
      vi.mocked(db.validateAndConsumeOAuthState).mockResolvedValue(true);

      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/callback',
        queryStringParameters: {
          state: 'valid_state',
          // code is missing
        },
      } as any;

      const result = await handler(event);

      // Should validate state but not exchange code
      expect(db.validateAndConsumeOAuthState).toHaveBeenCalled();
      expect(strava.exchangeCodeForToken).not.toHaveBeenCalled();

      // Should return 400
      expect(result.statusCode).toBe(400);
      expect(result.body).toContain('Missing authorization code');
    });
  });

  describe('Unknown paths', () => {
    it('should return 404 for unknown paths', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/unknown',
      } as any;

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
    });
  });
});
