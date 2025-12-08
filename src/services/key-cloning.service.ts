import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from '../interfaces';
import { API_KEY_ADAPTER } from '../api-key.module';
import { ApiKeyLogger } from '../utils/logger.util';

/**
 * Service for cloning API keys.
 */
@Injectable()
export class KeyCloningService {
  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  /**
   * Clones an API key with the same permissions and metadata.
   *
   * @param sourceKeyId - The source key ID to clone
   * @param newName - Name for the cloned key
   * @param overrides - Optional overrides for cloned key properties
   * @returns The cloned key with new token
   */
  async cloneKey(sourceKeyId: string, newName: string, overrides?: Partial<CreateApiKeyDto>) {
    const sourceKey = await this.adapter.findById(sourceKeyId);
    if (!sourceKey) {
      throw new Error(`Source key ${sourceKeyId} not found`);
    }

    const cloneDto: CreateApiKeyDto = {
      name: newName,
      scopes: sourceKey.scopes,
      expiresAt: sourceKey.expiresAt || undefined,
      ipWhitelist: sourceKey.ipWhitelist,
      ipBlacklist: sourceKey.ipBlacklist,
      rateLimitMax: sourceKey.rateLimitMax,
      rateLimitWindowMs: sourceKey.rateLimitWindowMs,
      quotaMax: sourceKey.quotaMax || undefined,
      quotaPeriod: sourceKey.quotaPeriod || undefined,
      metadata: sourceKey.metadata || undefined,
      tags: sourceKey.tags,
      owner: sourceKey.owner || undefined,
      environment: sourceKey.environment || undefined,
      description: sourceKey.description
        ? `${sourceKey.description} (cloned from ${sourceKey.name})`
        : `Cloned from ${sourceKey.name}`,
      ...overrides,
    };

    const clonedKey = await this.apiKeyService.create(cloneDto);

    ApiKeyLogger.log(
      `Key ${sourceKeyId} cloned to ${clonedKey.id} with name ${newName}`,
      'KeyCloningService',
    );

    return clonedKey;
  }
}
