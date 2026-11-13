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

import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent, SQSHandler } from 'aws-lambda';
import type { StravaWebhookEvent } from './types.js';
import { logger } from './logger.js';
import { getActivity, updateActivity } from './strava.js';
import { getForecastForCoordinate } from '@multifarious/forecast-api';
import { formatForecast, formatNoForecastNote, hasForecastLine, removeForecastLines } from '@multifarious/forecast-formatter';

/**
 * Main Lambda handler for SQS
 *
 * Reports failures per record (requires `reportBatchItemFailures` on the event
 * source), so only failed messages are retried. After `maxReceiveCount` failed
 * attempts SQS moves a message to the dead-letter queue.
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  logger.info('BatchProcessingStarted', { recordCount: event.Records.length });

  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const webhookEvent: StravaWebhookEvent = JSON.parse(record.body);
      await processWebhookEvent(webhookEvent);
    } catch (error) {
      logger.error('RecordProcessingFailed', error, {
        messageId: record.messageId,
        receiveCount: record.attributes?.ApproximateReceiveCount,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
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
  if (aspectType === 'create' && activity.type === 'BackcountrySki') {
    // Auto-process BackcountrySki activities on creation
    logger.info('ProcessingCriteriaMet', { ...logContext, reason: 'Auto-process BackcountrySki' });
  } else if (aspectType === 'update' && hasCommand) {
    // Process any activity with #avy_forecast command on update
    logger.info('ProcessingCriteriaMet', { ...logContext, reason: 'Manual command #avy_forecast' });
  } else {
    logger.info('ProcessingSkipped', { ...logContext, reason: 'Criteria not met' });
    return;
  }

  // Check if activity has start location
  if (!activity.start_latlng || activity.start_latlng.length !== 2) {
    logger.info('ProcessingSkipped', { ...logContext, reason: 'No start location' });

    // If user manually invoked with #avy_forecast, clean up title and add message
    if (hasCommand) {
      const newTitle = activity.name.replace(/#avy_forecast/g, '').trim();
      // Replace any earlier forecast line or note rather than adding another
      const previous = removeForecastLines(activity.description || '');
      const note = formatNoForecastNote('Activity has no location data');
      const updates = {
        name: newTitle,
        description: previous ? `${previous}\n\n${note}` : note,
      };
      logger.info('CleaningUpCommand', { ...logContext, newTitle });
      await updateActivity(activityId, athleteId, updates);
    }
    return;
  }

  // Check if description already has a forecast line from us (idempotency)
  const currentDescription = activity.description || '';
  const hasForecast = hasForecastLine(currentDescription);

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

  // If refreshing (manual command), remove any old forecast line or
  // "no forecast" note first, so they aren't repeated
  if (hasCommand) {
    newDescription = removeForecastLines(currentDescription);
    if (newDescription !== currentDescription.trim()) {
      logger.info('OldForecastRemoved', logContext);
    }
  }

  // Normalize description whitespace before adding new content
  // Remove trailing whitespace to ensure consistent spacing
  newDescription = newDescription.replace(/\s+$/, '');

  // Format the forecast with colored emoji squares. A product we can't format
  // won't get better on retry, so treat it like a missing forecast.
  let formattedForecast: string | null = null;
  let noForecastReason = forecastResult.error;
  if (forecastResult.product) {
    try {
      formattedForecast = formatForecast(forecastResult.product, {
        center: forecastResult.zone.center_id,
      });
    } catch (error) {
      logger.error('ForecastFormatFailed', error, logContext);
      noForecastReason = 'Forecast could not be formatted';
    }
  }

  if (formattedForecast) {
    logger.info('ForecastFound', {
      ...logContext,
      zoneName: forecastResult.zone.name,
      centerId: forecastResult.zone.center_id,
    });
    newDescription = newDescription ? `${newDescription}\n\n${formattedForecast}` : formattedForecast;
  } else {
    logger.info('ForecastNotFound', { ...logContext, error: noForecastReason });

    // If using #avy_forecast command, add a message explaining why no forecast was added
    if (hasCommand) {
      const reason = noForecastReason || 'No forecast available for this location/date';
      const note = formatNoForecastNote(reason);
      newDescription = newDescription ? `${newDescription}\n\n${note}` : note;
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
