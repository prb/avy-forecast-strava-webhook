import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { requireEnv } from './env.js';
import { logger, requestSummary } from './logger.js';

const sqs = new SQSClient({});

/**
 * Main Lambda handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  logger.info('IngestRequestReceived', requestSummary(event));

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
    logger.error('IngestFailed', error);

    // Details are logged above; don't return them to the caller
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
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


  if (!mode || !token || !challenge) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing verification parameters' }),
    };
  }

  // Verify the token matches
  if (mode === 'subscribe' && token === requireEnv('STRAVA_VERIFY_TOKEN')) {
    logger.info('WebhookVerified');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'hub.challenge': challenge }),
    };
  }

  logger.warn('WebhookVerificationFailed', { mode });

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

  logger.info('WebhookEventReceived', {
    objectType: webhookEvent.object_type,
    aspectType: webhookEvent.aspect_type,
    objectId: webhookEvent.object_id,
    ownerId: webhookEvent.owner_id,
  });

  // 2. Filter events early
  // We only care about 'activity' objects and 'create' or 'update' aspects
  if (webhookEvent.object_type !== 'activity') {
    logger.info('WebhookEventIgnored', { reason: 'not an activity', objectType: webhookEvent.object_type });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event ignored (not an activity)' }),
    };
  }

  if (webhookEvent.aspect_type === 'delete') {
    logger.info('WebhookEventIgnored', { reason: 'delete' });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event ignored (delete)' }),
    };
  }

  // Also double check it is create or update, just in case
  if (webhookEvent.aspect_type !== 'create' && webhookEvent.aspect_type !== 'update') {
    logger.info('WebhookEventIgnored', { reason: 'unknown aspect', aspectType: webhookEvent.aspect_type });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event ignored (unknown aspect)' }),
    };
  }

  try {
    // Send to SQS
    await sqs.send(new SendMessageCommand({
      QueueUrl: requireEnv('QUEUE_URL'),
      MessageBody: event.body, // Pass the raw JSON string
    }));

    logger.info('WebhookEventQueued', { objectId: webhookEvent.object_id });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Event queued for processing' }),
    };
  } catch (error) {
    logger.error('WebhookEventQueueFailed', error, { objectId: webhookEvent.object_id });
    // Even if queuing fails, we might want to return 500 so Strava retries
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to queue event' }),
    };
  }
}

