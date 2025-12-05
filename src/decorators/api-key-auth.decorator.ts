import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { ScopesGuard } from '../guards/scopes.guard';

/**
 * Decorator to protect a route with API key authentication.
 * Can be combined with @Scopes() to require specific permissions.
 *
 * @example
 * ```typescript
 * @ApiKeyAuth()
 * @Get()
 * findAll() {
 *   return [];
 * }
 *
 * @ApiKeyAuth()
 * @Scopes('read:projects')
 * @Get('projects')
 * getProjects() {
 *   return [];
 * }
 * ```
 */
export const ApiKeyAuth = () => {
  return applyDecorators(UseGuards(ApiKeyGuard, ScopesGuard));
};
