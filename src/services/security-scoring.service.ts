import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { API_KEY_ADAPTER } from '../api-key.module';
import { AnalyticsService, ANALYTICS_SERVICE_TOKEN } from './analytics.service';

export interface SecurityScore {
  keyId: string;
  score: number; // 0-100, higher is more secure
  factors: {
    age: number; // Older keys are less secure
    lastUsed: number; // Recently used keys are more secure
    usagePattern: number; // Consistent patterns are more secure
    failureRate: number; // High failure rate is less secure
    ipRestrictions: number; // IP restrictions increase security
    expiration: number; // Expiration increases security
  };
  recommendations: string[];
}

/**
 * Service for calculating security scores for API keys.
 */
@Injectable()
export class SecurityScoringService {
  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Inject(ANALYTICS_SERVICE_TOKEN) private readonly analyticsService?: AnalyticsService,
  ) {}

  /**
   * Calculates a security score for an API key.
   *
   * @param keyId - The API key ID
   * @returns Security score
   */
  async calculateSecurityScore(keyId: string): Promise<SecurityScore> {
    const key = await this.adapter.findById(keyId);
    if (!key) {
      throw new Error(`Key ${keyId} not found`);
    }

    const metrics = this.analyticsService ? await this.analyticsService.getKeyMetrics(keyId) : null;

    const recommendations: string[] = [];
    const factors = {
      age: this.calculateAgeScore(key),
      lastUsed: this.calculateLastUsedScore(key),
      usagePattern: this.calculateUsagePatternScore(key, metrics),
      failureRate: this.calculateFailureRateScore(metrics),
      ipRestrictions: this.calculateIpRestrictionScore(key),
      expiration: this.calculateExpirationScore(key),
    };

    // Calculate overall score (weighted average)
    const weights = {
      age: 0.15,
      lastUsed: 0.15,
      usagePattern: 0.2,
      failureRate: 0.2,
      ipRestrictions: 0.15,
      expiration: 0.15,
    };

    const score =
      factors.age * weights.age +
      factors.lastUsed * weights.lastUsed +
      factors.usagePattern * weights.usagePattern +
      factors.failureRate * weights.failureRate +
      factors.ipRestrictions * weights.ipRestrictions +
      factors.expiration * weights.expiration;

    // Generate recommendations
    if (factors.age < 50) {
      recommendations.push('Consider rotating this key - it is quite old');
    }

    if (factors.lastUsed < 30) {
      recommendations.push('Key has not been used recently - consider revoking if unused');
    }

    if (factors.ipRestrictions < 50) {
      recommendations.push('Add IP whitelist restrictions for better security');
    }

    if (factors.expiration < 50) {
      recommendations.push('Set an expiration date for this key');
    }

    if (factors.failureRate < 50 && metrics) {
      recommendations.push('High failure rate detected - investigate potential security issues');
    }

    return {
      keyId,
      score: Math.round(score),
      factors,
      recommendations,
    };
  }

  private calculateAgeScore(key: ApiKey): number {
    const ageInDays = (Date.now() - key.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    // Keys older than 365 days get lower scores
    if (ageInDays > 365) return 30;
    if (ageInDays > 180) return 50;
    if (ageInDays > 90) return 70;
    return 100;
  }

  private calculateLastUsedScore(key: ApiKey): number {
    if (!key.lastUsedAt) return 0;

    const daysSinceLastUse = (Date.now() - key.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastUse > 90) return 20;
    if (daysSinceLastUse > 30) return 50;
    if (daysSinceLastUse > 7) return 80;
    return 100;
  }

  private calculateUsagePatternScore(
    key: ApiKey,
    metrics: { requestCount: number; successCount: number } | null,
  ): number {
    if (!metrics || metrics.requestCount === 0) return 50;

    // Consistent usage is better
    const consistency = metrics.successCount / metrics.requestCount;
    return Math.round(consistency * 100);
  }

  private calculateFailureRateScore(
    metrics: { requestCount: number; failureCount: number } | null,
  ): number {
    if (!metrics || metrics.requestCount === 0) return 100;

    const failureRate = metrics.failureCount / metrics.requestCount;
    // Lower failure rate is better
    return Math.round((1 - failureRate) * 100);
  }

  private calculateIpRestrictionScore(key: ApiKey): number {
    let score = 50; // Base score

    if (key.ipWhitelist && key.ipWhitelist.length > 0) {
      score += 30; // IP whitelist increases security
    }

    if (key.ipBlacklist && key.ipBlacklist.length > 0) {
      score += 20; // IP blacklist also increases security
    }

    return Math.min(100, score);
  }

  private calculateExpirationScore(key: ApiKey): number {
    if (!key.expiresAt) return 30; // No expiration is less secure

    const daysUntilExpiration = (key.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiration < 7) return 90; // Expiring soon is good (forces rotation)
    if (daysUntilExpiration < 30) return 100; // Optimal expiration window
    if (daysUntilExpiration < 90) return 80;
    return 60; // Too far in future
  }
}
