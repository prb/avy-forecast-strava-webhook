/**
 * DynamoDB utility functions for user token management
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { StravaUser } from './types.js';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'strava-avy-users';

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
