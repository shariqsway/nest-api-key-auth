import { Injectable, BadRequestException } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { ApiKeyNotFoundException } from '../exceptions';
import { ApiKeyLogger } from '../utils/logger.util';
import { API_KEY_ADAPTER } from '../api-key.module';
import { Inject, Optional } from '@nestjs/common';
import { WebhookService, WEBHOOK_SERVICE_TOKEN } from './webhook.service';

/**
 * Service for managing API key approval workflow.
 */
@Injectable()
export class KeyApprovalService {
  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Optional() @Inject(WEBHOOK_SERVICE_TOKEN) private readonly webhookService?: WebhookService,
  ) {}

  /**
   * Approves a pending API key.
   *
   * @param id - The API key ID to approve
   * @returns The approved API key
   * @throws {ApiKeyNotFoundException} If the key doesn't exist
   * @throws {BadRequestException} If the key is not in pending state
   */
  async approve(id: string): Promise<ApiKey> {
    const key = await this.adapter.findById(id);
    if (!key) {
      throw new ApiKeyNotFoundException(id);
    }

    if (key.state !== 'pending') {
      throw new BadRequestException('API key is not pending approval');
    }

    const approvedKey = await this.adapter.approve(id);
    ApiKeyLogger.log(`API key approved: ${id} (${key.name})`);

    await this.webhookService
      ?.sendWebhook('key.approved', {
        keyId: approvedKey.id,
        keyName: approvedKey.name,
      })
      .catch((error) => {
        ApiKeyLogger.warn(
          `Failed to send webhook for key approval: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return approvedKey;
  }

  /**
   * Rejects a pending API key (revokes it).
   *
   * @param id - The API key ID to reject
   * @param reason - Reason for rejection
   * @returns The rejected API key
   * @throws {ApiKeyNotFoundException} If the key doesn't exist
   * @throws {BadRequestException} If the key is not in pending state
   */
  async reject(id: string, reason?: string): Promise<ApiKey> {
    const key = await this.adapter.findById(id);
    if (!key) {
      throw new ApiKeyNotFoundException(id);
    }

    if (key.state !== 'pending') {
      throw new BadRequestException('API key is not pending approval');
    }

    const rejectedKey = await this.adapter.revoke(id, reason || 'Rejected during approval process');
    ApiKeyLogger.log(`API key rejected: ${id} (${key.name})`);

    await this.webhookService
      ?.sendWebhook('key.rejected', {
        keyId: rejectedKey.id,
        keyName: rejectedKey.name,
        reason,
      })
      .catch((error) => {
        ApiKeyLogger.warn(
          `Failed to send webhook for key rejection: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    return rejectedKey;
  }

  /**
   * Gets all pending API keys.
   *
   * @returns Array of pending API keys
   */
  async getPendingKeys(): Promise<ApiKey[]> {
    return await this.adapter.query({ state: 'pending' });
  }

  /**
   * Checks if an API key requires approval.
   *
   * @param key - The API key to check
   * @returns True if the key requires approval
   */
  requiresApproval(key: ApiKey): boolean {
    return key.state === 'pending';
  }
}
