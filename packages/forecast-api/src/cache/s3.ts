import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import type { ForecastProduct } from '../types/index.js';
import type { ForecastCache, CachedForecast } from './types.js';
import { getCacheKey } from './types.js';
import { calculateExpiration, isExpired, getTTLReason } from './ttl.js';

/**
 * S3 cache implementation
 *
 * Stores cache entries as JSON objects in Amazon S3.
 * Supports both environment variable auth (local) and IAM role auth (AWS).
 */
export class S3CacheStore implements ForecastCache {
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
   * Get S3 key for a cache entry
   */
  private getS3Key(zoneId: number, date: string): string {
    const key = getCacheKey(zoneId, date);
    return `${this.prefix}${key}.json`;
  }

  async get(zoneId: number, date: string): Promise<CachedForecast | null> {
    const key = this.getS3Key(zoneId, date);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return null;
      }

      // Read the stream
      const bodyString = await response.Body.transformToString();
      const cached = JSON.parse(bodyString) as CachedForecast;

      // Check if expired
      if (isExpired(cached.expiresAt)) {
        // Delete expired entry
        await this.delete(zoneId, date);
        return null;
      }

      return cached;
    } catch (error: any) {
      // NoSuchKey error means cache miss
      if (error.name === 'NoSuchKey') {
        return null;
      }

      console.error(`S3 cache read error for zone ${zoneId}, date ${date}:`, error);
      return null;
    }
  }

  async set(zoneId: number, date: string, forecast: ForecastProduct | null): Promise<void> {
    const key = this.getS3Key(zoneId, date);
    const now = new Date();
    const expiresAt = calculateExpiration(date, now);

    const cached: CachedForecast = {
      forecast,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      reason: getTTLReason(date, now),
    };

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(cached, null, 2),
        ContentType: 'application/json',
        // Optional: Add metadata for easier debugging
        Metadata: {
          zoneId: zoneId.toString(),
          forecastDate: date,
          hasForecas: forecast ? 'true' : 'false',
        },
      });

      await this.client.send(command);
    } catch (error) {
      console.error(`S3 cache write error for zone ${zoneId}, date ${date}:`, error);
      // Don't throw - cache failure shouldn't break the API
    }
  }

  async delete(zoneId: number, date: string): Promise<void> {
    const key = this.getS3Key(zoneId, date);

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
    } catch (error) {
      console.error(`S3 cache delete error for zone ${zoneId}, date ${date}:`, error);
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
