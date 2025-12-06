import { Model, Document } from 'mongoose';
import { IAuditLogAdapter, AuditLogQuery, AuditLogStats } from './audit-log.adapter';
import { AuditLogEntry } from '../services/audit-log.service';
import { ApiKeyLogger } from '../utils/logger.util';

export interface MongooseAuditLogDocument extends Document {
  keyId: string;
  keyName?: string;
  ipAddress: string;
  method: string;
  path: string;
  statusCode?: number;
  success: boolean;
  errorMessage?: string;
  requestId?: string;
  timestamp: Date;
}

export type MongooseAuditLogModel = Model<MongooseAuditLogDocument>;

export const MONGOOSE_AUDIT_LOG_MODEL_KEY = 'MONGOOSE_AUDIT_LOG_MODEL';

/**
 * Mongoose adapter for audit log operations.
 */
export class MongooseAuditLogAdapter implements IAuditLogAdapter {
  constructor(private readonly model: MongooseAuditLogModel) {}

  async create(entry: AuditLogEntry): Promise<AuditLogEntry> {
    try {
      const created = new this.model({
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
      });

      const saved = await created.save();
      return this.mapToAuditLogEntry(saved);
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to create audit log',
        error instanceof Error ? error : String(error),
        'MongooseAuditLogAdapter',
      );
      throw error;
    }
  }

  async query(query: AuditLogQuery): Promise<AuditLogEntry[]> {
    try {
      const filter: {
        keyId?: string;
        ipAddress?: string;
        method?: string;
        path?: { $regex: string; $options: string };
        success?: boolean;
        timestamp?: { $gte?: Date; $lte?: Date };
      } = {};

      if (query.keyId) {
        filter.keyId = query.keyId;
      }

      if (query.ipAddress) {
        filter.ipAddress = query.ipAddress;
      }

      if (query.method) {
        filter.method = query.method;
      }

      if (query.path) {
        filter.path = { $regex: query.path, $options: 'i' };
      }

      if (query.success !== undefined) {
        filter.success = query.success;
      }

      if (query.startDate || query.endDate) {
        filter.timestamp = {};
        if (query.startDate) {
          filter.timestamp.$gte = query.startDate;
        }
        if (query.endDate) {
          filter.timestamp.$lte = query.endDate;
        }
      }

      const logs = await this.model
        .find(filter)
        .sort({ timestamp: -1 })
        .limit(query.limit || 100)
        .skip(query.offset || 0)
        .exec();

      return logs.map((log) => this.mapToAuditLogEntry(log));
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to query audit logs',
        error instanceof Error ? error : String(error),
        'MongooseAuditLogAdapter',
      );
      throw error;
    }
  }

  async getStats(query?: AuditLogQuery): Promise<AuditLogStats> {
    try {
      const filter: {
        keyId?: string;
        timestamp?: { $gte?: Date; $lte?: Date };
      } = {};

      if (query?.keyId) {
        filter.keyId = query.keyId;
      }

      if (query?.startDate || query?.endDate) {
        filter.timestamp = {};
        if (query.startDate) {
          filter.timestamp.$gte = query.startDate;
        }
        if (query.endDate) {
          filter.timestamp.$lte = query.endDate;
        }
      }

      const [totalLogs, successCount, failureCount, uniqueKeys, uniqueIPs, ipStats, pathStats] =
        await Promise.all([
          this.model.countDocuments(filter),
          this.model.countDocuments({ ...filter, success: true }),
          this.model.countDocuments({ ...filter, success: false }),
          this.model.distinct('keyId', filter),
          this.model.distinct('ipAddress', filter),
          this.model
            .aggregate([
              { $match: filter },
              { $group: { _id: '$ipAddress', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 },
            ])
            .exec(),
          this.model
            .aggregate([
              { $match: filter },
              { $group: { _id: '$path', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 },
            ])
            .exec(),
        ]);

      return {
        totalLogs,
        successCount,
        failureCount,
        uniqueKeys: uniqueKeys.length,
        uniqueIPs: uniqueIPs.length,
        topIPs: ipStats.map((stat: { _id: string; count: number }) => ({
          ip: stat._id,
          count: stat.count,
        })),
        topPaths: pathStats.map((stat: { _id: string; count: number }) => ({
          path: stat._id,
          count: stat.count,
        })),
      };
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to get audit log stats',
        error instanceof Error ? error : String(error),
        'MongooseAuditLogAdapter',
      );
      throw error;
    }
  }

  async deleteOldLogs(beforeDate: Date): Promise<number> {
    try {
      const result = await this.model.deleteMany({
        timestamp: { $lt: beforeDate },
      });

      return result.deletedCount || 0;
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to delete old audit logs',
        error instanceof Error ? error : String(error),
        'MongooseAuditLogAdapter',
      );
      throw error;
    }
  }

  async count(query?: AuditLogQuery): Promise<number> {
    try {
      const filter: {
        keyId?: string;
        ipAddress?: string;
        method?: string;
        path?: { $regex: string; $options: string };
        success?: boolean;
        timestamp?: { $gte?: Date; $lte?: Date };
      } = {};

      if (query?.keyId) {
        filter.keyId = query.keyId;
      }

      if (query?.ipAddress) {
        filter.ipAddress = query.ipAddress;
      }

      if (query?.method) {
        filter.method = query.method;
      }

      if (query?.path) {
        filter.path = { $regex: query.path, $options: 'i' };
      }

      if (query?.success !== undefined) {
        filter.success = query.success;
      }

      if (query?.startDate || query?.endDate) {
        filter.timestamp = {};
        if (query.startDate) {
          filter.timestamp.$gte = query.startDate;
        }
        if (query.endDate) {
          filter.timestamp.$lte = query.endDate;
        }
      }

      return await this.model.countDocuments(filter);
    } catch (error) {
      ApiKeyLogger.error(
        'Failed to count audit logs',
        error instanceof Error ? error : String(error),
        'MongooseAuditLogAdapter',
      );
      throw error;
    }
  }

  private mapToAuditLogEntry(log: MongooseAuditLogDocument): AuditLogEntry {
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
