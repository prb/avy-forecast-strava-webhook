/**
 * Tests for Strava webhook handler (Processor Lambda)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SQSEvent } from 'aws-lambda';
import { handler } from '../processor.js';
import type { ForecastProductResponse, ForecastResponse } from '@multifarious/forecast-api';
import {
  mockWebhookEvent,
  mockRunWebhookEvent,
  mockUpdateWebhookEvent,
  mockBackcountryActivity,
  mockActivityNoLocation,
  mockRunActivity,
  mockActivityWithForecast,
  mockMidnightCrossingActivity,
  mockMtHoodForecast,
  expectedMtHoodForecastText,
  mockUser,
} from './fixtures.js';

// Mock the Strava API module
vi.mock('../strava.js', () => ({
  getActivity: vi.fn(),
  updateActivity: vi.fn(),
  updateActivityDescription: vi.fn(),
  getValidAccessToken: vi.fn(),
}));

// Mock the database module
vi.mock('../db.js', () => ({
  getUser: vi.fn(),
}));

// Mock the forecast API module
vi.mock('@multifarious/forecast-api', () => ({
  getForecastForCoordinate: vi.fn(),
  fetchNWACForecastForZone: vi.fn(),
}));

import * as strava from '../strava.js';
import * as forecastApi from '@multifarious/forecast-api';
import * as db from '../db.js';

// Helper to create SQS event from body
const createSQSEvent = (body: any): SQSEvent => ({
  Records: [
    {
      messageId: '1',
      receiptHandle: 'handle',
      body: JSON.stringify(body),
      attributes: {} as any,
      messageAttributes: {},
      md5OfBody: 'hash',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn',
      awsRegion: 'us-west-2',
    },
  ],
});

describe('Webhook Handler', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Set up default database mock to return a valid user
    vi.mocked(db.getUser).mockResolvedValue(mockUser);
  });


  describe('SQS Event Processing', () => {
    it('should ignore non-activity events', async () => {
      const event = createSQSEvent({
        object_type: 'athlete',
        aspect_type: 'update',
      });

      await handler(event, {} as any, {} as any);

      expect(strava.getActivity).not.toHaveBeenCalled();
    });

    it('should ignore activity update events without #avy_forecast command', async () => {
      const event = createSQSEvent(mockUpdateWebhookEvent);

      // Mock activity without #avy_forecast in title
      vi.mocked(strava.getActivity).mockResolvedValue(mockBackcountryActivity);

      await handler(event, {} as any, {} as any);

      expect(strava.getActivity).toHaveBeenCalled();
      // Should not process without command
      expect(forecastApi.getForecastForCoordinate).not.toHaveBeenCalled();
      expect(strava.updateActivity).not.toHaveBeenCalled();
    });

    it('should ignore non-BackcountrySki activities', async () => {
      const event = createSQSEvent(mockRunWebhookEvent);

      vi.mocked(strava.getActivity).mockResolvedValue(mockRunActivity);

      await handler(event, {} as any, {} as any);

      expect(strava.getActivity).toHaveBeenCalledWith(
        mockRunWebhookEvent.object_id,
        mockRunWebhookEvent.owner_id
      );
      expect(forecastApi.getForecastForCoordinate).not.toHaveBeenCalled();
      expect(strava.updateActivity).not.toHaveBeenCalled();
    });

    it('should ignore activities without location', async () => {
      const event = createSQSEvent(mockWebhookEvent);

      vi.mocked(strava.getActivity).mockResolvedValue(mockActivityNoLocation);

      await handler(event, {} as any, {} as any);

      expect(strava.getActivity).toHaveBeenCalled();
      expect(forecastApi.getForecastForCoordinate).not.toHaveBeenCalled();
      expect(strava.updateActivity).not.toHaveBeenCalled();
    });

    it('should add rich forecast to BackcountrySki activity description', async () => {
      const event = createSQSEvent(mockWebhookEvent);

      // Mock activity fetch
      vi.mocked(strava.getActivity).mockResolvedValue(mockBackcountryActivity);

      // Mock forecast lookup (now returns the full product)
      const mockForecastProductResponse: ForecastProductResponse = {
        zone: {
          id: 3476,
          zone_id: '10',
          name: 'Mt Hood',
        },
        product: mockMtHoodForecast,
      };

      vi.mocked(forecastApi.getForecastForCoordinate).mockResolvedValue(
        mockForecastProductResponse as any
      );

      await handler(event, {} as any, {} as any);

      // Verify activity was fetched
      expect(strava.getActivity).toHaveBeenCalledWith(
        mockWebhookEvent.object_id,
        mockWebhookEvent.owner_id
      );

      // Verify forecast was looked up
      expect(forecastApi.getForecastForCoordinate).toHaveBeenCalledWith(
        { latitude: 45.4, longitude: -121.7 },
        '2025-04-09',
        { includeProduct: true }
      );

      // Verify activity was updated with rich forecast
      expect(strava.updateActivity).toHaveBeenCalledWith(
        mockWebhookEvent.object_id,
        mockWebhookEvent.owner_id,
        expect.objectContaining({
          description: expect.stringContaining(expectedMtHoodForecastText),
        })
      );

      // Verify the full description format
      const updateCall = vi.mocked(strava.updateActivity).mock.calls[0];
      const updates = updateCall[2];
      expect(updates.description).toBe(
        `Great day on Mt Hood!\n\n${expectedMtHoodForecastText}\n\nPowered by Strava`
      );
    });

    it('should not duplicate forecast if already present (idempotency)', async () => {
      const event = createSQSEvent(mockWebhookEvent);

      // Mock activity with existing forecast
      vi.mocked(strava.getActivity).mockResolvedValue(mockActivityWithForecast);

      await handler(event, {} as any, {} as any);

      expect(strava.getActivity).toHaveBeenCalled();

      // Should not fetch forecast or update description
      expect(forecastApi.getForecastForCoordinate).not.toHaveBeenCalled();
      expect(strava.updateActivity).not.toHaveBeenCalled();
    });

    it('should not duplicate forecast if text pattern matches but URL is different/missing', async () => {
      const event = createSQSEvent(mockWebhookEvent);

      // Mock activity with existing forecast but URL is shortened/different
      const activityWithShortenedUrl = {
        ...mockBackcountryActivity,
        description: 'Great day!\n\nNWAC Mt Hood Zone forecast: 3🟧/3🟧/2🟨 (https://strava.app.link/xyz)',
      };
      vi.mocked(strava.getActivity).mockResolvedValue(activityWithShortenedUrl);

      await handler(event, {} as any, {} as any);

      // Currently this fails (it WILL call updateActivity because URL check fails)
      // We want it to NOT call updateActivity
      expect(strava.updateActivity).not.toHaveBeenCalled();
    });

    it('should add forecast even if description mentions NWAC naturally', async () => {
      const event = createSQSEvent(mockWebhookEvent);

      // Activity that mentions NWAC/forecast but doesn't have our generated forecast
      const activityWithNaturalMention: typeof mockBackcountryActivity = {
        ...mockBackcountryActivity,
        description: 'Great day! I checked the NWAC forecast before heading out.',
      };

      vi.mocked(strava.getActivity).mockResolvedValue(activityWithNaturalMention);

      const mockForecastProductResponse: ForecastProductResponse = {
        zone: {
          id: 3476,
          zone_id: '10',
          name: 'Mt Hood',
        },
        product: mockMtHoodForecast,
      };

      vi.mocked(forecastApi.getForecastForCoordinate).mockResolvedValue(
        mockForecastProductResponse as any
      );

      await handler(event, {} as any, {} as any);

      // Should still add the forecast despite natural mention of NWAC/forecast
      expect(forecastApi.getForecastForCoordinate).toHaveBeenCalled();
      expect(strava.updateActivity).toHaveBeenCalledWith(
        mockWebhookEvent.object_id,
        mockWebhookEvent.owner_id,
        expect.objectContaining({
          description: expect.stringContaining(expectedMtHoodForecastText),
        })
      );
    });

    it('should handle missing forecast gracefully', async () => {
      const event = createSQSEvent(mockWebhookEvent);

      vi.mocked(strava.getActivity).mockResolvedValue(mockBackcountryActivity);

      // Mock no forecast available
      const noForecastResponse: ForecastProductResponse = {
        zone: {
          id: 3476,
          zone_id: '10',
          name: 'Mt Hood',
        },
        product: null,
        error: 'No forecast available for this date',
      };

      vi.mocked(forecastApi.getForecastForCoordinate).mockResolvedValue(noForecastResponse as any);

      await handler(event, {} as any, {} as any);

      expect(strava.getActivity).toHaveBeenCalled();
      expect(forecastApi.getForecastForCoordinate).toHaveBeenCalled();

      // Should not fetch full product or update description
      expect(forecastApi.fetchNWACForecastForZone).not.toHaveBeenCalled();
      expect(strava.updateActivity).not.toHaveBeenCalled();
    });

    it('should handle full product fetch failure gracefully', async () => {
      const event = createSQSEvent(mockWebhookEvent);

      vi.mocked(strava.getActivity).mockResolvedValue(mockBackcountryActivity);

      const mockForecastResponse: ForecastResponse = {
        zone: {
          id: 3476,
          zone_id: '10',
          name: 'Mt Hood',
        },
        forecast: {
          product_id: 166378,
          date: '2025-04-09',
          danger_rating: 3,
          published_time: '2025-04-09T06:00:00Z',
          bottom_line: '<p>Considerable danger above treeline</p>',
          url: 'https://nwac.us/avalanche-forecast/#/forecast/10/166378',
        },
      };

      vi.mocked(forecastApi.getForecastForCoordinate).mockResolvedValue(mockForecastResponse as any);

      // Mock full product fetch returning null
      vi.mocked(forecastApi.fetchNWACForecastForZone).mockResolvedValue(null);

      await handler(event, {} as any, {} as any);

      expect(strava.getActivity).toHaveBeenCalled();
      expect(forecastApi.getForecastForCoordinate).toHaveBeenCalled();
      expect(forecastApi.fetchNWACForecastForZone).not.toHaveBeenCalled();

      // Should not update description if full product fetch fails
      expect(strava.updateActivity).not.toHaveBeenCalled();
    });

    it('should throw error if activity processing fails (triggers SQS retry)', async () => {
      const event = createSQSEvent(mockWebhookEvent);

      // Mock Strava API error
      vi.mocked(strava.getActivity).mockRejectedValue(new Error('Strava API error'));

      // Should throw error to trigger SQS retry
      await expect(handler(event, {} as any, {} as any)).rejects.toThrow('Strava API error');
    });

    it('should use local date when activity crosses UTC midnight boundary', async () => {
      const event = createSQSEvent(mockWebhookEvent);

      // Mock activity that crosses UTC midnight (11:30 PM local = next day UTC)
      vi.mocked(strava.getActivity).mockResolvedValue(mockMidnightCrossingActivity);

      // Mock forecast response
      const mockForecastProductResponse: ForecastProductResponse = {
        zone: {
          id: 3476,
          zone_id: '10',
          name: 'Mt Hood',
        },
        product: mockMtHoodForecast,
      };
      vi.mocked(forecastApi.getForecastForCoordinate).mockResolvedValue(mockForecastProductResponse as any);

      await handler(event, {} as any, {} as any);

      // Verify forecast was looked up with LOCAL date (April 9), not UTC date (April 10)
      expect(forecastApi.getForecastForCoordinate).toHaveBeenCalledWith(
        { latitude: 45.4, longitude: -121.7 },
        '2025-04-09',  // Local date from start_date_local
        { includeProduct: true }
      );

      // Should update with forecast
      expect(strava.updateActivity).toHaveBeenCalled();
    });

    it('should fallback to UTC date if start_date_local is missing', async () => {
      const event = createSQSEvent(mockWebhookEvent);

      // Mock activity without start_date_local
      const activityWithoutLocal = {
        ...mockBackcountryActivity,
        start_date: '2025-04-10T14:30:00Z',
        start_date_local: null as any,  // Missing local date
      };
      vi.mocked(strava.getActivity).mockResolvedValue(activityWithoutLocal);

      // Mock forecast response
      const mockForecastProductResponse: ForecastProductResponse = {
        zone: {
          id: 3476,
          zone_id: '10',
          name: 'Mt Hood',
        },
        product: mockMtHoodForecast,
      };
      vi.mocked(forecastApi.getForecastForCoordinate).mockResolvedValue(mockForecastProductResponse as any);

      await handler(event, {} as any, {} as any);

      // Should fallback to UTC date when local date is missing
      expect(forecastApi.getForecastForCoordinate).toHaveBeenCalledWith(
        { latitude: 45.4, longitude: -121.7 },
        '2025-04-10',  // UTC date from start_date (fallback)
        { includeProduct: true }
      );
    });
  });

  describe('#avy_forecast command', () => {
    it('should process update events with #avy_forecast command', async () => {
      const event = createSQSEvent(mockUpdateWebhookEvent);

      // Mock activity with #avy_forecast in title
      const activityWithCommand = {
        ...mockBackcountryActivity,
        name: 'Mt Hood Tour #avy_forecast',
      };
      vi.mocked(strava.getActivity).mockResolvedValue(activityWithCommand);

      // Mock forecast response
      const mockForecastProductResponse: ForecastProductResponse = {
        zone: {
          id: 3476,
          zone_id: '10',
          name: 'Mt Hood',
        },
        product: mockMtHoodForecast,
      };
      vi.mocked(forecastApi.getForecastForCoordinate).mockResolvedValue(
        mockForecastProductResponse as any
      );

      await handler(event, {} as any, {} as any);

      expect(forecastApi.getForecastForCoordinate).toHaveBeenCalled();

      // Should remove #avy_forecast from title and update description
      expect(strava.updateActivity).toHaveBeenCalledWith(
        mockUpdateWebhookEvent.object_id,
        mockUpdateWebhookEvent.owner_id,
        expect.objectContaining({
          name: 'Mt Hood Tour',
          description: expect.stringContaining(expectedMtHoodForecastText),
        })
      );
    });

    it('should remove #avy_forecast even when no forecast is available', async () => {
      const event = createSQSEvent(mockUpdateWebhookEvent);

      // Mock activity with #avy_forecast in title
      const activityWithCommand = {
        ...mockBackcountryActivity,
        name: 'Future Tour #avy_forecast',
      };
      vi.mocked(strava.getActivity).mockResolvedValue(activityWithCommand);

      // Mock no forecast available
      const noForecastResponse: ForecastProductResponse = {
        zone: {
          id: 3476,
          zone_id: '10',
          name: 'Mt Hood',
        },
        product: null,
        error: 'No forecast available for this date',
      };
      vi.mocked(forecastApi.getForecastForCoordinate).mockResolvedValue(noForecastResponse as any);

      await handler(event, {} as any, {} as any);

      // Should remove #avy_forecast from title and add error message
      expect(strava.updateActivity).toHaveBeenCalledWith(
        mockUpdateWebhookEvent.object_id,
        mockUpdateWebhookEvent.owner_id,
        expect.objectContaining({
          name: 'Future Tour',
          description: expect.stringContaining('[No avalanche forecast available'),
        })
      );
    });

    it('should work for non-BackcountrySki activities with #avy_forecast', async () => {
      const event = createSQSEvent(mockUpdateWebhookEvent);

      // Mock non-BackcountrySki activity with #avy_forecast
      const hikeActivityWithCommand = {
        ...mockBackcountryActivity,
        type: 'Hike',
        name: 'Hike to summit #avy_forecast',
      };
      vi.mocked(strava.getActivity).mockResolvedValue(hikeActivityWithCommand);

      const mockForecastProductResponse: ForecastProductResponse = {
        zone: {
          id: 3476,
          zone_id: '10',
          name: 'Mt Hood',
        },
        product: mockMtHoodForecast,
      };
      vi.mocked(forecastApi.getForecastForCoordinate).mockResolvedValue(
        mockForecastProductResponse as any
      );

      await handler(event, {} as any, {} as any);

      // Should process even though it's not BackcountrySki
      expect(forecastApi.getForecastForCoordinate).toHaveBeenCalled();
      expect(strava.updateActivity).toHaveBeenCalled();
    });

    it('should refresh existing forecast when #avy_forecast command is used', async () => {
      const event = createSQSEvent(mockUpdateWebhookEvent);

      // Mock activity with existing forecast and #avy_forecast command
      const activityWithOldForecast = {
        ...mockBackcountryActivity,
        name: 'Mt Hood Tour #avy_forecast',
        description: 'Great powder day!\n\nNWAC Mt Hood Zone forecast: 2🟨/2🟨/1🟩 (https://nwac.us/avalanche-forecast/#/forecast/10/166377)',
      };
      vi.mocked(strava.getActivity).mockResolvedValue(activityWithOldForecast);

      // Mock new forecast (different from existing)
      const mockForecastProductResponse: ForecastProductResponse = {
        zone: {
          id: 3476,
          zone_id: '10',
          name: 'Mt Hood',
        },
        product: mockMtHoodForecast, // This has 3/3/2 ratings
      };
      vi.mocked(forecastApi.getForecastForCoordinate).mockResolvedValue(mockForecastProductResponse as any);

      await handler(event, {} as any, {} as any);

      // Should fetch new forecast even though old one exists
      expect(forecastApi.getForecastForCoordinate).toHaveBeenCalled();

      // Should update with new forecast (old one removed, new one added)
      expect(strava.updateActivity).toHaveBeenCalledWith(
        mockUpdateWebhookEvent.object_id,
        mockUpdateWebhookEvent.owner_id,
        expect.objectContaining({
          name: 'Mt Hood Tour', // Command removed
          description: expect.stringContaining(expectedMtHoodForecastText), // New forecast
        })
      );

      // Should NOT contain old forecast
      const updateCall = vi.mocked(strava.updateActivity).mock.calls[0][2];
      expect(updateCall.description).not.toContain('166377'); // Old forecast ID
      expect(updateCall.description).toContain('166378'); // New forecast ID
    });

    it('should remove #avy_forecast and add message for no-location activity', async () => {
      const event = createSQSEvent(mockUpdateWebhookEvent);

      // Mock activity with #avy_forecast but no location
      const activityNoLocationWithCommand = {
        ...mockActivityNoLocation,
        name: 'Indoor Ski Training #avy_forecast',
      };
      vi.mocked(strava.getActivity).mockResolvedValue(activityNoLocationWithCommand);

      await handler(event, {} as any, {} as any);

      // Should NOT look up forecast (no location)
      expect(forecastApi.getForecastForCoordinate).not.toHaveBeenCalled();

      // Should remove command from title and add helpful message
      expect(strava.updateActivity).toHaveBeenCalledWith(
        mockUpdateWebhookEvent.object_id,
        mockUpdateWebhookEvent.owner_id,
        {
          name: 'Indoor Ski Training', // Command removed
          description: expect.stringContaining('[No avalanche forecast available: Activity has no location data]'),
        }
      );
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON in body', async () => {
      const event = createSQSEvent({});
      event.Records[0].body = 'invalid json{';

      // Should throw error to trigger SQS retry
      await expect(handler(event, {} as any, {} as any)).rejects.toThrow();
    });
  });
});
