import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ApiKey } from '../interfaces';
import { IApiKeyAdapter } from './base.adapter';
import { MongooseApiKeyDocument, MongooseApiKeyModel, MongooseApiKeyFilter } from './types';
import { ApiKeyLogger } from '../utils/logger.util';

export const MONGOOSE_MODEL_KEY = 'MONGOOSE_API_KEY_MODEL';

/**
 * Mongoose adapter for API key storage.
 * Requires a Mongoose model to be provided via dependency injection.
 */
@Injectable()
export class MongooseAdapter implements IApiKeyAdapter {
  constructor(private readonly model: MongooseApiKeyModel) {}

  async create(data: {
    name: string;
    keyPrefix: string;
    hashedKey: string;
    scopes: string[];
    expiresAt?: Date | null;
    ipWhitelist?: string[];
    ipBlacklist?: string[]; // New: IP addresses/ranges to block
    rateLimitMax?: number | null;
    rateLimitWindowMs?: number | null;
    quotaMax?: number | null;
    quotaPeriod?: 'daily' | 'monthly' | 'yearly' | null;
    metadata?: Record<string, unknown> | null;
    tags?: string[];
    owner?: string | null;
    environment?: 'production' | 'staging' | 'development' | null;
    description?: string | null;
  }): Promise<ApiKey> {
    try {
      const now = new Date();
      let quotaResetAt: Date | null = null;
      if (data.quotaMax && data.quotaPeriod) {
        quotaResetAt = this.calculateQuotaResetAt(now, data.quotaPeriod);
      }

      const apiKey = new this.model({
        name: data.name,
        keyPrefix: data.keyPrefix,
        hashedKey: data.hashedKey,
        scopes: data.scopes,
        expiresAt: data.expiresAt || null,
        ipWhitelist: data.ipWhitelist || [],
        ipBlacklist: data.ipBlacklist || [],
        rateLimitMax: data.rateLimitMax || null,
        rateLimitWindowMs: data.rateLimitWindowMs || null,
        quotaMax: data.quotaMax || null,
        quotaPeriod: data.quotaPeriod || null,
        quotaUsed: 0,
        quotaResetAt,
        metadata: data.metadata || null,
        tags: data.tags || [],
        owner: data.owner || null,
        environment: data.environment || null,
        description: data.description || null,
      });

      const saved = await apiKey.save();
      return this.mapToApiKey(saved);
    } catch (error) {
      ApiKeyLogger.error(
        'Error creating API key in Mongoose',
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to create API key in database');
    }
  }

  async findByKeyPrefix(keyPrefix: string): Promise<ApiKey[]> {
    try {
      const now = new Date();
      const apiKeys = await this.model.find({
        keyPrefix,
        revokedAt: null,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      });

      return apiKeys.map((key) => this.mapToApiKey(key));
    } catch (error) {
      ApiKeyLogger.error(
        `Error finding keys by prefix: ${keyPrefix}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to query API keys');
    }
  }

  async findById(id: string): Promise<ApiKey | null> {
    const apiKey = await this.model.findById(id);

    if (!apiKey) {
      return null;
    }

    return this.mapToApiKey(apiKey);
  }

  async revoke(id: string, reason?: string): Promise<ApiKey> {
    const apiKey = await this.model.findByIdAndUpdate(
      id,
      { revokedAt: new Date(), revocationReason: reason || null },
      { new: true },
    );

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found`);
    }

    return this.mapToApiKey(apiKey);
  }

  async findAll(): Promise<ApiKey[]> {
    const apiKeys = await this.model.find().sort({ createdAt: -1 });
    return apiKeys.map((key) => this.mapToApiKey(key));
  }

  async findAllActive(): Promise<ApiKey[]> {
    const now = new Date();
    const apiKeys = await this.model
      .find({
        revokedAt: null,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      })
      .sort({ createdAt: -1 });

    return apiKeys.map((key) => this.mapToApiKey(key));
  }

  async updateLastUsed(id: string): Promise<ApiKey> {
    const apiKey = await this.model.findByIdAndUpdate(
      id,
      { lastUsedAt: new Date() },
      { new: true },
    );

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found`);
    }

    return this.mapToApiKey(apiKey);
  }

  async updateQuotaUsage(id: string, quotaUsed: number, quotaResetAt: Date): Promise<ApiKey> {
    try {
      const apiKey = await this.model
        .findByIdAndUpdate(id, { quotaUsed, quotaResetAt }, { new: true })
        .exec();

      if (!apiKey) {
        throw new Error(`API key with ID ${id} not found`);
      }

      return this.mapToApiKey(apiKey);
    } catch (error) {
      ApiKeyLogger.error(
        `Error updating quota usage for key ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to update quota usage');
    }
  }

