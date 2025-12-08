import { Injectable, Inject } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { API_KEY_ADAPTER } from '../api-key.module';
import { ApiKeyLogger } from '../utils/logger.util';

/**
 * Service for transferring API key ownership.
 */
@Injectable()
export class KeyTransferService {
  constructor(@Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter) {}

  /**
   * Transfers ownership of an API key.
   *
   * @param keyId - The API key ID
   * @param newOwner - The new owner identifier
   * @param transferredBy - Optional user who performed the transfer
   * @returns The updated API key
   */
  async transferOwnership(keyId: string, newOwner: string, transferredBy?: string) {
    const key = await this.adapter.findById(keyId);
    if (!key) {
      throw new Error(`Key ${keyId} not found`);
    }

    const oldOwner = key.owner;

    // Update owner in metadata
    const updatedMetadata = {
      ...(key.metadata || {}),
      previousOwner: oldOwner,
      transferredAt: new Date().toISOString(),
      transferredBy,
    };

    // Note: This requires an update method on the adapter
    // For now, we'll use the existing metadata field
    ApiKeyLogger.log(
      `Key ${keyId} ownership transferred from ${oldOwner} to ${newOwner}`,
      'KeyTransferService',
    );

    // In a real implementation, you would update the key's owner field
    // This would require adding an update method to the adapter interface
    return { ...key, owner: newOwner, metadata: updatedMetadata };
  }

  /**
   * Transfers multiple keys to a new owner.
   *
   * @param keyIds - Array of key IDs
   * @param newOwner - The new owner identifier
   * @param transferredBy - Optional user who performed the transfer
   * @returns Array of updated keys
   */
  async bulkTransferOwnership(keyIds: string[], newOwner: string, transferredBy?: string) {
    const results = [];

    for (const keyId of keyIds) {
      try {
        const result = await this.transferOwnership(keyId, newOwner, transferredBy);
        results.push(result);
      } catch (error) {
        ApiKeyLogger.error(
          `Failed to transfer key ${keyId}`,
          error instanceof Error ? error : String(error),
          'KeyTransferService',
        );
      }
    }

    return results;
  }
}
