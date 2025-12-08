import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiKey as PrismaApiKey, PrismaClient, Prisma } from '@prisma/client';
import { ApiKey } from '../interfaces';
import { IApiKeyAdapter } from './base.adapter';
import { ApiKeyLogger } from '../utils/logger.util';

export const PRISMA_CLIENT_KEY = 'PRISMA_CLIENT';

@Injectable()
export class PrismaAdapter implements IApiKeyAdapter, OnModuleInit, OnModuleDestroy {
  private prisma: PrismaClient;
  private shouldDisconnect: boolean;

  constructor(@Optional() @Inject(PRISMA_CLIENT_KEY) prismaClient?: PrismaClient) {
    if (prismaClient) {
      this.prisma = prismaClient;
      this.shouldDisconnect = false;
    } else {
      this.prisma = new PrismaClient();
      this.shouldDisconnect = true;
    }
  }

  async onModuleInit(): Promise<void> {
    if (this.shouldDisconnect) {
      try {
        await this.prisma.$connect();
        ApiKeyLogger.log('Prisma client connected successfully');
      } catch (error) {
        ApiKeyLogger.error(
          'Failed to connect Prisma client',
          error instanceof Error ? error : String(error),
        );
        throw new InternalServerErrorException('Failed to initialize database connection');
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.shouldDisconnect) {
      await this.prisma.$disconnect();
    }
  }

  /**
   * Creates a new API key in the database.
   *
   * @param data - The API key data to create
   * @returns The created API key
   */
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

      const apiKey = await this.prisma.apiKey.create({
        data: {
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
          metadata: data.metadata ? (data.metadata as Prisma.InputJsonValue) : null,
          tags: data.tags || [],
          owner: data.owner || null,
          environment: data.environment || null,
          description: data.description || null,
          state: data.state || 'active',
          approvedAt: data.approvedAt || null,
          expirationGracePeriodMs: data.expirationGracePeriodMs || null,
        },
      });

      return this.mapToApiKey(apiKey);
    } catch (error) {
      ApiKeyLogger.error(
        'Error creating API key in database',
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to create API key in database');
    }
  }

