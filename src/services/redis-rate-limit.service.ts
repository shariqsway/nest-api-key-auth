import { Injectable, Optional, Inject } from '@nestjs/common';
import { ApiKeyLogger } from '../utils/logger.util';
import { RateLimitConfig, RateLimitStatus } from './rate-limit.service';
import { RedisClient } from '../types/redis.types';

export const REDIS_CLIENT_KEY = 'REDIS_CLIENT';

/**
 * Redis-based rate limiting service for distributed systems.
 * Falls back to in-memory if Redis is not available.
 */
@Injectable()
export class RedisRateLimitService {
  private redisClient: RedisClient | null;
  private readonly inMemoryCache = new Map<string, { count: number; resetAt: number }>();
  private readonly defaultConfig: RateLimitConfig = {
    maxRequests: 100,
    windowMs: 60000,
  };

  constructor(@Optional() @Inject(REDIS_CLIENT_KEY) redisClient?: RedisClient) {
    this.redisClient = redisClient;
    if (this.redisClient) {
      ApiKeyLogger.log('Redis rate limiting enabled', 'RedisRateLimitService');
    } else {
      ApiKeyLogger.warn(
        'Redis not available, falling back to in-memory rate limiting',
        'RedisRateLimitService',
      );
    }
  }

  /**
   * Checks rate limit using Redis or in-memory fallback.
   *
   * @param keyId - The API key ID
   * @param maxRequests - Maximum requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns Rate limit status
   */
  async checkRateLimit(
    keyId: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<RateLimitStatus> {
    if (this.redisClient) {
      return await this.checkWithRedis(keyId, maxRequests, windowMs);
    }
    return this.checkInMemory(keyId, maxRequests, windowMs);
  }

  private async checkWithRedis(
    keyId: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<RateLimitStatus> {
    try {
      const redisKey = `ratelimit:${keyId}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      const pipeline = this.redisClient.pipeline();
      pipeline.zremrangebyscore(redisKey, 0, windowStart);
      pipeline.zcard(redisKey);
      pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
      pipeline.expire(redisKey, Math.ceil(windowMs / 1000));
      const results = await pipeline.exec();

      if (!results || results.length < 2) {
        ApiKeyLogger.warn(
          'Redis pipeline failed, falling back to in-memory',
          'RedisRateLimitService',
        );
        return this.checkInMemory(keyId, maxRequests, windowMs);
      }

      const currentCount = results[1][1] as number;
      const remaining = Math.max(0, maxRequests - currentCount - 1);
      const resetAt = now + windowMs;

      // Check if we've already hit the limit before adding this request
      const allowed = currentCount < maxRequests;

      return {
        allowed,
        limit: maxRequests,
        remaining,
        resetAt,
      };
    } catch (error) {
      ApiKeyLogger.error(
        'Redis rate limit check failed',
        error instanceof Error ? error : String(error),
        'RedisRateLimitService',
      );
      return this.checkInMemory(keyId, maxRequests, windowMs);
    }
  }

  private checkInMemory(keyId: string, maxRequests: number, windowMs: number): RateLimitStatus {
    const now = Date.now();
    const entry = this.inMemoryCache.get(keyId);

    if (!entry || now >= entry.resetAt) {
      this.inMemoryCache.set(keyId, {
        count: 1,
        resetAt: now + windowMs,
      });
      return {
        allowed: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        resetAt: now + windowMs,
      };
    }

    if (entry.count >= maxRequests) {
      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    entry.count++;
    return {
      allowed: true,
      limit: maxRequests,
      remaining: maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Resets rate limit for a key.
   *
   * @param keyId - The API key ID
   */
  async resetRateLimit(keyId: string): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.del(`ratelimit:${keyId}`);
      } catch (error) {
        ApiKeyLogger.error(
          'Failed to reset Redis rate limit',
          error instanceof Error ? error : String(error),
        );
      }
    }
    this.inMemoryCache.delete(keyId);
  }
}
