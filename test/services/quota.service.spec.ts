import { Test, TestingModule } from '@nestjs/testing';
import { QuotaService, QuotaStatus } from '../../src/services/quota.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { ApiKey } from '../../src/interfaces';
import { API_KEY_ADAPTER, REDIS_CLIENT_KEY } from '../../src/api-key.module';
import { createMockApiKey } from '../helpers/api-key.helper';

describe('QuotaService', () => {
  let service: QuotaService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;
  let mockRedisClient: {
    get: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
    set: jest.Mock;
  };

  const mockApiKey: ApiKey = createMockApiKey({
    id: 'test-key-123',
    name: 'Test Key',
    keyPrefix: 'abc12345',
    scopes: ['read:projects'],
    quotaMax: 100,
    quotaPeriod: 'daily',
    quotaUsed: 50,
    quotaResetAt: new Date(Date.now() + 86400000),
  });

  beforeEach(async () => {
    mockAdapter = {
      create: jest.fn(),
      findByKeyPrefix: jest.fn(),
      findById: jest.fn(),
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
    };

    mockRedisClient = {
      get: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        {
          provide: API_KEY_ADAPTER,
          useValue: mockAdapter,
        },
        {
          provide: REDIS_CLIENT_KEY,
          useValue: mockRedisClient,
        },
      ],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
  });

  describe('checkQuota', () => {
    it('should allow request when no quota is set', async () => {
      const keyWithoutQuota: ApiKey = {
        ...mockApiKey,
        quotaMax: undefined,
        quotaPeriod: undefined,
      };

      const status = await service.checkQuota(keyWithoutQuota);

      expect(status.allowed).toBe(true);
      expect(status.limit).toBe(0);
      expect(status.remaining).toBe(Infinity);
    });

    it('should allow request when quota is not exceeded', async () => {
      // checkQuota uses apiKey.quotaUsed, not Redis directly
      const status = await service.checkQuota(mockApiKey);

      expect(status.allowed).toBe(true);
      expect(status.limit).toBe(100);
      expect(status.used).toBe(50); // Uses quotaUsed from mockApiKey
      expect(status.remaining).toBeGreaterThan(0);
    });

    it('should deny request when quota is exceeded', async () => {
      const exceededKey: ApiKey = {
        ...mockApiKey,
        quotaUsed: 100, // At limit
      };
      mockRedisClient.get.mockResolvedValue('100');

      const status = await service.checkQuota(exceededKey);

      expect(status.allowed).toBe(false);
      expect(status.limit).toBe(100);
      expect(status.used).toBe(100);
      expect(status.remaining).toBe(0);
    });

    it('should reset quota when resetAt is in the past', async () => {
      const expiredKey: ApiKey = {
        ...mockApiKey,
        quotaResetAt: new Date(Date.now() - 1000),
      };

      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.expire.mockResolvedValue(1);
      mockRedisClient.get.mockResolvedValue(null); // No Redis value yet

      const status = await service.checkQuota(expiredKey);

      expect(status.allowed).toBe(true);
      expect(status.used).toBe(0); // Reset to 0
      expect(mockRedisClient.set).toHaveBeenCalled(); // resetQuota is called
    });

    it('should work without Redis client (database-only)', async () => {
      const moduleWithoutRedis: TestingModule = await Test.createTestingModule({
        providers: [
          QuotaService,
          {
            provide: API_KEY_ADAPTER,
            useValue: mockAdapter,
          },
        ],
      }).compile();

      const serviceWithoutRedis = moduleWithoutRedis.get<QuotaService>(QuotaService);

      const status = await serviceWithoutRedis.checkQuota(mockApiKey);

      expect(status.allowed).toBe(true);
      expect(status.limit).toBe(100);
      expect(status.used).toBe(50);
    });
  });

  describe('incrementUsage', () => {
    it('should increment quota usage with Redis', async () => {
      mockRedisClient.get.mockResolvedValue('50');

      await service.incrementUsage('test-key-123', 100, 'daily');

      expect(mockRedisClient.get).toHaveBeenCalled();
      expect(mockRedisClient.incr).toHaveBeenCalled();
      expect(mockRedisClient.expire).toHaveBeenCalled();
    });

    it('should increment quota usage without Redis (in-memory)', async () => {
      const moduleWithoutRedis: TestingModule = await Test.createTestingModule({
        providers: [
          QuotaService,
          {
            provide: API_KEY_ADAPTER,
            useValue: mockAdapter,
          },
        ],
      }).compile();

      const serviceWithoutRedis = moduleWithoutRedis.get<QuotaService>(QuotaService);

      mockAdapter.findById.mockResolvedValue(mockApiKey);

      await serviceWithoutRedis.incrementUsage('test-key-123', 100, 'daily');

      // incrementUsage calls findById to check if quota needs reset
      expect(mockAdapter.findById).toHaveBeenCalledWith('test-key-123');
    });

    it('should reset quota when period expires', async () => {
      const expiredKey: ApiKey = {
        ...mockApiKey,
        quotaResetAt: new Date(Date.now() - 1000),
      };

      const moduleWithoutRedis: TestingModule = await Test.createTestingModule({
        providers: [
          QuotaService,
          {
            provide: API_KEY_ADAPTER,
            useValue: mockAdapter,
          },
        ],
      }).compile();

      const serviceWithoutRedis = moduleWithoutRedis.get<QuotaService>(QuotaService);

      mockAdapter.findById.mockResolvedValue(expiredKey);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.expire.mockResolvedValue(1);

      await serviceWithoutRedis.incrementUsage('test-key-123', 100, 'daily');

      // Should call findById to check quota status
      expect(mockAdapter.findById).toHaveBeenCalledWith('test-key-123');
    });
  });
});

