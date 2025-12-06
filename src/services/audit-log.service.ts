import { Injectable, Optional, Inject } from '@nestjs/common';
import { ApiKeyLogger } from '../utils/logger.util';
import { IAuditLogAdapter, AuditLogQuery, AuditLogStats } from '../adapters/audit-log.adapter';

export interface AuditLogEntry {
  keyId: string;
  keyName?: string;
  ipAddress: string;
  method: string;
  path: string;
  statusCode?: number;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
  requestId?: string;
}

export interface AuditLogOptions {
  enabled?: boolean;
  logToDatabase?: boolean;
  logToConsole?: boolean;
  onLog?: (entry: AuditLogEntry) => Promise<void> | void;
  retentionDays?: number;
}

export const AUDIT_LOG_ADAPTER_TOKEN = 'AUDIT_LOG_ADAPTER';

/**
 * Service for logging API key usage and security events.
 */
@Injectable()
export class AuditLogService {
  private options: Required<Omit<AuditLogOptions, 'onLog'>> & { onLog?: AuditLogOptions['onLog'] };

  constructor(
    @Optional() options?: AuditLogOptions,
    @Optional() @Inject(AUDIT_LOG_ADAPTER_TOKEN) private readonly adapter?: IAuditLogAdapter,
  ) {
    this.options = {
      enabled: true,
      logToConsole: true,
      logToDatabase: false,
      retentionDays: 90,
      ...options,
    };
  }

  /**
   * Logs an API key usage event.
   *
   * @param entry - The audit log entry
   */
  async log(entry: AuditLogEntry): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    try {
      if (this.options.logToConsole) {
        const logMessage = `[AUDIT] ${entry.success ? 'SUCCESS' : 'FAILED'} | Key: ${entry.keyId} | IP: ${entry.ipAddress} | ${entry.method} ${entry.path} | ${entry.timestamp.toISOString()}`;
        if (entry.success) {
          ApiKeyLogger.log(logMessage);
        } else {
          ApiKeyLogger.warn(
            logMessage + (entry.errorMessage ? ` | Error: ${entry.errorMessage}` : ''),
          );
        }
      }

      if (this.options.onLog) {
        await Promise.resolve(this.options.onLog(entry));
      }

      if (this.options.logToDatabase && this.adapter) {
        await this.adapter.create(entry).catch((error) => {
          ApiKeyLogger.error(
            'Failed to write audit log to database',
            error instanceof Error ? error : String(error),
            'AuditLogService',
          );
        });
      }
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to write audit log',
        error instanceof Error ? error : String(error),
      );
    }
  }

  /**
   * Logs a successful API key validation.
   *
   * @param keyId - The API key ID
   * @param keyName - The API key name
   * @param ipAddress - The client IP address
   * @param method - HTTP method
   * @param path - Request path
   * @param requestId - Optional request ID
   */
  async logSuccess(
    keyId: string,
    ipAddress: string,
    method: string,
    path: string,
    keyName?: string,
    requestId?: string,
  ): Promise<void> {
    await this.log({
      keyId,
      keyName,
      ipAddress,
      method,
      path,
      success: true,
      timestamp: new Date(),
      requestId,
    });
  }

  /**
   * Logs a failed API key validation attempt.
   *
   * @param keyId - The API key ID (if available)
   * @param ipAddress - The client IP address
   * @param method - HTTP method
   * @param path - Request path
   * @param errorMessage - Error message
   * @param requestId - Optional request ID
   */
  async logFailure(
    ipAddress: string,
    method: string,
    path: string,
    errorMessage: string,
    keyId?: string,
    requestId?: string,
  ): Promise<void> {
    await this.log({
      keyId: keyId || 'unknown',
      ipAddress,
      method,
      path,
      success: false,
      errorMessage,
      timestamp: new Date(),
      requestId,
    });
  }

  /**
   * Queries audit logs with filters.
   *
   * @param query - Query filters
   * @returns Array of matching audit log entries
   */
  async query(query: AuditLogQuery): Promise<AuditLogEntry[]> {
    if (!this.adapter) {
      throw new Error(
        'Audit log adapter not configured. Enable logToDatabase and provide an adapter.',
      );
    }
    return await this.adapter.query(query);
  }

  /**
   * Gets audit log statistics.
   *
   * @param query - Optional query filters
   * @returns Audit log statistics
   */
  async getStats(query?: AuditLogQuery): Promise<AuditLogStats> {
    if (!this.adapter) {
      throw new Error(
        'Audit log adapter not configured. Enable logToDatabase and provide an adapter.',
      );
    }
    return await this.adapter.getStats(query);
  }

  /**
   * Gets the total count of audit logs.
   *
   * @param query - Optional query filters
   * @returns Total count
   */
  async count(query?: AuditLogQuery): Promise<number> {
    if (!this.adapter) {
      throw new Error(
        'Audit log adapter not configured. Enable logToDatabase and provide an adapter.',
      );
    }
    return await this.adapter.count(query);
  }

  /**
   * Deletes old audit logs based on retention policy.
   *
   * @returns Number of deleted logs
   */
  async cleanup(): Promise<number> {
    if (!this.adapter) {
      ApiKeyLogger.warn(
        'Audit log adapter not configured. Cannot cleanup old logs.',
        'AuditLogService',
      );
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.options.retentionDays);

    try {
      const deleted = await this.adapter.deleteOldLogs(cutoffDate);
      ApiKeyLogger.log(`Cleaned up ${deleted} old audit logs`, 'AuditLogService');
      return deleted;
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to cleanup old audit logs',
        error instanceof Error ? error : String(error),
        'AuditLogService',
      );
      throw error;
    }
  }
}
