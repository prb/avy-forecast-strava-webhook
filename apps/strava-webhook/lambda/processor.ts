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
 * Main Lambda handler for SQS
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<void> => {
  console.log(`Processing ${event.Records.length} records`);

  for (const record of event.Records) {
    try {
      const webhookEvent: StravaWebhookEvent = JSON.parse(record.body);
      await processWebhookEvent(webhookEvent);
    } catch (error) {
      console.error('Error processing record:', error);
      // Throwing error here will cause SQS to retry this message (visibility timeout)
      // If you want to skip bad messages, catch and log only.
      // For now, we throw to ensure retries on transient failures.
      throw error;
    }
  }
};

/**
 * Process a single webhook event
 */
async function processWebhookEvent(webhookEvent: StravaWebhookEvent): Promise<void> {
  console.log('Processing webhook event:', webhookEvent);

  // Filter: Only process activity creation or update events
  if (
    webhookEvent.object_type !== 'activity' ||
    (webhookEvent.aspect_type !== 'create' && webhookEvent.aspect_type !== 'update')
  ) {
    console.log('Ignoring non-activity event');
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
  console.log(`Processing activity ${activityId} for athlete ${athleteId} (${aspectType} event)`);

  // Get activity details from Strava
  const activity = await getActivity(activityId, athleteId);

  console.log(
    `Activity type: ${activity.type}, title: "${activity.name}", has location: ${!!activity.start_latlng}`
  );

  // Check for #avy_forecast command in title
  const hasCommand = activity.name.includes('#avy_forecast');

  // Determine if we should process this activity
  let shouldProcess = false;
  if (aspectType === 'create' && activity.type === 'BackcountrySki') {
    // Auto-process BackcountrySki activities on creation
    shouldProcess = true;
    console.log('Auto-processing BackcountrySki activity on creation');
  } else if (aspectType === 'update' && hasCommand) {
    // Process any activity with #avy_forecast command on update
    shouldProcess = true;
    console.log('Processing activity with #avy_forecast command');
  } else {
    console.log('Activity does not meet processing criteria, skipping');
    return;
  }

  if (!shouldProcess) {
    return;
  }

  // Check if activity has start location
  if (!activity.start_latlng || activity.start_latlng.length !== 2) {
    console.log('Activity has no start location, skipping forecast lookup');

    // If user manually invoked with #avy_forecast, clean up title and add message
    if (hasCommand) {
      const newTitle = activity.name.replace(/#avy_forecast/g, '').trim();
      const updates = {
        name: newTitle,
        description: (activity.description || '') + '\n\n[No avalanche forecast available: Activity has no location data]',
      };
      console.log(`Removing #avy_forecast from title: "${activity.name}" -> "${newTitle}"`);
      await updateActivity(activityId, athleteId, updates);
    }
    return;
  }

  // Check if description already has forecast (idempotency)
  // Look for our specific forecast URL pattern: nwac.us/avalanche-forecast/#/forecast/
  // Skip if forecast exists, UNLESS user manually invoked with #avy_forecast (allows retry)
  const currentDescription = activity.description || '';
  const hasForecast = currentDescription.includes('nwac.us/avalanche-forecast/#/forecast/');

  if (hasForecast && !hasCommand) {
    console.log('Activity description already contains forecast, skipping update');
    return;
  }

  if (hasForecast && hasCommand) {
    console.log('Refreshing existing forecast (manual #avy_forecast command)');
  }

  // Extract coordinates and date
  const [latitude, longitude] = activity.start_latlng;
  // Use local date for forecast lookup (handles UTC midnight crossings)
  // Falls back to UTC date if start_date_local is missing
  const activityDate = (activity.start_date_local || activity.start_date).split('T')[0];

  console.log(`Looking up forecast for coordinates: ${latitude}, ${longitude} on ${activityDate} (local date)`);

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
    console.log('Removed old forecast from description');
  }

  // Normalize description whitespace before adding new content
  // Remove trailing whitespace to ensure consistent spacing
  newDescription = newDescription.replace(/\s+$/, '');

  if (forecastResult.product) {
    console.log(`Found forecast for zone: ${forecastResult.zone.name}`);

    // Format the forecast with colored emoji squares
    const formattedForecast = formatForecast(forecastResult.product);
    newDescription = newDescription + `\n\n${formattedForecast}`;
  } else {
    console.log(`No forecast available: ${forecastResult.error || 'unknown reason'}`);

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
    console.log(`Removing #avy_forecast from title: "${activity.name}" -> "${newTitle}"`);
  }

  console.log(`Updating activity ${activityId}`);

  await updateActivity(activityId, athleteId, updates);

  console.log(`Successfully updated activity ${activityId}`);
}
