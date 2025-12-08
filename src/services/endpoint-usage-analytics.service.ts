import { Injectable } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { API_KEY_ADAPTER } from '../api-key.module';
import { Inject, Optional } from '@nestjs/common';
import { AuditLogService, AUDIT_LOG_SERVICE_TOKEN } from './audit-log.service';

export interface EndpointUsageStats {
  endpoint: string;
  method: string;
  count: number;
  successCount: number;
  failureCount: number;
  averageResponseTime?: number;
  lastUsedAt: Date;
}

export interface EndpointUsageQuery {
  keyId?: string;
  endpoint?: string;
  method?: string;
  startDate?: Date;
  endDate?: Date;
  period?: 'hour' | 'day' | 'month';
}

/**
 * Service for tracking and analyzing endpoint usage.
 */
@Injectable()
export class EndpointUsageAnalyticsService {
  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Optional() @Inject(AUDIT_LOG_SERVICE_TOKEN) private readonly auditLogService?: AuditLogService,
  ) {}

  /**
   * Records endpoint usage for an API key.
   *
   * @param keyId - The API key ID
   * @param endpoint - The endpoint path
   * @param method - The HTTP method
   * @param success - Whether the request was successful
   */
  async recordUsage(
    _keyId: string,
    _endpoint: string,
    _method: string,
    _success: boolean,
  ): Promise<void> {
    // This is handled by AuditLogService, but we can add additional tracking here if needed
    // For now, we rely on audit logs for endpoint usage tracking
  }

  /**
   * Gets endpoint usage statistics.
   *
   * @param query - Query parameters
   * @returns Array of endpoint usage statistics
   */
  async getEndpointUsageStats(query: EndpointUsageQuery): Promise<EndpointUsageStats[]> {
    if (!this.auditLogService) {
      return [];
    }

    const logs = await this.auditLogService.query({
      keyId: query.keyId,
      path: query.endpoint,
      method: query.method,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: 10000, // Large limit to get all relevant logs
    });

    // Aggregate by endpoint and method
    const statsMap = new Map<string, EndpointUsageStats>();

    for (const log of logs) {
      const key = `${log.path}:${log.method}`;
      const existing = statsMap.get(key);

      if (existing) {
        existing.count++;
        if (log.success) {
          existing.successCount++;
        } else {
          existing.failureCount++;
        }
        if (log.timestamp > existing.lastUsedAt) {
          existing.lastUsedAt = log.timestamp;
        }
      } else {
        statsMap.set(key, {
          endpoint: log.path,
          method: log.method,
          count: 1,
          successCount: log.success ? 1 : 0,
          failureCount: log.success ? 0 : 1,
          lastUsedAt: log.timestamp,
        });
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.count - a.count);
  }

  /**
   * Gets top endpoints by usage.
   *
   * @param keyId - Optional API key ID to filter by
   * @param limit - Maximum number of results
   * @returns Array of top endpoints
   */
  async getTopEndpoints(keyId?: string, limit: number = 10): Promise<EndpointUsageStats[]> {
    const stats = await this.getEndpointUsageStats({ keyId });
    return stats.slice(0, limit);
  }

  /**
   * Gets endpoint usage for a specific API key.
   *
   * @param keyId - The API key ID
   * @param period - Time period to analyze
   * @returns Array of endpoint usage statistics
   */
  async getKeyEndpointUsage(
    keyId: string,
    period: 'hour' | 'day' | 'month' = 'day',
  ): Promise<EndpointUsageStats[]> {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case 'hour':
        startDate.setHours(startDate.getHours() - 1);
        break;
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    return await this.getEndpointUsageStats({
      keyId,
      startDate,
      endDate,
      period,
    });
  }
}
