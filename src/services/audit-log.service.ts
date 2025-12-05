import { Injectable, Optional } from '@nestjs/common';
import { ApiKeyLogger } from '../utils/logger.util';

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
}

/**
 * Service for logging API key usage and security events.
 */
@Injectable()
export class AuditLogService {
  private options: AuditLogOptions;

  constructor(@Optional() options?: AuditLogOptions) {
    this.options = {
      enabled: true,
      logToConsole: true,
      logToDatabase: false,
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

      if (this.options.logToDatabase) {
        await this.logToDatabase(entry);
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
   * Logs to database (placeholder - implement based on your needs).
   *
   * @param entry - The audit log entry
   */
  private async logToDatabase(_entry: AuditLogEntry): Promise<void> {
    ApiKeyLogger.debug(
      'Database logging not implemented. Use onLog callback for custom implementation.',
    );
  }
}
