import { ApiKey } from '../interfaces';

/**
 * Base interface that all database adapters must implement.
 * This allows the library to work with different ORMs (Prisma, TypeORM, Mongoose, etc.)
 */
export interface IApiKeyAdapter {
  /**
   * Creates a new API key in the database.
   *
   * @param data - The API key data to create
   * @returns The created API key
   */
  create(data: {
    name: string;
    keyPrefix: string;
    hashedKey: string;
    scopes: string[];
    expiresAt?: Date | null;
    ipWhitelist?: string[];
    rateLimitMax?: number | null;
    rateLimitWindowMs?: number | null;
  }): Promise<ApiKey>;

  /**
   * Finds API keys by their prefix (used for fast lookup during validation).
   *
   * @param keyPrefix - The first 8 characters of the token
   * @returns Array of active API keys with matching prefix
   */
  findByKeyPrefix(keyPrefix: string): Promise<ApiKey[]>;

  /**
   * Finds an API key by its unique identifier.
   *
   * @param id - The API key ID
   * @returns The API key if found, null otherwise
   */
  findById(id: string): Promise<ApiKey | null>;

  /**
   * Revokes an API key by setting its revokedAt timestamp.
   *
   * @param id - The API key ID to revoke
   * @returns The revoked API key
   */
  revoke(id: string): Promise<ApiKey>;

  /**
   * Retrieves all API keys from the database, including revoked ones.
   *
   * @returns Array of all API keys
   */
  findAll(): Promise<ApiKey[]>;

  /**
   * Retrieves only active (non-revoked and non-expired) API keys.
   *
   * @returns Array of active API keys
   */
  findAllActive(): Promise<ApiKey[]>;

  /**
   * Updates the lastUsedAt timestamp for an API key.
   *
   * @param id - The API key ID
   * @returns The updated API key
   */
  updateLastUsed(id: string): Promise<ApiKey>;
}
