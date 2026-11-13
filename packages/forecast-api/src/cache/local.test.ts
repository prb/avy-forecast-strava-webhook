import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalCacheStore } from './local.js';

const PERMANENT = { expiresAt: null };

describe('LocalCacheStore', () => {
  let testCacheDir: string;
  let cache: LocalCacheStore;

  beforeEach(async () => {
    testCacheDir = await mkdtemp(join(tmpdir(), 'local-cache-test-'));
    cache = new LocalCacheStore(testCacheDir);
    // Failures are logged by design; keep test output readable
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(testCacheDir, { recursive: true, force: true });
  });

  describe('set and get', () => {
    it('stores and reads values of different types', async () => {
      const bundle = { areas: [{ id: 'a1' }], products: [{ areaId: 'a1', rating: 'low' }] };

      await cache.set('object-key', bundle, PERMANENT);
      await cache.set('string-key', 'hello', PERMANENT);
      await cache.set('null-key', null, PERMANENT);

      expect((await cache.get<typeof bundle>('object-key'))?.value).toEqual(bundle);
      expect((await cache.get<string>('string-key'))?.value).toBe('hello');

      const nullEntry = await cache.get<null>('null-key');
      expect(nullEntry).not.toBeNull();
      expect(nullEntry!.value).toBeNull();
    });

    it('records when and why an entry was cached', async () => {
      const expiresAt = new Date(Date.now() + 60_000);

      await cache.set('key', 1, { expiresAt, reason: 'test reason' });
      const entry = await cache.get<number>('key');

      expect(entry!.cachedAt).toBeDefined();
      expect(entry!.expiresAt).toBe(expiresAt.toISOString());
      expect(entry!.reason).toBe('test reason');
    });

    it('stores entries as <key>.json in the cache directory', async () => {
      await cache.set('v2-zone-1649-date-2026-02-16', null, PERMANENT);
      expect(existsSync(join(testCacheDir, 'v2-zone-1649-date-2026-02-16.json'))).toBe(true);
    });

    it('returns null for a cache miss', async () => {
      expect(await cache.get('missing')).toBeNull();
    });
  });

  describe('expiration', () => {
    it('keeps permanent entries', async () => {
      await cache.set('key', 'value', PERMANENT);
      expect((await cache.get('key'))?.expiresAt).toBeNull();
    });

    it('drops and deletes expired entries', async () => {
      await cache.set('key', 'value', { expiresAt: new Date(Date.now() - 1000) });

      expect(await cache.get('key')).toBeNull();
      expect(existsSync(join(testCacheDir, 'key.json'))).toBe(false);
    });
  });

  describe('legacy entries', () => {
    it('reads pre-#61 zone forecast entries stored under "forecast"', async () => {
      const legacy = {
        forecast: { id: 166672 },
        cachedAt: '2025-01-20T12:00:00Z',
        expiresAt: null,
        reason: 'Old forecast - cached permanently',
      };
      await writeFile(join(testCacheDir, 'v2-zone-1648-date-2025-01-15.json'), JSON.stringify(legacy));

      const entry = await cache.get<{ id: number }>('v2-zone-1648-date-2025-01-15');

      expect(entry).toEqual({
        value: { id: 166672 },
        cachedAt: '2025-01-20T12:00:00Z',
        expiresAt: null,
        reason: 'Old forecast - cached permanently',
      });
    });

    it('writes new entries under "value"', async () => {
      await cache.set('key', 42, PERMANENT);
      const stored = JSON.parse(await readFile(join(testCacheDir, 'key.json'), 'utf-8'));
      expect(stored.value).toBe(42);
      expect(stored).not.toHaveProperty('forecast');
    });
  });

  describe('keys', () => {
    it.each(['../escape', 'a/b', '', '..', 'has space'])(
      'rejects unsafe key %j without throwing or writing outside the cache directory',
      async key => {
        await expect(cache.set(key, 'value', PERMANENT)).resolves.toBeUndefined();
        expect(await cache.get(key)).toBeNull();
        expect(existsSync(join(testCacheDir, '..', 'escape.json'))).toBe(false);
      }
    );
  });

  describe('delete', () => {
    it('deletes a cached entry', async () => {
      await cache.set('key', null, PERMANENT);
      expect(await cache.get('key')).not.toBeNull();

      await cache.delete('key');
      expect(await cache.get('key')).toBeNull();
    });

    it('does not throw when deleting a missing entry', async () => {
      await expect(cache.delete('missing')).resolves.toBeUndefined();
    });
  });

  describe('clear', () => {
    it('clears all cache entries', async () => {
      await cache.set('a', 1, PERMANENT);
      await cache.set('b', 2, PERMANENT);

      await cache.clear();

      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBeNull();
    });
  });

  describe('error handling', () => {
    it('treats a corrupted file as a miss', async () => {
      await writeFile(join(testCacheDir, 'key.json'), 'invalid json{{{', 'utf-8');
      expect(await cache.get('key')).toBeNull();
    });

    it('treats JSON that is not a cache entry as a miss', async () => {
      await writeFile(join(testCacheDir, 'key.json'), JSON.stringify({ hello: 'world' }), 'utf-8');
      expect(await cache.get('key')).toBeNull();
    });
  });
});
