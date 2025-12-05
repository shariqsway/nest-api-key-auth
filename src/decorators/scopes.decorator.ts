import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'scopes';

/**
 * Decorator to specify required scopes for a route.
 * Can be used at the controller or method level.
 * Multiple scopes are treated as AND (all required).
 *
 * @param scopes - Array of required scope strings
 *
 * @example
 * ```typescript
 * @Scopes('read:projects')
 * @Get()
 * findAll() {}
 *
 * @Scopes('read:projects', 'write:projects')
 * @Post()
 * create() {}
 * ```
 */
export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);
