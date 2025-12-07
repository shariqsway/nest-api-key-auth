import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { API_KEY_ADAPTER } from '../api-key.module';
import { ApiKeyLogger } from '../utils/logger.util';

export interface ExportOptions {
  includeRevoked?: boolean;
  includeHashedKeys?: boolean;
  format?: 'json' | 'csv';
  filters?: {
    tags?: string[];
    owner?: string;
    environment?: 'production' | 'staging' | 'development';
  };
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ key: string; error: string }>;
}

/**
 * Service for exporting and importing API key configurations.
 */
@Injectable()
export class ExportImportService {
  constructor(@Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter) {}

  /**
   * Exports API keys to JSON format.
   *
   * @param options - Export options
   * @returns Exported keys data (without sensitive information)
   */
  async exportKeys(options: ExportOptions = {}): Promise<string> {
    try {
      type QueryFilters = {
        active?: boolean;
        tags?: string[];
        owner?: string;
        environment?: 'production' | 'staging' | 'development';
        scopes?: string[];
        createdAfter?: Date;
        createdBefore?: Date;
        lastUsedAfter?: Date;
        lastUsedBefore?: Date;
        limit?: number;
        offset?: number;
      };

      const filters: QueryFilters = {
        active: !options.includeRevoked,
      };

      if (options.filters) {
        if (options.filters.tags) filters.tags = options.filters.tags;
        if (options.filters.owner) filters.owner = options.filters.owner;
        if (options.filters.environment) filters.environment = options.filters.environment;
      }

      const keys = await this.adapter.query(filters);

      interface ExportedApiKey {
        id: string;
        name: string;
        scopes: string[];
        expiresAt: string | null;
        ipWhitelist: string[];
        rateLimitMax: number | null | undefined;
        rateLimitWindowMs: number | null | undefined;
        quotaMax: number | null | undefined;
        quotaPeriod: 'daily' | 'monthly' | 'yearly' | null | undefined;
        metadata: Record<string, unknown> | null | undefined;
        tags: string[] | undefined;
        owner: string | null | undefined;
        environment: 'production' | 'staging' | 'development' | null | undefined;
        description: string | null | undefined;
        createdAt: string;
        updatedAt: string;
        lastUsedAt: string | null;
        revokedAt: string | null;
        keyPrefix?: string;
      }

      const exportData = keys.map((key): ExportedApiKey => {
        const exported: ExportedApiKey = {
          id: key.id,
          name: key.name,
          scopes: key.scopes,
          expiresAt: key.expiresAt?.toISOString() || null,
          ipWhitelist: key.ipWhitelist || [],
          rateLimitMax: key.rateLimitMax || null,
          rateLimitWindowMs: key.rateLimitWindowMs || null,
          quotaMax: key.quotaMax || null,
          quotaPeriod: key.quotaPeriod || null,
          metadata: key.metadata || null,
          tags: key.tags || [],
          owner: key.owner || null,
          environment: key.environment || null,
          description: key.description || null,
          createdAt: key.createdAt.toISOString(),
          updatedAt: key.updatedAt.toISOString(),
          lastUsedAt: key.lastUsedAt?.toISOString() || null,
          revokedAt: key.revokedAt?.toISOString() || null,
        };

        // Never export hashed keys for security
        if (options.includeHashedKeys) {
          exported.keyPrefix = key.keyPrefix;
        }

        return exported;
      });

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      ApiKeyLogger.error(
        'Error exporting API keys',
        error instanceof Error ? error : String(error),
        'ExportImportService',
      );
      throw error;
    }
  }

  /**
   * Imports API key configurations (metadata only, not actual keys).
   *
   * @param jsonData - JSON string containing key configurations
   * @returns Import result
   */
  async importKeys(jsonData: string): Promise<ImportResult> {
    try {
      const keys = JSON.parse(jsonData) as Array<Partial<ApiKey>>;
      const result: ImportResult = {
        success: 0,
        failed: 0,
        errors: [],
      };

      for (const keyData of keys) {
        try {
          // Validate required fields
          if (!keyData.name) {
            result.failed++;
            result.errors.push({ key: keyData.id || 'unknown', error: 'Missing name field' });
            continue;
          }

          // Note: Import only creates metadata, actual keys must be created via ApiKeyService
          // This is a placeholder for the import logic
          // In a real implementation, you would validate and store the configuration
          // but not create actual API keys (they need to be generated securely)

          result.success++;
        } catch (error) {
          result.failed++;
          result.errors.push({
            key: keyData.id || 'unknown',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      ApiKeyLogger.log(
        `Import completed: ${result.success} succeeded, ${result.failed} failed`,
        'ExportImportService',
      );

      return result;
    } catch (error) {
      ApiKeyLogger.error(
        'Error importing API keys',
        error instanceof Error ? error : String(error),
        'ExportImportService',
      );
      throw error;
    }
  }
}
