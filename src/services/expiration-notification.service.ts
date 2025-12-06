import { Injectable, Inject, Optional } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { WebhookService } from './webhook.service';
import { API_KEY_ADAPTER } from '../api-key.module';
import { WEBHOOK_SERVICE_TOKEN } from '../api-key.module';
import { ApiKeyLogger } from '../utils/logger.util';

export interface ExpirationNotificationOptions {
  checkIntervalMs?: number;
  warningDaysBeforeExpiration?: number[];
  enableWebhooks?: boolean;
}

/**
 * Service for monitoring and notifying about API key expirations.
 */
@Injectable()
export class ExpirationNotificationService {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly options: Required<ExpirationNotificationOptions>;

  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Optional() @Inject(WEBHOOK_SERVICE_TOKEN) private readonly webhookService?: WebhookService,
    options: ExpirationNotificationOptions = {},
  ) {
    this.options = {
      checkIntervalMs: options.checkIntervalMs || 24 * 60 * 60 * 1000, // 24 hours
      warningDaysBeforeExpiration: options.warningDaysBeforeExpiration || [30, 7, 1],
      enableWebhooks: options.enableWebhooks !== false,
    };
  }

  /**
   * Starts monitoring for expiring keys.
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkExpiringKeys().catch((error) => {
        ApiKeyLogger.error(
          'Error checking expiring keys',
          error instanceof Error ? error : String(error),
          'ExpirationNotificationService',
        );
      });
    }, this.options.checkIntervalMs);

    ApiKeyLogger.log('Expiration monitoring started', 'ExpirationNotificationService');
  }

  /**
   * Stops monitoring for expiring keys.
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      ApiKeyLogger.log('Expiration monitoring stopped', 'ExpirationNotificationService');
    }
  }

  /**
   * Checks for keys that are expiring soon and sends notifications.
   */
  async checkExpiringKeys(): Promise<void> {
    const allKeys = await this.adapter.findAllActive();
    const now = new Date();

    for (const key of allKeys) {
      if (!key.expiresAt) {
        continue;
      }

      const daysUntilExpiration = Math.ceil(
        (key.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );

      if (daysUntilExpiration <= 0) {
        await this.notifyExpired(key);
      } else if (this.options.warningDaysBeforeExpiration.includes(daysUntilExpiration)) {
        await this.notifyExpiringSoon(key, daysUntilExpiration);
      }
    }
  }

  /**
   * Notifies that a key has expired.
   *
   * @param key - The expired API key
   */
  private async notifyExpired(key: ApiKey): Promise<void> {
    ApiKeyLogger.warn(`API key expired: ${key.id} (${key.name})`, 'ExpirationNotificationService');

    if (this.options.enableWebhooks && this.webhookService) {
      await this.webhookService
        .sendWebhook('key.expired', {
          keyId: key.id,
          keyName: key.name,
          expiredAt: key.expiresAt,
        })
        .catch((error) => {
          ApiKeyLogger.warn(
            `Failed to send expiration webhook: ${error instanceof Error ? error.message : String(error)}`,
            'ExpirationNotificationService',
          );
        });
    }
  }

  /**
   * Notifies that a key is expiring soon.
   *
   * @param key - The API key expiring soon
   * @param daysUntilExpiration - Days until expiration
   */
  private async notifyExpiringSoon(key: ApiKey, daysUntilExpiration: number): Promise<void> {
    ApiKeyLogger.warn(
      `API key expiring in ${daysUntilExpiration} days: ${key.id} (${key.name})`,
      'ExpirationNotificationService',
    );

    if (this.options.enableWebhooks && this.webhookService) {
      await this.webhookService
        .sendWebhook('key.expiring', {
          keyId: key.id,
          keyName: key.name,
          expiresAt: key.expiresAt,
          daysUntilExpiration,
        })
        .catch((error) => {
          ApiKeyLogger.warn(
            `Failed to send expiration warning webhook: ${error instanceof Error ? error.message : String(error)}`,
            'ExpirationNotificationService',
          );
        });
    }
  }

  /**
   * Gets all keys expiring within a specified number of days.
   *
   * @param days - Number of days
   * @returns Array of keys expiring soon
   */
  async getKeysExpiringSoon(days: number): Promise<ApiKey[]> {
    const allKeys = await this.adapter.findAllActive();
    const now = new Date();
    const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return allKeys.filter(
      (key) => key.expiresAt && key.expiresAt <= threshold && key.expiresAt > now,
    );
  }
}
