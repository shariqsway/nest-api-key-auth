import { Test, TestingModule } from '@nestjs/testing';
import { KeySuspensionService } from '../../src/services/key-suspension.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { ApiKeyNotFoundException } from '../../src/exceptions';
import { API_KEY_ADAPTER } from '../../src/api-key.module';
import { WEBHOOK_SERVICE_TOKEN } from '../../src/services/webhook.service';
import { WebhookService } from '../../src/services/webhook.service';
import { createMockApiKey } from '../helpers/api-key.helper';

describe('KeySuspensionService', () => {
  let service: KeySuspensionService;
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
        KeySuspensionService,
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

    service = module.get<KeySuspensionService>(KeySuspensionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('suspend', () => {
    it('should suspend an active API key', async () => {
      const key = createMockApiKey({
        id: 'key-1',
        name: 'Test Key',
        state: 'active',
      });

      mockAdapter.findById.mockResolvedValue(key);
      mockAdapter.suspend.mockResolvedValue({ ...key, state: 'suspended', suspendedAt: new Date() });

      const result = await service.suspend('key-1', 'Security investigation');

      expect(result.state).toBe('suspended');
      expect(mockAdapter.suspend).toHaveBeenCalledWith('key-1', 'Security investigation');
      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith('key.suspended', expect.any(Object));
    });

    it('should throw error if key not found', async () => {
      mockAdapter.findById.mockResolvedValue(null);

      await expect(service.suspend('key-1')).rejects.toThrow(ApiKeyNotFoundException);
    });

    it('should throw error if key already suspended', async () => {
      const key = createMockApiKey({
        id: 'key-1',
        name: 'Test Key',
        state: 'suspended',
        suspendedAt: new Date(),
      });

      mockAdapter.findById.mockResolvedValue(key);

      await expect(service.suspend('key-1')).rejects.toThrow('already suspended');
    });

    it('should throw error if key is revoked', async () => {
      const key = createMockApiKey({
        id: 'key-1',
        name: 'Test Key',
        state: 'revoked',
        revokedAt: new Date(),
      });

      mockAdapter.findById.mockResolvedValue(key);

      await expect(service.suspend('key-1')).rejects.toThrow('Cannot suspend a revoked');
    });
  });

  describe('unsuspend', () => {
    it('should unsuspend a suspended API key', async () => {
      const key = createMockApiKey({
        id: 'key-1',
        name: 'Test Key',
        state: 'suspended',
        suspendedAt: new Date(),
      });

      mockAdapter.findById.mockResolvedValue(key);
      mockAdapter.unsuspend.mockResolvedValue({ ...key, state: 'active', suspendedAt: null });

      const result = await service.unsuspend('key-1');

      expect(result.state).toBe('active');
      expect(mockAdapter.unsuspend).toHaveBeenCalledWith('key-1');
      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith('key.unsuspended', expect.any(Object));
    });

    it('should throw error if key not found', async () => {
      mockAdapter.findById.mockResolvedValue(null);

      await expect(service.unsuspend('key-1')).rejects.toThrow(ApiKeyNotFoundException);
    });

    it('should throw error if key is not suspended', async () => {
      const key = createMockApiKey({
        id: 'key-1',
        name: 'Test Key',
        state: 'active',
      });

      mockAdapter.findById.mockResolvedValue(key);

      await expect(service.unsuspend('key-1')).rejects.toThrow('not suspended');
    });
  });

  describe('getSuspendedKeys', () => {
    it('should return all suspended keys', async () => {
      const suspendedKeys = [
        createMockApiKey({
          id: 'key-1',
          name: 'Suspended Key 1',
          state: 'suspended',
          suspendedAt: new Date(),
        }),
      ];

      mockAdapter.query.mockResolvedValue(suspendedKeys);

      const result = await service.getSuspendedKeys();

      expect(result).toEqual(suspendedKeys);
      expect(mockAdapter.query).toHaveBeenCalledWith({ state: 'suspended' });
    });
  });
});

