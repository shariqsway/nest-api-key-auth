import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { HashUtil } from '../utils/hash.util';
import { ApiKeyLogger } from '../utils/logger.util';

export interface CliConfig {
  databaseUrl?: string;
  adapter?: 'prisma' | 'typeorm' | 'mongoose';
  hashAlgorithm?: 'bcrypt' | 'argon2';
  secretLength?: number;
}

export class CliService {
  private prisma: PrismaClient | null = null;
  private config: CliConfig;

  constructor(config: CliConfig = {}) {
    this.config = {
      adapter: 'prisma',
      hashAlgorithm: 'bcrypt',
      secretLength: 32,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (this.config.adapter === 'prisma') {
      try {
        // Set DATABASE_URL if provided
        if (this.config.databaseUrl) {
          process.env.DATABASE_URL = this.config.databaseUrl;
        }
        this.prisma = new PrismaClient();
        await this.prisma.$connect();
      } catch (error) {
        throw new Error(
          `Failed to connect to database: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      throw new Error(
        `CLI currently only supports Prisma adapter. TypeORM and Mongoose support coming soon.`,
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.prisma) {
      await this.prisma.$disconnect();
    }
  }

  async createKey(options: {
    name: string;
    scopes?: string[];
    expiresAt?: Date;
    ipWhitelist?: string[];
    rateLimitMax?: number;
    rateLimitWindowMs?: number;
  }): Promise<{
    id: string;
    name: string;
    token: string;
    scopes: string[];
    expiresAt: Date | null;
    createdAt: Date;
  }> {
    if (!this.prisma) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const token = this.generateToken(this.config.secretLength || 32);
    const keyPrefix = token.substring(0, 8);
    const hashedKey = await HashUtil.hash(token, {
      algorithm: this.config.hashAlgorithm || 'bcrypt',
      bcryptRounds: 10,
    });

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: options.name,
        keyPrefix,
        hashedKey,
        scopes: options.scopes || [],
        expiresAt: options.expiresAt || null,
        ipWhitelist: options.ipWhitelist || [],
        rateLimitMax: options.rateLimitMax || null,
        rateLimitWindowMs: options.rateLimitWindowMs || null,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      token,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    };
  }

  async listKeys(includeRevoked = false): Promise<
    Array<{
      id: string;
      name: string;
      scopes: string[];
      expiresAt: Date | null;
      revokedAt: Date | null;
      lastUsedAt: Date | null;
      createdAt: Date;
    }>
  > {
    if (!this.prisma) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const where = includeRevoked ? {} : { revokedAt: null };

    const keys = await this.prisma.apiKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    return keys;
  }

  async revokeKey(id: string): Promise<{ id: string; name: string; revokedAt: Date }> {
    if (!this.prisma) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const existingKey = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existingKey) {
      throw new Error(`API key with ID ${id} not found`);
    }

    if (existingKey.revokedAt) {
      throw new Error(`API key ${id} is already revoked`);
    }

    const revokedKey = await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: {
        id: true,
        name: true,
        revokedAt: true,
      },
    });

    return revokedKey;
  }

  async rotateKey(
    id: string,
    options: { revokeOldKey?: boolean; gracePeriodHours?: number } = {},
  ): Promise<{
    id: string;
    name: string;
    token: string;
    scopes: string[];
    expiresAt: Date | null;
    createdAt: Date;
  }> {
    if (!this.prisma) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const oldKey = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!oldKey) {
      throw new Error(`API key with ID ${id} not found`);
    }

    const newKey = await this.createKey({
      name: `${oldKey.name} (rotated)`,
      scopes: oldKey.scopes,
      expiresAt: oldKey.expiresAt,
      ipWhitelist: oldKey.ipWhitelist,
      rateLimitMax: oldKey.rateLimitMax || undefined,
      rateLimitWindowMs: oldKey.rateLimitWindowMs || undefined,
    });

    if (options.revokeOldKey) {
      if (options.gracePeriodHours && options.gracePeriodHours > 0) {
        setTimeout(
          async () => {
            try {
              await this.revokeKey(id);
            } catch (error) {
              ApiKeyLogger.error(`Failed to revoke key after grace period: ${id}`, error);
            }
          },
          options.gracePeriodHours * 60 * 60 * 1000,
        );
      } else {
        await this.revokeKey(id);
      }
    }

    return newKey;
  }

  private generateToken(length: number): string {
    return crypto.randomBytes(length).toString('base64url');
  }
}
