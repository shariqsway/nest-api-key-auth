import { Module } from '@nestjs/common';
import { ApiKeyModule, CacheService } from 'nest-api-key-auth';

/**
 * Example: Caching Configuration
 *
 * This example shows how to configure and use caching for improved performance.
 */

@Module({
  imports: [
    ApiKeyModule.register({
      enableCaching: true, // Enable caching (default: true)
      cacheTtlMs: 300000, // Cache TTL: 5 minutes (default: 300000ms)
    }),
  ],
})
export class CachingModule {}

// In your service:
import { Injectable, Inject } from '@nestjs/common';

@Injectable()
export class CacheManagementService {
  constructor(
    @Inject('CACHE_SERVICE') private readonly cacheService: CacheService,
  ) {}

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const stats = this.cacheService.getStats();
    console.log('Cache size:', stats.size);
    console.log('Cache entries:', stats.entries);
    return stats;
  }

  /**
   * Clear the cache manually
   */
  clearCache() {
    this.cacheService.clear();
    console.log('Cache cleared');
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    this.cacheService.cleanup();
  }
}

/**
 * Caching Benefits:
 * - Reduces database queries for frequently accessed keys
 * - Improves response time for API key validation
 * - Automatic cache invalidation on key revocation
 * - Configurable TTL (Time To Live)
 *
 * Cache is automatically:
 * - Populated when keys are validated
 * - Invalidated when keys are revoked
 * - Cleaned up when entries expire
 *
 * For production with multiple instances, consider using Redis
 * by implementing a custom cache service.
 */

