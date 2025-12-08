import { Test, TestingModule } from '@nestjs/testing';
import { KeyHistoryService } from '../../src/services/key-history.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { API_KEY_ADAPTER } from '../../src/api-key.module';
import { ApiKey } from '../../src/interfaces';

describe('KeyHistoryService', () => {
  let service: KeyHistoryService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;

  beforeEach(async () => {
    mockAdapter = {
      create: jest.fn(),
      findByKeyPrefix: jest.fn(),
      findById: jest.fn(),
      revoke: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      updateLastUsed: jest.fn(),
      updateQuotaUsage: jest.fn(),
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: KeyHistoryService,
          useFactory: (adapter: IApiKeyAdapter) => {
            return new KeyHistoryService(adapter, {
              enabled: true,
              trackMetadataChanges: true,
              retentionDays: 365,
            });
          },
          inject: [API_KEY_ADAPTER],
        },
        {
          provide: API_KEY_ADAPTER,
          useValue: mockAdapter,
        },
      ],
    }).compile();

    service = module.get<KeyHistoryService>(KeyHistoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordHistory', () => {
    it('should record a history entry', async () => {
      const keyId = 'key-123';
      await service.recordHistory(keyId, 'created', undefined, 'user-1');
      const history = await service.getKeyHistory(keyId);
      expect(history.length).toBe(1);
      expect(history[0].action).toBe('created');
    });
  });

  describe('getKeyHistory', () => {
    it('should return history for a key', async () => {
      const keyId = 'key-123';
      await service.recordHistory(keyId, 'created');
      await service.recordHistory(keyId, 'updated');
      const history = await service.getKeyHistory(keyId);
      expect(history.length).toBe(2);
    });

    it('should respect limit', async () => {
      const keyId = 'key-123';
      for (let i = 0; i < 5; i++) {
        await service.recordHistory(keyId, 'updated');
      }
      const history = await service.getKeyHistory(keyId, 3);
      expect(history.length).toBe(3);
    });
  });

  describe('compareKeys', () => {
    it('should detect changes between keys', () => {
      const oldKey: Partial<ApiKey> = { name: 'Old Name', scopes: ['read'] };
      const newKey: Partial<ApiKey> = { name: 'New Name', scopes: ['read', 'write'] };
      const changes = service.compareKeys(oldKey, newKey);
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.some((c) => c.field === 'name')).toBe(true);
      expect(changes.some((c) => c.field === 'scopes')).toBe(true);
    });
  });

  describe('recordCreation', () => {
    it('should record key creation', async () => {
      const keyId = 'key-123';
      const key: ApiKey = {
        id: keyId,
        name: 'Test Key',
        keyPrefix: 'abc12345',
        hashedKey: 'hash',
        scopes: [],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await service.recordCreation(keyId, key, 'user-1');
      const history = await service.getKeyHistory(keyId);
      expect(history[0].action).toBe('created');
    });
  });

  describe('recordRevocation', () => {
    it('should record key revocation', async () => {
      const keyId = 'key-123';
      await service.recordRevocation(keyId, 'Security breach', 'admin');
      const history = await service.getKeyHistory(keyId);
      expect(history[0].action).toBe('revoked');
      expect(history[0].reason).toBe('Security breach');
    });
  });
});

