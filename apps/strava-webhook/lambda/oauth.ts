/**
 * OAuth Flow Handler Lambda
 *
 * Handles Strava OAuth authorization flow
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { exchangeCodeForToken } from './strava.js';
import { createUserRecord, saveUser, createOAuthState, validateAndConsumeOAuthState } from './db.js';
import { requireEnv } from './env.js';
import { logger, requestSummary } from './logger.js';

/**
 * Escape text for safe interpolation into HTML
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Construct the OAuth redirect URI from the request
 */
function getRedirectUri(event: APIGatewayProxyEvent): string {
  const headers = event.headers || {};
  const host = headers.Host || headers.host;
  const proto = headers['X-Forwarded-Proto'] || headers['x-forwarded-proto'] || 'https';
  const stage = event.requestContext?.stage || 'prod';

  return `${proto}://${host}/${stage}/callback`;
}

/**
 * Main Lambda handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  logger.info('OAuthRequestReceived', requestSummary(event));

  try {
    const path = event.path || event.resource || '';

    // Handle /connect - Start OAuth flow
    if (path.includes('/connect')) {
      return await handleConnect(event);
    }

    // Handle /callback - OAuth callback from Strava
    if (path.includes('/callback')) {
      return await handleCallback(event);
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error) {
    logger.error('OAuthFailed', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"></head>
          <body>
            <h1>Error</h1>
            <p>Something went wrong during authorization. Please try again.</p>
            <a href="../">Try again</a>
          </body>
        </html>
      `,
    };
  }
}

/**
 * Handle /connect - Redirect user to Strava OAuth page
 */
async function handleConnect(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const scope = 'read,activity:read_all,activity:write';
  const redirectUri = getRedirectUri(event);

  // Generate and store CSRF protection state token
  const state = await createOAuthState();

  const authUrl = new URL('https://www.strava.com/oauth/authorize');
  authUrl.searchParams.set('client_id', requireEnv('STRAVA_CLIENT_ID'));
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('approval_prompt', 'auto');
  authUrl.searchParams.set('state', state);

  logger.info('OAuthRedirect', { redirectUri });

  return {
    statusCode: 302,
    headers: {
      Location: authUrl.toString(),
    },
    body: '',
  };
}

/**
 * Handle /callback - Process OAuth callback from Strava
 */
async function handleCallback(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const params = event.queryStringParameters || {};
  const code = params.code;
  const state = params.state;
  const error = params.error;

  // Check for OAuth error
  if (error) {
    logger.warn('OAuthDenied', { oauthError: error });

    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"></head>
          <body>
            <h1>Authorization Failed</h1>
            <p>You denied access to your Strava account.</p>
            <a href="../">Go back</a>
          </body>
        </html>
      `,
    };
  }

  // Validate state parameter (CSRF protection)
  let isValidState: boolean;
  try {
    isValidState = await validateAndConsumeOAuthState(state || '');
  } catch (error) {
    // DynamoDB service error (throttling, outage, etc.)
    logger.error('OAuthStateValidationFailed', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"></head>
          <body>
            <h1>Service Temporarily Unavailable</h1>
            <p>We're experiencing technical difficulties. Please try again in a moment.</p>
            <a href="../">Go back</a>
          </body>
        </html>
      `,
    };
  }

  if (!isValidState) {
    logger.warn('OAuthStateRejected');

    return {
      statusCode: 403,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"></head>
          <body>
            <h1>Security Error</h1>
            <p>Invalid or expired authorization request.</p>
            <p>This could be due to:</p>
            <ul>
              <li>The authorization link expired (older than 5 minutes)</li>
              <li>The authorization link was already used</li>
              <li>A potential security issue was detected</li>
            </ul>
            <a href="../">Start over</a>
          </body>
        </html>
      `,
    };
  }

  // Check for authorization code
  if (!code) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"></head>
          <body>
            <h1>Error</h1>
            <p>Missing authorization code.</p>
            <a href="../">Go back</a>
          </body>
        </html>
      `,
    };
  }


  // Exchange code for access token
  const tokenResponse = await exchangeCodeForToken(code);

  logger.info('OAuthTokensReceived', { athleteId: tokenResponse.athlete.id });

  // Save user to database
  const user = createUserRecord(tokenResponse);
  await saveUser(user);

  logger.info('UserSaved', { athleteId: user.athlete_id });

  // Success page
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Connected to Strava</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
              text-align: center;
            }
            h1 { color: #fc4c02; }
            .success { background: #d4edda; padding: 20px; border-radius: 5px; margin: 20px 0; }
            a { color: #fc4c02; text-decoration: none; }
          </style>
        </head>
        <body>
          <h1>✅ Successfully Connected!</h1>
          <div class="success">
            <p>Welcome, ${escapeHtml(`${tokenResponse.athlete.firstname} ${tokenResponse.athlete.lastname}`)}!</p>
            <p>Your Strava account is now connected to the Avalanche Forecast service.</p>
          </div>
          <p>From now on, your BackcountrySki activities will automatically get NWAC avalanche forecasts added to their descriptions.</p>
          <p><strong>Go create some ski activities and see the magic happen!</strong></p>
          <br/>
          <p style="color: #666; font-size: 0.9em;">
            You can close this window and return to Strava.
          </p>
        </body>
      </html>
    `,
  };
}