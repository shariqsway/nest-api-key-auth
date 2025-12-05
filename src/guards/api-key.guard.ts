import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '../services/api-key.service';
import { ApiKeyModuleOptions } from '../interfaces';

/**
 * Guard that validates API keys from request headers.
 * Attaches the validated API key data to the request object for use in controllers.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
    private readonly options: ApiKeyModuleOptions,
  ) {}

  /**
   * Validates the API key from the request and attaches key data if valid.
   *
   * @param context - The execution context containing the request
   * @returns true if the API key is valid, throws UnauthorizedException otherwise
   * @throws {UnauthorizedException} If the API key is missing or invalid
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('API key is missing');
    }

    const keyData = await this.apiKeyService.validate(apiKey);

    if (!keyData) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.apiKeyService.updateLastUsed(keyData.id).catch(() => {
      // Silently fail if update fails - don't block the request
    });

    request.apiKey = keyData;

    return true;
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
