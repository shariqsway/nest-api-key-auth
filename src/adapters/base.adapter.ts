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
   * @param reason - Optional reason for revocation
   * @returns The revoked API key
   */
  revoke(id: string, reason?: string): Promise<ApiKey>;

  /**
   * Suspends an API key temporarily.
   *
   * @param id - The API key ID to suspend
   * @param reason - Optional reason for suspension
   * @returns The suspended API key
   */
  suspend(id: string, reason?: string): Promise<ApiKey>;

  /**
   * Unsuspends an API key.
   *
   * @param id - The API key ID to unsuspend
   * @returns The unsuspended API key
   */
  unsuspend(id: string): Promise<ApiKey>;

  /**
   * Restores a revoked API key.
   *
   * @param id - The API key ID to restore
   * @returns The restored API key
   */
  restore(id: string): Promise<ApiKey>;

  /**
   * Approves a pending API key.
   *
   * @param id - The API key ID to approve
   * @returns The approved API key
   */
  approve(id: string): Promise<ApiKey>;

  /**
   * Updates the state of an API key.
   *
   * @param id - The API key ID
   * @param state - The new state
   * @returns The updated API key
   */
  updateState(id: string, state: string): Promise<ApiKey>;

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

  /**
   * Updates the quota usage for an API key.
   *
   * @param id - The API key ID
   * @param quotaUsed - New quota used value
   * @param quotaResetAt - When quota resets
   * @returns The updated API key
   */
  updateQuotaUsage(id: string, quotaUsed: number, quotaResetAt: Date): Promise<ApiKey>;

  /**
   * Queries API keys with advanced filters.
   *
   * @param filters - Query filters
   * @returns Array of matching API keys
   */
  query(filters: {
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
  }): Promise<ApiKey[]>;
}
