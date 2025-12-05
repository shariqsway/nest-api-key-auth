import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ApiKey } from '../interfaces';
import { IApiKeyAdapter } from './base.adapter';
import { MongooseApiKeyDocument, MongooseApiKeyModel } from './types';
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
    rateLimitMax?: number | null;
    rateLimitWindowMs?: number | null;
  }): Promise<ApiKey> {
    try {
      const apiKey = new this.model({
        name: data.name,
        keyPrefix: data.keyPrefix,
        hashedKey: data.hashedKey,
        scopes: data.scopes,
        expiresAt: data.expiresAt || null,
        ipWhitelist: data.ipWhitelist || [],
        rateLimitMax: data.rateLimitMax || null,
        rateLimitWindowMs: data.rateLimitWindowMs || null,
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

  async revoke(id: string): Promise<ApiKey> {
    const apiKey = await this.model.findByIdAndUpdate(id, { revokedAt: new Date() }, { new: true });

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

  private mapToApiKey(doc: MongooseApiKeyDocument): ApiKey {
    const docAny = doc as MongooseApiKeyDocument & {
      ipWhitelist?: string[];
      rateLimitMax?: number | null;
      rateLimitWindowMs?: number | null;
    };
    return {
      id: doc._id?.toString() || doc.id,
      name: doc.name,
      keyPrefix: doc.keyPrefix,
      hashedKey: doc.hashedKey,
      scopes: doc.scopes || [],
      expiresAt: doc.expiresAt,
      revokedAt: doc.revokedAt,
      lastUsedAt: doc.lastUsedAt,
      ipWhitelist: docAny.ipWhitelist || [],
      rateLimitMax: docAny.rateLimitMax || undefined,
      rateLimitWindowMs: docAny.rateLimitWindowMs || undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
