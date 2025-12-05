import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaAdapter } from '../adapters/prisma.adapter';
import { CreateApiKeyDto, CreateApiKeyResponse, ApiKey } from '../interfaces';
import { ApiKeyNotFoundException, ApiKeyAlreadyRevokedException } from '../exceptions';

@Injectable()
export class ApiKeyService {
  private readonly MIN_TOKEN_LENGTH = 8;

  constructor(
    private readonly adapter: PrismaAdapter,
    private readonly secretLength: number = 32,
  ) {}

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
    this.validateCreateDto(dto);

    const token = this.generateToken(this.secretLength);
    const keyPrefix = token.substring(0, 8);
    const hashedKey = await bcrypt.hash(token, 10);

    const apiKey = await this.adapter.create({
      name: dto.name,
      keyPrefix,
      hashedKey,
      scopes: dto.scopes || [],
      expiresAt: dto.expiresAt || null,
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
    if (!token || typeof token !== 'string' || token.length < this.MIN_TOKEN_LENGTH) {
      return null;
    }

    const keyPrefix = token.substring(0, 8);
    const candidates = await this.adapter.findByKeyPrefix(keyPrefix);

    if (candidates.length === 0) {
      return null;
    }

    const now = new Date();

    for (const apiKey of candidates) {
      const isValid = await bcrypt.compare(token, apiKey.hashedKey);
      if (isValid) {
        if (apiKey.revokedAt) {
          return null;
        }

        if (apiKey.expiresAt && apiKey.expiresAt <= now) {
          return null;
        }

        return apiKey;
      }
    }

    return null;
  }

  /**
   * Updates the last used timestamp for an API key.
   *
   * @param id - The API key ID
   * @returns The updated API key
   */
  async updateLastUsed(id: string): Promise<ApiKey> {
    return this.adapter.updateLastUsed(id);
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
    if (!id || typeof id !== 'string') {
      throw new BadRequestException('API key ID must be a non-empty string');
    }

    const apiKey = await this.adapter.findById(id);
    if (!apiKey) {
      throw new ApiKeyNotFoundException(id);
    }

    return apiKey;
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

    return this.adapter.revoke(id);
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

    if (dto.scopes !== undefined && !Array.isArray(dto.scopes)) {
      throw new BadRequestException('Scopes must be an array');
    }

    if (dto.scopes && dto.scopes.some((scope) => typeof scope !== 'string')) {
      throw new BadRequestException('All scopes must be strings');
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
