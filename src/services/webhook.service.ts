import { Injectable } from '@nestjs/common';
import { ApiKeyLogger } from '../utils/logger.util';

export interface WebhookConfig {
  url: string;
  secret?: string;
  events: WebhookEvent[];
  retryAttempts?: number;
  timeout?: number;
}

export type WebhookEvent =
  | 'key.created'
  | 'key.revoked'
  | 'key.rotated'
  | 'key.expired'
  | 'key.expiring'
  | 'key.updated'
  | 'key.suspended'
  | 'key.unsuspended'
  | 'key.approved'
  | 'key.rejected'
  | 'key.restored'
  | 'key.archived'
  | 'threat.detected';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: Date;
  data: {
    keyId: string;
    keyName: string;
    [key: string]: unknown;
  };
}

export const WEBHOOK_SERVICE_TOKEN = 'WEBHOOK_SERVICE';

/**
 * Service for sending webhook notifications for API key events.
 */
@Injectable()
export class WebhookService {
  private readonly webhooks: WebhookConfig[] = [];
  private readonly defaultTimeout = 5000;
  private readonly defaultRetryAttempts = 3;

  /**
   * Registers a webhook configuration.
   *
   * @param config - Webhook configuration
   */
  registerWebhook(config: WebhookConfig): void {
    this.webhooks.push({
      ...config,
      retryAttempts: config.retryAttempts || this.defaultRetryAttempts,
      timeout: config.timeout || this.defaultTimeout,
    });
    ApiKeyLogger.log(`Webhook registered: ${config.url}`, 'WebhookService');
  }

  /**
   * Sends a webhook notification.
   *
   * @param event - The webhook event type
   * @param data - Event data
   */
  async sendWebhook(
    event: WebhookEvent,
    data: { keyId: string; keyName: string; [key: string]: unknown },
  ): Promise<void> {
    const payload: WebhookPayload = {
      event,
      timestamp: new Date(),
      data,
    };

    const relevantWebhooks = this.webhooks.filter((wh) => wh.events.includes(event));

    await Promise.allSettled(
      relevantWebhooks.map((webhook) => this.sendToWebhook(webhook, payload)),
    );
  }

  private async sendToWebhook(webhook: WebhookConfig, payload: WebhookPayload): Promise<void> {
    const maxAttempts = webhook.retryAttempts || this.defaultRetryAttempts;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'nest-api-key-auth/1.0',
            ...(webhook.secret && { 'X-Webhook-Secret': webhook.secret }),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(webhook.timeout || this.defaultTimeout),
        });

        if (!response.ok) {
          throw new Error(`Webhook returned status ${response.status}`);
        }

        ApiKeyLogger.debug(`Webhook sent successfully: ${webhook.url}`, 'WebhookService');
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        ApiKeyLogger.warn(
          `Webhook attempt ${attempt}/${maxAttempts} failed: ${webhook.url}`,
          'WebhookService',
        );

        if (attempt < maxAttempts) {
          await this.delay(1000 * attempt);
        }
      }
    }

    ApiKeyLogger.error(
      `Webhook failed after ${maxAttempts} attempts: ${webhook.url}`,
      lastError || new Error('Unknown error'),
      'WebhookService',
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Removes a webhook configuration.
   *
   * @param url - Webhook URL to remove
   */
  unregisterWebhook(url: string): void {
    const index = this.webhooks.findIndex((wh) => wh.url === url);
    if (index !== -1) {
      this.webhooks.splice(index, 1);
      ApiKeyLogger.log(`Webhook unregistered: ${url}`, 'WebhookService');
    }
  }

  /**
   * Gets all registered webhooks.
   *
   * @returns Array of webhook configurations
   */
  getWebhooks(): WebhookConfig[] {
    return [...this.webhooks];
  }
}
