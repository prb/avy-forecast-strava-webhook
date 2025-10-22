/**
 * Test setup for vitest
 */

// Set up environment variables for testing
process.env.STRAVA_CLIENT_ID = 'test_client_id';
process.env.STRAVA_CLIENT_SECRET = 'test_client_secret';
process.env.STRAVA_VERIFY_TOKEN = 'test_verify_token';
process.env.USERS_TABLE_NAME = 'test-strava-users';
process.env.AWS_REGION = 'us-west-2';
