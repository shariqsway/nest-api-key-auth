import { Injectable, BadRequestException } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { ApiKeyNotFoundException } from '../exceptions';
import { ApiKeyLogger } from '../utils/logger.util';
import { API_KEY_ADAPTER } from '../api-key.module';
import { Inject, Optional } from '@nestjs/common';
import { WebhookService, WEBHOOK_SERVICE_TOKEN } from './webhook.service';

/**
 * Service for managing API key suspension and unsuspension.
 */
@Injectable()
export class KeySuspensionService {
  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Optional() @Inject(WEBHOOK_SERVICE_TOKEN) private readonly webhookService?: WebhookService,
  ) {}

  /**
   * Suspends an API key temporarily.
   *
   * @param id - The API key ID to suspend
   * @param reason - Optional reason for suspension
   * @returns The suspended API key
   * @throws {ApiKeyNotFoundException} If the key doesn't exist
   * @throws {BadRequestException} If the key is already suspended or revoked
   */
  async suspend(id: string, reason?: string): Promise<ApiKey> {
    const key = await this.adapter.findById(id);
    if (!key) {
      throw new ApiKeyNotFoundException(id);
    }

    if (key.state === 'suspended') {
      throw new BadRequestException('API key is already suspended');
    }

    if (key.state === 'revoked') {
      throw new BadRequestException('Cannot suspend a revoked API key');
    }

    const suspendedKey = await this.adapter.suspend(id, reason);
    ApiKeyLogger.log(`API key suspended: ${id} (${key.name})`);

    await this.webhookService
      ?.sendWebhook('key.suspended', {
        keyId: suspendedKey.id,
        keyName: suspendedKey.name,
        reason,
      })
      .catch((error) => {
        ApiKeyLogger.warn(
          `Failed to send webhook for key suspension: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return suspendedKey;
  }

  /**
   * Unsuspends an API key.
   *
   * @param id - The API key ID to unsuspend
   * @returns The unsuspended API key
   * @throws {ApiKeyNotFoundException} If the key doesn't exist
   * @throws {BadRequestException} If the key is not suspended
   */
  async unsuspend(id: string): Promise<ApiKey> {
    const key = await this.adapter.findById(id);
    if (!key) {
      throw new ApiKeyNotFoundException(id);
    }

    if (key.state !== 'suspended') {
      throw new BadRequestException('API key is not suspended');
    }

    const unsuspendedKey = await this.adapter.unsuspend(id);
    ApiKeyLogger.log(`API key unsuspended: ${id} (${key.name})`);

    await this.webhookService
      ?.sendWebhook('key.unsuspended', {
        keyId: unsuspendedKey.id,
        keyName: unsuspendedKey.name,
      })
      .catch((error) => {
        ApiKeyLogger.warn(
          `Failed to send webhook for key unsuspension: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return unsuspendedKey;
  }

  /**
   * Checks if an API key is suspended.
   *
   * @param key - The API key to check
   * @returns True if the key is suspended
   */
  isSuspended(key: ApiKey): boolean {
    return key.state === 'suspended' || key.suspendedAt !== null;
  }

  /**
   * Gets all suspended API keys.
   *
   * @returns Array of suspended API keys
   */
  async getSuspendedKeys(): Promise<ApiKey[]> {
    return await this.adapter.query({ state: 'suspended' });
  }
}
