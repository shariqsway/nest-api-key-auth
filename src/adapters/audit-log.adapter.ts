import { AuditLogEntry } from '../services/audit-log.service';

export interface AuditLogQuery {
  keyId?: string;
  ipAddress?: string;
  method?: string;
  path?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditLogStats {
  totalLogs: number;
  successCount: number;
  failureCount: number;
  uniqueKeys: number;
  uniqueIPs: number;
  topIPs: Array<{ ip: string; count: number }>;
  topPaths: Array<{ path: string; count: number }>;
}

/**
 * Base interface for audit log database adapters.
 */
export interface IAuditLogAdapter {
  /**
   * Creates a new audit log entry.
   *
   * @param entry - The audit log entry
   * @returns The created audit log entry
   */
  create(entry: AuditLogEntry): Promise<AuditLogEntry>;

  /**
   * Queries audit logs with filters.
   *
   * @param query - Query filters
   * @returns Array of matching audit log entries
   */
  query(query: AuditLogQuery): Promise<AuditLogEntry[]>;

  /**
   * Gets audit log statistics.
   *
   * @param query - Optional query filters
   * @returns Audit log statistics
   */
  getStats(query?: AuditLogQuery): Promise<AuditLogStats>;

  /**
   * Deletes audit logs older than the specified date.
   *
   * @param beforeDate - Delete logs before this date
   * @returns Number of deleted logs
   */
  deleteOldLogs(beforeDate: Date): Promise<number>;

  /**
   * Gets the total count of audit logs matching the query.
   *
   * @param query - Query filters
   * @returns Total count
   */
  count(query?: AuditLogQuery): Promise<number>;
}
