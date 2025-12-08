import { BulkOperationsService } from '../../src/services/bulk-operations.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { ApiKeyService } from '../../src/services/api-key.service';
import { CreateApiKeyDto } from '../../src/interfaces';
import { createMockApiKey } from '../helpers/api-key.helper';

describe('BulkOperationsService', () => {
  let service: BulkOperationsService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;
  let mockApiKeyService: jest.Mocked<ApiKeyService>;

  beforeEach(() => {
    mockAdapter = {
      create: jest.fn(),
      findById: jest.fn(),
      findByKeyPrefix: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      revoke: jest.fn(),
      suspend: jest.fn(),
      unsuspend: jest.fn(),
      restore: jest.fn(),
      approve: jest.fn(),
      updateState: jest.fn(),
      updateLastUsed: jest.fn(),
      updateQuotaUsage: jest.fn(),
      query: jest.fn(),
    } as unknown as jest.Mocked<IApiKeyAdapter>;

    mockApiKeyService = {
      create: jest.fn(),
      revoke: jest.fn(),
    } as unknown as jest.Mocked<ApiKeyService>;

    service = new BulkOperationsService(mockAdapter, mockApiKeyService);
  });

  describe('bulkCreate', () => {
    it('should create multiple keys successfully', async () => {
      const dtos: CreateApiKeyDto[] = [
        { name: 'Key 1', scopes: ['read:projects'] },
        { name: 'Key 2', scopes: ['write:projects'] },
      ];

      mockApiKeyService.create
        .mockResolvedValueOnce({
          id: 'key-1',
          name: 'Key 1',
          token: 'token-1',
          scopes: ['read:projects'],
          expiresAt: null,
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'key-2',
          name: 'Key 2',
          token: 'token-2',
          scopes: ['write:projects'],
          expiresAt: null,
          createdAt: new Date(),
        });

      const result = await service.bulkCreate(dtos);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });

    it('should handle partial failures', async () => {
      const dtos: CreateApiKeyDto[] = [
        { name: 'Key 1', scopes: ['read:projects'] },
        { name: 'Key 2', scopes: ['write:projects'] },
      ];

      mockApiKeyService.create
        .mockResolvedValueOnce({
          id: 'key-1',
          name: 'Key 1',
          token: 'token-1',
          scopes: ['read:projects'],
          expiresAt: null,
          createdAt: new Date(),
        })
        .mockRejectedValueOnce(new Error('Validation failed'));

      const result = await service.bulkCreate(dtos);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Validation failed');
    });

    it('should throw error when ApiKeyService not available', async () => {
      const serviceWithoutApiKey = new BulkOperationsService(mockAdapter);

      await expect(
        serviceWithoutApiKey.bulkCreate([{ name: 'Key 1' }]),
      ).rejects.toThrow('ApiKeyService is required for bulk operations');
    });
  });

  describe('bulkRevoke', () => {
    it('should revoke multiple keys successfully', async () => {
      const keyIds = ['key-1', 'key-2'];

      mockApiKeyService.revoke
        .mockResolvedValueOnce(
          createMockApiKey({
            id: 'key-1',
            name: 'Key 1',
            keyPrefix: 'abc',
            state: 'revoked',
            revokedAt: new Date(),
          }),
        )
        .mockResolvedValueOnce(
          createMockApiKey({
            id: 'key-2',
            name: 'Key 2',
            keyPrefix: 'def',
            state: 'revoked',
            revokedAt: new Date(),
          }),
        );

      const result = await service.bulkRevoke(keyIds);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(true);
    });

    it('should handle partial failures', async () => {
      const keyIds = ['key-1', 'key-2'];

      mockApiKeyService.revoke
        .mockResolvedValueOnce(
          createMockApiKey({
            id: 'key-1',
            name: 'Key 1',
            keyPrefix: 'abc',
            state: 'revoked',
            revokedAt: new Date(),
          }),
        )
        .mockRejectedValueOnce(new Error('Key not found'));

      const result = await service.bulkRevoke(keyIds);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Key not found');
    });

    it('should throw error when ApiKeyService not available', async () => {
      const serviceWithoutApiKey = new BulkOperationsService(mockAdapter);

      await expect(serviceWithoutApiKey.bulkRevoke(['key-1'])).rejects.toThrow(
        'ApiKeyService is required for bulk operations',
      );
    });
  });
});