  async query(filters: {
    tags?: string[];
    owner?: string;
    environment?: 'production' | 'staging' | 'development';
    scopes?: string[];
    active?: boolean;
    createdAfter?: Date;
    createdBefore?: Date;
    lastUsedAfter?: Date;
    lastUsedBefore?: Date;
    limit?: number;
    offset?: number;
  }): Promise<ApiKey[]> {
    try {
      const queryFilter: MongooseApiKeyFilter = {};

      if (filters.tags && filters.tags.length > 0) {
        queryFilter.tags = { $all: filters.tags };
      }

      if (filters.owner) {
        queryFilter.owner = filters.owner;
      }

      if (filters.environment) {
        queryFilter.environment = filters.environment;
      }

      if (filters.scopes && filters.scopes.length > 0) {
        queryFilter.scopes = { $all: filters.scopes };
      }

      if (filters.active !== undefined) {
        if (filters.active) {
          queryFilter.revokedAt = null;
          queryFilter.$or = [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }];
        } else {
          queryFilter.$or = [{ revokedAt: { $ne: null } }, { expiresAt: { $lte: new Date() } }];
        }
      }

      if (filters.createdAfter) {
        queryFilter.createdAt = { $gte: filters.createdAfter };
      }

      if (filters.createdBefore) {
        if (
          queryFilter.createdAt &&
          typeof queryFilter.createdAt === 'object' &&
          '$gte' in queryFilter.createdAt
        ) {
          queryFilter.createdAt = { ...queryFilter.createdAt, $lte: filters.createdBefore };
        } else {
          queryFilter.createdAt = { $lte: filters.createdBefore };
        }
      }

      if (filters.lastUsedAfter) {
        queryFilter.lastUsedAt = { $gte: filters.lastUsedAfter };
      }

      if (filters.lastUsedBefore) {
        if (
          queryFilter.lastUsedAt &&
          typeof queryFilter.lastUsedAt === 'object' &&
          '$gte' in queryFilter.lastUsedAt
        ) {
          queryFilter.lastUsedAt = { ...queryFilter.lastUsedAt, $lte: filters.lastUsedBefore };
        } else {
          queryFilter.lastUsedAt = { $lte: filters.lastUsedBefore };
        }
      }

      const apiKeys = await this.model
        .find(queryFilter)
        .sort({ createdAt: -1 })
        .limit(filters.limit || 100)
        .skip(filters.offset || 0)
        .exec();

      return apiKeys.map((key) => this.mapToApiKey(key));
    } catch (error) {
      ApiKeyLogger.error('Error querying API keys', error instanceof Error ? error : String(error));
      throw new InternalServerErrorException('Failed to query API keys');
    }
  }

  private calculateQuotaResetAt(now: Date, period: 'daily' | 'monthly' | 'yearly'): Date {
    const resetAt = new Date(now);
    switch (period) {
      case 'daily':
        resetAt.setDate(resetAt.getDate() + 1);
        resetAt.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        resetAt.setMonth(resetAt.getMonth() + 1);
        resetAt.setDate(1);
        resetAt.setHours(0, 0, 0, 0);
        break;
      case 'yearly':
        resetAt.setFullYear(resetAt.getFullYear() + 1);
        resetAt.setMonth(0);
        resetAt.setDate(1);
        resetAt.setHours(0, 0, 0, 0);
        break;
    }
    return resetAt;
  }

  private mapToApiKey(doc: MongooseApiKeyDocument): ApiKey {
    const docAny = doc as MongooseApiKeyDocument & {
      quotaMax?: number | null;
      quotaPeriod?: string | null;
      quotaUsed?: number;
      quotaResetAt?: Date | null;
      metadata?: Record<string, unknown> | null;
      tags?: string[];
      owner?: string | null;
      environment?: string | null;
      description?: string | null;
    };

    return {
      id: doc._id?.toString() || doc.id,
      name: doc.name,
      keyPrefix: doc.keyPrefix,
      hashedKey: doc.hashedKey,
      scopes: doc.scopes || [],
      expiresAt: doc.expiresAt,
      revokedAt: doc.revokedAt,
      revocationReason: docAny.revocationReason || undefined,
      lastUsedAt: doc.lastUsedAt,
      ipWhitelist: docAny.ipWhitelist || [],
      ipBlacklist: docAny.ipBlacklist || [],
      rateLimitMax: docAny.rateLimitMax || undefined,
      rateLimitWindowMs: doc.rateLimitWindowMs || undefined,
      quotaMax: docAny.quotaMax || undefined,
      quotaPeriod: (docAny.quotaPeriod as 'daily' | 'monthly' | 'yearly') || undefined,
      quotaUsed: docAny.quotaUsed || undefined,
      quotaResetAt: docAny.quotaResetAt || undefined,
      metadata: docAny.metadata || undefined,
      tags: docAny.tags || undefined,
      owner: docAny.owner || undefined,
      environment: (docAny.environment as 'production' | 'staging' | 'development') || undefined,
      description: docAny.description || undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
