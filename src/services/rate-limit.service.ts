import { Injectable } from '@nestjs/common';
import { ApiKeyLogger } from '../utils/logger.util';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitStatus {
  remaining: number;
  resetAt: number;
  limit: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limiting service for API keys.
 * For production, consider using Redis for distributed rate limiting.
 */
@Injectable()
export class RateLimitService {
  private readonly rateLimits = new Map<string, RateLimitEntry>();
  private readonly defaultConfig: RateLimitConfig = {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
  };

  /**
   * Checks if a request should be rate limited.
   *
   * @param keyId - The API key ID
   * @param config - Optional custom rate limit configuration
   * @returns true if request should be allowed, false if rate limited
   */
  checkRateLimit(keyId: string, config?: Partial<RateLimitConfig>): boolean {
    const limitConfig: RateLimitConfig = {
      ...this.defaultConfig,
      ...config,
    };

    const now = Date.now();
    const entry = this.rateLimits.get(keyId);

    if (!entry || now >= entry.resetAt) {
      this.rateLimits.set(keyId, {
        count: 1,
        resetAt: now + limitConfig.windowMs,
      });
      return true;
    }

    if (entry.count >= limitConfig.maxRequests) {
      ApiKeyLogger.warn(`Rate limit exceeded for key: ${keyId}`);
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Gets the current rate limit status for a key.
   *
   * @param keyId - The API key ID
   * @param config - Optional custom rate limit configuration
   * @returns Rate limit status information
   */
  getRateLimitStatus(keyId: string, config?: Partial<RateLimitConfig>): RateLimitStatus {
    const limitConfig: RateLimitConfig = {
      ...this.defaultConfig,
      ...config,
    };

    const entry = this.rateLimits.get(keyId);
    const now = Date.now();

    if (!entry || now >= entry.resetAt) {
      return {
        remaining: limitConfig.maxRequests,
        resetAt: now + limitConfig.windowMs,
        limit: limitConfig.maxRequests,
      };
    }

    return {
      remaining: Math.max(0, limitConfig.maxRequests - entry.count),
      resetAt: entry.resetAt,
      limit: limitConfig.maxRequests,
    };
  }

  /**
   * Resets rate limit for a specific key.
   *
   * @param keyId - The API key ID
   */
  resetRateLimit(keyId: string): void {
    this.rateLimits.delete(keyId);
  }

  /**
   * Cleans up expired rate limit entries.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [keyId, entry] of this.rateLimits.entries()) {
      if (now >= entry.resetAt) {
        this.rateLimits.delete(keyId);
      }
    }
  }
}
