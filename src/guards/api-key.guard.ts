import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '../services/api-key.service';
import { ApiKeyModuleOptions } from '../interfaces';
import { ApiKeyLogger } from '../utils/logger.util';
import { RateLimitService } from '../services/rate-limit.service';
import { RedisRateLimitService } from '../services/redis-rate-limit.service';
import { AuditLogService } from '../services/audit-log.service';
import { AnalyticsService } from '../services/analytics.service';
import { QuotaService } from '../services/quota.service';
import { isIpAllowed, extractClientIp } from '../utils/ip.util';
import {
  RATE_LIMIT_SERVICE_TOKEN,
  AUDIT_LOG_SERVICE_TOKEN,
  ANALYTICS_SERVICE_TOKEN,
  QUOTA_SERVICE_TOKEN,
} from '../api-key.module';
import { Optional, Inject } from '@nestjs/common';

/**
 * Guard that validates API keys from request headers.
 * Attaches the validated API key data to the request object for use in controllers.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly quotaService?: QuotaService;

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
    private readonly options: ApiKeyModuleOptions,
    @Optional()
    @Inject(RATE_LIMIT_SERVICE_TOKEN)
    private readonly rateLimitService?: RateLimitService | RedisRateLimitService,
    @Optional() @Inject(AUDIT_LOG_SERVICE_TOKEN) private readonly auditLogService?: AuditLogService,
    @Optional()
    @Inject(ANALYTICS_SERVICE_TOKEN)
    private readonly analyticsService?: AnalyticsService,
    @Optional() @Inject(QUOTA_SERVICE_TOKEN) quotaService?: QuotaService,
  ) {
    this.quotaService = quotaService;
  }

  /**
   * Validates the API key from the request and attaches key data if valid.
   *
   * @param context - The execution context containing the request
   * @returns true if the API key is valid, throws UnauthorizedException otherwise
   * @throws {UnauthorizedException} If the API key is missing or invalid
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method;
    const path = request.url || request.path || 'unknown';
    const ipAddress = extractClientIp(request);
    const requestId = request.id || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const apiKey = this.extractApiKey(request);

      if (!apiKey) {
        ApiKeyLogger.debug('API key missing from request');
        await this.auditLogService?.logFailure(
          ipAddress,
          method,
          path,
          'API key is missing',
          undefined,
          requestId,
        );
        this.analyticsService?.recordFailure();
        throw new UnauthorizedException('API key is missing');
      }

      const keyData = await this.apiKeyService.validate(apiKey);

      if (!keyData) {
        ApiKeyLogger.warn('Invalid API key provided');
        await this.auditLogService?.logFailure(
          ipAddress,
          method,
          path,
          'Invalid API key',
          undefined,
          requestId,
        );
        this.analyticsService?.recordFailure();
        throw new UnauthorizedException('Invalid API key');
      }

      if (keyData.ipWhitelist && keyData.ipWhitelist.length > 0) {
        if (!isIpAllowed(ipAddress, keyData.ipWhitelist)) {
          ApiKeyLogger.warn(`IP address ${ipAddress} not allowed for key ${keyData.id}`);
          await this.auditLogService?.logFailure(
            ipAddress,
            method,
            path,
            'IP address not allowed',
            keyData.id,
            requestId,
          );
          throw new ForbiddenException('IP address not allowed');
        }
      }

      if (
        this.options.enableRateLimiting &&
        this.rateLimitService &&
        keyData.rateLimitMax &&
        keyData.rateLimitWindowMs
      ) {
        const maxRequests = keyData.rateLimitMax;
        const windowMs = keyData.rateLimitWindowMs;

        const status = await Promise.resolve(
          this.rateLimitService.checkRateLimit(keyData.id, maxRequests, windowMs),
        );

        response.setHeader('X-RateLimit-Limit', status.limit.toString());
        response.setHeader('X-RateLimit-Remaining', status.remaining.toString());
        response.setHeader('X-RateLimit-Reset', new Date(status.resetAt).toISOString());

        if (!status.allowed) {
          await this.auditLogService?.logFailure(
            ipAddress,
            method,
            path,
            'Rate limit exceeded',
            keyData.id,
            requestId,
          );
          throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
        }
      }

      // Check quota limits
      if (this.quotaService && keyData.quotaMax && keyData.quotaPeriod) {
        const quotaStatus = await this.quotaService.checkQuota(keyData);

        response.setHeader('X-Quota-Limit', quotaStatus.limit.toString());
        response.setHeader('X-Quota-Used', quotaStatus.used.toString());
        response.setHeader('X-Quota-Remaining', quotaStatus.remaining.toString());
        response.setHeader('X-Quota-Reset', quotaStatus.resetAt.toISOString());

        if (!quotaStatus.allowed) {
          await this.auditLogService?.logFailure(
            ipAddress,
            method,
            path,
            'Quota exceeded',
            keyData.id,
            requestId,
          );
          throw new HttpException('Quota exceeded', HttpStatus.TOO_MANY_REQUESTS);
        }

        // Increment quota usage
        await this.quotaService
          .incrementUsage(keyData.id, keyData.quotaMax, keyData.quotaPeriod)
          .catch((error) => {
            ApiKeyLogger.warn(
              `Failed to increment quota usage: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          });
      }

      await this.apiKeyService.updateLastUsed(keyData.id).catch((error) => {
        ApiKeyLogger.warn(
          `Failed to update last used timestamp for key ${keyData.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      });

      request.apiKey = keyData;

      await this.auditLogService?.logSuccess(
        keyData.id,
        ipAddress,
        method,
        path,
        keyData.name,
        requestId,
      );

      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException ||
        (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS)
      ) {
        throw error;
      }
      ApiKeyLogger.error('Error in ApiKeyGuard', error instanceof Error ? error : String(error));
      throw new InternalServerErrorException('Failed to validate API key');
    }
  }

  /**
   * Extracts the API key from the request (headers, query params, or cookies).
   * Checks sources in order: headers -> query params -> cookies.
   *
   * @param request - The HTTP request object
   * @returns The API key token if found, null otherwise
   */
  private extractApiKey(request: {
    headers: Record<string, string | undefined>;
    query?: Record<string, string | undefined>;
    cookies?: Record<string, string | undefined>;
  }): string | null {
    const headerName = this.options.headerName || 'x-api-key';
    const queryParamName = this.options.queryParamName || 'api_key';
    const cookieName = this.options.cookieName || 'api_key';

    if (request.headers[headerName]) {
      return request.headers[headerName];
    }

    if (request.headers[headerName.toLowerCase()]) {
      return request.headers[headerName.toLowerCase()];
    }

    if (request.query?.[queryParamName]) {
      return request.query[queryParamName];
    }

    if (request.cookies?.[cookieName]) {
      return request.cookies[cookieName];
    }

    return null;
  }
}
