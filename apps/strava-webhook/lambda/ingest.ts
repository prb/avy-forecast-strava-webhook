import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

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

  // 2. Filter events early
  // We only care about 'activity' objects and 'create' or 'update' aspects
  if (webhookEvent.object_type !== 'activity') {
    console.log('Ignoring non-activity event:', webhookEvent.object_type);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event ignored (not an activity)' }),
    };
  }

  if (webhookEvent.aspect_type === 'delete') {
    console.log('Ignoring delete event');
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event ignored (delete)' }),
    };
  }

  // Also double check it is create or update, just in case
  if (webhookEvent.aspect_type !== 'create' && webhookEvent.aspect_type !== 'update') {
    console.log('Ignoring unknown aspect type:', webhookEvent.aspect_type);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event ignored (unknown aspect)' }),
    };
  }

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

