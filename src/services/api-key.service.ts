import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { CreateApiKeyDto, CreateApiKeyResponse, ApiKey } from '../interfaces';
import { ApiKeyNotFoundException, ApiKeyAlreadyRevokedException } from '../exceptions';
import { validateTokenFormat, validateScopeFormat } from '../utils/validation.util';
import { ApiKeyLogger } from '../utils/logger.util';
import { CacheService } from './cache.service';
import { RedisCacheService } from './redis-cache.service';
import { HashUtil, HashAlgorithm } from '../utils/hash.util';
import { WebhookService } from './webhook.service';
import { AnalyticsService } from './analytics.service';
import { Optional, Inject } from '@nestjs/common';
import { WEBHOOK_SERVICE_TOKEN, ANALYTICS_SERVICE_TOKEN } from '../api-key.module';

@Injectable()
export class ApiKeyService {
  private readonly MIN_TOKEN_LENGTH = 8;
  private readonly hashAlgorithm: HashAlgorithm;

  constructor(
    private readonly adapter: IApiKeyAdapter,
    private readonly secretLength: number = 32,
    private readonly cacheService?: CacheService | RedisCacheService,
    hashAlgorithm: HashAlgorithm = 'bcrypt',
    @Optional() @Inject(WEBHOOK_SERVICE_TOKEN) private readonly webhookService?: WebhookService,
    @Optional()
    @Inject(ANALYTICS_SERVICE_TOKEN)
    private readonly analyticsService?: AnalyticsService,
  ) {
    this.hashAlgorithm = hashAlgorithm;
  }

