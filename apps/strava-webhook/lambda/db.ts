/**
 * DynamoDB utility functions for user token management
 */

import { randomBytes } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { StravaUser, OAuthState } from './types.js';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'strava-avy-users';
const STATE_TABLE_NAME = process.env.STATE_TABLE_NAME || 'strava-avy-oauth-states';
const STATE_TTL_SECONDS = 300; // 5 minutes

/**
 * Get user by athlete ID
 */
export async function getUser(athleteId: number): Promise<StravaUser | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { athlete_id: athleteId },
      })
    );

    return (result.Item as StravaUser) || null;
  } catch (error) {
    console.error('Error getting user from DynamoDB:', error);
    throw error;
  }
}

/**
 * Save or update user
 */
export async function saveUser(user: StravaUser): Promise<void> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: user,
      })
    );
  } catch (error) {
    console.error('Error saving user to DynamoDB:', error);
    throw error;
  }
}

/**
 * Create a new user record from OAuth response
 */
export function createUserRecord(tokenResponse: {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: {
    id: number;
    username?: string;
    firstname?: string;
    lastname?: string;
  };
}): StravaUser {
  const now = new Date().toISOString();

  return {
    athlete_id: tokenResponse.athlete.id,
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: tokenResponse.expires_at,
    username: tokenResponse.athlete.username,
    firstname: tokenResponse.athlete.firstname,
    lastname: tokenResponse.athlete.lastname,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Update user tokens after refresh
 */
export async function updateUserTokens(
  athleteId: number,
  accessToken: string,
  refreshToken: string,
  expiresAt: number
): Promise<void> {
  const user = await getUser(athleteId);

  if (!user) {
    throw new Error(`User ${athleteId} not found in database`);
  }

  user.access_token = accessToken;
  user.refresh_token = refreshToken;
  user.expires_at = expiresAt;
  user.updated_at = new Date().toISOString();

  await saveUser(user);
}

/**
 * Generate and save a cryptographically secure OAuth state token
 * Returns the state token for use in OAuth flow
 */
export async function createOAuthState(): Promise<string> {
  const state = randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);

  const stateRecord: OAuthState = {
    state,
    ttl: now + STATE_TTL_SECONDS,
    created_at: new Date().toISOString(),
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: STATE_TABLE_NAME,
        Item: stateRecord,
      })
    );

    return state;
  } catch (error) {
    console.error('Error saving OAuth state to DynamoDB:', error);
    throw error;
  }
}

/**
 * Validate and consume an OAuth state token
 * Returns true if valid, false if invalid or expired
 * State is deleted after validation (single-use)
 */
export async function validateAndConsumeOAuthState(state: string): Promise<boolean> {
  if (!state) {
    return false;
  }

  try {
    // Get the state record
    const result = await docClient.send(
      new GetCommand({
        TableName: STATE_TABLE_NAME,
        Key: { state },
      })
    );

    const stateRecord = result.Item as OAuthState | undefined;

    // Check if state exists
    if (!stateRecord) {
      console.warn('OAuth state not found:', state.substring(0, 8) + '...');
      return false;
    }

    // Check if expired (TTL is checked by DynamoDB but we double-check)
    const now = Math.floor(Date.now() / 1000);
    if (stateRecord.ttl < now) {
      console.warn('OAuth state expired:', state.substring(0, 8) + '...');
      return false;
    }

    // Delete the state (single-use token)
    await docClient.send(
      new DeleteCommand({
        TableName: STATE_TABLE_NAME,
        Key: { state },
      })
    );

    return true;
  } catch (error) {
    console.error('Error validating OAuth state:', error);
    return false;
  }
}