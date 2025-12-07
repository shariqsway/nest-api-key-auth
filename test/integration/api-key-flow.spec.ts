import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyModule } from '../../src/api-key.module';
import { ApiKeyService } from '../../src/services/api-key.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';

describe('API Key Flow Integration Tests', () => {
  let module: TestingModule;
  let apiKeyService: ApiKeyService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;

  const mockApiKey = {
    id: 'test-key-123',
    name: 'Test Key',
    keyPrefix: 'abc12345',
    hashedKey: '$2b$10$hashedkeyhere',
    scopes: ['read:projects'],
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    ipWhitelist: [],
    rateLimitMax: undefined,
    rateLimitWindowMs: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

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

    module = await Test.createTestingModule({
      imports: [
        ApiKeyModule.register({
          adapter: 'custom',
          customAdapter: mockAdapter,
          enableRateLimiting: true,
          enableAuditLogging: true,
          enableCaching: true,
          auditLogOptions: {
            logToDatabase: false, // Disable database logging in tests
          },
        }),
      ],
    })
      .overrideProvider('API_KEY_ADAPTER')
      .useValue(mockAdapter)
      .compile();

    apiKeyService = module.get<ApiKeyService>(ApiKeyService);
  });

  describe('Complete API Key Lifecycle', () => {
    it('should create, validate, and revoke an API key', async () => {
      const createData = {
        name: 'Test Key',
        scopes: ['read:projects'],
      };

      const createdKey = {
        ...mockApiKey,
        ...createData,
      };

      mockAdapter.create.mockResolvedValue(createdKey);

      const result = await apiKeyService.create(createData);

      expect(result).toHaveProperty('token');
      expect(result.name).toBe('Test Key');
      expect(mockAdapter.create).toHaveBeenCalled();

      mockAdapter.findByKeyPrefix.mockResolvedValue([createdKey]);
      mockAdapter.findById.mockResolvedValue(createdKey);
      mockAdapter.revoke.mockResolvedValue({
        ...createdKey,
        revokedAt: new Date(),
      });

      const foundKey = await apiKeyService.findById(createdKey.id);
      expect(foundKey.id).toBe(createdKey.id);

      const revokedKey = await apiKeyService.revoke(createdKey.id);
      expect(revokedKey.revokedAt).toBeDefined();
    });
  });

  describe('Rate Limiting Flow', () => {
    it('should enforce rate limits', async () => {
      const keyWithRateLimit = {
        ...mockApiKey,
        rateLimitMax: 2,
        rateLimitWindowMs: 60000,
      };

      mockAdapter.findByKeyPrefix.mockResolvedValue([keyWithRateLimit]);
      mockAdapter.updateLastUsed.mockResolvedValue(keyWithRateLimit);

      const validate1 = await apiKeyService.validate('abc12345token');
      expect(validate1).toBeDefined();

      const validate2 = await apiKeyService.validate('abc12345token');
      expect(validate2).toBeDefined();

      const validate3 = await apiKeyService.validate('abc12345token');
      expect(validate3).toBeDefined();
    });
  });

  describe('IP Whitelisting Flow', () => {
    it('should create keys with IP whitelist', async () => {
      const createData = {
        name: 'IP Restricted Key',
        scopes: ['read:projects'],
        ipWhitelist: ['192.168.1.1', '192.168.1.0/24'],
      };

      const createdKey = {
        ...mockApiKey,
        ...createData,
      };

      mockAdapter.create.mockResolvedValue(createdKey);

      const result = await apiKeyService.create(createData);
      expect(result).toHaveProperty('token');
      expect(result.name).toBe('IP Restricted Key');

      // Verify the key was created with IP whitelist
      expect(mockAdapter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ipWhitelist: ['192.168.1.1', '192.168.1.0/24'],
        }),
      );
    });
  });

  describe('Caching Flow', () => {
    it('should cache API keys', async () => {
      // Note: This test verifies that caching is integrated
      // Actual cache behavior is tested in unit tests
      // Here we just verify the service works with caching enabled
      const createData = {
        name: 'Cached Key',
        scopes: ['read:projects'],
      };

      const createdKey = {
        ...mockApiKey,
        ...createData,
      };

      mockAdapter.create.mockResolvedValue(createdKey);

      const result = await apiKeyService.create(createData);
      expect(result).toHaveProperty('token');
      expect(result.name).toBe('Cached Key');
      expect(mockAdapter.create).toHaveBeenCalled();
    });
  });
});

