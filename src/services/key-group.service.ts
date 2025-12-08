import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { API_KEY_ADAPTER } from '../api-key.module';
import { ApiKeyLogger } from '../utils/logger.util';

export interface KeyGroup {
  id: string;
  name: string;
  description?: string;
  keyIds: string[];
  tags?: string[];
  owner?: string;
  environment?: 'production' | 'staging' | 'development';
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateKeyGroupDto {
  name: string;
  description?: string;
  keyIds?: string[];
  tags?: string[];
  owner?: string;
  environment?: 'production' | 'staging' | 'development';
  metadata?: Record<string, unknown>;
}

/**
 * Service for managing key groups/teams.
 */
@Injectable()
export class KeyGroupService {
  private readonly groups = new Map<string, KeyGroup>();

  constructor(@Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter) {}

  /**
   * Creates a new key group.
   *
   * @param dto - Group creation data
   * @returns The created group
   */
  async createGroup(dto: CreateKeyGroupDto): Promise<KeyGroup> {
    const group: KeyGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: dto.name,
      description: dto.description,
      keyIds: dto.keyIds || [],
      tags: dto.tags || [],
      owner: dto.owner,
      environment: dto.environment,
      metadata: dto.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.groups.set(group.id, group);
    ApiKeyLogger.log(`Key group created: ${group.name} (${group.id})`, 'KeyGroupService');
    return group;
  }

  /**
   * Gets a group by ID.
   *
   * @param groupId - The group ID
   * @returns The group or null
   */
  getGroup(groupId: string): KeyGroup | null {
    return this.groups.get(groupId) || null;
  }

  /**
   * Gets all groups.
   *
   * @returns Array of groups
   */
  getAllGroups(): KeyGroup[] {
    return Array.from(this.groups.values());
  }

  /**
   * Gets groups by owner.
   *
   * @param owner - The owner identifier
   * @returns Array of groups
   */
  getGroupsByOwner(owner: string): KeyGroup[] {
    return Array.from(this.groups.values()).filter((g) => g.owner === owner);
  }

  /**
   * Gets groups by environment.
   *
   * @param environment - The environment
   * @returns Array of groups
   */
  getGroupsByEnvironment(environment: 'production' | 'staging' | 'development'): KeyGroup[] {
    return Array.from(this.groups.values()).filter((g) => g.environment === environment);
  }

  /**
   * Adds a key to a group.
   *
   * @param groupId - The group ID
   * @param keyId - The key ID to add
   */
  async addKeyToGroup(groupId: string, keyId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    // Verify key exists
    const key = await this.adapter.findById(keyId);
    if (!key) {
      throw new Error(`Key ${keyId} not found`);
    }

    if (!group.keyIds.includes(keyId)) {
      group.keyIds.push(keyId);
      group.updatedAt = new Date();
      ApiKeyLogger.log(`Key ${keyId} added to group ${group.name}`, 'KeyGroupService');
    }
  }

  /**
   * Removes a key from a group.
   *
   * @param groupId - The group ID
   * @param keyId - The key ID to remove
   */
  removeKeyFromGroup(groupId: string, keyId: string): void {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const index = group.keyIds.indexOf(keyId);
    if (index > -1) {
      group.keyIds.splice(index, 1);
      group.updatedAt = new Date();
      ApiKeyLogger.log(`Key ${keyId} removed from group ${group.name}`, 'KeyGroupService');
    }
  }

  /**
   * Gets all keys in a group.
   *
   * @param groupId - The group ID
   * @returns Array of API keys
   */
  async getGroupKeys(groupId: string): Promise<ApiKey[]> {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    const keys: ApiKey[] = [];
    for (const keyId of group.keyIds) {
      const key = await this.adapter.findById(keyId);
      if (key) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Updates a group.
   *
   * @param groupId - The group ID
   * @param updates - Partial group data to update
   * @returns The updated group
   */
  updateGroup(groupId: string, updates: Partial<CreateKeyGroupDto>): KeyGroup {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group ${groupId} not found`);
    }

    if (updates.name !== undefined) group.name = updates.name;
    if (updates.description !== undefined) group.description = updates.description;
    if (updates.tags !== undefined) group.tags = updates.tags;
    if (updates.owner !== undefined) group.owner = updates.owner;
    if (updates.environment !== undefined) group.environment = updates.environment;
    if (updates.metadata !== undefined) group.metadata = updates.metadata;

    group.updatedAt = new Date();
    ApiKeyLogger.log(`Group ${group.name} updated`, 'KeyGroupService');
    return group;
  }

  /**
   * Deletes a group.
   *
   * @param groupId - The group ID
   */
  deleteGroup(groupId: string): void {
    const group = this.groups.get(groupId);
    if (group) {
      this.groups.delete(groupId);
      ApiKeyLogger.log(`Group ${group.name} deleted`, 'KeyGroupService');
    }
  }

  /**
   * Bulk revokes all keys in a group.
   *
   * @param groupId - The group ID
   * @param reason - Optional reason for revocation
   */
  async bulkRevokeGroup(groupId: string, reason?: string): Promise<void> {
    const keys = await this.getGroupKeys(groupId);
    ApiKeyLogger.log(`Bulk revoking ${keys.length} keys in group ${groupId}`, 'KeyGroupService');

    for (const key of keys) {
      try {
        await this.adapter.revoke(key.id, reason);
      } catch (error) {
        ApiKeyLogger.error(
          `Failed to revoke key ${key.id} in group`,
          error instanceof Error ? error : String(error),
          'KeyGroupService',
        );
      }
    }
  }
}
