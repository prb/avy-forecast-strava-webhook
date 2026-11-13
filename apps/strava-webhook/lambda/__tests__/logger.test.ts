/**
 * Tests for the shared structured logger and env helpers
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger, requestSummary } from '../logger.js';
import { requireEnv } from '../env.js';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes one JSON object per line with level and event', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('Something', { activityId: 1 });

    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ level: 'INFO', event: 'Something', activityId: 1 });
  });

  it('uses level ERROR (matched by the processor error metric filter) with message and stack', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('Failed', new Error('boom'), { messageId: 'm1' });

    const line = JSON.parse(err.mock.calls[0][0]);
    expect(line).toMatchObject({ level: 'ERROR', event: 'Failed', error: 'boom', messageId: 'm1' });
    expect(line.stack).toContain('boom');
  });

  it('uses level WARN for warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('Careful');

    expect(JSON.parse(warn.mock.calls[0][0])).toEqual({ level: 'WARN', event: 'Careful' });
  });

  it("doesn't let caller data override level, event, error or stack", () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const clash = { level: 'DEBUG', event: 'Other', error: 'masked', stack: 'fake', extra: 1 };

    logger.info('Info', clash);
    logger.warn('Warn', clash);
    logger.error('Error', new Error('boom'), clash);

    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ level: 'INFO', event: 'Info', extra: 1 });
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ level: 'WARN', event: 'Warn', extra: 1 });
    const line = JSON.parse(err.mock.calls[0][0]);
    expect(line).toMatchObject({ level: 'ERROR', event: 'Error', error: 'boom', extra: 1 });
    expect(line.stack).toContain('boom');
  });

  it('summarizes requests without headers, body or query string', () => {
    const summary = requestSummary({
      httpMethod: 'GET',
      path: '/callback',
      requestContext: { requestId: 'r1' },
      headers: { Authorization: 'secret' },
      queryStringParameters: { code: 'secret' },
      body: 'secret',
    } as never);

    expect(summary).toEqual({ method: 'GET', path: '/callback', requestId: 'r1' });
  });
});

describe('requireEnv', () => {
  afterEach(() => {
    delete process.env.TEST_REQUIRED_VAR;
  });

  it('returns the value when set', () => {
    process.env.TEST_REQUIRED_VAR = 'value';
    expect(requireEnv('TEST_REQUIRED_VAR')).toBe('value');
  });

  it.each([undefined, ''])('throws a clear error when the value is %j', value => {
    if (value !== undefined) process.env.TEST_REQUIRED_VAR = value;
    expect(() => requireEnv('TEST_REQUIRED_VAR')).toThrow(
      'Missing required environment variable TEST_REQUIRED_VAR'
    );
  });
});
