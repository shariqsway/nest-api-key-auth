import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';

/**
 * Example: Rate Limiting Configuration
 *
 * This example shows how to configure and use rate limiting with API keys.
 */

@Module({
  imports: [
    ApiKeyModule.register({
      enableRateLimiting: true, // Enable rate limiting (default: true)
    }),
  ],
})
export class RateLimitingModule {}

// In your service:
import { Injectable } from '@nestjs/common';
import { ApiKeyService } from 'nest-api-key-auth';

@Injectable()
export class ApiKeyManagementService {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * Create an API key with custom rate limiting
   */
  async createKeyWithRateLimit() {
    const key = await this.apiKeyService.create({
      name: 'High Traffic App',
      rateLimitMax: 1000, // 1000 requests
      rateLimitWindowMs: 60000, // per minute (60000ms)
    });

    return key;
  }

  /**
   * Create an API key with different rate limits
   */
  async createKeyWithDifferentLimits() {
    const key = await this.apiKeyService.create({
      name: 'Low Traffic App',
      rateLimitMax: 100, // 100 requests
      rateLimitWindowMs: 3600000, // per hour (3600000ms = 1 hour)
    });

    return key;
  }
}

/**
 * Rate limit headers are automatically added to responses:
 * - X-RateLimit-Limit: Maximum requests allowed
 * - X-RateLimit-Remaining: Remaining requests in current window
 * - X-RateLimit-Reset: When the rate limit window resets
 *
 * When rate limit is exceeded, a 429 Too Many Requests error is returned.
 */

