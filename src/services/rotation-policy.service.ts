import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKeyService } from './api-key.service';
import { ApiKeyLogger } from '../utils/logger.util';
import { API_KEY_ADAPTER } from '../api-key.module';

export interface RotationPolicy {
  id: string;
  name: string;
  keyIds?: string[];
  tags?: string[];
  owner?: string;
  environment?: 'production' | 'staging' | 'development';
  rotationIntervalDays: number;
  gracePeriodHours?: number;
  revokeOldKey: boolean;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt: Date;
}

/**
 * Service for managing automated key rotation policies.
 */
@Injectable()
export class RotationPolicyService implements OnModuleInit, OnModuleDestroy {
  private policies: Map<string, RotationPolicy> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.isRunning = true;
    // Start monitoring policies
    this.startMonitoring();
  }

  async onModuleDestroy(): Promise<void> {
    this.isRunning = false;
    // Clear monitoring interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    // Clear all policy intervals
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();
  }

  /**
   * Registers a rotation policy.
   *
   * @param policy - The rotation policy
   */
  registerPolicy(policy: RotationPolicy): void {
    this.policies.set(policy.id, policy);

    if (policy.enabled && this.isRunning) {
      this.schedulePolicy(policy);
    }

    ApiKeyLogger.log(
      `Rotation policy registered: ${policy.name} (${policy.id})`,
      'RotationPolicyService',
    );
  }

  /**
   * Removes a rotation policy.
   *
   * @param policyId - The policy ID
   */
  removePolicy(policyId: string): void {
    const interval = this.intervals.get(policyId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(policyId);
    }
    this.policies.delete(policyId);
    ApiKeyLogger.log(`Rotation policy removed: ${policyId}`, 'RotationPolicyService');
  }

  /**
   * Gets all registered policies.
   *
   * @returns Array of policies
   */
  getPolicies(): RotationPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Gets a specific policy.
   *
   * @param policyId - The policy ID
   * @returns The policy or null
   */
  getPolicy(policyId: string): RotationPolicy | null {
    return this.policies.get(policyId) || null;
  }

  /**
   * Executes a rotation policy.
   *
   * @param policyId - The policy ID
   */
  async executePolicy(policyId: string): Promise<void> {
    const policy = this.policies.get(policyId);
    if (!policy || !policy.enabled) {
      return;
    }

    try {
      ApiKeyLogger.log(`Executing rotation policy: ${policy.name}`, 'RotationPolicyService');

      let keysToRotate: string[] = [];

      if (policy.keyIds && policy.keyIds.length > 0) {
        keysToRotate = policy.keyIds;
      } else {
        // Find keys matching the policy criteria
        type QueryFilters = {
          tags?: string[];
          owner?: string;
          environment?: 'production' | 'staging' | 'development';
          scopes?: string[];
          active?: boolean;
          createdAfter?: Date;
          createdBefore?: Date;
          lastUsedAfter?: Date;
          lastUsedBefore?: Date;
          limit?: number;
          offset?: number;
        };

        const filters: QueryFilters = {};
        if (policy.tags) filters.tags = policy.tags;
        if (policy.owner) filters.owner = policy.owner;
        if (policy.environment) filters.environment = policy.environment;
        filters.active = true;

        const matchingKeys = await this.adapter.query(filters);
        keysToRotate = matchingKeys.map((key) => key.id);
      }

      for (const keyId of keysToRotate) {
        try {
          await this.apiKeyService.rotate(keyId, {
            revokeOldKey: policy.revokeOldKey,
            gracePeriodHours: policy.gracePeriodHours,
          });
          ApiKeyLogger.log(
            `Rotated key ${keyId} via policy ${policy.name}`,
            'RotationPolicyService',
          );
        } catch (error) {
          ApiKeyLogger.error(
            `Failed to rotate key ${keyId} via policy ${policy.name}`,
            error instanceof Error ? error : String(error),
            'RotationPolicyService',
          );
        }
      }

      // Update policy last run time
      policy.lastRunAt = new Date();
      policy.nextRunAt = this.calculateNextRun(policy);
      this.policies.set(policyId, policy);

      ApiKeyLogger.log(
        `Rotation policy ${policy.name} completed. Rotated ${keysToRotate.length} keys.`,
        'RotationPolicyService',
      );
    } catch (error) {
      ApiKeyLogger.error(
        `Error executing rotation policy ${policyId}`,
        error instanceof Error ? error : String(error),
        'RotationPolicyService',
      );
    }
  }

  private startMonitoring(): void {
    // Clear existing monitoring interval if any
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Check for policies that need to run every hour
    this.monitoringInterval = setInterval(
      () => {
        if (!this.isRunning) return;

        const now = new Date();
        for (const [policyId, policy] of this.policies.entries()) {
          if (policy.enabled && policy.nextRunAt <= now) {
            this.executePolicy(policyId).catch((error) => {
              ApiKeyLogger.error(
                `Error in scheduled rotation policy ${policyId}`,
                error instanceof Error ? error : String(error),
                'RotationPolicyService',
              );
            });
          }
        }
      },
      60 * 60 * 1000,
    ); // Check every hour
  }

  private schedulePolicy(policy: RotationPolicy): void {
    // Clear existing interval if any
    const existing = this.intervals.get(policy.id);
    if (existing) {
      clearInterval(existing);
    }

    // Calculate next run time
    policy.nextRunAt = this.calculateNextRun(policy);

    // Schedule the policy
    const delay = policy.nextRunAt.getTime() - Date.now();
    if (delay > 0) {
      const timeout = setTimeout(() => {
        this.executePolicy(policy.id).catch((error) => {
          ApiKeyLogger.error(
            `Error in scheduled rotation policy ${policy.id}`,
            error instanceof Error ? error : String(error),
            'RotationPolicyService',
          );
        });
        // Reschedule for next interval
        this.schedulePolicy(policy);
      }, delay);

      this.intervals.set(policy.id, timeout);
    }
  }

  private calculateNextRun(policy: RotationPolicy): Date {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + policy.rotationIntervalDays);
    nextRun.setHours(0, 0, 0, 0); // Start of day
    return nextRun;
  }
}