  /**
   * Finds API keys by their prefix (used for fast lookup during validation).
   *
   * @param keyPrefix - The first 8 characters of the token
   * @returns Array of active API keys with matching prefix
   */
  async findByKeyPrefix(keyPrefix: string): Promise<ApiKey[]> {
    try {
      const now = new Date();
      const apiKeys = await this.prisma.apiKey.findMany({
        where: {
          keyPrefix,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });

      return apiKeys.map((key: PrismaApiKey) => this.mapToApiKey(key));
    } catch (error) {
      ApiKeyLogger.error(
        `Error finding keys by prefix: ${keyPrefix}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to query API keys');
    }
  }

  /**
   * Finds an API key by its unique identifier.
   *
   * @param id - The API key ID
   * @returns The API key if found, null otherwise
   */
  async findById(id: string): Promise<ApiKey | null> {
    try {
      const apiKey = await this.prisma.apiKey.findUnique({
        where: { id },
      });

      if (!apiKey) {
        return null;
      }

      return this.mapToApiKey(apiKey);
    } catch (error) {
      ApiKeyLogger.error(
        `Error finding key by ID: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to find API key');
    }
  }

  /**
   * Revokes an API key by setting its revokedAt timestamp.
   *
   * @param id - The API key ID to revoke
   * @param reason - Optional reason for revocation
   * @returns The revoked API key
   */
  async revoke(id: string, reason?: string): Promise<ApiKey> {
    try {
      const apiKey = await this.prisma.apiKey.update({
        where: { id },
        data: {
          revokedAt: new Date(),
          revocationReason: reason || null,
          state: 'revoked',
        },
      });

      return this.mapToApiKey(apiKey);
    } catch (error) {
      ApiKeyLogger.error(
        `Error revoking key: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to revoke API key');
    }
  }

  async suspend(id: string, _reason?: string): Promise<ApiKey> {
    try {
      const apiKey = await this.prisma.apiKey.update({
        where: { id },
        data: {
          suspendedAt: new Date(),
          state: 'suspended',
        },
      });

      return this.mapToApiKey(apiKey);
    } catch (error) {
      ApiKeyLogger.error(
        `Error suspending key: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to suspend API key');
    }
  }

  async unsuspend(id: string): Promise<ApiKey> {
    try {
      const apiKey = await this.prisma.apiKey.update({
        where: { id },
        data: {
          suspendedAt: null,
          state: 'active',
        },
      });

      return this.mapToApiKey(apiKey);
    } catch (error) {
      ApiKeyLogger.error(
        `Error unsuspending key: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to unsuspend API key');
    }
  }

  async restore(id: string): Promise<ApiKey> {
    try {
      const apiKey = await this.prisma.apiKey.update({
        where: { id },
        data: {
          revokedAt: null,
          revocationReason: null,
          state: 'active',
        },
      });

      return this.mapToApiKey(apiKey);
    } catch (error) {
      ApiKeyLogger.error(
        `Error restoring key: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to restore API key');
    }
  }

  async approve(id: string): Promise<ApiKey> {
    try {
      const apiKey = await this.prisma.apiKey.update({
        where: { id },
        data: {
          approvedAt: new Date(),
          state: 'active',
        },
      });

      return this.mapToApiKey(apiKey);
    } catch (error) {
      ApiKeyLogger.error(
        `Error approving key: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to approve API key');
    }
  }

  async updateState(id: string, state: string): Promise<ApiKey> {
    try {
      const apiKey = await this.prisma.apiKey.update({
        where: { id },
        data: { state },
      });

      return this.mapToApiKey(apiKey);
    } catch (error) {
      ApiKeyLogger.error(
        `Error updating state for key: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to update API key state');
    }
  }

  /**
   * Retrieves all API keys from the database, including revoked ones.
   *
   * @returns Array of all API keys
   */
  async findAll(): Promise<ApiKey[]> {
    try {
      const apiKeys = await this.prisma.apiKey.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return apiKeys.map((key: PrismaApiKey) => this.mapToApiKey(key));
    } catch (error) {
      ApiKeyLogger.error('Error finding all keys', error instanceof Error ? error : String(error));
      throw new InternalServerErrorException('Failed to retrieve API keys');
    }
  }

  /**
   * Retrieves only active (non-revoked) API keys.
   *
   * @returns Array of active API keys
   */
  async findAllActive(): Promise<ApiKey[]> {
    try {
      const now = new Date();
      const apiKeys = await this.prisma.apiKey.findMany({
        where: {
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { createdAt: 'desc' },
      });

      return apiKeys.map((key: PrismaApiKey) => this.mapToApiKey(key));
    } catch (error) {
      ApiKeyLogger.error(
        'Error finding active keys',
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to retrieve active API keys');
    }
  }

  /**
   * Updates the lastUsedAt timestamp for an API key.
   *
   * @param id - The API key ID
   * @returns The updated API key
   */
  async updateLastUsed(id: string): Promise<ApiKey> {
    try {
      const apiKey = await this.prisma.apiKey.update({
        where: { id },
        data: { lastUsedAt: new Date() },
      });

      return this.mapToApiKey(apiKey);
    } catch (error) {
      ApiKeyLogger.error(
        `Error updating last used: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to update last used timestamp');
    }
  }

  async updateQuotaUsage(id: string, quotaUsed: number, quotaResetAt: Date): Promise<ApiKey> {
    try {
      const apiKey = await this.prisma.apiKey.update({
        where: { id },
        data: {
          quotaUsed,
          quotaResetAt,
        },
      });

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
      const where: Prisma.ApiKeyWhereInput = {};

      if (filters.tags && filters.tags.length > 0) {
        where.tags = { hasEvery: filters.tags };
      }

      if (filters.owner) {
        where.owner = filters.owner;
      }

      if (filters.environment) {
        where.environment = filters.environment;
      }

      if (filters.scopes && filters.scopes.length > 0) {
        where.scopes = { hasEvery: filters.scopes };
      }

      if (filters.state) {
        where.state = filters.state;
      }

      if (filters.active !== undefined) {
        if (filters.active) {
          where.revokedAt = null;
          where.state = { not: 'revoked' };
          where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
        } else {
          where.OR = [{ revokedAt: { not: null } }, { expiresAt: { lte: new Date() } }];
        }
      }

      if (filters.createdAfter) {
        where.createdAt = { gte: filters.createdAfter };
      }

      if (filters.createdBefore) {
        const existingCreatedAt = where.createdAt as Prisma.DateTimeFilter | undefined;
        if (existingCreatedAt && 'gte' in existingCreatedAt) {
          where.createdAt = { ...existingCreatedAt, lte: filters.createdBefore };
        } else {
          where.createdAt = { lte: filters.createdBefore };
        }
      }

      if (filters.lastUsedAfter) {
        where.lastUsedAt = { gte: filters.lastUsedAfter };
      }

      if (filters.lastUsedBefore) {
        const existingLastUsedAt = where.lastUsedAt as Prisma.DateTimeFilter | undefined;
        if (existingLastUsedAt && 'gte' in existingLastUsedAt) {
          where.lastUsedAt = { ...existingLastUsedAt, lte: filters.lastUsedBefore };
        } else {
          where.lastUsedAt = { lte: filters.lastUsedBefore };
        }
      }

      const apiKeys = await this.prisma.apiKey.findMany({
        where,
        take: filters.limit || 100,
        skip: filters.offset || 0,
        orderBy: { createdAt: 'desc' },
      });

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

  /**
   * Maps a Prisma API key model to the application's ApiKey interface.
   *
   * @param prismaKey - The Prisma model instance
   * @returns The mapped API key
   */
  private mapToApiKey(prismaKey: PrismaApiKey): ApiKey {
    return {
      id: prismaKey.id,
      name: prismaKey.name,
      keyPrefix: prismaKey.keyPrefix,
      hashedKey: prismaKey.hashedKey,
      scopes: prismaKey.scopes || [],
      expiresAt: prismaKey.expiresAt,
      revokedAt: prismaKey.revokedAt,
      revocationReason: prismaKey.revocationReason || undefined,
      suspendedAt: prismaKey.suspendedAt || undefined,
      state: (prismaKey.state as ApiKey['state']) || 'active',
      approvedAt: prismaKey.approvedAt || undefined,
      expirationGracePeriodMs: prismaKey.expirationGracePeriodMs || undefined,
      lastUsedAt: prismaKey.lastUsedAt,
      ipWhitelist: prismaKey.ipWhitelist || [],
      ipBlacklist: prismaKey.ipBlacklist || [],
      rateLimitMax: prismaKey.rateLimitMax || undefined,
      rateLimitWindowMs: prismaKey.rateLimitWindowMs || undefined,
      quotaMax: prismaKey.quotaMax || undefined,
      quotaPeriod: (prismaKey.quotaPeriod as 'daily' | 'monthly' | 'yearly') || undefined,
      quotaUsed: prismaKey.quotaUsed || undefined,
      quotaResetAt: prismaKey.quotaResetAt || undefined,
      metadata: prismaKey.metadata ? (prismaKey.metadata as Record<string, unknown>) : undefined,
      tags: prismaKey.tags || undefined,
      owner: prismaKey.owner || undefined,
      environment: (prismaKey.environment as 'production' | 'staging' | 'development') || undefined,
      description: prismaKey.description || undefined,
      createdAt: prismaKey.createdAt,
      updatedAt: prismaKey.updatedAt,
    };
  }
}
