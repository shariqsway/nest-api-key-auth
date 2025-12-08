import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ApiKey } from '../interfaces';
import { IApiKeyAdapter } from './base.adapter';
import {
  TypeOrmApiKeyRepository,
  TypeOrmApiKeyEntity,
  TypeOrmApiKeyEntityData,
  TypeOrmQuotaUpdateData,
} from './types';
import { ApiKeyLogger } from '../utils/logger.util';

export const TYPEORM_REPOSITORY_KEY = 'TYPEORM_API_KEY_REPOSITORY';

/**
 * TypeORM adapter for API key storage.
 * Requires a TypeORM repository to be provided via dependency injection.
 */
@Injectable()
export class TypeOrmAdapter implements IApiKeyAdapter {
  constructor(private readonly repository: TypeOrmApiKeyRepository) {}

  async create(data: {
    name: string;
    keyPrefix: string;
    hashedKey: string;
    scopes: string[];
    expiresAt?: Date | null;
    ipWhitelist?: string[];
    ipBlacklist?: string[];
    rateLimitMax?: number | null;
    rateLimitWindowMs?: number | null;
    quotaMax?: number | null;
    quotaPeriod?: 'daily' | 'monthly' | 'yearly' | null;
    metadata?: Record<string, unknown> | null;
    tags?: string[];
    owner?: string | null;
    environment?: 'production' | 'staging' | 'development' | null;
    description?: string | null;
    state?: string;
    approvedAt?: Date | null;
    expirationGracePeriodMs?: number | null;
  }): Promise<ApiKey> {
    try {
      const now = new Date();
      let quotaResetAt: Date | null = null;
      if (data.quotaMax && data.quotaPeriod) {
        quotaResetAt = this.calculateQuotaResetAt(now, data.quotaPeriod);
      }

      const apiKeyData: TypeOrmApiKeyEntityData = {
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
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        tags: data.tags || [],
        owner: data.owner || null,
        environment: data.environment || null,
        description: data.description || null,
        state: data.state || 'active',
        approvedAt: data.approvedAt || null,
        expirationGracePeriodMs: data.expirationGracePeriodMs || null,
      };

      const apiKey = this.repository.create(apiKeyData);
      const saved = await this.repository.save(apiKey);
      const savedEntity = Array.isArray(saved) ? saved[0] : saved;
      return this.mapToApiKey(savedEntity as TypeOrmApiKeyEntity);
    } catch (error) {
      ApiKeyLogger.error(
        'Error creating API key in TypeORM',
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to create API key in database');
    }
  }

  async findByKeyPrefix(keyPrefix: string): Promise<ApiKey[]> {
    try {
      const now = new Date();
      const apiKeys = await this.repository
        .createQueryBuilder('apiKey')
        .where('apiKey.keyPrefix = :keyPrefix', { keyPrefix })
        .andWhere('apiKey.revokedAt IS NULL')
        .andWhere('(apiKey.expiresAt IS NULL OR apiKey.expiresAt > :now)', { now })
        .getMany();

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
    const apiKey = await this.repository.findOne({ where: { id } });

    if (!apiKey) {
      return null;
    }

    return this.mapToApiKey(apiKey);
  }

  async revoke(id: string, reason?: string): Promise<ApiKey> {
    await this.repository.update(id, {
      revokedAt: new Date(),
      revocationReason: reason || null,
      state: 'revoked',
    });
    const apiKey = await this.repository.findOne({ where: { id } });

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found after revocation`);
    }

    return this.mapToApiKey(apiKey);
  }

  async suspend(id: string, _reason?: string): Promise<ApiKey> {
    await this.repository.update(id, {
      suspendedAt: new Date(),
      state: 'suspended',
    });
    const apiKey = await this.repository.findOne({ where: { id } });

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found after suspension`);
    }

    return this.mapToApiKey(apiKey);
  }

