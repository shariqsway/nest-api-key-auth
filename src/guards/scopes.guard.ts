import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from '../decorators/scopes.decorator';
import { ApiKey } from '../interfaces';

/**
 * Guard that validates API key scopes against required scopes for a route.
 * Must be used after ApiKeyGuard to ensure request.apiKey is available.
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * Checks if the API key has all required scopes for the route.
   *
   * @param context - The execution context containing the request
   * @returns true if the API key has all required scopes
   * @throws {ForbiddenException} If the API key lacks required scopes
   */
  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey: ApiKey | undefined = request.apiKey;

    if (!apiKey) {
      throw new ForbiddenException('API key not found in request context');
    }

    const keyScopes = apiKey.scopes || [];
    const hasAllScopes = requiredScopes.every((scope) => keyScopes.includes(scope));

    if (!hasAllScopes) {
      const missingScopes = requiredScopes.filter((scope) => !keyScopes.includes(scope));
      throw new ForbiddenException(
        `Insufficient scopes. Required: [${requiredScopes.join(', ')}]. Missing: [${missingScopes.join(', ')}]`,
      );
    }

    return true;
  }
}
