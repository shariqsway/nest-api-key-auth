import { Injectable, Optional, Inject } from '@nestjs/common';
import { ApiKey } from '../interfaces';
import { ApiKeyLogger } from '../utils/logger.util';
import { RedisClient } from '../types/redis.types';

export const REDIS_CLIENT_KEY = 'REDIS_CLIENT';

/**
 * Redis-based cache service for distributed systems.
 * Falls back to in-memory if Redis is not available.
 */
@Injectable()
export class RedisCacheService {
  private redisClient: RedisClient | null;
  private readonly inMemoryCache = new Map<string, { key: ApiKey; expiresAt: number }>();
  private readonly defaultTtl = 5 * 60 * 1000;

  constructor(@Optional() @Inject(REDIS_CLIENT_KEY) redisClient?: RedisClient) {
    this.redisClient = redisClient;
    if (this.redisClient) {
      ApiKeyLogger.log('Redis caching enabled', 'RedisCacheService');
    } else {
      ApiKeyLogger.warn(
        'Redis not available, falling back to in-memory caching',
        'RedisCacheService',
      );
    }
  }

  /**
   * Gets a cached API key by ID.
   *
   * @param keyId - The API key ID
   * @returns The cached API key or null
   */
  async get(keyId: string): Promise<ApiKey | null> {
    if (this.redisClient) {
      return await this.getFromRedis(keyId);
    }
    return this.getFromMemory(keyId);
  }

  private async getFromRedis(keyId: string): Promise<ApiKey | null> {
    try {
      const cached = await this.redisClient.get(`apikey:${keyId}`);
      if (!cached) {
        return null;
      }
      return JSON.parse(cached) as ApiKey;
    } catch (error) {
      ApiKeyLogger.error(
        'Redis get failed',
        error instanceof Error ? error : String(error),
        'RedisCacheService',
      );
      return this.getFromMemory(keyId);
    }
  }

  private getFromMemory(keyId: string): ApiKey | null {
    const entry = this.inMemoryCache.get(keyId);
    if (!entry) {
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.inMemoryCache.delete(keyId);
      return null;
    }
    return entry.key;
  }

  /**
   * Gets cached API keys by prefix.
   *
   * @param prefix - The key prefix
   * @returns Array of matching API keys
   */
  async getByPrefix(prefix: string): Promise<ApiKey[]> {
    if (this.redisClient) {
      return await this.getByPrefixFromRedis(prefix);
    }
    return this.getByPrefixFromMemory(prefix);
  }

  private async getByPrefixFromRedis(prefix: string): Promise<ApiKey[]> {
    try {
      const keys = await this.redisClient.keys(`apikey:prefix:${prefix}:*`);
      if (keys.length === 0) {
        return [];
      }
      const values = await this.redisClient.mget(keys as string[]);
      return values
        .filter((v: string | null) => v !== null)
        .map((v: string) => JSON.parse(v) as ApiKey);
    } catch (error) {
      ApiKeyLogger.error(
        'Redis prefix lookup failed',
        error instanceof Error ? error : String(error),
        'RedisCacheService',
      );
      return this.getByPrefixFromMemory(prefix);
    }
  }

  private getByPrefixFromMemory(prefix: string): ApiKey[] {
    const now = Date.now();
    const keys: ApiKey[] = [];
    for (const [keyId, entry] of this.inMemoryCache.entries()) {
      if (now >= entry.expiresAt) {
        this.inMemoryCache.delete(keyId);
        continue;
      }
      if (entry.key.keyPrefix === prefix) {
        keys.push(entry.key);
      }
    }
    return keys;
  }

  /**
   * Sets a cached API key.
   *
   * @param key - The API key to cache
   * @param ttlMs - Optional TTL in milliseconds
   */
  async set(key: ApiKey, ttlMs?: number): Promise<void> {
    if (this.redisClient) {
      await this.setInRedis(key, ttlMs);
    }
    this.setInMemory(key, ttlMs);
  }

  private async setInRedis(key: ApiKey, ttlMs?: number): Promise<void> {
    try {
      const ttl = ttlMs || this.defaultTtl;
      const serialized = JSON.stringify(key);
      await this.redisClient.setex(`apikey:${key.id}`, Math.ceil(ttl / 1000), serialized);
      if (key.keyPrefix) {
        await this.redisClient.setex(
          `apikey:prefix:${key.keyPrefix}:${key.id}`,
          Math.ceil(ttl / 1000),
          serialized,
        );
      }
    } catch (error) {
      ApiKeyLogger.error(
        'Redis set failed',
        error instanceof Error ? error : String(error),
        'RedisCacheService',
      );
    }
  }

  private setInMemory(key: ApiKey, ttlMs?: number): void {
    const ttl = ttlMs || this.defaultTtl;
    this.inMemoryCache.set(key.id, {
      key,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Sets multiple API keys in cache.
   *
   * @param keys - Array of API keys
   * @param ttlMs - Optional TTL in milliseconds
   */
  async setMany(keys: ApiKey[], ttlMs?: number): Promise<void> {
    await Promise.all(keys.map((key) => this.set(key, ttlMs)));
  }

  /**
   * Invalidates a cached API key.
   *
   * @param keyId - The API key ID
   */
  async invalidate(keyId: string): Promise<void> {
    if (this.redisClient) {
      try {
        const key = await this.get(keyId);
        await this.redisClient.del(`apikey:${keyId}`);
        if (key?.keyPrefix) {
          await this.redisClient.del(`apikey:prefix:${key.keyPrefix}:${keyId}`);
        }
      } catch (error) {
        ApiKeyLogger.error(
          'Redis invalidate failed',
          error instanceof Error ? error : String(error),
          'RedisCacheService',
        );
      }
    }
    this.inMemoryCache.delete(keyId);
  }

  /**
   * Clears all cached entries.
   */
  async clear(): Promise<void> {
    if (this.redisClient) {
      try {
        const keys = await this.redisClient.keys('apikey:*');
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      } catch (error) {
        ApiKeyLogger.error(
          'Redis clear failed',
          error instanceof Error ? error : String(error),
          'RedisCacheService',
        );
      }
    }
    this.inMemoryCache.clear();
  }
}
