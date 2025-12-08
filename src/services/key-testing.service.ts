import { Injectable } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { ApiKeyLogger } from '../utils/logger.util';

export interface KeyTestResult {
  valid: boolean;
  keyId?: string;
  keyName?: string;
  scopes?: string[];
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
        expiresAt: key.expiresAt,
        revokedAt: key.revokedAt,
      };

      // Check for warnings
      if (key.revokedAt) {
        errors.push('Key has been revoked');
        result.valid = false;
      }

      if (key.expiresAt && key.expiresAt <= new Date()) {
        errors.push('Key has expired');
        result.valid = false;
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
