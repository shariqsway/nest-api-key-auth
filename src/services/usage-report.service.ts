import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { API_KEY_ADAPTER } from '../api-key.module';
import { AnalyticsService, ANALYTICS_SERVICE_TOKEN } from './analytics.service';
import { AuditLogService, AUDIT_LOG_SERVICE_TOKEN } from './audit-log.service';
import { ApiKeyLogger } from '../utils/logger.util';

export interface UsageReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalRequests: number;
    totalKeys: number;
    activeKeys: number;
    revokedKeys: number;
    expiredKeys: number;
  };
  keyMetrics: Array<{
    keyId: string;
    keyName: string;
    requestCount: number;
    successCount: number;
    failureCount: number;
    lastUsedAt: Date | null;
  }>;
  topKeys: Array<{
    keyId: string;
    keyName: string;
    requestCount: number;
  }>;
  errorRate: number;
}

export interface ReportFormat {
  format: 'json' | 'csv' | 'pdf';
  includeDetails?: boolean;
}

/**
 * Service for generating usage reports.
 */
@Injectable()
export class UsageReportService {
  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Inject(ANALYTICS_SERVICE_TOKEN) private readonly analyticsService?: AnalyticsService,
    @Inject(AUDIT_LOG_SERVICE_TOKEN) private readonly auditLogService?: AuditLogService,
  ) {}

  /**
   * Generates a usage report for a time period.
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @param keyIds - Optional specific key IDs to include
   * @returns Usage report
   */
  async generateReport(startDate: Date, endDate: Date, keyIds?: string[]): Promise<UsageReport> {
    const allKeys = keyIds
      ? await Promise.all(keyIds.map((id) => this.adapter.findById(id))).then((keys) =>
          keys.filter((k): k is ApiKey => k !== null),
        )
      : await this.adapter.findAll();

    const activeKeys = allKeys.filter(
      (key) => !key.revokedAt && (!key.expiresAt || key.expiresAt > new Date()),
    );
    const revokedKeys = allKeys.filter((key) => key.revokedAt !== null);
    const expiredKeys = allKeys.filter(
      (key) => key.expiresAt !== null && key.expiresAt <= new Date() && !key.revokedAt,
    );

    const keyMetrics = await Promise.all(
      allKeys.map(async (key) => {
        const metrics = this.analyticsService
          ? await this.analyticsService.getKeyMetrics(key.id)
          : null;

        return {
          keyId: key.id,
          keyName: key.name,
          requestCount: metrics?.requestCount || 0,
          successCount: metrics?.successCount || 0,
          failureCount: metrics?.failureCount || 0,
          lastUsedAt: key.lastUsedAt,
        };
      }),
    );

    const totalRequests = keyMetrics.reduce((sum, m) => sum + m.requestCount, 0);
    const totalFailure = keyMetrics.reduce((sum, m) => sum + m.failureCount, 0);
    const errorRate = totalRequests > 0 ? totalFailure / totalRequests : 0;

    const topKeys = keyMetrics
      .sort((a, b) => b.requestCount - a.requestCount)
      .slice(0, 10)
      .map((m) => ({
        keyId: m.keyId,
        keyName: m.keyName,
        requestCount: m.requestCount,
      }));

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      summary: {
        totalRequests,
        totalKeys: allKeys.length,
        activeKeys: activeKeys.length,
        revokedKeys: revokedKeys.length,
        expiredKeys: expiredKeys.length,
      },
      keyMetrics,
      topKeys,
      errorRate,
    };
  }

  /**
   * Exports a report to JSON format.
   *
   * @param report - The usage report
   * @returns JSON string
   */
  exportToJson(report: UsageReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Exports a report to CSV format.
   *
   * @param report - The usage report
   * @returns CSV string
   */
  exportToCsv(report: UsageReport): string {
    const lines: string[] = [];

    // Header
    lines.push('Key ID,Key Name,Request Count,Success Count,Failure Count,Last Used At');

    // Data rows
    for (const metric of report.keyMetrics) {
      lines.push(
        [
          metric.keyId,
          metric.keyName,
          metric.requestCount,
          metric.successCount,
          metric.failureCount,
          metric.lastUsedAt?.toISOString() || '',
        ].join(','),
      );
    }

    return lines.join('\n');
  }

  /**
   * Generates and exports a report.
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @param format - Export format
   * @param keyIds - Optional specific key IDs
   * @returns Exported report string
   */
  async generateAndExport(
    startDate: Date,
    endDate: Date,
    format: ReportFormat['format'],
    keyIds?: string[],
  ): Promise<string> {
    const report = await this.generateReport(startDate, endDate, keyIds);

    switch (format) {
      case 'json':
        return this.exportToJson(report);
      case 'csv':
        return this.exportToCsv(report);
      case 'pdf':
        // PDF generation would require a library like pdfkit
        // For now, return JSON as fallback
        ApiKeyLogger.warn('PDF export not implemented, returning JSON', 'UsageReportService');
        return this.exportToJson(report);
      default:
        return this.exportToJson(report);
    }
  }
}
