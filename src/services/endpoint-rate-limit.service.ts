import { Injectable, Optional, Inject } from '@nestjs/common';
import { RedisClient } from '../types/redis.types';
import { REDIS_CLIENT_KEY } from '../api-key.module';
import { ApiKeyLogger } from '../utils/logger.util';

export interface EndpointRateLimitConfig {
  path: string;
  method?: string;
  maxRequests: number;
  windowMs: number;
}

export interface EndpointRateLimitStatus {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Service for endpoint-specific rate limiting.
 */
@Injectable()
export class EndpointRateLimitService {
  private readonly endpointLimits = new Map<string, EndpointRateLimitConfig>();
  private readonly inMemoryCounters = new Map<string, { count: number; resetAt: number }>();

  constructor(@Optional() @Inject(REDIS_CLIENT_KEY) private readonly redisClient?: RedisClient) {}

  /**
   * Registers a rate limit for an endpoint.
   *
   * @param limit - The rate limit configuration
   */
  registerEndpointLimit(limit: EndpointRateLimitConfig): void {
    const key = this.getEndpointKey(limit.path, limit.method);
    this.endpointLimits.set(key, limit);
    ApiKeyLogger.log(
      `Endpoint rate limit registered: ${limit.method || 'ALL'} ${limit.path} - ${limit.maxRequests}/${limit.windowMs}ms`,
      'EndpointRateLimitService',
    );
  }

  /**
   * Checks if a request to an endpoint is within rate limits.
   *
   * @param keyId - The API key ID
   * @param path - The request path
   * @param method - The HTTP method
   * @returns Rate limit status
   */
  async checkEndpointLimit(
    keyId: string,
    path: string,
    method?: string,
  ): Promise<EndpointRateLimitStatus | null> {
    const endpointKey = this.getEndpointKey(path, method);
    const limit = this.endpointLimits.get(endpointKey);

    if (!limit) {
      return null; // No limit for this endpoint
    }

    const counterKey = `endpoint:${keyId}:${endpointKey}`;
    const now = Date.now();

    if (this.redisClient) {
      return await this.checkRedisLimit(counterKey, limit, now);
    } else {
      return this.checkInMemoryLimit(counterKey, limit, now);
    }
  }

  /**
   * Gets all registered endpoint limits.
   *
   * @returns Array of endpoint limits
   */
  getEndpointLimits(): EndpointRateLimitConfig[] {
    return Array.from(this.endpointLimits.values());
  }

  /**
   * Removes an endpoint rate limit.
   *
   * @param path - The endpoint path
   * @param method - Optional HTTP method
   */
  removeEndpointLimit(path: string, method?: string): void {
    const key = this.getEndpointKey(path, method);
    this.endpointLimits.delete(key);
    ApiKeyLogger.log(`Endpoint rate limit removed: ${key}`, 'EndpointRateLimitService');
  }

  private getEndpointKey(path: string, method?: string): string {
    return method ? `${method}:${path}` : `*:${path}`;
  }

  private async checkRedisLimit(
    counterKey: string,
    limit: EndpointRateLimitConfig,
    now: number,
  ): Promise<EndpointRateLimitStatus> {
    try {
      const current = await this.redisClient.get(counterKey);
      const count = current ? parseInt(current, 10) : 0;
      const resetAt = now + limit.windowMs;

      if (count >= limit.maxRequests) {
        return {
          allowed: false,
          limit: limit.maxRequests,
          remaining: 0,
          resetAt,
        };
      }

      // Increment counter
      await this.redisClient.incr(counterKey);
      await this.redisClient.expire(counterKey, Math.ceil(limit.windowMs / 1000));

      return {
        allowed: true,
        limit: limit.maxRequests,
        remaining: limit.maxRequests - count - 1,
        resetAt,
      };
    } catch (error) {
      ApiKeyLogger.error(
        'Redis endpoint rate limit check failed, falling back to in-memory',
        error instanceof Error ? error : String(error),
        'EndpointRateLimitService',
      );
      return this.checkInMemoryLimit(counterKey, limit, now);
    }
  }

  private checkInMemoryLimit(
    counterKey: string,
    limit: EndpointRateLimitConfig,
    now: number,
  ): EndpointRateLimitStatus {
    const entry = this.inMemoryCounters.get(counterKey);
    const resetAt = now + limit.windowMs;

    if (!entry || entry.resetAt <= now) {
      // New or expired counter
      this.inMemoryCounters.set(counterKey, { count: 1, resetAt });
      return {
        allowed: true,
        limit: limit.maxRequests,
        remaining: limit.maxRequests - 1,
        resetAt,
      };
    }

    // Check if already at limit before incrementing
    if (entry.count >= limit.maxRequests) {
      return {
        allowed: false,
        limit: limit.maxRequests,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    // Increment and check
    entry.count++;
    const allowed = entry.count <= limit.maxRequests;
    return {
      allowed,
      limit: limit.maxRequests,
      remaining: allowed ? limit.maxRequests - entry.count : 0,
      resetAt: entry.resetAt,
    };
  }
}
