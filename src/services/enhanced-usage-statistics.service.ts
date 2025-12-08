import { Injectable } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { API_KEY_ADAPTER } from '../api-key.module';
import { Inject, Optional } from '@nestjs/common';
import { AuditLogService, AUDIT_LOG_SERVICE_TOKEN } from './audit-log.service';
import { AnalyticsService, ANALYTICS_SERVICE_TOKEN } from './analytics.service';

export interface UsageTrend {
  period: string;
  count: number;
  successCount: number;
  failureCount: number;
  averageResponseTime?: number;
}

export interface UsageStatistics {
  totalRequests: number;
  successRate: number;
  failureRate: number;
  peakUsageTime?: Date;
  peakUsageCount?: number;
  trends: UsageTrend[];
  topEndpoints: Array<{
    endpoint: string;
    method: string;
    count: number;
  }>;
}

export interface UsageStatisticsQuery {
  keyId?: string;
  startDate: Date;
  endDate: Date;
  period?: 'hour' | 'day' | 'week' | 'month';
}

/**
 * Service for enhanced usage statistics and analytics.
 */
@Injectable()
export class EnhancedUsageStatisticsService {
  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Optional() @Inject(AUDIT_LOG_SERVICE_TOKEN) private readonly auditLogService?: AuditLogService,
    @Optional()
    @Inject(ANALYTICS_SERVICE_TOKEN)
    private readonly analyticsService?: AnalyticsService,
  ) {}

  /**
   * Gets comprehensive usage statistics.
   *
   * @param query - Query parameters
   * @returns Usage statistics
   */
  async getUsageStatistics(query: UsageStatisticsQuery): Promise<UsageStatistics> {
    if (!this.auditLogService) {
      return {
        totalRequests: 0,
        successRate: 0,
        failureRate: 0,
        trends: [],
        topEndpoints: [],
      };
    }

    const logs = await this.auditLogService.query({
      keyId: query.keyId,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: 100000, // Large limit for comprehensive analysis
    });

    const totalRequests = logs.length;
    const successCount = logs.filter((log) => log.success).length;
    const failureCount = totalRequests - successCount;
    const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 0;
    const failureRate = totalRequests > 0 ? (failureCount / totalRequests) * 100 : 0;

    // Calculate trends
    const trends = this.calculateTrends(logs, query.period || 'day');

    // Find peak usage time
    const usageByTime = new Map<string, number>();
    for (const log of logs) {
      const timeKey = this.getTimeKey(log.timestamp, query.period || 'day');
      usageByTime.set(timeKey, (usageByTime.get(timeKey) || 0) + 1);
    }

    let peakUsageTime: Date | undefined;
    let peakUsageCount = 0;
    for (const [timeKey, count] of usageByTime.entries()) {
      if (count > peakUsageCount) {
        peakUsageCount = count;
        peakUsageTime = this.parseTimeKey(timeKey);
      }
    }

    // Get top endpoints
    const endpointCounts = new Map<string, number>();
    for (const log of logs) {
      const key = `${log.method} ${log.path}`;
      endpointCounts.set(key, (endpointCounts.get(key) || 0) + 1);
    }

    const topEndpoints = Array.from(endpointCounts.entries())
      .map(([endpoint, count]) => {
        const [method, path] = endpoint.split(' ', 2);
        return { endpoint: path, method, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalRequests,
      successRate,
      failureRate,
      peakUsageTime,
      peakUsageCount,
      trends,
      topEndpoints,
    };
  }

  /**
   * Gets usage trends over time.
   *
   * @param query - Query parameters
   * @returns Array of usage trends
   */
  async getUsageTrends(query: UsageStatisticsQuery): Promise<UsageTrend[]> {
    if (!this.auditLogService) {
      return [];
    }

    const logs = await this.auditLogService.query({
      keyId: query.keyId,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: 100000,
    });

    return this.calculateTrends(logs, query.period || 'day');
  }

  /**
   * Gets peak usage times.
   *
   * @param query - Query parameters
   * @returns Array of peak usage times with counts
   */
  async getPeakUsageTimes(
    query: UsageStatisticsQuery,
  ): Promise<Array<{ time: Date; count: number }>> {
    if (!this.auditLogService) {
      return [];
    }

    const logs = await this.auditLogService.query({
      keyId: query.keyId,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: 100000,
    });

    const usageByTime = new Map<string, number>();
    for (const log of logs) {
      const timeKey = this.getTimeKey(log.timestamp, query.period || 'hour');
      usageByTime.set(timeKey, (usageByTime.get(timeKey) || 0) + 1);
    }

    return Array.from(usageByTime.entries())
      .map(([timeKey, count]) => ({
        time: this.parseTimeKey(timeKey),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  private calculateTrends(
    logs: Array<{ timestamp: Date; success: boolean }>,
    period: 'hour' | 'day' | 'week' | 'month',
  ): UsageTrend[] {
    const trendsMap = new Map<
      string,
      { count: number; successCount: number; failureCount: number }
    >();

    for (const log of logs) {
      const timeKey = this.getTimeKey(log.timestamp, period);
      const existing = trendsMap.get(timeKey) || { count: 0, successCount: 0, failureCount: 0 };

      existing.count++;
      if (log.success) {
        existing.successCount++;
      } else {
        existing.failureCount++;
      }

      trendsMap.set(timeKey, existing);
    }

    return Array.from(trendsMap.entries())
      .map(([period, data]) => ({
        period,
        count: data.count,
        successCount: data.successCount,
        failureCount: data.failureCount,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private getTimeKey(timestamp: Date, period: 'hour' | 'day' | 'week' | 'month'): string {
    const date = new Date(timestamp);

    switch (period) {
      case 'hour':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:00:00`;
      case 'day':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + 6) / 7)).padStart(2, '0')}`;
      case 'month':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      default:
        return date.toISOString();
    }
  }

  private parseTimeKey(timeKey: string): Date {
    // Try to parse different time key formats
    if (timeKey.includes('T')) {
      return new Date(timeKey);
    }
    if (timeKey.includes('W')) {
      // Week format - simplified parsing
      const [year, week] = timeKey.split('-W');
      const date = new Date(parseInt(year, 10), 0, 1);
      date.setDate(date.getDate() + (parseInt(week, 10) - 1) * 7);
      return date;
    }
    if (timeKey.match(/^\d{4}-\d{2}$/)) {
      // Month format
      return new Date(timeKey + '-01');
    }
    if (timeKey.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Day format
      return new Date(timeKey);
    }
    return new Date(timeKey);
  }
}
