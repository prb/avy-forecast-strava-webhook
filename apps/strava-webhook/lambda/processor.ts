/**
 * Strava Webhook Handler Lambda
 *
 * Handles webhook events from Strava for activity creation
 */

/**
 * Strava Webhook Processor Lambda
 *
 * Processes queued webhook events from SQS.
 * Fetches forecasts and updates Strava activities.
 */

import type { SQSEvent, SQSHandler } from 'aws-lambda';
import type { StravaWebhookEvent } from './types.js';
import { getActivity, updateActivity } from './strava.js';
import { getForecastForCoordinate } from '@multifarious/forecast-api';
import { formatForecast } from '@multifarious/forecast-formatter';

/**
 * Structured Logger Helper
 */
const logger = {
  info: (event: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({ level: 'INFO', event, ...data }));
  },
  error: (event: string, error: any, data: Record<string, any> = {}) => {
    console.error(
      JSON.stringify({
        level: 'ERROR',
        event,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ...data,
      })
    );
  },
};

/**
 * Main Lambda handler for SQS
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  logger.info('BatchProcessingStarted', { recordCount: event.Records.length });

  for (const record of event.Records) {
    try {
      const webhookEvent: StravaWebhookEvent = JSON.parse(record.body);
      await processWebhookEvent(webhookEvent);
    } catch (error) {
      logger.error('RecordProcessingFailed', error, { messageId: record.messageId });
      // Throwing error here will cause SQS to retry this message (visibility timeout)
      throw error;
    }
  }
};

/**
 * Process a single webhook event
 */
async function processWebhookEvent(webhookEvent: StravaWebhookEvent): Promise<void> {
  logger.info('WebhookEventReceived', { webhookEvent });

  // Filter: Only process activity creation or update events
  if (
    webhookEvent.object_type !== 'activity' ||
    (webhookEvent.aspect_type !== 'create' && webhookEvent.aspect_type !== 'update')
  ) {
    logger.info('EventIgnored', { reason: 'Not an activity create/update event' });
    return;
  }

  // Process the activity
  await processActivity(
    webhookEvent.object_id,
    webhookEvent.owner_id,
    webhookEvent.aspect_type
  );
}

/**
 * Process a single activity: fetch forecast and update description
 */
async function processActivity(
  activityId: number,
  athleteId: number,
  aspectType: 'create' | 'update' | 'delete'
): Promise<void> {
  const logContext = { activityId, athleteId, aspectType };
  logger.info('ActivityProcessingStarted', logContext);

  // Get activity details from Strava
  const activity = await getActivity(activityId, athleteId);

  logger.info('ActivityDetailsFetched', {
    ...logContext,
    activityType: activity.type,
    activityName: activity.name,
    hasLocation: !!activity.start_latlng,
  });

  // Check for #avy_forecast command in title
  const hasCommand = activity.name.includes('#avy_forecast');

  // Determine if we should process this activity
  let shouldProcess = false;
  if (aspectType === 'create' && activity.type === 'BackcountrySki') {
    // Auto-process BackcountrySki activities on creation
    shouldProcess = true;
    logger.info('ProcessingCriteriaMet', { ...logContext, reason: 'Auto-process BackcountrySki' });
  } else if (aspectType === 'update' && hasCommand) {
    // Process any activity with #avy_forecast command on update
    shouldProcess = true;
    logger.info('ProcessingCriteriaMet', { ...logContext, reason: 'Manual command #avy_forecast' });
  } else {
    logger.info('ProcessingSkipped', { ...logContext, reason: 'Criteria not met' });
    return;
  }

  if (!shouldProcess) {
    return;
  }

  // Check if activity has start location
  if (!activity.start_latlng || activity.start_latlng.length !== 2) {
    logger.info('ProcessingSkipped', { ...logContext, reason: 'No start location' });

    // If user manually invoked with #avy_forecast, clean up title and add message
    if (hasCommand) {
      const newTitle = activity.name.replace(/#avy_forecast/g, '').trim();
      const updates = {
        name: newTitle,
        description: (activity.description || '') + '\n\n[No avalanche forecast available: Activity has no location data]',
      };
      logger.info('CleaningUpCommand', { ...logContext, newTitle });
      await updateActivity(activityId, athleteId, updates);
    }
    return;
  }

  // Check if description already has forecast (idempotency)
  // Look for our specific forecast text pattern or the URL
  // Pattern: "NWAC [Zone Name] Zone forecast:"
  const currentDescription = activity.description || '';
  const hasForecast =
    currentDescription.includes('nwac.us/avalanche-forecast/#/forecast/') ||
    /NWAC .* Zone forecast:/.test(currentDescription);

  if (hasForecast && !hasCommand) {
    logger.info('ProcessingSkipped', { ...logContext, reason: 'Forecast already present' });
    return;
  }

  if (hasForecast && hasCommand) {
    logger.info('ForecastRefreshTriggered', logContext);
  }

  // Extract coordinates and date
  const [latitude, longitude] = activity.start_latlng;
  // Use local date for forecast lookup (handles UTC midnight crossings)
  // Falls back to UTC date if start_date_local is missing
  const activityDate = (activity.start_date_local || activity.start_date).split('T')[0];

  logger.info('ForecastLookupStarted', { ...logContext, latitude, longitude, date: activityDate });

  // Get avalanche forecast
  const forecastResult = await getForecastForCoordinate(
    { latitude, longitude },
    activityDate,
    { includeProduct: true }
  );

  // Prepare description update
  let newDescription = currentDescription;

  // If refreshing (manual command + existing forecast), remove old forecast first
  if (hasForecast && hasCommand) {
    // Remove any line containing the NWAC forecast URL pattern
    // This is more robust than matching specific format like "NWAC ... (URL)"
    newDescription = currentDescription
      .replace(/\n\n[^\n]*https:\/\/nwac\.us\/avalanche-forecast\/#\/forecast\/[^\n]*/g, '')
      .trim();
    logger.info('OldForecastRemoved', logContext);
  }

  // Normalize description whitespace before adding new content
  // Remove trailing whitespace to ensure consistent spacing
  newDescription = newDescription.replace(/\s+$/, '');

  if (forecastResult.product) {
    logger.info('ForecastFound', { ...logContext, zoneName: forecastResult.zone.name });

    // Format the forecast with colored emoji squares
    const formattedForecast = formatForecast(forecastResult.product);
    newDescription = newDescription + `\n\n${formattedForecast}\n\nPowered by Strava`;
  } else {
    logger.info('ForecastNotFound', { ...logContext, error: forecastResult.error });

    // If using #avy_forecast command, add a message explaining why no forecast was added
    if (hasCommand) {
      const reason = forecastResult.error || 'No forecast available for this location/date';
      newDescription = newDescription + `\n\n[No avalanche forecast available: ${reason}]`;
    } else {
      // For auto-processing (create events), just skip silently
      return;
    }
  }

  // Prepare updates
  const updates: { name?: string; description: string } = {
    description: newDescription,
  };

  // If title has #avy_forecast command, remove it
  if (hasCommand) {
    const newTitle = activity.name.replace(/#avy_forecast/g, '').trim();
    updates.name = newTitle;
    logger.info('RemovingCommandFromTitle', { ...logContext, newTitle });
  }

  logger.info('UpdatingActivity', logContext);

  await updateActivity(activityId, athleteId, updates);

  logger.info('ActivityProcessed', { ...logContext, success: true });
}
