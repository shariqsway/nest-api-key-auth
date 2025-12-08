import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKey } from '../interfaces';
import { API_KEY_ADAPTER } from '../api-key.module';
import { ApiKeyLogger } from '../utils/logger.util';

export interface Tenant {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Service for multi-tenancy support.
 * Provides tenant isolation for API keys.
 */
@Injectable()
export class MultiTenancyService {
  private readonly tenants = new Map<string, Tenant>();
  private readonly tenantKeyMap = new Map<string, string>(); // keyId -> tenantId

  constructor(@Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter) {}

  /**
   * Creates a new tenant.
   *
   * @param name - Tenant name
   * @param metadata - Optional metadata
   * @returns The created tenant
   */
  createTenant(name: string, metadata?: Record<string, unknown>): Tenant {
    const tenant: Tenant = {
      id: `tenant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      metadata,
      createdAt: new Date(),
    };

    this.tenants.set(tenant.id, tenant);
    ApiKeyLogger.log(`Tenant created: ${tenant.name} (${tenant.id})`, 'MultiTenancyService');
    return tenant;
  }

  /**
   * Assigns a key to a tenant.
   *
   * @param keyId - The API key ID
   * @param tenantId - The tenant ID
   */
  assignKeyToTenant(keyId: string, tenantId: string): void {
    if (!this.tenants.has(tenantId)) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    this.tenantKeyMap.set(keyId, tenantId);
    ApiKeyLogger.log(`Key ${keyId} assigned to tenant ${tenantId}`, 'MultiTenancyService');
  }

  /**
   * Gets the tenant for a key.
   *
   * @param keyId - The API key ID
   * @returns The tenant or null
   */
  getKeyTenant(keyId: string): Tenant | null {
    const tenantId = this.tenantKeyMap.get(keyId);
    if (!tenantId) {
      return null;
    }

    return this.tenants.get(tenantId) || null;
  }

  /**
   * Gets all keys for a tenant.
   *
   * @param tenantId - The tenant ID
   * @returns Array of API keys
   */
  async getTenantKeys(tenantId: string): Promise<ApiKey[]> {
    const keyIds = Array.from(this.tenantKeyMap.entries())
      .filter(([, tid]) => tid === tenantId)
      .map(([kid]) => kid);

    const keys: ApiKey[] = [];
    for (const keyId of keyIds) {
      const key = await this.adapter.findById(keyId);
      if (key) {
        keys.push(key);
      }
    }

    return keys;
  }

  /**
   * Queries keys with tenant isolation.
   *
   * @param tenantId - The tenant ID
   * @param filters - Query filters
   * @returns Array of API keys for the tenant
   */
  async queryTenantKeys(
    tenantId: string,
    filters: {
      tags?: string[];
      owner?: string;
      environment?: 'production' | 'staging' | 'development';
      active?: boolean;
    } = {},
  ): Promise<ApiKey[]> {
    const allTenantKeys = await this.getTenantKeys(tenantId);

    return allTenantKeys.filter((key) => {
      if (filters.tags && filters.tags.length > 0) {
        const keyTags = key.tags || [];
        if (!filters.tags.every((tag) => keyTags.includes(tag))) {
          return false;
        }
      }

      if (filters.owner && key.owner !== filters.owner) {
        return false;
      }

      if (filters.environment && key.environment !== filters.environment) {
        return false;
      }

      if (filters.active !== undefined) {
        const isActive = !key.revokedAt && (!key.expiresAt || key.expiresAt > new Date());
        if (filters.active !== isActive) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Gets a tenant by ID.
   *
   * @param tenantId - The tenant ID
   * @returns The tenant or null
   */
  getTenant(tenantId: string): Tenant | null {
    return this.tenants.get(tenantId) || null;
  }

  /**
   * Gets all tenants.
   *
   * @returns Array of tenants
   */
  getAllTenants(): Tenant[] {
    return Array.from(this.tenants.values());
  }

  /**
   * Deletes a tenant and optionally revokes all its keys.
   *
   * @param tenantId - The tenant ID
   * @param revokeKeys - Whether to revoke all tenant keys
   */
  async deleteTenant(tenantId: string, revokeKeys: boolean = false): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    if (revokeKeys) {
      const keys = await this.getTenantKeys(tenantId);
      for (const key of keys) {
        try {
          await this.adapter.revoke(key.id, 'Tenant deleted');
        } catch (error) {
          ApiKeyLogger.error(
            `Failed to revoke key ${key.id} during tenant deletion`,
            error instanceof Error ? error : String(error),
            'MultiTenancyService',
          );
        }
      }
    }

    // Remove tenant assignments
    for (const [keyId, tid] of this.tenantKeyMap.entries()) {
      if (tid === tenantId) {
        this.tenantKeyMap.delete(keyId);
      }
    }

    this.tenants.delete(tenantId);
    ApiKeyLogger.log(`Tenant ${tenant.name} deleted`, 'MultiTenancyService');
  }
}
