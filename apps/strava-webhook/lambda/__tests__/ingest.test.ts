/**
 * Tests for Strava webhook ingest handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../ingest.js';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import * as crypto from 'crypto';

// Mock SQS Client
vi.mock('@aws-sdk/client-sqs', () => {
    const sendMock = vi.fn();
    return {
        SQSClient: vi.fn(() => ({
            send: sendMock,
        })),
        SendMessageCommand: vi.fn(),
        __sendMock: sendMock,
    };
});

describe('Ingest Handler', () => {
    const TEST_CLIENT_SECRET = 'test_secret';

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.STRAVA_VERIFY_TOKEN = 'test_token';
        process.env.STRAVA_CLIENT_SECRET = TEST_CLIENT_SECRET;
        process.env.QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/123456789012/test-queue';
    });

    // Helper to generate signature
    function generateSignature(body: string): string {
        return crypto.createHmac('sha256', TEST_CLIENT_SECRET).update(body).digest('hex');
    }

    describe('GET request (verification)', () => {
        it('should verify webhook subscription with correct token', async () => {
            const event: APIGatewayProxyEvent = {
                httpMethod: 'GET',
                queryStringParameters: {
                    'hub.mode': 'subscribe',
                    'hub.verify_token': 'test_token',
                    'hub.challenge': 'challenge_12345',
                },
            } as any;

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(result.headers?.['Content-Type']).toBe('application/json');
            const body = JSON.parse(result.body);
            expect(body['hub.challenge']).toBe('challenge_12345');
        });

        it('should reject verification with incorrect token', async () => {
            const event: APIGatewayProxyEvent = {
                httpMethod: 'GET',
                queryStringParameters: {
                    'hub.mode': 'subscribe',
                    'hub.verify_token': 'wrong_token',
                    'hub.challenge': 'challenge_12345',
                },
            } as any;

            const result = await handler(event);

            expect(result.statusCode).toBe(403);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Verification failed');
        });

        it('should reject verification with missing parameters', async () => {
            const event: APIGatewayProxyEvent = {
                httpMethod: 'GET',
                queryStringParameters: {},
            } as any;

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Missing verification parameters');
        });
    });

    describe('POST request (webhook events)', () => {
        it('should queue valid webhook event with correct signature', async () => {
            const eventBody = {
                object_type: 'activity',
                object_id: 12345,
                aspect_type: 'create',
            };
            const bodyString = JSON.stringify(eventBody);
            const signature = generateSignature(bodyString);

            const event: APIGatewayProxyEvent = {
                httpMethod: 'POST',
                body: bodyString,
                headers: {
                    'X-Strava-Signature': signature,
                },
            } as any;

            // Mock SQS send success
            const sqsMock = (SQSClient as any)().send;
            sqsMock.mockResolvedValue({});

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(SendMessageCommand).toHaveBeenCalledWith({
                QueueUrl: process.env.QUEUE_URL,
                MessageBody: bodyString,
            });
            expect(sqsMock).toHaveBeenCalled();
        });

        it('should return 400 if signature is missing', async () => {
            const eventBody = {
                object_type: 'activity',
                object_id: 12345,
            };
            const bodyString = JSON.stringify(eventBody);

            const event: APIGatewayProxyEvent = {
                httpMethod: 'POST',
                body: bodyString,
                headers: {}, // No signature
            } as any;

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Invalid or missing signature');
        });

        it('should return 400 if signature is invalid', async () => {
            const eventBody = {
                object_type: 'activity',
                object_id: 12345,
            };
            const bodyString = JSON.stringify(eventBody);

            const event: APIGatewayProxyEvent = {
                httpMethod: 'POST',
                body: bodyString,
                headers: {
                    'X-Strava-Signature': 'invalid_signature',
                },
            } as any;

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Invalid or missing signature');
        });

        it('should return 500 if SQS send fails', async () => {
            const eventBody = {
                object_type: 'activity',
                object_id: 12345,
            };
            const bodyString = JSON.stringify(eventBody);
            const signature = generateSignature(bodyString);

            const event: APIGatewayProxyEvent = {
                httpMethod: 'POST',
                body: bodyString,
                headers: {
                    'X-Strava-Signature': signature,
                },
            } as any;

            // Mock SQS send failure
            const sqsMock = (SQSClient as any)().send;
            sqsMock.mockRejectedValue(new Error('SQS Error'));

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Failed to queue event');
        });

        it('should handle missing body', async () => {
            const event: APIGatewayProxyEvent = {
                httpMethod: 'POST',
                body: null,
            } as any;

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Missing request body');
        });
    });

    describe('Other methods', () => {
        it('should return 405 for unsupported methods', async () => {
            const event: APIGatewayProxyEvent = {
                httpMethod: 'PUT',
            } as any;

            const result = await handler(event);

            expect(result.statusCode).toBe(405);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Method not allowed');
        });
    });
});
