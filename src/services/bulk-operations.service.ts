import { Injectable, Inject, Optional } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { CreateApiKeyDto } from '../interfaces';
import { API_KEY_ADAPTER } from '../api-key.module';
import { ApiKeyLogger } from '../utils/logger.util';
import { ApiKeyService } from './api-key.service';

export interface BulkCreateResult {
  success: number;
  failed: number;
  results: Array<{ name: string; success: boolean; keyId?: string; error?: string }>;
}

export interface BulkRevokeResult {
  success: number;
  failed: number;
  results: Array<{ keyId: string; success: boolean; error?: string }>;
}

/**
 * Service for bulk operations on API keys.
 */
@Injectable()
export class BulkOperationsService {
  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Optional() public readonly apiKeyService?: ApiKeyService,
  ) {}

  /**
   * Creates multiple API keys in bulk.
   *
   * @param dtos - Array of API key creation DTOs
   * @returns Bulk creation result
   */
  async bulkCreate(dtos: CreateApiKeyDto[]): Promise<BulkCreateResult> {
    const results: BulkCreateResult['results'] = [];
    let success = 0;
    let failed = 0;

    if (!this.apiKeyService) {
      throw new Error('ApiKeyService is required for bulk operations');
    }

    for (const dto of dtos) {
      try {
        const key = await this.apiKeyService.create(dto);
        results.push({
          name: dto.name,
          success: true,
          keyId: key.id,
        });
        success++;
      } catch (error) {
        results.push({
          name: dto.name,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }

    ApiKeyLogger.log(
      `Bulk create completed: ${success} succeeded, ${failed} failed`,
      'BulkOperationsService',
    );

    return {
      success,
      failed,
      results,
    };
  }

  /**
   * Revokes multiple API keys in bulk.
   *
   * @param keyIds - Array of API key IDs to revoke
   * @returns Bulk revoke result
   */
  async bulkRevoke(keyIds: string[]): Promise<BulkRevokeResult> {
    const results: BulkRevokeResult['results'] = [];
    let success = 0;
    let failed = 0;

    if (!this.apiKeyService) {
      throw new Error('ApiKeyService is required for bulk operations');
    }

    for (const keyId of keyIds) {
      try {
        await this.apiKeyService.revoke(keyId);
        results.push({
          keyId,
          success: true,
        });
        success++;
      } catch (error) {
        results.push({
          keyId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
        failed++;
      }
    }

    ApiKeyLogger.log(
      `Bulk revoke completed: ${success} succeeded, ${failed} failed`,
      'BulkOperationsService',
    );

    return {
      success,
      failed,
      results,
    };
  }
}
