import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ApiKey } from '../interfaces';
import { IApiKeyAdapter } from './base.adapter';
import { TypeOrmApiKeyRepository, TypeOrmApiKeyEntity } from './types';
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
    rateLimitMax?: number | null;
    rateLimitWindowMs?: number | null;
  }): Promise<ApiKey> {
    try {
      const apiKey = this.repository.create({
        name: data.name,
        keyPrefix: data.keyPrefix,
        hashedKey: data.hashedKey,
        scopes: data.scopes,
        expiresAt: data.expiresAt || null,
        ipWhitelist: data.ipWhitelist || [],
        rateLimitMax: data.rateLimitMax || null,
        rateLimitWindowMs: data.rateLimitWindowMs || null,
      });

      const saved = await this.repository.save(apiKey);
      return this.mapToApiKey(saved);
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

  async revoke(id: string): Promise<ApiKey> {
    await this.repository.update(id, { revokedAt: new Date() });
    const apiKey = await this.repository.findOne({ where: { id } });

    if (!apiKey) {
      throw new Error(`API key with ID ${id} not found after revocation`);
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

  private mapToApiKey(entity: TypeOrmApiKeyEntity): ApiKey {
    const entityAny = entity as TypeOrmApiKeyEntity & {
      ipWhitelist?: string[];
      rateLimitMax?: number | null;
      rateLimitWindowMs?: number | null;
    };
    return {
      id: entity.id,
      name: entity.name,
      keyPrefix: entity.keyPrefix,
      hashedKey: entity.hashedKey,
      scopes: entity.scopes || [],
      expiresAt: entity.expiresAt,
      revokedAt: entity.revokedAt,
      lastUsedAt: entity.lastUsedAt,
      ipWhitelist: entityAny.ipWhitelist || [],
      rateLimitMax: entityAny.rateLimitMax || undefined,
      rateLimitWindowMs: entityAny.rateLimitWindowMs || undefined,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
