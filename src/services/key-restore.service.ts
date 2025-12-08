import { Injectable, BadRequestException } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { ApiKeyNotFoundException } from '../exceptions';
import { ApiKeyLogger } from '../utils/logger.util';
import { API_KEY_ADAPTER } from '../api-key.module';
import { Inject, Optional } from '@nestjs/common';
import { WebhookService, WEBHOOK_SERVICE_TOKEN } from './webhook.service';

/**
 * Service for restoring revoked API keys.
 */
@Injectable()
export class KeyRestoreService {
  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Optional() @Inject(WEBHOOK_SERVICE_TOKEN) private readonly webhookService?: WebhookService,
  ) {}

  /**
   * Restores a revoked API key.
   *
   * @param id - The API key ID to restore
   * @returns The restored API key
   * @throws {ApiKeyNotFoundException} If the key doesn't exist
   * @throws {BadRequestException} If the key is not revoked
   */
  async restore(id: string): Promise<ApiKey> {
    const key = await this.adapter.findById(id);
    if (!key) {
      throw new ApiKeyNotFoundException(id);
    }

    if (key.state !== 'revoked' || !key.revokedAt) {
      throw new BadRequestException('API key is not revoked and cannot be restored');
    }

    const restoredKey = await this.adapter.restore(id);
    ApiKeyLogger.log(`API key restored: ${id} (${key.name})`);

    await this.webhookService
      ?.sendWebhook('key.restored', {
        keyId: restoredKey.id,
        keyName: restoredKey.name,
      })
      .catch((error) => {
        ApiKeyLogger.warn(
          `Failed to send webhook for key restoration: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return restoredKey;
  }

  /**
   * Gets all revoked API keys that can be restored.
   *
   * @returns Array of revoked API keys
   */
  async getRevokedKeys(): Promise<ApiKey[]> {
    return await this.adapter.query({ state: 'revoked' });
  }
}
