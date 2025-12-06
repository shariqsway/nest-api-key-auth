import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';
import { PrismaClient } from '@prisma/client';

/**
 * Example: Database-backed audit logging
 *
 * This example shows how to enable database-backed audit logging
 * with query and analytics capabilities.
 */

const prisma = new PrismaClient();

@Module({
  imports: [
    ApiKeyModule.register({
      adapter: 'prisma',
      prismaClient: prisma,
      enableAuditLogging: true,
      auditLogOptions: {
        enabled: true,
        logToDatabase: true, // Enable database storage
        logToConsole: true, // Also log to console
        retentionDays: 90, // Keep logs for 90 days
      },
    }),
  ],
})
export class AppModule {}

/**
 * Example: Querying audit logs
 */
import { Injectable } from '@nestjs/common';
import { AuditLogService, AUDIT_LOG_SERVICE_TOKEN } from 'nest-api-key-auth';
import { Inject } from '@nestjs/common';

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_LOG_SERVICE_TOKEN) private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Get audit logs for a specific API key
   */
  async getKeyLogs(keyId: string) {
    return await this.auditLogService.query({
      keyId,
      limit: 100,
    });
  }

  /**
   * Get failed authentication attempts
   */
  async getFailedAttempts(startDate?: Date, endDate?: Date) {
    return await this.auditLogService.query({
      success: false,
      startDate,
      endDate,
      limit: 1000,
    });
  }

  /**
   * Get audit log statistics
   */
  async getStats() {
    return await this.auditLogService.getStats();
  }

  /**
   * Get stats for a specific time period
   */
  async getStatsForPeriod(startDate: Date, endDate: Date) {
    return await this.auditLogService.getStats({
      startDate,
      endDate,
    });
  }

  /**
   * Cleanup old audit logs (based on retention policy)
   */
  async cleanupOldLogs() {
    const deleted = await this.auditLogService.cleanup();
    console.log(`Deleted ${deleted} old audit logs`);
    return deleted;
  }
}

/**
 * Example: Using audit log statistics
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(AUDIT_LOG_SERVICE_TOKEN) private readonly auditLogService: AuditLogService,
  ) {}

  async getUsageReport() {
    const stats = await this.auditLogService.getStats();

    return {
      totalRequests: stats.totalLogs,
      successRate: stats.totalLogs > 0 ? (stats.successCount / stats.totalLogs) * 100 : 0,
      failureRate: stats.totalLogs > 0 ? (stats.failureCount / stats.totalLogs) * 100 : 0,
      uniqueKeys: stats.uniqueKeys,
      uniqueIPs: stats.uniqueIPs,
      topIPs: stats.topIPs,
      topPaths: stats.topPaths,
    };
  }
}

