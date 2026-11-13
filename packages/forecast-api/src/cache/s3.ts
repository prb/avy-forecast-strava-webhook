import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import type { CacheEntry, CacheSetOptions, CacheStore } from './types.js';
import { assertValidCacheKey, buildCacheEntry, parseCacheEntry } from './types.js';
import { isExpired } from './ttl.js';

/**
 * S3 cache implementation
 *
 * Stores each entry as a JSON object named after its key, under the prefix.
 * Supports both environment variable auth (local) and IAM role auth (AWS).
 */
export class S3CacheStore implements CacheStore {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(bucket: string, prefix: string = 'forecasts/', region?: string) {
    this.bucket = bucket;
    this.prefix = prefix;

    // S3 client will automatically use:
    // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) for local
    // 2. IAM role credentials when running on AWS (ECS, Lambda, EC2)
    this.client = new S3Client({
      region: region || process.env.AWS_REGION || 'us-west-2',
    });
  }

  /**
   * Get S3 object key for a cache entry
   */
  private getS3Key(key: string): string {
    assertValidCacheKey(key);
    return `${this.prefix}${key}.json`;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.getS3Key(key) })
      );

      if (!response.Body) {
        return null;
      }

      const cached = parseCacheEntry<T>(await response.Body.transformToString());
      if (!cached) {
        return null;
      }

      if (isExpired(cached.expiresAt)) {
        await this.delete(key);
        return null;
      }

      return cached;
    } catch (error: unknown) {
      // NoSuchKey error means cache miss
      if (error instanceof Error && error.name === 'NoSuchKey') {
        return null;
      }

      console.error(`S3 cache read error for ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheSetOptions): Promise<void> {
    try {
      const entry = buildCacheEntry(value, options);
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.getS3Key(key),
          Body: JSON.stringify(entry, null, 2),
          ContentType: 'application/json',
        })
      );
    } catch (error) {
      // Don't throw - cache failure shouldn't break the API
      console.error(`S3 cache write error for ${key}:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: this.getS3Key(key) })
      );
    } catch (error) {
      console.error(`S3 cache delete error for ${key}:`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      // List all objects with the prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
      });

      const listResponse = await this.client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return;
      }

      // Delete all objects
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: listResponse.Contents.map(obj => ({ Key: obj.Key! })),
        },
      });

      await this.client.send(deleteCommand);
    } catch (error) {
      console.error('S3 cache clear error:', error);
    }
  }

  /**
   * Get S3 bucket name
   */
  getBucket(): string {
    return this.bucket;
  }

  /**
   * Get S3 key prefix
   */
  getPrefix(): string {
    return this.prefix;
  }
}
