import { Injectable } from '@nestjs/common';
import { ApiKeyLogger } from '../utils/logger.util';

/**
 * Service for managing key aliases (multiple names for the same key).
 */
@Injectable()
export class KeyAliasService {
  private readonly aliases = new Map<string, string[]>(); // keyId -> aliases
  private readonly aliasToKey = new Map<string, string>(); // alias -> keyId

  /**
   * Adds an alias to a key.
   *
   * @param keyId - The API key ID
   * @param alias - The alias name
   */
  addAlias(keyId: string, alias: string): void {
    if (this.aliasToKey.has(alias)) {
      throw new Error(`Alias ${alias} already exists`);
    }

    const aliases = this.aliases.get(keyId) || [];
    if (!aliases.includes(alias)) {
      aliases.push(alias);
      this.aliases.set(keyId, aliases);
      this.aliasToKey.set(alias, keyId);
      ApiKeyLogger.log(`Alias ${alias} added to key ${keyId}`, 'KeyAliasService');
    }
  }

  /**
   * Removes an alias from a key.
   *
   * @param keyId - The API key ID
   * @param alias - The alias to remove
   */
  removeAlias(keyId: string, alias: string): void {
    const aliases = this.aliases.get(keyId);
    if (aliases) {
      const index = aliases.indexOf(alias);
      if (index > -1) {
        aliases.splice(index, 1);
        this.aliasToKey.delete(alias);
        ApiKeyLogger.log(`Alias ${alias} removed from key ${keyId}`, 'KeyAliasService');
      }
    }
  }

  /**
   * Gets all aliases for a key.
   *
   * @param keyId - The API key ID
   * @returns Array of aliases
   */
  getAliases(keyId: string): string[] {
    return this.aliases.get(keyId) || [];
  }

  /**
   * Gets the key ID for an alias.
   *
   * @param alias - The alias
   * @returns The key ID or null
   */
  getKeyByAlias(alias: string): string | null {
    return this.aliasToKey.get(alias) || null;
  }

  /**
   * Removes all aliases for a key.
   *
   * @param keyId - The API key ID
   */
  clearAliases(keyId: string): void {
    const aliases = this.aliases.get(keyId) || [];
    for (const alias of aliases) {
      this.aliasToKey.delete(alias);
    }
    this.aliases.delete(keyId);
    ApiKeyLogger.log(`All aliases cleared for key ${keyId}`, 'KeyAliasService');
  }
}
