import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiKey as PrismaApiKey, PrismaClient } from '@prisma/client';
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
    rateLimitMax?: number | null;
    rateLimitWindowMs?: number | null;
  }): Promise<ApiKey> {
    try {
      const apiKey = await this.prisma.apiKey.create({
        data: {
          name: data.name,
          keyPrefix: data.keyPrefix,
          hashedKey: data.hashedKey,
          scopes: data.scopes,
          expiresAt: data.expiresAt || null,
          ipWhitelist: data.ipWhitelist || [],
          rateLimitMax: data.rateLimitMax || null,
          rateLimitWindowMs: data.rateLimitWindowMs || null,
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
   * @returns The revoked API key
   */
  async revoke(id: string): Promise<ApiKey> {
    try {
      const apiKey = await this.prisma.apiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
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
      lastUsedAt: prismaKey.lastUsedAt,
      ipWhitelist: prismaKey.ipWhitelist || [],
      rateLimitMax: prismaKey.rateLimitMax || undefined,
      rateLimitWindowMs: prismaKey.rateLimitWindowMs || undefined,
      createdAt: prismaKey.createdAt,
      updatedAt: prismaKey.updatedAt,
    };
  }
}
