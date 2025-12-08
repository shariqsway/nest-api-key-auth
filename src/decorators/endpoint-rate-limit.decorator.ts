import { SetMetadata } from '@nestjs/common';

export const ENDPOINT_RATE_LIMIT_KEY = 'endpoint_rate_limit';

export interface EndpointRateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

/**
 * Decorator for setting endpoint-specific rate limits.
 *
 * @param maxRequests - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 *
 * @example
 * ```typescript
 * @EndpointRateLimit(100, 60000) // 100 requests per minute
 * @Get('sensitive-endpoint')
 * getSensitiveData() {
 *   return {};
 * }
 * ```
 */
export const EndpointRateLimit = (maxRequests: number, windowMs: number) =>
  SetMetadata(ENDPOINT_RATE_LIMIT_KEY, { maxRequests, windowMs } as EndpointRateLimitOptions);
