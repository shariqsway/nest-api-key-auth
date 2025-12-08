import { Injectable } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { ApiKeyLogger } from '../utils/logger.util';
import { ApiKeyState } from '../interfaces';

export interface KeyTestResult {
  valid: boolean;
  keyId?: string;
  keyName?: string;
  scopes?: string[];
  state?: ApiKeyState;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  errors?: string[];
}

/**
 * Service for testing API keys without making real requests.
 */
@Injectable()
export class KeyTestingService {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * Tests an API key for validity.
   *
   * @param token - The API key token to test
   * @returns Test result
   */
  async testKey(token: string): Promise<KeyTestResult> {
    const errors: string[] = [];

    try {
      const key = await this.apiKeyService.validate(token);

      if (!key) {
        errors.push('Invalid API key token');
        return {
          valid: false,
          errors,
        };
      }

      const result: KeyTestResult = {
        valid: true,
        keyId: key.id,
        keyName: key.name,
        scopes: key.scopes,
        state: key.state,
        expiresAt: key.expiresAt,
        revokedAt: key.revokedAt,
      };

      // Check key state and add appropriate errors
      if (key.state === 'revoked' || key.revokedAt) {
        errors.push('Key has been revoked');
        result.valid = false;
      } else if (key.state === 'suspended' || key.suspendedAt) {
        errors.push('Key has been suspended');
        result.valid = false;
      } else if (key.state === 'pending') {
        errors.push('Key is pending approval');
        result.valid = false;
      } else if (key.state === 'expired') {
        errors.push('Key has expired');
        result.valid = false;
      } else if (key.expiresAt && key.expiresAt <= new Date()) {
        // Check expiration even if state hasn't been updated yet
        const gracePeriodMs = key.expirationGracePeriodMs || 0;
        const effectiveExpirationTime = key.expiresAt.getTime() + gracePeriodMs;
        if (new Date().getTime() > effectiveExpirationTime) {
          errors.push('Key has expired');
          result.valid = false;
        }
      }

      if (errors.length > 0) {
        result.errors = errors;
      }

      return result;
    } catch (error) {
      ApiKeyLogger.error(
        'Error testing API key',
        error instanceof Error ? error : String(error),
        'KeyTestingService',
      );

      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Tests multiple API keys.
   *
   * @param tokens - Array of API key tokens
   * @returns Map of token to test result
   */
  async testKeys(tokens: string[]): Promise<Map<string, KeyTestResult>> {
    const results = new Map<string, KeyTestResult>();

    for (const token of tokens) {
      const result = await this.testKey(token);
      results.set(token, result);
    }

    return results;
  }
}