  async unsuspend(id: string): Promise<ApiKey> {
    await this.repository.update(id, {
      suspendedAt: null,
      state: 'active',
    });
    const apiKey = await this.repository.findOne({ where: { id } });

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found after unsuspension`);
    }

    return this.mapToApiKey(apiKey);
  }

  async restore(id: string): Promise<ApiKey> {
    await this.repository.update(id, {
      revokedAt: null,
      revocationReason: null,
      state: 'active',
    });
    const apiKey = await this.repository.findOne({ where: { id } });

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found after restoration`);
    }

    return this.mapToApiKey(apiKey);
  }

  async approve(id: string): Promise<ApiKey> {
    await this.repository.update(id, {
      approvedAt: new Date(),
      state: 'active',
    });
    const apiKey = await this.repository.findOne({ where: { id } });

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found after approval`);
    }

    return this.mapToApiKey(apiKey);
  }

  async updateState(id: string, state: string): Promise<ApiKey> {
    await this.repository.update(id, { state });
    const apiKey = await this.repository.findOne({ where: { id } });

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found after state update`);
    }

    return this.mapToApiKey(apiKey);
  }

  async findAll(): Promise<ApiKey[]> {
    const apiKeys = await this.repository.find({
      order: { createdAt: 'DESC' },
    });

    return apiKeys.map((key) => this.mapToApiKey(key));
  }

  async findAllActive(): Promise<ApiKey[]> {
    const now = new Date();
    const apiKeys = await this.repository
      .createQueryBuilder('apiKey')
      .where('apiKey.revokedAt IS NULL')
      .andWhere('(apiKey.expiresAt IS NULL OR apiKey.expiresAt > :now)', { now })
      .orderBy('apiKey.createdAt', 'DESC')
      .getMany();

    return apiKeys.map((key) => this.mapToApiKey(key));
  }

  async updateLastUsed(id: string): Promise<ApiKey> {
    await this.repository.update(id, { lastUsedAt: new Date() });
    const apiKey = await this.repository.findOne({ where: { id } });

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found after update`);
    }

    return this.mapToApiKey(apiKey);
  }

  async updateQuotaUsage(id: string, quotaUsed: number, quotaResetAt: Date): Promise<ApiKey> {
    try {
      const updateData: TypeOrmQuotaUpdateData = { quotaUsed, quotaResetAt };
      await this.repository.update(id, updateData as Partial<TypeOrmApiKeyEntity>);
      const apiKey = await this.repository.findOne({ where: { id } });
      if (!apiKey) {
        throw new Error(`API key with ID ${id} not found after quota update`);
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
    state?: string;
    createdAfter?: Date;
    createdBefore?: Date;
    lastUsedAfter?: Date;
    lastUsedBefore?: Date;
    limit?: number;
    offset?: number;
  }): Promise<ApiKey[]> {
    try {
      const queryBuilder = this.repository.createQueryBuilder('apiKey');

      if (filters.tags && filters.tags.length > 0) {
        queryBuilder.andWhere('apiKey.tags && :tags', { tags: filters.tags });
      }

      if (filters.owner) {
        queryBuilder.andWhere('apiKey.owner = :owner', { owner: filters.owner });
      }

      if (filters.environment) {
        queryBuilder.andWhere('apiKey.environment = :environment', {
          environment: filters.environment,
        });
      }

      if (filters.scopes && filters.scopes.length > 0) {
        queryBuilder.andWhere('apiKey.scopes && :scopes', { scopes: filters.scopes });
      }

      if (filters.state) {
        queryBuilder.andWhere('apiKey.state = :state', { state: filters.state });
      }

      if (filters.active !== undefined) {
        if (filters.active) {
          queryBuilder.andWhere('apiKey.revokedAt IS NULL');
          queryBuilder.andWhere('apiKey.state != :revokedState', { revokedState: 'revoked' });
          queryBuilder.andWhere('(apiKey.expiresAt IS NULL OR apiKey.expiresAt > :now)', {
            now: new Date(),
          });
        } else {
          queryBuilder.andWhere('(apiKey.revokedAt IS NOT NULL OR apiKey.expiresAt <= :now)', {
            now: new Date(),
          });
        }
      }

      if (filters.createdAfter) {
        queryBuilder.andWhere('apiKey.createdAt >= :createdAfter', {
          createdAfter: filters.createdAfter,
        });
      }

      if (filters.createdBefore) {
        queryBuilder.andWhere('apiKey.createdAt <= :createdBefore', {
          createdBefore: filters.createdBefore,
        });
      }

      if (filters.lastUsedAfter) {
        queryBuilder.andWhere('apiKey.lastUsedAt >= :lastUsedAfter', {
          lastUsedAfter: filters.lastUsedAfter,
        });
      }

      if (filters.lastUsedBefore) {
        queryBuilder.andWhere('apiKey.lastUsedAt <= :lastUsedBefore', {
          lastUsedBefore: filters.lastUsedBefore,
        });
      }

      queryBuilder.orderBy('apiKey.createdAt', 'DESC');
      queryBuilder.take(filters.limit || 100);
      queryBuilder.skip(filters.offset || 0);

      const apiKeys = await queryBuilder.getMany();
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

  private mapToApiKey(entity: TypeOrmApiKeyEntity): ApiKey {
    const entityAny = entity as TypeOrmApiKeyEntity & {
      ipWhitelist?: string[];
      rateLimitMax?: number | null;
      rateLimitWindowMs?: number | null;
      quotaMax?: number | null;
      quotaPeriod?: string | null;
      quotaUsed?: number;
      quotaResetAt?: Date | null;
      metadata?: string | null;
      tags?: string[];
      owner?: string | null;
      environment?: string | null;
      description?: string | null;
      suspendedAt?: Date | null;
      state?: string;
      approvedAt?: Date | null;
      expirationGracePeriodMs?: number | null;
    };

    let metadata: Record<string, unknown> | undefined = undefined;
    if (entityAny.metadata) {
      try {
        metadata =
          typeof entityAny.metadata === 'string'
            ? JSON.parse(entityAny.metadata)
            : entityAny.metadata;
      } catch {
        metadata = undefined;
      }
    }

    return {
      id: entity.id,
      name: entity.name,
      keyPrefix: entity.keyPrefix,
      hashedKey: entity.hashedKey,
      scopes: entity.scopes || [],
      expiresAt: entity.expiresAt,
      revokedAt: entity.revokedAt,
      revocationReason: entityAny.revocationReason || undefined,
      suspendedAt: entityAny.suspendedAt || undefined,
      state: (entityAny.state as ApiKey['state']) || 'active',
      approvedAt: entityAny.approvedAt || undefined,
      expirationGracePeriodMs: entityAny.expirationGracePeriodMs || undefined,
      lastUsedAt: entity.lastUsedAt,
      ipWhitelist: entityAny.ipWhitelist || [],
      ipBlacklist: entityAny.ipBlacklist || [],
      rateLimitMax: entityAny.rateLimitMax || undefined,
      rateLimitWindowMs: entityAny.rateLimitWindowMs || undefined,
      quotaMax: entityAny.quotaMax || undefined,
      quotaPeriod: (entityAny.quotaPeriod as 'daily' | 'monthly' | 'yearly') || undefined,
      quotaUsed: entityAny.quotaUsed || undefined,
      quotaResetAt: entityAny.quotaResetAt || undefined,
      metadata,
      tags: entityAny.tags || undefined,
      owner: entityAny.owner || undefined,
      environment: (entityAny.environment as 'production' | 'staging' | 'development') || undefined,
      description: entityAny.description || undefined,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
