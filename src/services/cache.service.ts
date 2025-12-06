import { Injectable } from '@nestjs/common';
import { ApiKey } from '../interfaces';
import { ApiKeyLogger } from '../utils/logger.util';

export interface CacheEntry {
  key: ApiKey;
  expiresAt: number;
}

export interface CacheStats {
  size: number;
  entries: number;
}

/**
 * In-memory cache service for API keys.
 * For production with multiple instances, consider using Redis.
 */
@Injectable()
export class CacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly defaultTtl = 5 * 60 * 1000; // 5 minutes

  /**
   * Gets a cached API key by ID.
   *
   * @param keyId - The API key ID
   * @returns The cached API key or null if not found/expired
   */
  get(keyId: string): ApiKey | null {
    const entry = this.cache.get(keyId);

    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(keyId);
      return null;
    }

    return entry.key;
  }

  /**
   * Gets a cached API key by prefix (for validation).
   *
   * @param prefix - The key prefix
   * @returns Array of cached API keys with matching prefix
   */
  getByPrefix(prefix: string): ApiKey[] | Promise<ApiKey[]> {
    const now = Date.now();
    const keys: ApiKey[] = [];

    for (const [keyId, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(keyId);
        continue;
      }

      if (entry.key.keyPrefix === prefix) {
        keys.push(entry.key);
      }
    }

    return keys;
  }

  /**
   * Sets a cached API key.
   *
   * @param key - The API key to cache
   * @param ttlMs - Optional TTL in milliseconds
   */
  set(key: ApiKey, ttlMs?: number): void | Promise<void> {
    const ttl = ttlMs || this.defaultTtl;
    this.cache.set(key.id, {
      key,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Sets multiple API keys in cache.
   *
   * @param keys - Array of API keys to cache
   * @param ttlMs - Optional TTL in milliseconds
   */
  setMany(keys: ApiKey[], ttlMs?: number): void {
    keys.forEach((key) => this.set(key, ttlMs));
  }

  /**
   * Invalidates a cached API key.
   *
   * @param keyId - The API key ID to invalidate
   */
  invalidate(keyId: string): void | Promise<void> {
    this.cache.delete(keyId);
    ApiKeyLogger.debug(`Cache invalidated for key: ${keyId}`);
  }

  /**
   * Invalidates all cached keys with a specific prefix.
   *
   * @param prefix - The key prefix
   */
  invalidateByPrefix(prefix: string): void {
    for (const [keyId, entry] of this.cache.entries()) {
      if (entry.key.keyPrefix === prefix) {
        this.cache.delete(keyId);
      }
    }
  }

  /**
   * Clears all cached entries.
   */
  clear(): void {
    this.cache.clear();
    ApiKeyLogger.debug('Cache cleared');
  }

  /**
   * Cleans up expired cache entries.
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [keyId, entry] of this.cache.entries()) {
      if (now >= entry.expiresAt) {
        this.cache.delete(keyId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      ApiKeyLogger.debug(`Cleaned up ${cleaned} expired cache entries`);
    }
  }

  /**
   * Gets cache statistics.
   *
   * @returns Cache statistics
   */
  getStats(): CacheStats {
    return {
      size: this.cache.size,
      entries: this.cache.size,
    };
  }
}