  /**
   * Creates a new API key with the specified name and optional scopes.
   *
   * @param dto - The API key creation data
   * @returns The created API key with the plaintext token (shown only once)
   * @throws {BadRequestException} If the name is empty or scopes is not an array
   *
   * @example
   * ```typescript
   * const key = await apiKeyService.create({
   *   name: 'My Application',
   *   scopes: ['read:projects']
   * });
   * console.log(key.token); // Store this securely!
   * ```
   */
  async create(dto: CreateApiKeyDto): Promise<CreateApiKeyResponse> {
    try {
      this.validateCreateDto(dto);

      const token = this.generateToken(this.secretLength);
      const keyPrefix = token.substring(0, 8);
      const hashedKey = await HashUtil.hash(token, {
        algorithm: this.hashAlgorithm,
        bcryptRounds: 10,
      });

      const apiKey = await this.adapter.create({
        name: dto.name,
        keyPrefix,
        hashedKey,
        scopes: dto.scopes || [],
        expiresAt: dto.expiresAt || null,
        ipWhitelist: dto.ipWhitelist || [],
        rateLimitMax: dto.rateLimitMax || null,
        rateLimitWindowMs: dto.rateLimitWindowMs || null,
        quotaMax: dto.quotaMax || null,
        quotaPeriod: dto.quotaPeriod || null,
        metadata: dto.metadata || null,
        tags: dto.tags || [],
        owner: dto.owner || null,
        environment: dto.environment || null,
        description: dto.description || null,
      });

      if (this.cacheService) {
        const setResult = this.cacheService.set(apiKey);
        if (setResult instanceof Promise) {
          await setResult;
        }
      }

      ApiKeyLogger.log(`API key created: ${apiKey.id} (${apiKey.name})`);

      await this.webhookService
        ?.sendWebhook('key.created', {
          keyId: apiKey.id,
          keyName: apiKey.name,
          scopes: apiKey.scopes,
          expiresAt: apiKey.expiresAt,
        })
        .catch((error) => {
          ApiKeyLogger.warn(
            `Failed to send webhook for key creation: ${error instanceof Error ? error.message : String(error)}`,
          );
        });

      return {
        id: apiKey.id,
        name: apiKey.name,
        token,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      ApiKeyLogger.error('Error creating API key', error instanceof Error ? error : String(error));
      throw new InternalServerErrorException('Failed to create API key');
    }
  }

  /**
   * Validates an API key token and returns the associated key data if valid.
   *
   * @param token - The API key token to validate
   * @returns The API key if valid and active, null otherwise
   *
   * @example
   * ```typescript
   * const key = await apiKeyService.validate('abc123...');
   * if (key) {
   *   console.log('Valid key:', key.name);
   * }
   * ```
   */
  async validate(token: string): Promise<ApiKey | null> {
    try {
      if (!token || typeof token !== 'string' || token.length < this.MIN_TOKEN_LENGTH) {
        ApiKeyLogger.debug('Token validation failed: invalid length or type');
        return null;
      }

      try {
        validateTokenFormat(token);
      } catch (error) {
        ApiKeyLogger.warn(
          `Invalid token format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        return null;
      }

      const keyPrefix = token.substring(0, 8);
      let candidates: ApiKey[] = [];

      if (this.cacheService) {
        const prefixResult = this.cacheService.getByPrefix(keyPrefix);
        candidates = prefixResult instanceof Promise ? await prefixResult : prefixResult;
      }

      if (candidates.length === 0) {
        candidates = await this.adapter.findByKeyPrefix(keyPrefix);
        if (this.cacheService && candidates.length > 0) {
          const setManyResult = this.cacheService.setMany(candidates);
          if (setManyResult instanceof Promise) {
            await setManyResult;
          }
        }
      }

      if (candidates.length === 0) {
        ApiKeyLogger.debug(`No candidates found for prefix: ${keyPrefix.substring(0, 4)}...`);
        return null;
      }

      const now = new Date();

      for (const apiKey of candidates) {
        try {
          const algorithm = HashUtil.detectAlgorithm(apiKey.hashedKey);
          const isValid = await HashUtil.compare(token, apiKey.hashedKey, algorithm);
          if (isValid) {
            if (apiKey.revokedAt) {
              ApiKeyLogger.warn(`Revoked key attempted: ${apiKey.id}`);
              return null;
            }

            if (apiKey.expiresAt && apiKey.expiresAt <= now) {
              ApiKeyLogger.warn(`Expired key attempted: ${apiKey.id}`);
              return null;
            }

            ApiKeyLogger.debug(`Valid key found: ${apiKey.id} (${apiKey.name})`);

            if (this.cacheService) {
              this.cacheService.set(apiKey);
            }

            return apiKey;
          }
        } catch (error) {
          ApiKeyLogger.error(
            'Error comparing token hash',
            error instanceof Error ? error : String(error),
          );
        }
      }

      return null;
    } catch (error) {
      ApiKeyLogger.error(
        'Error validating API key',
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to validate API key');
    }
  }

  /**
   * Updates the last used timestamp for an API key.
   *
   * @param id - The API key ID
   * @returns The updated API key
   */
  async updateLastUsed(id: string): Promise<ApiKey> {
    try {
      return await this.adapter.updateLastUsed(id);
    } catch (error) {
      ApiKeyLogger.error(
        `Error updating last used for key: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to update last used timestamp');
    }
  }

  /**
   * Rotates an API key by creating a new key and optionally revoking the old one after a grace period.
   *
   * @param oldKeyId - The ID of the key to rotate
   * @param options - Rotation options
   * @returns The new API key with plaintext token (shown only once)
   * @throws {ApiKeyNotFoundException} If the old key does not exist
   *
   * @example
   * ```typescript
   * const newKey = await apiKeyService.rotate('old-key-id', {
   *   revokeOldKey: true,
   *   gracePeriodHours: 24
   * });
   * console.log('New key:', newKey.token);
   * ```
   */
  async rotate(
    oldKeyId: string,
    options: {
      revokeOldKey?: boolean;
      gracePeriodHours?: number;
    } = {},
  ): Promise<CreateApiKeyResponse> {
    try {
      const oldKey = await this.findById(oldKeyId);

      const newKey = await this.create({
        name: `${oldKey.name} (rotated)`,
        scopes: oldKey.scopes,
        expiresAt: oldKey.expiresAt,
      });

      if (options.revokeOldKey) {
        if (options.gracePeriodHours && options.gracePeriodHours > 0) {
          ApiKeyLogger.log(
            `Key ${oldKeyId} will be revoked after ${options.gracePeriodHours} hours grace period`,
          );
          setTimeout(
            async () => {
              try {
                await this.revoke(oldKeyId);
                ApiKeyLogger.log(`Key ${oldKeyId} revoked after grace period`);
              } catch (error) {
                ApiKeyLogger.error(`Error revoking key after grace period: ${oldKeyId}`, error);
              }
            },
            options.gracePeriodHours * 60 * 60 * 1000,
          );
        } else {
          await this.revoke(oldKeyId);
          ApiKeyLogger.log(`Key ${oldKeyId} revoked immediately after rotation`);
        }
      }

      ApiKeyLogger.log(`Key rotated: ${oldKeyId} -> ${newKey.id}`);

      await this.webhookService
        ?.sendWebhook('key.rotated', {
          keyId: newKey.id,
          keyName: newKey.name,
          oldKeyId: oldKey.id,
          oldKeyName: oldKey.name,
          revokeOldKey: options.revokeOldKey || false,
          gracePeriodHours: options.gracePeriodHours,
        })
        .catch((error) => {
          ApiKeyLogger.warn(
            `Failed to send webhook for key rotation: ${error instanceof Error ? error.message : String(error)}`,
          );
        });

      return newKey;
    } catch (error) {
      if (error instanceof ApiKeyNotFoundException) {
        throw error;
      }
      ApiKeyLogger.error(
        `Error rotating key: ${oldKeyId}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to rotate API key');
    }
  }

  /**
   * Finds an API key by its ID.
   *
   * @param id - The API key ID
   * @returns The API key if found
   * @throws {ApiKeyNotFoundException} If the key does not exist
   *
   * @example
   * ```typescript
   * const key = await apiKeyService.findById('key-id-123');
   * console.log(key.name);
   * ```
   */
  async findById(id: string): Promise<ApiKey> {
    try {
      if (!id || typeof id !== 'string') {
        throw new BadRequestException('API key ID must be a non-empty string');
      }

      const apiKey = await this.adapter.findById(id);
      if (!apiKey) {
        throw new ApiKeyNotFoundException(id);
      }

      return apiKey;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ApiKeyNotFoundException) {
        throw error;
      }
      ApiKeyLogger.error(
        `Error finding API key by ID: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to find API key');
    }
  }

  /**
   * Retrieves all API keys, including revoked ones.
   *
   * @returns Array of all API keys
   *
   * @example
   * ```typescript
   * const allKeys = await apiKeyService.findAll();
   * console.log(`Total keys: ${allKeys.length}`);
   * ```
   */
  async findAll(): Promise<ApiKey[]> {
    return this.adapter.findAll();
  }

  /**
   * Retrieves only active (non-revoked) API keys.
   *
   * @returns Array of active API keys
   *
   * @example
   * ```typescript
   * const activeKeys = await apiKeyService.findAllActive();
   * console.log(`Active keys: ${activeKeys.length}`);
   * ```
   */
  async findAllActive(): Promise<ApiKey[]> {
    return this.adapter.findAllActive();
  }

  /**
   * Revokes an API key by ID. Once revoked, the key can no longer be used for authentication.
   *
   * @param id - The API key ID to revoke
   * @returns The revoked API key
   * @throws {ApiKeyNotFoundException} If the key does not exist
   * @throws {ApiKeyAlreadyRevokedException} If the key is already revoked
   *
   * @example
   * ```typescript
   * const revokedKey = await apiKeyService.revoke('key-id-123');
   * console.log(`Revoked at: ${revokedKey.revokedAt}`);
   * ```
   */
  async revoke(id: string): Promise<ApiKey> {
    try {
      if (!id || typeof id !== 'string') {
        throw new BadRequestException('API key ID must be a non-empty string');
      }

      const existingKey = await this.adapter.findById(id);
      if (!existingKey) {
        throw new ApiKeyNotFoundException(id);
      }

      if (existingKey.revokedAt) {
        throw new ApiKeyAlreadyRevokedException(id);
      }

      const revokedKey = await this.adapter.revoke(id);
      ApiKeyLogger.log(`API key revoked: ${id} (${revokedKey.name})`);

      if (this.cacheService) {
        const invalidateResult = this.cacheService.invalidate(id);
        if (invalidateResult instanceof Promise) {
          await invalidateResult;
        }
      }

      await this.webhookService
        ?.sendWebhook('key.revoked', {
          keyId: revokedKey.id,
          keyName: revokedKey.name,
          revokedAt: revokedKey.revokedAt,
        })
        .catch((error) => {
          ApiKeyLogger.warn(
            `Failed to send webhook for key revocation: ${error instanceof Error ? error.message : String(error)}`,
          );
        });

      return revokedKey;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ApiKeyNotFoundException ||
        error instanceof ApiKeyAlreadyRevokedException
      ) {
        throw error;
      }
      ApiKeyLogger.error(
        `Error revoking API key: ${id}`,
        error instanceof Error ? error : String(error),
      );
      throw new InternalServerErrorException('Failed to revoke API key');
    }
  }

  /**
   * Validates the create DTO to ensure required fields are present and valid.
   *
   * @param dto - The DTO to validate
   * @throws {BadRequestException} If validation fails
   */
  private validateCreateDto(dto: CreateApiKeyDto): void {
    if (!dto.name || typeof dto.name !== 'string' || dto.name.trim().length === 0) {
      throw new BadRequestException('API key name is required and must be a non-empty string');
    }

    if (dto.name.length > 255) {
      throw new BadRequestException('API key name must not exceed 255 characters');
    }

    if (dto.scopes !== undefined && !Array.isArray(dto.scopes)) {
      throw new BadRequestException('Scopes must be an array');
    }

    if (dto.scopes && dto.scopes.some((scope) => typeof scope !== 'string')) {
      throw new BadRequestException('All scopes must be strings');
    }

    if (dto.scopes) {
      for (const scope of dto.scopes) {
        try {
          validateScopeFormat(scope);
        } catch (error) {
          throw new BadRequestException(
            `Invalid scope format: "${scope}". ${error instanceof Error ? error.message : 'Scope must follow resource:action format'}`,
          );
        }
      }
    }

    if (dto.expiresAt !== undefined && dto.expiresAt !== null) {
      if (!(dto.expiresAt instanceof Date)) {
        throw new BadRequestException('expiresAt must be a Date object');
      }

      if (dto.expiresAt <= new Date()) {
        throw new BadRequestException('expiresAt must be in the future');
      }
    }
  }

  /**
   * Generates a cryptographically secure random token.
   *
   * @param length - The length in bytes (default: 32)
   * @returns A hexadecimal string token
   */
  private generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}
