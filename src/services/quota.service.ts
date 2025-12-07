import { Injectable, Inject, Optional } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { ApiKeyLogger } from '../utils/logger.util';
import { API_KEY_ADAPTER } from '../api-key.module';
import { RedisClient } from '../types/redis.types';
import { REDIS_CLIENT_KEY } from '../api-key.module';

export interface QuotaStatus {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  resetAt: Date;
}

export type QuotaPeriod = 'daily' | 'monthly' | 'yearly';

/**
 * Service for managing and enforcing usage quotas for API keys.
 */
@Injectable()
export class QuotaService {
  private readonly inMemoryQuotas = new Map<
    string,
    {
      used: number;
      resetAt: Date;
    }
  >();

  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Optional() @Inject(REDIS_CLIENT_KEY) private readonly redisClient?: RedisClient,
  ) {}

  /**
   * Checks if a request is within quota limits.
   *
   * @param apiKey - The API key to check
   * @returns Quota status
   */
  async checkQuota(apiKey: ApiKey): Promise<QuotaStatus> {
    if (!apiKey.quotaMax || !apiKey.quotaPeriod) {
      // No quota set, allow request
      return {
        allowed: true,
        limit: 0,
        used: 0,
        remaining: Infinity,
        resetAt: new Date(Date.now() + 86400000), // Default to 24 hours
      };
    }

    const now = new Date();
    let resetAt = apiKey.quotaResetAt || this.calculateResetAt(now, apiKey.quotaPeriod);

    // Check if quota period has reset
    if (resetAt <= now) {
      resetAt = this.calculateResetAt(now, apiKey.quotaPeriod);
      await this.resetQuota(apiKey.id, resetAt);
      apiKey.quotaUsed = 0;
      apiKey.quotaResetAt = resetAt;
    }

    const used = apiKey.quotaUsed || 0;
    const limit = apiKey.quotaMax;
    const remaining = Math.max(0, limit - used - 1);
    const allowed = used < limit;

    return {
      allowed,
      limit,
      used,
      remaining,
      resetAt,
    };
  }

  /**
   * Increments the usage count for an API key.
   *
   * @param keyId - The API key ID
   * @param quotaMax - Maximum quota
   * @param quotaPeriod - Quota period
   */
  async incrementUsage(keyId: string, quotaMax: number, quotaPeriod: QuotaPeriod): Promise<void> {
    try {
      if (this.redisClient) {
        await this.incrementUsageRedis(keyId, quotaMax, quotaPeriod);
      } else {
        await this.incrementUsageInMemory(keyId, quotaMax, quotaPeriod);
      }

      // Update database
      const apiKey = await this.adapter.findById(keyId);
      if (apiKey && apiKey.quotaMax) {
        const resetAt = apiKey.quotaResetAt || this.calculateResetAt(new Date(), quotaPeriod);

        // Check if we need to reset
        if (resetAt <= new Date()) {
          const newResetAt = this.calculateResetAt(new Date(), quotaPeriod);
          await this.resetQuota(keyId, newResetAt);
        } else {
          // Update adapter to increment quotaUsed
          // Note: This requires adding updateQuotaUsed method to adapter
          // For now, we'll track in memory/Redis and sync periodically
        }
      }
    } catch (error) {
      ApiKeyLogger.error(
        `Failed to increment quota usage for key ${keyId}`,
        error instanceof Error ? error : String(error),
        'QuotaService',
      );
    }
  }

  /**
   * Resets the quota for an API key.
   *
   * @param keyId - The API key ID
   * @param resetAt - When the quota resets
   */
  async resetQuota(keyId: string, resetAt: Date): Promise<void> {
    try {
      if (this.redisClient) {
        const redisKey = `quota:${keyId}`;
        await this.redisClient.set(redisKey, '0');
        await this.redisClient.expire(redisKey, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
      } else {
        this.inMemoryQuotas.delete(keyId);
      }
    } catch (error) {
      ApiKeyLogger.error(
        `Failed to reset quota for key ${keyId}`,
        error instanceof Error ? error : String(error),
        'QuotaService',
      );
    }
  }

  /**
   * Gets the current quota status for an API key.
   *
   * @param keyId - The API key ID
   * @returns Quota status or null if no quota set
   */
  async getQuotaStatus(keyId: string): Promise<QuotaStatus | null> {
    const apiKey = await this.adapter.findById(keyId);
    if (!apiKey || !apiKey.quotaMax || !apiKey.quotaPeriod) {
      return null;
    }

    return await this.checkQuota(apiKey);
  }

  private calculateResetAt(now: Date, period: QuotaPeriod): Date {
    const resetAt = new Date(now);

    switch (period) {
      case 'daily':
        resetAt.setDate(resetAt.getDate() + 1);
        resetAt.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        resetAt.setMonth(resetAt.getMonth() + 1);
        resetAt.setDate(1);
        resetAt.setHours(0, 0, 0, 0);
        break;
      case 'yearly':
        resetAt.setFullYear(resetAt.getFullYear() + 1);
        resetAt.setMonth(0);
        resetAt.setDate(1);
        resetAt.setHours(0, 0, 0, 0);
        break;
    }

    return resetAt;
  }

  private async incrementUsageRedis(
    keyId: string,
    quotaMax: number,
    quotaPeriod: QuotaPeriod,
  ): Promise<void> {
    try {
      const redisKey = `quota:${keyId}`;
      const now = new Date();
      const resetAt = this.calculateResetAt(now, quotaPeriod);
      const ttl = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);

      const current = await this.redisClient.get(redisKey);
      const used = current ? parseInt(current, 10) : 0;

      if (used >= quotaMax) {
        return; // Already at limit
      }

      await this.redisClient.incr(redisKey);
      await this.redisClient.expire(redisKey, ttl);
    } catch (error) {
      ApiKeyLogger.error(
        'Redis quota increment failed, falling back to in-memory',
        error instanceof Error ? error : String(error),
        'QuotaService',
      );
      await this.incrementUsageInMemory(keyId, quotaMax, quotaPeriod);
    }
  }

  private async incrementUsageInMemory(
    keyId: string,
    quotaMax: number,
    quotaPeriod: QuotaPeriod,
  ): Promise<void> {
    const now = new Date();
    const entry = this.inMemoryQuotas.get(keyId);

    if (!entry || entry.resetAt <= now) {
      const resetAt = this.calculateResetAt(now, quotaPeriod);
      this.inMemoryQuotas.set(keyId, {
        used: 1,
        resetAt,
      });
    } else {
      entry.used++;
      if (entry.used > quotaMax) {
        entry.used = quotaMax; // Cap at max
      }
    }
  }
}
