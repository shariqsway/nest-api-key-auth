import { Repository } from 'typeorm';
import { IAuditLogAdapter, AuditLogQuery, AuditLogStats } from './audit-log.adapter';
import { AuditLogEntry } from '../services/audit-log.service';
import { ApiKeyLogger } from '../utils/logger.util';

export interface TypeOrmAuditLogEntity {
  id: string;
  keyId: string;
  keyName?: string | null;
  ipAddress: string;
  method: string;
  path: string;
  statusCode?: number | null;
  success: boolean;
  errorMessage?: string | null;
  requestId?: string | null;
  timestamp: Date;
}

export type TypeOrmAuditLogRepository = Repository<TypeOrmAuditLogEntity>;

export const TYPEORM_AUDIT_LOG_REPOSITORY_KEY = 'TYPEORM_AUDIT_LOG_REPOSITORY';

/**
 * TypeORM adapter for audit log operations.
 */
export class TypeOrmAuditLogAdapter implements IAuditLogAdapter {
  constructor(private readonly repository: TypeOrmAuditLogRepository) {}

  async create(entry: AuditLogEntry): Promise<AuditLogEntry> {
    try {
      const created = this.repository.create({
        keyId: entry.keyId,
        keyName: entry.keyName || null,
        ipAddress: entry.ipAddress,
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode || null,
        success: entry.success,
        errorMessage: entry.errorMessage || null,
        requestId: entry.requestId || null,
        timestamp: entry.timestamp,
      });

      const saved = await this.repository.save(created);
      return this.mapToAuditLogEntry(saved);
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to create audit log',
        error instanceof Error ? error : String(error),
        'TypeOrmAuditLogAdapter',
      );
      throw error;
    }
  }

  async query(query: AuditLogQuery): Promise<AuditLogEntry[]> {
    try {
      const queryBuilder = this.repository.createQueryBuilder('audit_log');

      if (query.keyId) {
        queryBuilder.andWhere('audit_log.keyId = :keyId', { keyId: query.keyId });
      }

      if (query.ipAddress) {
        queryBuilder.andWhere('audit_log.ipAddress = :ipAddress', { ipAddress: query.ipAddress });
      }

      if (query.method) {
        queryBuilder.andWhere('audit_log.method = :method', { method: query.method });
      }

      if (query.path) {
        queryBuilder.andWhere('audit_log.path LIKE :path', { path: `%${query.path}%` });
      }

      if (query.success !== undefined) {
        queryBuilder.andWhere('audit_log.success = :success', { success: query.success });
      }

      if (query.startDate) {
        queryBuilder.andWhere('audit_log.timestamp >= :startDate', { startDate: query.startDate });
      }

      if (query.endDate) {
        queryBuilder.andWhere('audit_log.timestamp <= :endDate', { endDate: query.endDate });
      }

      queryBuilder.orderBy('audit_log.timestamp', 'DESC');
      queryBuilder.take(query.limit || 100);
      queryBuilder.skip(query.offset || 0);

      const logs = await queryBuilder.getMany();
      return logs.map((log) => this.mapToAuditLogEntry(log));
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to query audit logs',
        error instanceof Error ? error : String(error),
        'TypeOrmAuditLogAdapter',
      );
      throw error;
    }
  }

  async getStats(query?: AuditLogQuery): Promise<AuditLogStats> {
    try {
      const queryBuilder = this.repository.createQueryBuilder('audit_log');

      if (query?.keyId) {
        queryBuilder.andWhere('audit_log.keyId = :keyId', { keyId: query.keyId });
      }

      if (query?.startDate) {
        queryBuilder.andWhere('audit_log.timestamp >= :startDate', { startDate: query.startDate });
      }

      if (query?.endDate) {
        queryBuilder.andWhere('audit_log.timestamp <= :endDate', { endDate: query.endDate });
      }

      const [totalLogs, successCount, failureCount] = await Promise.all([
        queryBuilder.getCount(),
        queryBuilder.clone().andWhere('audit_log.success = :success', { success: true }).getCount(),
        queryBuilder
          .clone()
          .andWhere('audit_log.success = :success', { success: false })
          .getCount(),
      ]);

      const uniqueKeys = await queryBuilder
        .select('DISTINCT audit_log.keyId', 'keyId')
        .getRawMany();

      const uniqueIPs = await queryBuilder
        .select('DISTINCT audit_log.ipAddress', 'ipAddress')
        .getRawMany();

      const topIPs = await queryBuilder
        .select('audit_log.ipAddress', 'ip')
        .addSelect('COUNT(*)', 'count')
        .groupBy('audit_log.ipAddress')
        .orderBy('count', 'DESC')
        .limit(10)
        .getRawMany();

      const topPaths = await queryBuilder
        .select('audit_log.path', 'path')
        .addSelect('COUNT(*)', 'count')
        .groupBy('audit_log.path')
        .orderBy('count', 'DESC')
        .limit(10)
        .getRawMany();

      return {
        totalLogs,
        successCount,
        failureCount,
        uniqueKeys: uniqueKeys.length,
        uniqueIPs: uniqueIPs.length,
        topIPs: topIPs.map((stat) => ({ ip: stat.ip, count: parseInt(stat.count, 10) })),
        topPaths: topPaths.map((stat) => ({ path: stat.path, count: parseInt(stat.count, 10) })),
      };
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to get audit log stats',
        error instanceof Error ? error : String(error),
        'TypeOrmAuditLogAdapter',
      );
      throw error;
    }
  }

  async deleteOldLogs(beforeDate: Date): Promise<number> {
    try {
      const result = await this.repository
        .createQueryBuilder()
        .delete()
        .where('timestamp < :beforeDate', { beforeDate })
        .execute();

      return result.affected || 0;
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to delete old audit logs',
        error instanceof Error ? error : String(error),
        'TypeOrmAuditLogAdapter',
      );
      throw error;
    }
  }

  async count(query?: AuditLogQuery): Promise<number> {
    try {
      const queryBuilder = this.repository.createQueryBuilder('audit_log');

      if (query?.keyId) {
        queryBuilder.andWhere('audit_log.keyId = :keyId', { keyId: query.keyId });
      }

      if (query?.ipAddress) {
        queryBuilder.andWhere('audit_log.ipAddress = :ipAddress', { ipAddress: query.ipAddress });
      }

      if (query?.method) {
        queryBuilder.andWhere('audit_log.method = :method', { method: query.method });
      }

      if (query?.path) {
        queryBuilder.andWhere('audit_log.path LIKE :path', { path: `%${query.path}%` });
      }

      if (query?.success !== undefined) {
        queryBuilder.andWhere('audit_log.success = :success', { success: query.success });
      }

      if (query?.startDate) {
        queryBuilder.andWhere('audit_log.timestamp >= :startDate', { startDate: query.startDate });
      }

      if (query?.endDate) {
        queryBuilder.andWhere('audit_log.timestamp <= :endDate', { endDate: query.endDate });
      }

      return await queryBuilder.getCount();
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to count audit logs',
        error instanceof Error ? error : String(error),
        'TypeOrmAuditLogAdapter',
      );
      throw error;
    }
  }

  private mapToAuditLogEntry(log: TypeOrmAuditLogEntity): AuditLogEntry {
    return {
      keyId: log.keyId,
      keyName: log.keyName || undefined,
      ipAddress: log.ipAddress,
      method: log.method,
      path: log.path,
      statusCode: log.statusCode || undefined,
      success: log.success,
      errorMessage: log.errorMessage || undefined,
      timestamp: log.timestamp,
      requestId: log.requestId || undefined,
    };
  }
}
