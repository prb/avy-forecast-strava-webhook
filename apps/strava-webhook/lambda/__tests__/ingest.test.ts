/**
 * Tests for Strava webhook ingest handler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../ingest.js';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// Mock SQS Client
vi.mock('@aws-sdk/client-sqs', () => {
    const sendMock = vi.fn();
    return {
        // A function, not an arrow: vitest 4+ mocks are only constructible
        // with `new` when their implementation is
        SQSClient: vi.fn(function () {
            return { send: sendMock };
        }),
        SendMessageCommand: vi.fn(),
        __sendMock: sendMock,
    };
});

describe('Ingest Handler', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.STRAVA_VERIFY_TOKEN = 'test_token';
        process.env.QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/123456789012/test-queue';
    });

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
        it('should queue valid webhook event', async () => {
            const eventBody = {
                object_type: 'activity',
                object_id: 12345,
                aspect_type: 'create',
            };

            const event: APIGatewayProxyEvent = {
                httpMethod: 'POST',
                body: JSON.stringify(eventBody),
                headers: {},
            } as any;

            // Mock SQS send success
            const sqsMock = (SQSClient as any)().send;
            sqsMock.mockResolvedValue({});

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(SendMessageCommand).toHaveBeenCalledWith({
                QueueUrl: process.env.QUEUE_URL,
                MessageBody: JSON.stringify(eventBody),
            });
            expect(sqsMock).toHaveBeenCalled();
        });

        it('should ignore delete events (return 200 but not queue)', async () => {
            const eventBody = {
                object_type: 'activity',
                object_id: 12345,
                aspect_type: 'delete',
            };

            const event: APIGatewayProxyEvent = {
                httpMethod: 'POST',
                body: JSON.stringify(eventBody),
                headers: {},
            } as any;

            const sqsMock = (SQSClient as any)().send;

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.message).toContain('ignored');
            expect(sqsMock).not.toHaveBeenCalled();
        });

        it('should ignore non-activity events', async () => {
            const eventBody = {
                object_type: 'athlete', // Not activity
                object_id: 12345,
                aspect_type: 'update',
            };

            const event: APIGatewayProxyEvent = {
                httpMethod: 'POST',
                body: JSON.stringify(eventBody),
                headers: {},
            } as any;

            const sqsMock = (SQSClient as any)().send;

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.message).toContain('ignored');
            expect(sqsMock).not.toHaveBeenCalled();
        });

        it('should return 500 if SQS send fails', async () => {
            const eventBody = {
                object_type: 'activity',
                object_id: 12345,
                aspect_type: 'create',
            };

            const event: APIGatewayProxyEvent = {
                httpMethod: 'POST',
                body: JSON.stringify(eventBody),
                headers: {},
            } as any;

            // Mock SQS send failure
            const sqsMock = (SQSClient as any)().send;
            sqsMock.mockRejectedValue(new Error('SQS Error'));

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.error).toBe('Failed to queue event');
        });

        it('should not log the verify token or request headers', async () => {
            const log = vi.spyOn(console, 'log');
            const warn = vi.spyOn(console, 'warn');

            await handler({
                httpMethod: 'GET',
                headers: { Authorization: 'Bearer header-secret' },
                queryStringParameters: {
                    'hub.mode': 'subscribe',
                    'hub.verify_token': 'token-secret',
                    'hub.challenge': 'c',
                },
            } as unknown as APIGatewayProxyEvent);

            const logged = [...log.mock.calls, ...warn.mock.calls].flat().join('\n');
            expect(logged).not.toContain('token-secret');
            expect(logged).not.toContain('header-secret');
        });

        it('should not return internal error details on unexpected failures', async () => {
            // Non-enumerable so request logging doesn't trip it; the handler logic does
            const event = { httpMethod: 'GET', headers: {} } as unknown as APIGatewayProxyEvent;
            Object.defineProperty(event, 'queryStringParameters', {
                enumerable: false,
                get(): never {
                    throw new Error('secret internal detail');
                },
            });

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
            expect(result.body).not.toContain('secret internal detail');
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
