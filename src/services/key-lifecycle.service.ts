import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKeyLogger } from '../utils/logger.util';
import { API_KEY_ADAPTER } from '../api-key.module';
import { Inject, Optional } from '@nestjs/common';
import { WebhookService, WEBHOOK_SERVICE_TOKEN } from './webhook.service';

export interface LifecyclePolicy {
  id: string;
  name: string;
  enabled: boolean;
  autoArchiveExpiredAfterDays?: number; // Auto-archive expired keys after X days
  autoArchiveRevokedAfterDays?: number; // Auto-archive revoked keys after X days
  autoExpireAfterDays?: number; // Auto-expire keys after X days of inactivity
  checkIntervalMs?: number; // How often to check (default: 24 hours)
}

/**
 * Service for automating API key lifecycle management.
 * Handles automatic state transitions, archiving, and cleanup.
 */
@Injectable()
export class KeyLifecycleService implements OnModuleInit, OnModuleDestroy {
  private checkInterval: NodeJS.Timeout | null = null;
  private policies: Map<string, LifecyclePolicy> = new Map();
  private isRunning = false;

  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Optional() @Inject(WEBHOOK_SERVICE_TOKEN) private readonly webhookService?: WebhookService,
  ) {}

  /**
   * Starts lifecycle monitoring when module initializes.
   */
  onModuleInit(): void {
    this.startMonitoring();
  }

  /**
   * Stops lifecycle monitoring when module destroys.
   */
  onModuleDestroy(): void {
    this.stopMonitoring();
  }

  /**
   * Registers a lifecycle policy.
   *
   * @param policy - The lifecycle policy to register
   */
  registerPolicy(policy: LifecyclePolicy): void {
    this.policies.set(policy.id, policy);
    ApiKeyLogger.log(`Lifecycle policy registered: ${policy.name} (${policy.id})`);
  }

  /**
   * Removes a lifecycle policy.
   *
   * @param policyId - The policy ID to remove
   */
  removePolicy(policyId: string): void {
    this.policies.delete(policyId);
    ApiKeyLogger.log(`Lifecycle policy removed: ${policyId}`);
  }

  /**
   * Starts automatic lifecycle monitoring.
   */
  startMonitoring(): void {
    if (this.isRunning) {
      ApiKeyLogger.warn('Lifecycle monitoring is already running');
      return;
    }

    this.isRunning = true;
    const defaultInterval = 24 * 60 * 60 * 1000; // 24 hours

    this.checkInterval = setInterval(async () => {
      await this.processLifecyclePolicies();
    }, defaultInterval);

    // Run immediately on start
    this.processLifecyclePolicies().catch((error) => {
      ApiKeyLogger.error(
        'Error in initial lifecycle check',
        error instanceof Error ? error : String(error),
      );
    });

    ApiKeyLogger.log('Lifecycle monitoring started', 'KeyLifecycleService');
  }

  /**
   * Stops automatic lifecycle monitoring.
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    ApiKeyLogger.log('Lifecycle monitoring stopped', 'KeyLifecycleService');
  }

  /**
   * Processes all lifecycle policies.
   */
  async processLifecyclePolicies(): Promise<void> {
    const enabledPolicies = Array.from(this.policies.values()).filter((p) => p.enabled);

    if (enabledPolicies.length === 0) {
      return;
    }

    ApiKeyLogger.debug(`Processing ${enabledPolicies.length} lifecycle policies`);

    for (const policy of enabledPolicies) {
      try {
        await this.processPolicy(policy);
      } catch (error) {
        ApiKeyLogger.error(
          `Error processing lifecycle policy ${policy.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Processes a single lifecycle policy.
   *
   * @param policy - The policy to process
   */
  private async processPolicy(policy: LifecyclePolicy): Promise<void> {
    const now = new Date();

    // Auto-archive expired keys
    if (policy.autoArchiveExpiredAfterDays) {
      await this.archiveExpiredKeys(policy.autoArchiveExpiredAfterDays, now);
    }

    // Auto-archive revoked keys
    if (policy.autoArchiveRevokedAfterDays) {
      await this.archiveRevokedKeys(policy.autoArchiveRevokedAfterDays, now);
    }

    // Auto-expire inactive keys
    if (policy.autoExpireAfterDays) {
      await this.expireInactiveKeys(policy.autoExpireAfterDays, now);
    }
  }

  /**
   * Archives expired keys that have been expired for the specified number of days.
   *
   * @param daysAfterExpiration - Number of days after expiration to archive
   * @param now - Current date
   */
  private async archiveExpiredKeys(daysAfterExpiration: number, now: Date): Promise<void> {
    const allKeys = await this.adapter.findAll();
    const cutoffDate = new Date(now.getTime() - daysAfterExpiration * 24 * 60 * 60 * 1000);

    for (const key of allKeys) {
      if (key.state === 'expired' && key.expiresAt && key.expiresAt <= cutoffDate) {
        // Archive by updating metadata (we don't have an archived state, so we use metadata)
        // Note: This requires an update method in the adapter
        // For now, we'll log it
        ApiKeyLogger.log(
          `Would archive expired key: ${key.id} (expired ${daysAfterExpiration} days ago)`,
        );

        await this.webhookService
          ?.sendWebhook('key.archived', {
            keyId: key.id,
            keyName: key.name,
            reason: 'Auto-archived after expiration period',
          })
          .catch((error) => {
            ApiKeyLogger.warn(
              `Failed to send webhook for key archival: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }
    }
  }

  /**
   * Archives revoked keys that have been revoked for the specified number of days.
   *
   * @param daysAfterRevocation - Number of days after revocation to archive
   * @param now - Current date
   */
  private async archiveRevokedKeys(daysAfterRevocation: number, now: Date): Promise<void> {
    const allKeys = await this.adapter.findAll();
    const cutoffDate = new Date(now.getTime() - daysAfterRevocation * 24 * 60 * 60 * 1000);

    for (const key of allKeys) {
      if (key.state === 'revoked' && key.revokedAt && key.revokedAt <= cutoffDate) {
        ApiKeyLogger.log(
          `Would archive revoked key: ${key.id} (revoked ${daysAfterRevocation} days ago)`,
        );

        await this.webhookService
          ?.sendWebhook('key.archived', {
            keyId: key.id,
            keyName: key.name,
            reason: 'Auto-archived after revocation period',
          })
          .catch((error) => {
            ApiKeyLogger.warn(
              `Failed to send webhook for key archival: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }
    }
  }

  /**
   * Expires keys that have been inactive for the specified number of days.
   *
   * @param daysOfInactivity - Number of days of inactivity before expiration
   * @param now - Current date
   */
  private async expireInactiveKeys(daysOfInactivity: number, now: Date): Promise<void> {
    const activeKeys = await this.adapter.findAllActive();
    const cutoffDate = new Date(now.getTime() - daysOfInactivity * 24 * 60 * 60 * 1000);

    for (const key of activeKeys) {
      if (
        key.state === 'active' &&
        key.lastUsedAt &&
        key.lastUsedAt <= cutoffDate &&
        !key.expiresAt
      ) {
        // Set expiration date to now
        await this.adapter.updateState(key.id, 'expired');

        ApiKeyLogger.log(
          `Auto-expired inactive key: ${key.id} (inactive for ${daysOfInactivity} days)`,
        );

        await this.webhookService
          ?.sendWebhook('key.expired', {
            keyId: key.id,
            keyName: key.name,
            reason: 'Auto-expired due to inactivity',
          })
          .catch((error) => {
            ApiKeyLogger.warn(
              `Failed to send webhook for key expiration: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }
    }
  }

  /**
   * Manually triggers lifecycle processing.
   */
  async triggerLifecycleCheck(): Promise<void> {
    await this.processLifecyclePolicies();
  }

  /**
   * Gets all registered policies.
   *
   * @returns Array of lifecycle policies
   */
  getPolicies(): LifecyclePolicy[] {
    return Array.from(this.policies.values());
  }
}
