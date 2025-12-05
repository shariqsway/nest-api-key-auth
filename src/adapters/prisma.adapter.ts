import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ApiKey as PrismaApiKey, PrismaClient } from '@prisma/client';
import { ApiKey } from '../interfaces';

export const PRISMA_CLIENT_KEY = 'PRISMA_CLIENT';

@Injectable()
export class PrismaAdapter implements OnModuleInit, OnModuleDestroy {
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
      await this.prisma.$connect();
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
  }): Promise<ApiKey> {
    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: data.name,
        keyPrefix: data.keyPrefix,
        hashedKey: data.hashedKey,
        scopes: data.scopes,
        expiresAt: data.expiresAt || null,
      },
    });

    return this.mapToApiKey(apiKey);
  }

  /**
   * Finds API keys by their prefix (used for fast lookup during validation).
   *
   * @param keyPrefix - The first 8 characters of the token
   * @returns Array of active API keys with matching prefix
   */
  async findByKeyPrefix(keyPrefix: string): Promise<ApiKey[]> {
    const now = new Date();
    const apiKeys = await this.prisma.apiKey.findMany({
      where: {
        keyPrefix,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    return apiKeys.map((key: PrismaApiKey) => this.mapToApiKey(key));
  }

  /**
   * Finds an API key by its unique identifier.
   *
   * @param id - The API key ID
   * @returns The API key if found, null otherwise
   */
  async findById(id: string): Promise<ApiKey | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      return null;
    }

    return this.mapToApiKey(apiKey);
  }

  /**
   * Revokes an API key by setting its revokedAt timestamp.
   *
   * @param id - The API key ID to revoke
   * @returns The revoked API key
   */
  async revoke(id: string): Promise<ApiKey> {
    const apiKey = await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return this.mapToApiKey(apiKey);
  }

  /**
   * Retrieves all API keys from the database, including revoked ones.
   *
   * @returns Array of all API keys
   */
  async findAll(): Promise<ApiKey[]> {
    const apiKeys = await this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return apiKeys.map((key: PrismaApiKey) => this.mapToApiKey(key));
  }

  /**
   * Retrieves only active (non-revoked) API keys.
   *
   * @returns Array of active API keys
   */
  async findAllActive(): Promise<ApiKey[]> {
    const now = new Date();
    const apiKeys = await this.prisma.apiKey.findMany({
      where: {
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return apiKeys.map((key: PrismaApiKey) => this.mapToApiKey(key));
  }

  /**
   * Updates the lastUsedAt timestamp for an API key.
   *
   * @param id - The API key ID
   * @returns The updated API key
   */
  async updateLastUsed(id: string): Promise<ApiKey> {
    const apiKey = await this.prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });

    return this.mapToApiKey(apiKey);
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
      hashedKey: prismaKey.hashedKey,
      scopes: prismaKey.scopes || [],
      expiresAt: prismaKey.expiresAt,
      revokedAt: prismaKey.revokedAt,
      lastUsedAt: prismaKey.lastUsedAt,
      createdAt: prismaKey.createdAt,
      updatedAt: prismaKey.updatedAt,
    };
  }
}
