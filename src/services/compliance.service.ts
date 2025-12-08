import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { API_KEY_ADAPTER } from '../api-key.module';
import { AuditLogService, AUDIT_LOG_SERVICE_TOKEN } from './audit-log.service';
import { KeyHistoryService } from './key-history.service';
import { ApiKeyLogger } from '../utils/logger.util';

export interface ComplianceExport {
  keys: Array<{
    id: string;
    name: string;
    owner?: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
  }>;
  auditLogs: Array<{
    keyId: string;
    timestamp: Date;
    action: string;
    ipAddress: string;
  }>;
  exportedAt: Date;
}

/**
 * Service for compliance features (GDPR, SOC2, etc.).
 */
@Injectable()
export class ComplianceService {
  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Inject(AUDIT_LOG_SERVICE_TOKEN) private readonly auditLogService?: AuditLogService,
    private readonly keyHistoryService?: KeyHistoryService,
  ) {}

  /**
   * Exports all data for a user (GDPR right to data portability).
   *
   * @param owner - The owner identifier
   * @returns Compliance export data
   */
  async exportUserData(owner: string): Promise<ComplianceExport> {
    const allKeys = await this.adapter.findAll();
    const userKeys = allKeys.filter((key) => key.owner === owner);

    const keys = userKeys.map((key) => ({
      id: key.id,
      name: key.name,
      owner: key.owner,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
    }));

    const auditLogs: ComplianceExport['auditLogs'] = [];

    if (this.auditLogService) {
      for (const key of userKeys) {
        try {
          const logs = await this.auditLogService.query({
            keyId: key.id,
          });

          auditLogs.push(
            ...logs.map((log) => ({
              keyId: log.keyId,
              timestamp: log.timestamp,
              action: log.success ? 'success' : 'failure',
              ipAddress: log.ipAddress,
            })),
          );
        } catch (error) {
          ApiKeyLogger.error(
            `Failed to export audit logs for key ${key.id}`,
            error instanceof Error ? error : String(error),
            'ComplianceService',
          );
        }
      }
    }

    return {
      keys,
      auditLogs,
      exportedAt: new Date(),
    };
  }

  /**
   * Deletes all data for a user (GDPR right to be forgotten).
   *
   * @param owner - The owner identifier
   */
  async deleteUserData(owner: string): Promise<void> {
    const allKeys = await this.adapter.findAll();
    const userKeys = allKeys.filter((key) => key.owner === owner);

    ApiKeyLogger.log(
      `Deleting data for user ${owner} (${userKeys.length} keys)`,
      'ComplianceService',
    );

    for (const key of userKeys) {
      try {
        // Revoke the key
        await this.adapter.revoke(key.id, 'GDPR data deletion request');

        // Clear history if available
        if (this.keyHistoryService) {
          this.keyHistoryService.clearHistory(key.id);
        }
      } catch (error) {
        ApiKeyLogger.error(
          `Failed to delete data for key ${key.id}`,
          error instanceof Error ? error : String(error),
          'ComplianceService',
        );
      }
    }
  }

  /**
   * Generates a compliance report (SOC2, etc.).
   *
   * @param startDate - Start date for the report
   * @param endDate - End date for the report
   * @returns Compliance report
   */
  async generateComplianceReport(startDate: Date, endDate: Date) {
    const allKeys = await this.adapter.findAll();
    const activeKeys = allKeys.filter(
      (key) => !key.revokedAt && (!key.expiresAt || key.expiresAt > new Date()),
    );

    const report = {
      period: { start: startDate, end: endDate },
      summary: {
        totalKeys: allKeys.length,
        activeKeys: activeKeys.length,
        revokedKeys: allKeys.filter((k) => k.revokedAt !== null).length,
        keysWithExpiration: allKeys.filter((k) => k.expiresAt !== null).length,
        keysWithIpRestrictions: allKeys.filter(
          (k) =>
            (k.ipWhitelist && k.ipWhitelist.length > 0) ||
            (k.ipBlacklist && k.ipBlacklist.length > 0),
        ).length,
      },
      security: {
        keysWithRotation: 0, // Would need to track this
        averageKeyAge: this.calculateAverageKeyAge(allKeys),
        keysNeverUsed: allKeys.filter((k) => !k.lastUsedAt).length,
      },
      generatedAt: new Date(),
    };

    return report;
  }

  private calculateAverageKeyAge(keys: Array<{ createdAt: Date }>): number {
    if (keys.length === 0) return 0;

    const totalAge = keys.reduce((sum, key) => {
      const ageInDays = (Date.now() - key.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return sum + ageInDays;
    }, 0);

    return Math.round(totalAge / keys.length);
  }
}
