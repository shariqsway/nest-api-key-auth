import { PrismaClient } from '@prisma/client';
import { IAuditLogAdapter, AuditLogQuery, AuditLogStats } from './audit-log.adapter';
import { AuditLogEntry } from '../services/audit-log.service';
import { ApiKeyLogger } from '../utils/logger.util';

/**
 * Prisma adapter for audit log operations.
 */
export class PrismaAuditLogAdapter implements IAuditLogAdapter {
  constructor(private readonly prisma: PrismaClient) {}

  async create(entry: AuditLogEntry): Promise<AuditLogEntry> {
    try {
      const created = await this.prisma.auditLog.create({
        data: {
          keyId: entry.keyId,
          keyName: entry.keyName,
          ipAddress: entry.ipAddress,
          method: entry.method,
          path: entry.path,
          statusCode: entry.statusCode,
          success: entry.success,
          errorMessage: entry.errorMessage,
          requestId: entry.requestId,
          timestamp: entry.timestamp,
        },
      });

      return this.mapToAuditLogEntry(created);
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to create audit log',
        error instanceof Error ? error : String(error),
        'PrismaAuditLogAdapter',
      );
      throw error;
    }
  }

  async query(query: AuditLogQuery): Promise<AuditLogEntry[]> {
    try {
      const where: {
        keyId?: string;
        ipAddress?: string;
        method?: string;
        path?: { contains: string };
        success?: boolean;
        timestamp?: { gte?: Date; lte?: Date };
      } = {};

      if (query.keyId) {
        where.keyId = query.keyId;
      }

      if (query.ipAddress) {
        where.ipAddress = query.ipAddress;
      }

      if (query.method) {
        where.method = query.method;
      }

      if (query.path) {
        where.path = { contains: query.path };
      }

      if (query.success !== undefined) {
        where.success = query.success;
      }

      if (query.startDate || query.endDate) {
        where.timestamp = {};
        if (query.startDate) {
          where.timestamp.gte = query.startDate;
        }
        if (query.endDate) {
          where.timestamp.lte = query.endDate;
        }
      }

      const logs = await this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: query.limit || 100,
        skip: query.offset || 0,
      });

      return logs.map((log) => this.mapToAuditLogEntry(log));
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to query audit logs',
        error instanceof Error ? error : String(error),
        'PrismaAuditLogAdapter',
      );
      throw error;
    }
  }

  async getStats(query?: AuditLogQuery): Promise<AuditLogStats> {
    try {
      const where: {
        keyId?: string;
        timestamp?: { gte?: Date; lte?: Date };
      } = {};

      if (query?.keyId) {
        where.keyId = query.keyId;
      }

      if (query?.startDate || query?.endDate) {
        where.timestamp = {};
        if (query.startDate) {
          where.timestamp.gte = query.startDate;
        }
        if (query.endDate) {
          where.timestamp.lte = query.endDate;
        }
      }

      const [totalLogs, successCount, failureCount, uniqueKeys, uniqueIPs, ipStats, pathStats] =
        await Promise.all([
          this.prisma.auditLog.count({ where }),
          this.prisma.auditLog.count({ where: { ...where, success: true } }),
          this.prisma.auditLog.count({ where: { ...where, success: false } }),
          this.prisma.auditLog.groupBy({
            by: ['keyId'],
            where,
            _count: true,
          }),
          this.prisma.auditLog.groupBy({
            by: ['ipAddress'],
            where,
            _count: true,
          }),
          this.prisma.auditLog.groupBy({
            by: ['ipAddress'],
            where,
            _count: { ipAddress: true },
            orderBy: { _count: { ipAddress: 'desc' } },
            take: 10,
          }),
          this.prisma.auditLog.groupBy({
            by: ['path'],
            where,
            _count: { path: true },
            orderBy: { _count: { path: 'desc' } },
            take: 10,
          }),
        ]);

      return {
        totalLogs,
        successCount,
        failureCount,
        uniqueKeys: uniqueKeys.length,
        uniqueIPs: uniqueIPs.length,
        topIPs: ipStats.map((stat) => ({
          ip: stat.ipAddress,
          count: stat._count.ipAddress,
        })),
        topPaths: pathStats.map((stat) => ({
          path: stat.path,
          count: stat._count.path,
        })),
      };
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to get audit log stats',
        error instanceof Error ? error : String(error),
        'PrismaAuditLogAdapter',
      );
      throw error;
    }
  }

  async deleteOldLogs(beforeDate: Date): Promise<number> {
    try {
      const result = await this.prisma.auditLog.deleteMany({
        where: {
          timestamp: {
            lt: beforeDate,
          },
        },
      });

      return result.count;
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to delete old audit logs',
        error instanceof Error ? error : String(error),
        'PrismaAuditLogAdapter',
      );
      throw error;
    }
  }

  async count(query?: AuditLogQuery): Promise<number> {
    try {
      const where: {
        keyId?: string;
        ipAddress?: string;
        method?: string;
        path?: { contains: string };
        success?: boolean;
        timestamp?: { gte?: Date; lte?: Date };
      } = {};

      if (query?.keyId) {
        where.keyId = query.keyId;
      }

      if (query?.ipAddress) {
        where.ipAddress = query.ipAddress;
      }

      if (query?.method) {
        where.method = query.method;
      }

      if (query?.path) {
        where.path = { contains: query.path };
      }

      if (query?.success !== undefined) {
        where.success = query.success;
      }

      if (query?.startDate || query?.endDate) {
        where.timestamp = {};
        if (query.startDate) {
          where.timestamp.gte = query.startDate;
        }
        if (query.endDate) {
          where.timestamp.lte = query.endDate;
        }
      }

      return await this.prisma.auditLog.count({ where });
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to count audit logs',
        error instanceof Error ? error : String(error),
        'PrismaAuditLogAdapter',
      );
      throw error;
    }
  }

  private mapToAuditLogEntry(log: {
    keyId: string;
    keyName: string | null;
    ipAddress: string;
    method: string;
    path: string;
    statusCode: number | null;
    success: boolean;
    errorMessage: string | null;
    timestamp: Date;
    requestId: string | null;
  }): AuditLogEntry {
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
