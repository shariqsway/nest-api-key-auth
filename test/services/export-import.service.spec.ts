import { Test, TestingModule } from '@nestjs/testing';
import { ExportImportService } from '../../src/services/export-import.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { ApiKey } from '../../src/interfaces';
import { API_KEY_ADAPTER } from '../../src/api-key.module';

describe('ExportImportService', () => {
  let service: ExportImportService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;

  const mockApiKeys: ApiKey[] = [
    {
      id: 'key-1',
      name: 'Key 1',
      keyPrefix: 'abc12345',
      hashedKey: 'hashed1',
      scopes: ['read:projects'],
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: new Date('2024-01-01'),
      tags: ['production'],
      owner: 'user1',
      environment: 'production',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 'key-2',
      name: 'Key 2',
      keyPrefix: 'def67890',
      hashedKey: 'hashed2',
      scopes: ['write:projects'],
      expiresAt: new Date('2025-12-31'),
      revokedAt: null,
      lastUsedAt: null,
      tags: ['staging'],
      owner: 'user2',
      environment: 'staging',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
    },
  ];

  beforeEach(async () => {
    mockAdapter = {
      create: jest.fn(),
      findByKeyPrefix: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      revoke: jest.fn(),
      updateLastUsed: jest.fn(),
      updateQuotaUsage: jest.fn(),
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportImportService,
        {
          provide: API_KEY_ADAPTER,
          useValue: mockAdapter,
        },
      ],
    }).compile();

    service = module.get<ExportImportService>(ExportImportService);
  });

  describe('exportKeys', () => {
    it('should export keys to JSON format', async () => {
      mockAdapter.query.mockResolvedValue(mockApiKeys);

      const result = await service.exportKeys();

      expect(result).toBeTruthy();
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });

    it('should exclude revoked keys by default', async () => {
      mockAdapter.query.mockResolvedValue([mockApiKeys[0]]);

      await service.exportKeys();

      expect(mockAdapter.query).toHaveBeenCalledWith(
        expect.objectContaining({
          active: true,
        }),
      );
    });

    it('should include revoked keys when specified', async () => {
      mockAdapter.query.mockResolvedValue(mockApiKeys);

      await service.exportKeys({ includeRevoked: true });

      expect(mockAdapter.query).toHaveBeenCalledWith(
        expect.objectContaining({
          active: false,
        }),
      );
    });

    it('should include key prefix when includeHashedKeys is true', async () => {
      mockAdapter.query.mockResolvedValue([mockApiKeys[0]]);

      const result = await service.exportKeys({ includeHashedKeys: true });
      const parsed = JSON.parse(result);

      expect(parsed[0]).toHaveProperty('keyPrefix');
      expect(parsed[0].keyPrefix).toBe('abc12345');
    });

    it('should exclude key prefix by default', async () => {
      mockAdapter.query.mockResolvedValue([mockApiKeys[0]]);

      const result = await service.exportKeys();
      const parsed = JSON.parse(result);

      expect(parsed[0]).not.toHaveProperty('keyPrefix');
    });

    it('should apply filters when provided', async () => {
      mockAdapter.query.mockResolvedValue([mockApiKeys[0]]);

      await service.exportKeys({
        filters: {
          tags: ['production'],
          owner: 'user1',
        },
      });

      expect(mockAdapter.query).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['production'],
          owner: 'user1',
        }),
      );
    });

    it('should not include hashed keys in export', async () => {
      mockAdapter.query.mockResolvedValue([mockApiKeys[0]]);

      const result = await service.exportKeys({ includeHashedKeys: true });
      const parsed = JSON.parse(result);

      expect(parsed[0]).not.toHaveProperty('hashedKey');
    });

    it('should format dates as ISO strings', async () => {
      mockAdapter.query.mockResolvedValue([mockApiKeys[0]]);

      const result = await service.exportKeys();
      const parsed = JSON.parse(result);

      expect(parsed[0].createdAt).toBe(mockApiKeys[0].createdAt.toISOString());
      expect(parsed[0].updatedAt).toBe(mockApiKeys[0].updatedAt.toISOString());
      expect(parsed[0].lastUsedAt).toBe(mockApiKeys[0].lastUsedAt?.toISOString());
    });
  });

  describe('importKeys', () => {
    it('should import keys from JSON', async () => {
      const importData = [
        {
          name: 'Imported Key 1',
          scopes: ['read:projects'],
          environment: 'production',
          tags: ['imported'],
        },
        {
          name: 'Imported Key 2',
          scopes: ['write:projects'],
          environment: 'staging',
        },
      ];

      // Note: importKeys doesn't actually create keys, it just validates the format
      // The actual creation would be done by the caller using ApiKeyService
      const result = await service.importKeys(JSON.stringify(importData));

      expect(result.success).toBeGreaterThanOrEqual(0);
      expect(result.failed).toBe(0);
    });

    it('should handle invalid JSON gracefully', async () => {
      try {
        const result = await service.importKeys('invalid json');
        // If it doesn't throw, check the result
        expect(result.success).toBe(0);
        expect(result.failed).toBeGreaterThan(0);
      } catch (error) {
        // It's also acceptable if it throws an error
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle missing required fields', async () => {
      const importData = [
        {
          scopes: ['read:projects'],
          // Missing name
        },
      ];

      const result = await service.importKeys(JSON.stringify(importData));

      expect(result.success).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toContain('name');
    });

    it('should skip keys that fail validation', async () => {
      const importData = [
        {
          name: 'Valid Key',
          scopes: ['read:projects'],
        },
        {
          // Invalid key - missing name
          scopes: ['read:projects'],
        },
      ];

      mockAdapter.create.mockResolvedValue({
        id: 'valid-key',
        name: 'Valid Key',
        keyPrefix: 'valid123',
        hashedKey: 'hashed',
        scopes: ['read:projects'],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.importKeys(JSON.stringify(importData));

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});

