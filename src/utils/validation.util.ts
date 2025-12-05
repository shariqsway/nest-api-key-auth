import { BadRequestException } from '@nestjs/common';
import { ApiKeyModuleOptions, AdapterType } from '../interfaces';

/**
 * Validates token format - must be hexadecimal string.
 *
 * @param token - The token to validate
 * @returns true if valid, throws BadRequestException otherwise
 */
export function validateTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') {
    throw new BadRequestException('Token must be a non-empty string');
  }

  const hexPattern = /^[0-9a-f]+$/i;
  if (!hexPattern.test(token)) {
    throw new BadRequestException('Token must contain only hexadecimal characters (0-9, a-f)');
  }

  return true;
}

/**
 * Validates scope format - should follow resource:action pattern.
 * Examples: "read:projects", "write:users", "admin:*"
 *
 * @param scope - The scope to validate
 * @returns true if valid, throws BadRequestException otherwise
 */
export function validateScopeFormat(scope: string): boolean {
  if (!scope || typeof scope !== 'string') {
    throw new BadRequestException('Scope must be a non-empty string');
  }

  const scopePattern = /^[a-z0-9_-]+:[a-z0-9_*-]+$/i;
  if (!scopePattern.test(scope)) {
    throw new BadRequestException(
      'Scope must follow the format "resource:action" (e.g., "read:projects", "write:users")',
    );
  }

  return true;
}

/**
 * Validates module configuration options.
 *
 * @param options - The module options to validate
 * @throws {BadRequestException} If validation fails
 */
export function validateModuleOptions(options: ApiKeyModuleOptions): void {
  if (options.secretLength !== undefined) {
    if (
      typeof options.secretLength !== 'number' ||
      options.secretLength < 8 ||
      options.secretLength > 128
    ) {
      throw new BadRequestException('secretLength must be a number between 8 and 128');
    }
  }

  if (options.headerName !== undefined) {
    if (typeof options.headerName !== 'string' || options.headerName.trim().length === 0) {
      throw new BadRequestException('headerName must be a non-empty string');
    }
  }

  if (options.queryParamName !== undefined) {
    if (typeof options.queryParamName !== 'string' || options.queryParamName.trim().length === 0) {
      throw new BadRequestException('queryParamName must be a non-empty string');
    }
  }

  if (options.cookieName !== undefined) {
    if (typeof options.cookieName !== 'string' || options.cookieName.trim().length === 0) {
      throw new BadRequestException('cookieName must be a non-empty string');
    }
  }

  const adapterType: AdapterType = options.adapter || 'prisma';
  if (!['prisma', 'typeorm', 'mongoose', 'custom'].includes(adapterType)) {
    throw new BadRequestException(`Invalid adapter type: ${adapterType}`);
  }

  if (adapterType === 'prisma' && !options.prismaClient && !options.customAdapter) {
    // Prisma adapter can work without explicit client (creates its own)
  }

  if (adapterType === 'typeorm' && !options.typeOrmRepository && !options.customAdapter) {
    throw new BadRequestException('TypeORM repository must be provided when using TypeORM adapter');
  }

  if (adapterType === 'mongoose' && !options.mongooseModel && !options.customAdapter) {
    throw new BadRequestException('Mongoose model must be provided when using Mongoose adapter');
  }

  if (adapterType === 'custom' && !options.customAdapter) {
    throw new BadRequestException(
      'Custom adapter instance must be provided when using custom adapter',
    );
  }

  if (options.enableCaching !== undefined && typeof options.enableCaching !== 'boolean') {
    throw new BadRequestException('enableCaching must be a boolean');
  }

  if (
    options.cacheTtlMs !== undefined &&
    (typeof options.cacheTtlMs !== 'number' || options.cacheTtlMs <= 0)
  ) {
    throw new BadRequestException('cacheTtlMs must be a positive number');
  }

  if (options.enableRateLimiting !== undefined && typeof options.enableRateLimiting !== 'boolean') {
    throw new BadRequestException('enableRateLimiting must be a boolean');
  }

  if (options.enableAuditLogging !== undefined && typeof options.enableAuditLogging !== 'boolean') {
    throw new BadRequestException('enableAuditLogging must be a boolean');
  }

  if (options.auditLogOptions !== undefined && typeof options.auditLogOptions !== 'object') {
    throw new BadRequestException('auditLogOptions must be an object');
  }

  if (
    options.auditLogOptions?.logToConsole !== undefined &&
    typeof options.auditLogOptions.logToConsole !== 'boolean'
  ) {
    throw new BadRequestException('auditLogOptions.logToConsole must be a boolean');
  }

  if (
    options.auditLogOptions?.onLog !== undefined &&
    typeof options.auditLogOptions.onLog !== 'function'
  ) {
    throw new BadRequestException('auditLogOptions.onLog must be a function');
  }

  if (
    options.hashAlgorithm !== undefined &&
    !['bcrypt', 'argon2'].includes(options.hashAlgorithm)
  ) {
    throw new BadRequestException('hashAlgorithm must be either "bcrypt" or "argon2"');
  }

  if (
    options.bcryptRounds !== undefined &&
    (typeof options.bcryptRounds !== 'number' ||
      options.bcryptRounds < 4 ||
      options.bcryptRounds > 31)
  ) {
    throw new BadRequestException('bcryptRounds must be a number between 4 and 31');
  }
}
