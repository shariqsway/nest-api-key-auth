import { Test, TestingModule } from '@nestjs/testing';
import { KeyCloningService } from '../../src/services/key-cloning.service';
import { ApiKeyService } from '../../src/services/api-key.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { API_KEY_ADAPTER } from '../../src/api-key.module';
import { ApiKey } from '../../src/interfaces';

describe('KeyCloningService', () => {
  let service: KeyCloningService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;
  let mockApiKeyService: jest.Mocked<ApiKeyService>;

  beforeEach(async () => {
    mockAdapter = {
      create: jest.fn(),
      findByKeyPrefix: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'key-123',
        name: 'Source Key',
        keyPrefix: 'abc12345',
        hashedKey: 'hash',
        scopes: ['read', 'write'],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        ipWhitelist: ['192.168.1.1'],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ApiKey),
      revoke: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      updateLastUsed: jest.fn(),
      updateQuotaUsage: jest.fn(),
      query: jest.fn(),
    };

    mockApiKeyService = {
      create: jest.fn().mockResolvedValue({
        id: 'key-456',
        name: 'Cloned Key',
        token: 'new-token',
        scopes: ['read', 'write'],
        createdAt: new Date(),
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyCloningService,
        {
          provide: API_KEY_ADAPTER,
          useValue: mockAdapter,
        },
        {
          provide: ApiKeyService,
          useValue: mockApiKeyService,
        },
      ],
    }).compile();

    service = module.get<KeyCloningService>(KeyCloningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cloneKey', () => {
    it('should clone a key with same properties', async () => {
      const cloned = await service.cloneKey('key-123', 'Cloned Key');
      expect(mockApiKeyService.create).toHaveBeenCalled();
      expect(cloned.name).toBe('Cloned Key');
    });

    it('should allow overriding properties', async () => {
      await service.cloneKey('key-123', 'Cloned Key', {
        scopes: ['read'],
      });
      expect(mockApiKeyService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: ['read'],
        }),
      );
    });
  });
});

