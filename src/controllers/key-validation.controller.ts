import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiKeyService } from '../services/api-key.service';
import { KeyTestingService } from '../services/key-testing.service';

export interface ValidateKeyRequest {
  apiKey: string;
}

export interface ValidateKeyResponse {
  valid: boolean;
  key?: {
    id: string;
    name: string;
    scopes: string[];
    state: string;
    expiresAt: Date | null;
  };
  error?: string;
}

/**
 * REST controller for API key validation.
 * Provides endpoints for validating API keys without making actual requests.
 */
@Controller('api-keys')
export class KeyValidationController {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly keyTestingService: KeyTestingService,
  ) {}

  /**
   * Validates a single API key.
   *
   * @param body - Request body containing the API key
   * @returns Validation result
   */
  @Post('validate')
  async validateKey(@Body() body: ValidateKeyRequest): Promise<ValidateKeyResponse> {
    try {
      const result = await this.keyTestingService.testKey(body.apiKey);

      if (result.valid && result.keyId) {
        return {
          valid: true,
          key: {
            id: result.keyId,
            name: result.keyName || 'Unknown',
            scopes: result.scopes || [],
            state: result.state || 'active',
            expiresAt: result.expiresAt || null,
          },
        };
      }

      return {
        valid: false,
        error: result.errors?.[0] || 'Invalid API key',
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Validates multiple API keys.
   *
   * @param keys - Array of API keys to validate
   * @returns Array of validation results
   */
  @Post('validate/batch')
  async validateKeys(@Body() body: { keys: string[] }): Promise<ValidateKeyResponse[]> {
    const resultsMap = await this.keyTestingService.testKeys(body.keys);

    return Array.from(resultsMap.values()).map((result) => {
      if (result.valid && result.keyId) {
        return {
          valid: true,
          key: {
            id: result.keyId,
            name: result.keyName || 'Unknown',
            scopes: result.scopes || [],
            state: result.state || 'active',
            expiresAt: result.expiresAt || null,
          },
        };
      }

      return {
        valid: false,
        error: result.errors?.[0] || 'Invalid API key',
      };
    });
  }

  /**
   * Health check endpoint for key validation service.
   *
   * @returns Health status
   */
  @Get('validate/health')
  async healthCheck(): Promise<{ status: string; timestamp: Date }> {
    return {
      status: 'ok',
      timestamp: new Date(),
    };
  }
}
