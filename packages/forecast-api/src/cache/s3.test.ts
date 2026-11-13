import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { S3CacheStore } from './s3.js';

const send = vi.spyOn(S3Client.prototype, 'send');

function body(json: unknown) {
  return { Body: { transformToString: async () => JSON.stringify(json) } };
}

describe('S3CacheStore', () => {
  let cache: S3CacheStore;

  beforeEach(() => {
    send.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cache = new S3CacheStore('bucket', 'forecasts/', 'us-west-2');
  });

  it('writes entries as JSON under <prefix><key>.json', async () => {
    send.mockResolvedValue({} as never);

    await cache.set('caic-v1-date-2026-02-16', { areas: [] }, { expiresAt: null, reason: 'r' });

    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe('bucket');
    expect(command.input.Key).toBe('forecasts/caic-v1-date-2026-02-16.json');
    expect(JSON.parse(command.input.Body as string)).toMatchObject({
      value: { areas: [] },
      expiresAt: null,
      reason: 'r',
    });
  });

  it('reads generic and pre-#61 entries', async () => {
    send.mockResolvedValueOnce(body({ value: 1, cachedAt: '2026-01-01T00:00:00Z', expiresAt: null }) as never);
    send.mockResolvedValueOnce(body({ forecast: null, cachedAt: '2026-01-01T00:00:00Z', expiresAt: null }) as never);

    expect((await cache.get<number>('a'))?.value).toBe(1);
    const legacy = await cache.get<null>('v2-zone-1649-date-2025-01-15');
    expect(legacy).not.toBeNull();
    expect(legacy!.value).toBeNull();

    const command = send.mock.calls[1][0] as GetObjectCommand;
    expect(command.input.Key).toBe('forecasts/v2-zone-1649-date-2025-01-15.json');
  });

  it('treats NoSuchKey as a miss', async () => {
    send.mockRejectedValue(Object.assign(new Error('missing'), { name: 'NoSuchKey' }) as never);
    expect(await cache.get('missing')).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('drops and deletes expired entries', async () => {
    send.mockResolvedValueOnce(
      body({ value: 1, cachedAt: '2026-01-01T00:00:00Z', expiresAt: '2026-01-01T01:00:00Z' }) as never
    );
    send.mockResolvedValueOnce({} as never);

    expect(await cache.get('key')).toBeNull();
    const command = send.mock.calls[1][0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input.Key).toBe('forecasts/key.json');
  });

  it('does not throw on S3 errors', async () => {
    send.mockRejectedValue(new Error('AccessDenied') as never);

    await expect(cache.set('key', 1, { expiresAt: null })).resolves.toBeUndefined();
    await expect(cache.get('key')).resolves.toBeNull();
    await expect(cache.delete('key')).resolves.toBeUndefined();
  });

  it('rejects unsafe keys without calling S3', async () => {
    await cache.set('../other-prefix/key', 1, { expiresAt: null });
    expect(await cache.get('a/b')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
