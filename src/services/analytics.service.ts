import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { API_KEY_ADAPTER } from '../api-key.module';

export interface KeyUsageMetrics {
  keyId: string;
  keyName: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  lastUsedAt: Date | null;
  averageResponseTime?: number;
}

export interface UsageAnalytics {
  totalRequests: number;
  totalKeys: number;
  activeKeys: number;
  topKeys: KeyUsageMetrics[];
  requestsByHour: Array<{ hour: string; count: number }>;
  errorRate: number;
}

export const ANALYTICS_SERVICE_TOKEN = 'ANALYTICS_SERVICE';

/**
 * Service for tracking API key usage analytics and metrics.
 */
@Injectable()
export class AnalyticsService {
  private readonly usageMetrics = new Map<
    string,
    {
      requestCount: number;
      successCount: number;
      failureCount: number;
      lastUsedAt: Date;
      responseTimes: number[];
    }
  >();

  constructor(@Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter) {}

  /**
   * Records a successful request.
   *
   * @param keyId - The API key ID
   * @param responseTime - Optional response time in milliseconds
   */
  recordSuccess(keyId: string, responseTime?: number): void {
    const metrics = this.usageMetrics.get(keyId) || {
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      lastUsedAt: new Date(),
      responseTimes: [],
    };

    metrics.requestCount++;
    metrics.successCount++;
    metrics.lastUsedAt = new Date();
    if (responseTime !== undefined) {
      metrics.responseTimes.push(responseTime);
      if (metrics.responseTimes.length > 100) {
        metrics.responseTimes.shift();
      }
    }

    this.usageMetrics.set(keyId, metrics);
  }

  /**
   * Records a failed request.
   *
   * @param keyId - The API key ID (optional for failed auth)
   * @param responseTime - Optional response time in milliseconds
   */
  recordFailure(keyId?: string, responseTime?: number): void {
    if (!keyId) {
      return;
    }

    const metrics = this.usageMetrics.get(keyId) || {
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      lastUsedAt: new Date(),
      responseTimes: [],
    };

    metrics.requestCount++;
    metrics.failureCount++;
    metrics.lastUsedAt = new Date();
    if (responseTime !== undefined) {
      metrics.responseTimes.push(responseTime);
      if (metrics.responseTimes.length > 100) {
        metrics.responseTimes.shift();
      }
    }

    this.usageMetrics.set(keyId, metrics);
  }

  /**
   * Gets usage metrics for a specific key.
   *
   * @param keyId - The API key ID
   * @returns Usage metrics for the key
   */
  async getKeyMetrics(keyId: string): Promise<KeyUsageMetrics | null> {
    const metrics = this.usageMetrics.get(keyId);
    if (!metrics) {
      return null;
    }

    const key = await this.adapter.findById(keyId);
    if (!key) {
      return null;
    }

    const avgResponseTime =
      metrics.responseTimes.length > 0
        ? metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length
        : undefined;

    return {
      keyId: key.id,
      keyName: key.name,
      requestCount: metrics.requestCount,
      successCount: metrics.successCount,
      failureCount: metrics.failureCount,
      lastUsedAt: key.lastUsedAt,
      averageResponseTime: avgResponseTime,
    };
  }

  /**
   * Gets overall usage analytics.
   *
   * @returns Overall usage analytics
   */
  async getAnalytics(): Promise<UsageAnalytics> {
    const allKeys = await this.adapter.findAll();
    const activeKeys = allKeys.filter(
      (key) => !key.revokedAt && (!key.expiresAt || key.expiresAt > new Date()),
    );

    let totalRequests = 0;
    let totalFailures = 0;
    const topKeys: KeyUsageMetrics[] = [];

    for (const [keyId, metrics] of this.usageMetrics.entries()) {
      totalRequests += metrics.requestCount;
      totalFailures += metrics.failureCount;

      const key = allKeys.find((k) => k.id === keyId);
      if (key) {
        const avgResponseTime =
          metrics.responseTimes.length > 0
            ? metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length
            : undefined;

        topKeys.push({
          keyId: key.id,
          keyName: key.name,
          requestCount: metrics.requestCount,
          successCount: metrics.successCount,
          failureCount: metrics.failureCount,
          lastUsedAt: key.lastUsedAt,
          averageResponseTime: avgResponseTime,
        });
      }
    }

    topKeys.sort((a, b) => b.requestCount - a.requestCount);

    return {
      totalRequests,
      totalKeys: allKeys.length,
      activeKeys: activeKeys.length,
      topKeys: topKeys.slice(0, 10),
      requestsByHour: [],
      errorRate: totalRequests > 0 ? (totalFailures / totalRequests) * 100 : 0,
    };
  }

  /**
   * Resets metrics for a specific key.
   *
   * @param keyId - The API key ID
   */
  resetMetrics(keyId: string): void {
    this.usageMetrics.delete(keyId);
  }

  /**
   * Clears all metrics.
   */
  clearMetrics(): void {
    this.usageMetrics.clear();
  }
}
