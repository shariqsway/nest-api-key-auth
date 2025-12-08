import { Test, TestingModule } from '@nestjs/testing';
import { KeyRestoreService } from '../../src/services/key-restore.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { ApiKeyNotFoundException } from '../../src/exceptions';
import { API_KEY_ADAPTER } from '../../src/api-key.module';
import { WEBHOOK_SERVICE_TOKEN } from '../../src/services/webhook.service';
import { WebhookService } from '../../src/services/webhook.service';
import { createMockApiKey } from '../helpers/api-key.helper';

describe('KeyRestoreService', () => {
  let service: KeyRestoreService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;
  let mockWebhookService: jest.Mocked<WebhookService>;

  beforeEach(async () => {
    mockAdapter = {
      create: jest.fn(),
      findByKeyPrefix: jest.fn(),
      findById: jest.fn(),
      revoke: jest.fn(),
      suspend: jest.fn(),
      unsuspend: jest.fn(),
      restore: jest.fn(),
      approve: jest.fn(),
      updateState: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      updateLastUsed: jest.fn(),
      updateQuotaUsage: jest.fn(),
      query: jest.fn(),
    };

    mockWebhookService = {
      sendWebhook: jest.fn().mockResolvedValue(undefined),
      registerWebhook: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyRestoreService,
        {
          provide: API_KEY_ADAPTER,
          useValue: mockAdapter,
        },
        {
          provide: WEBHOOK_SERVICE_TOKEN,
          useValue: mockWebhookService,
        },
      ],
    }).compile();

    service = module.get<KeyRestoreService>(KeyRestoreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('restore', () => {
    it('should restore a revoked API key', async () => {
      const key = createMockApiKey({
        id: 'key-1',
        name: 'Test Key',
        state: 'revoked',
        revokedAt: new Date(),
      });

      mockAdapter.findById.mockResolvedValue(key);
      mockAdapter.restore.mockResolvedValue({ ...key, state: 'active', revokedAt: null });

      const result = await service.restore('key-1');

      expect(result.state).toBe('active');
      expect(result.revokedAt).toBeNull();
      expect(mockAdapter.restore).toHaveBeenCalledWith('key-1');
      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith('key.restored', expect.any(Object));
    });

    it('should throw error if key not found', async () => {
      mockAdapter.findById.mockResolvedValue(null);

      await expect(service.restore('key-1')).rejects.toThrow(ApiKeyNotFoundException);
    });

    it('should throw error if key is not revoked', async () => {
      const key = createMockApiKey({
        id: 'key-1',
        name: 'Test Key',
        state: 'active',
      });

      mockAdapter.findById.mockResolvedValue(key);

      await expect(service.restore('key-1')).rejects.toThrow('not revoked');
    });
  });

  describe('getRevokedKeys', () => {
    it('should return all revoked keys', async () => {
      const revokedKeys = [
        createMockApiKey({
          id: 'key-1',
          name: 'Revoked Key 1',
          state: 'revoked',
          revokedAt: new Date(),
        }),
      ];

      mockAdapter.query.mockResolvedValue(revokedKeys);

      const result = await service.getRevokedKeys();

      expect(result).toEqual(revokedKeys);
      expect(mockAdapter.query).toHaveBeenCalledWith({ state: 'revoked' });
    });
  });
});

