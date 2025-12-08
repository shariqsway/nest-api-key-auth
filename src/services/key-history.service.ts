import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { API_KEY_ADAPTER } from '../api-key.module';
import { ApiKeyLogger } from '../utils/logger.util';

export interface KeyHistoryEntry {
  id: string;
  keyId: string;
  action: 'created' | 'updated' | 'revoked' | 'rotated' | 'restored' | 'metadata_changed';
  changedBy?: string;
  changes?: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
  reason?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface KeyHistoryOptions {
  enabled?: boolean;
  trackMetadataChanges?: boolean;
  retentionDays?: number;
}

/**
 * Service for tracking API key history and changes.
 */
@Injectable()
export class KeyHistoryService {
  private readonly history: Map<string, KeyHistoryEntry[]> = new Map();
  private readonly options: Required<KeyHistoryOptions>;

  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    options?: KeyHistoryOptions,
  ) {
    this.options = {
      enabled: true,
      trackMetadataChanges: true,
      retentionDays: 365,
      ...options,
    };
  }

  /**
   * Records a history entry for a key action.
   *
   * @param keyId - The API key ID
   * @param action - The action performed
   * @param changes - Optional changes made
   * @param changedBy - Optional user who made the change
   * @param reason - Optional reason for the change
   * @param metadata - Optional metadata
   */
  async recordHistory(
    keyId: string,
    action: KeyHistoryEntry['action'],
    changes?: KeyHistoryEntry['changes'],
    changedBy?: string,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    const entry: KeyHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      keyId,
      action,
      changedBy,
      changes,
      reason,
      timestamp: new Date(),
      metadata,
    };

    const history = this.history.get(keyId) || [];
    history.push(entry);

    // Apply retention policy
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.options.retentionDays);
    const filtered = history.filter((e) => e.timestamp >= cutoffDate);
    this.history.set(keyId, filtered);

    ApiKeyLogger.debug(`History recorded for key ${keyId}: ${action}`, 'KeyHistoryService');
  }

  /**
   * Gets the history for a specific key.
   *
   * @param keyId - The API key ID
   * @param limit - Optional limit on number of entries
   * @returns Array of history entries
   */
  async getKeyHistory(keyId: string, limit?: number): Promise<KeyHistoryEntry[]> {
    const history = this.history.get(keyId) || [];
    const sorted = history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Gets history for multiple keys.
   *
   * @param keyIds - Array of key IDs
   * @returns Map of key ID to history entries
   */
  async getBulkHistory(keyIds: string[]): Promise<Map<string, KeyHistoryEntry[]>> {
    const result = new Map<string, KeyHistoryEntry[]>();
    for (const keyId of keyIds) {
      result.set(keyId, await this.getKeyHistory(keyId));
    }
    return result;
  }

  /**
   * Compares two API keys and returns the differences.
   *
   * @param oldKey - The old key state
   * @param newKey - The new key state
   * @returns Array of changes
   */
  compareKeys(oldKey: Partial<ApiKey>, newKey: Partial<ApiKey>): KeyHistoryEntry['changes'] {
    const changes: KeyHistoryEntry['changes'] = [];
    const fields: Array<keyof ApiKey> = [
      'name',
      'scopes',
      'expiresAt',
      'ipWhitelist',
      'ipBlacklist',
      'rateLimitMax',
      'rateLimitWindowMs',
      'quotaMax',
      'quotaPeriod',
      'metadata',
      'tags',
      'owner',
      'environment',
      'description',
    ];

    for (const field of fields) {
      const oldValue = oldKey[field];
      const newValue = newKey[field];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field,
          oldValue,
          newValue,
        });
      }
    }

    return changes;
  }

  /**
   * Records key creation.
   */
  async recordCreation(keyId: string, key: ApiKey, createdBy?: string): Promise<void> {
    await this.recordHistory(keyId, 'created', undefined, createdBy, undefined, {
      keyName: key.name,
      scopes: key.scopes,
    });
  }

  /**
   * Records key update.
   */
  async recordUpdate(
    keyId: string,
    oldKey: Partial<ApiKey>,
    newKey: Partial<ApiKey>,
    updatedBy?: string,
  ): Promise<void> {
    const changes = this.compareKeys(oldKey, newKey);
    if (changes.length > 0) {
      await this.recordHistory(keyId, 'updated', changes, updatedBy);
    }
  }

  /**
   * Records key revocation.
   */
  async recordRevocation(keyId: string, reason?: string, revokedBy?: string): Promise<void> {
    await this.recordHistory(keyId, 'revoked', undefined, revokedBy, reason);
  }

  /**
   * Records key rotation.
   */
  async recordRotation(oldKeyId: string, newKeyId: string, rotatedBy?: string): Promise<void> {
    await this.recordHistory(oldKeyId, 'rotated', undefined, rotatedBy, undefined, {
      newKeyId,
    });
    await this.recordHistory(newKeyId, 'rotated', undefined, rotatedBy, undefined, {
      oldKeyId,
    });
  }

  /**
   * Records key restoration (un-revoking).
   */
  async recordRestoration(keyId: string, restoredBy?: string): Promise<void> {
    await this.recordHistory(keyId, 'restored', undefined, restoredBy);
  }

  /**
   * Clears history for a key (for GDPR compliance).
   *
   * @param keyId - The API key ID
   */
  clearHistory(keyId: string): void {
    this.history.delete(keyId);
    ApiKeyLogger.log(`History cleared for key ${keyId}`, 'KeyHistoryService');
  }

  /**
   * Exports history for a key (for compliance).
   *
   * @param keyId - The API key ID
   * @returns JSON string of history
   */
  async exportHistory(keyId: string): Promise<string> {
    const history = await this.getKeyHistory(keyId);
    return JSON.stringify(history, null, 2);
  }
}
