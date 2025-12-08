import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { API_KEY_ADAPTER } from '../api-key.module';
import { ApiKeyService } from './api-key.service';
import { ApiKeyLogger } from '../utils/logger.util';

export interface KeyVersion {
  version: number;
  keyId: string;
  keyData: Partial<ApiKey>;
  createdAt: Date;
  createdBy?: string;
  reason?: string;
}

/**
 * Service for tracking API key versions.
 */
@Injectable()
export class KeyVersioningService {
  private readonly versions = new Map<string, KeyVersion[]>(); // keyId -> versions

  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  /**
   * Creates a new version of a key.
   *
   * @param keyId - The API key ID
   * @param keyData - The key data for this version
   * @param createdBy - Optional user who created the version
   * @param reason - Optional reason for version creation
   * @returns The created version
   */
  async createVersion(
    keyId: string,
    keyData: Partial<ApiKey>,
    createdBy?: string,
    reason?: string,
  ): Promise<KeyVersion> {
    const versions = this.versions.get(keyId) || [];
    const versionNumber = versions.length + 1;

    const version: KeyVersion = {
      version: versionNumber,
      keyId,
      keyData: { ...keyData },
      createdAt: new Date(),
      createdBy,
      reason,
    };

    versions.push(version);
    this.versions.set(keyId, versions);

    ApiKeyLogger.log(`Version ${versionNumber} created for key ${keyId}`, 'KeyVersioningService');

    return version;
  }

  /**
   * Gets all versions for a key.
   *
   * @param keyId - The API key ID
   * @returns Array of versions (sorted by version number)
   */
  getKeyVersions(keyId: string): KeyVersion[] {
    const versions = this.versions.get(keyId) || [];
    return versions.sort((a, b) => a.version - b.version);
  }

  /**
   * Gets a specific version of a key.
   *
   * @param keyId - The API key ID
   * @param version - The version number
   * @returns The version or null
   */
  getKeyVersion(keyId: string, version: number): KeyVersion | null {
    const versions = this.versions.get(keyId) || [];
    return versions.find((v) => v.version === version) || null;
  }

  /**
   * Gets the latest version of a key.
   *
   * @param keyId - The API key ID
   * @returns The latest version or null
   */
  getLatestVersion(keyId: string): KeyVersion | null {
    const versions = this.getKeyVersions(keyId);
    return versions.length > 0 ? versions[versions.length - 1] : null;
  }

  /**
   * Records a version when a key is rotated.
   *
   * @param oldKeyId - The old key ID
   * @param newKeyId - The new key ID
   * @param rotatedBy - Optional user who rotated the key
   */
  async recordRotation(oldKeyId: string, newKeyId: string, rotatedBy?: string): Promise<void> {
    const oldKey = await this.adapter.findById(oldKeyId);
    if (oldKey) {
      await this.createVersion(oldKeyId, oldKey, rotatedBy, 'Key rotated');
    }

    const newKey = await this.adapter.findById(newKeyId);
    if (newKey) {
      await this.createVersion(newKeyId, newKey, rotatedBy, 'Key created from rotation');
    }
  }

  /**
   * Records a version when a key is updated.
   *
   * @param keyId - The API key ID
   * @param oldKeyData - The old key data
   * @param newKeyData - The new key data
   * @param updatedBy - Optional user who updated the key
   */
  async recordUpdate(
    keyId: string,
    oldKeyData: Partial<ApiKey>,
    newKeyData: Partial<ApiKey>,
    updatedBy?: string,
  ): Promise<void> {
    await this.createVersion(keyId, oldKeyData, updatedBy, 'Key updated');
  }

  /**
   * Rolls back a key to a previous version.
   * Note: This creates a new version with the old data, it doesn't actually restore the old key.
   *
   * @param keyId - The API key ID
   * @param version - The version to roll back to
   * @param rolledBackBy - Optional user who performed the rollback
   * @returns The new version created from rollback
   */
  async rollbackToVersion(
    keyId: string,
    version: number,
    rolledBackBy?: string,
  ): Promise<KeyVersion> {
    const targetVersion = this.getKeyVersion(keyId, version);
    if (!targetVersion) {
      throw new Error(`Version ${version} not found for key ${keyId}`);
    }

    const newVersion = await this.createVersion(
      keyId,
      targetVersion.keyData,
      rolledBackBy,
      `Rolled back to version ${version}`,
    );

    ApiKeyLogger.log(`Key ${keyId} rolled back to version ${version}`, 'KeyVersioningService');

    return newVersion;
  }

  /**
   * Gets version history summary.
   *
   * @param keyId - The API key ID
   * @returns Version history summary
   */
  getVersionHistory(keyId: string): {
    totalVersions: number;
    latestVersion: number;
    firstVersion: Date | null;
    lastVersion: Date | null;
  } {
    const versions = this.getKeyVersions(keyId);

    return {
      totalVersions: versions.length,
      latestVersion: versions.length > 0 ? versions[versions.length - 1].version : 0,
      firstVersion: versions.length > 0 ? versions[0].createdAt : null,
      lastVersion: versions.length > 0 ? versions[versions.length - 1].createdAt : null,
    };
  }
}
