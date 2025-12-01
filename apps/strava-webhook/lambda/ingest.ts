import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import * as crypto from 'crypto';

const sqs = new SQSClient({});

/**
 * Main Lambda handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Ingest event received:', JSON.stringify(event, null, 2));

  try {
    // Handle GET request (webhook subscription verification)
    if (event.httpMethod === 'GET') {
      return handleVerification(event);
    }

    // Handle POST request (webhook event notification)
    if (event.httpMethod === 'POST') {
      return await handleWebhookIngest(event);
    }

    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Error handling ingest:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

/**
 * Handle webhook subscription verification (GET request)
 */
function handleVerification(event: APIGatewayProxyEvent): APIGatewayProxyResult {
  const params = event.queryStringParameters || {};
  const mode = params['hub.mode'];
  const token = params['hub.verify_token'];
  const challenge = params['hub.challenge'];

  console.log('Webhook verification request:', { mode, token, challenge });

  if (!mode || !token || !challenge) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing verification parameters' }),
    };
  }

  // Verify the token matches
  if (mode === 'subscribe' && token === process.env.STRAVA_VERIFY_TOKEN) {
    console.log('Webhook verified successfully');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'hub.challenge': challenge }),
    };
  }

  console.error('Webhook verification failed: invalid verify token');

  return {
    statusCode: 403,
    body: JSON.stringify({ error: 'Verification failed' }),
  };
}

/**
 * Verify Strava webhook signature
 */
function verifySignature(event: APIGatewayProxyEvent): boolean {
  const headers = event.headers || {};

  // Header key is case-insensitive
  const signatureKey = Object.keys(headers).find(key => key.toLowerCase() === 'x-strava-signature');
  const signature = signatureKey ? headers[signatureKey] : undefined;

  if (!signature) {
    console.error('Missing X-Strava-Signature header');
    return false;
  }

  if (!process.env.STRAVA_CLIENT_SECRET) {
    console.error('Missing STRAVA_CLIENT_SECRET environment variable');
    return false;
  }

  // Create HMAC-SHA256 hash
  // Note: event.body should be the raw string
  const hmac = crypto.createHmac('sha256', process.env.STRAVA_CLIENT_SECRET);
  const digest = hmac.update(event.body || '').digest('hex');

  if (digest !== signature) {
    console.error(`Signature mismatch. Expected: ${digest}, Received: ${signature}`);
    return false;
  }

  return true;
}

/**
 * Handle webhook event ingestion (POST request)
 */
async function handleWebhookIngest(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing request body' }),
    };
  }

  // Verify signature
  if (!verifySignature(event)) {
    return {
      statusCode: 400, // Strava expects 400 if signature is invalid? Or 401/403?
      // The logs showed 400 for "Missing X-Strava-Signature header", so sticking with 400 seems safe/consistent with previous behavior.
      body: JSON.stringify({ error: 'Invalid or missing signature' }),
    };
  }

  // Validate JSON parsing
  let webhookEvent;
  try {
    webhookEvent = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  console.log('Ingesting webhook event:', webhookEvent);

  try {
    // Send to SQS
    await sqs.send(new SendMessageCommand({
      QueueUrl: process.env.QUEUE_URL,
      MessageBody: event.body, // Pass the raw JSON string
    }));

    console.log('Event queued successfully');

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event queued for processing' }),
    };
  } catch (error) {
    console.error('Error queuing event:', error);
    // Even if queuing fails, we might want to return 500 so Strava retries
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to queue event' }),
    };
  }
}
