import { Injectable } from '@nestjs/common';
import { ApiKeyLogger } from '../utils/logger.util';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitStatus {
  allowed: boolean;
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
   * @param maxRequests - Maximum requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns Rate limit status
   */
  checkRateLimit(keyId: string, maxRequests: number, windowMs: number): RateLimitStatus {
    const now = Date.now();
    const entry = this.rateLimits.get(keyId);

    if (!entry || now >= entry.resetAt) {
      const resetAt = now + windowMs;
      this.rateLimits.set(keyId, {
        count: 1,
        resetAt,
      });
      return {
        allowed: true,
        limit: maxRequests,
        remaining: maxRequests - 1,
        resetAt,
      };
    }

    if (entry.count >= maxRequests) {
      ApiKeyLogger.warn(`Rate limit exceeded for key: ${keyId}`);
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
   * Gets the current rate limit status for a key.
   *
   * @param keyId - The API key ID
   * @param maxRequests - Maximum requests allowed
   * @param windowMs - Time window in milliseconds
   * @returns Rate limit status information
   */
  getRateLimitStatus(keyId: string, maxRequests: number, windowMs: number): RateLimitStatus {
    const entry = this.rateLimits.get(keyId);
    const now = Date.now();

    if (!entry || now >= entry.resetAt) {
      return {
        allowed: true,
        remaining: maxRequests,
        resetAt: now + windowMs,
        limit: maxRequests,
      };
    }

    return {
      allowed: entry.count < maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
      resetAt: entry.resetAt,
      limit: maxRequests,
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
