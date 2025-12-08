import { Test, TestingModule } from '@nestjs/testing';
import { KeyTestingService } from '../../src/services/key-testing.service';
import { ApiKeyService } from '../../src/services/api-key.service';
import { ApiKey } from '../../src/interfaces';

describe('KeyTestingService', () => {
  let service: KeyTestingService;
  let mockApiKeyService: jest.Mocked<ApiKeyService>;

  beforeEach(async () => {
    mockApiKeyService = {
      validate: jest.fn(),
      updateLastUsed: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyTestingService,
        {
          provide: ApiKeyService,
          useValue: mockApiKeyService,
        },
      ],
    }).compile();

    service = module.get<KeyTestingService>(KeyTestingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('testKey', () => {
    it('should return invalid for missing key', async () => {
      mockApiKeyService.validate.mockResolvedValue(null);
      const result = await service.testKey('invalid-token');
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should return valid for active key', async () => {
      const key: ApiKey = {
        id: 'key-123',
        name: 'Test Key',
        keyPrefix: 'abc12345',
        hashedKey: 'hash',
        scopes: ['read'],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockApiKeyService.validate.mockResolvedValue(key);
      const result = await service.testKey('valid-token');
      expect(result.valid).toBe(true);
      expect(result.keyId).toBe('key-123');
    });

    it('should detect revoked key', async () => {
      const key: ApiKey = {
        id: 'key-123',
        name: 'Test Key',
        keyPrefix: 'abc12345',
        hashedKey: 'hash',
        scopes: [],
        expiresAt: null,
        revokedAt: new Date(),
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockApiKeyService.validate.mockResolvedValue(key);
      const result = await service.testKey('revoked-token');
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.includes('revoked'))).toBe(true);
    });
  });

  describe('testKeys', () => {
    it('should test multiple keys', async () => {
      mockApiKeyService.validate
        .mockResolvedValueOnce({
          id: 'key-1',
          name: 'Key 1',
          hashedKey: 'hash',
          scopes: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ApiKey)
        .mockResolvedValueOnce(null);

      const results = await service.testKeys(['token-1', 'token-2']);
      expect(results.size).toBe(2);
      expect(results.get('token-1')?.valid).toBe(true);
      expect(results.get('token-2')?.valid).toBe(false);
    });
  });
});

