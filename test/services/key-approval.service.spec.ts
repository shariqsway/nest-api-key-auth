import { Test, TestingModule } from '@nestjs/testing';
import { KeyApprovalService } from '../../src/services/key-approval.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { ApiKeyNotFoundException } from '../../src/exceptions';
import { API_KEY_ADAPTER } from '../../src/api-key.module';
import { WEBHOOK_SERVICE_TOKEN } from '../../src/services/webhook.service';
import { WebhookService } from '../../src/services/webhook.service';
import { createMockApiKey } from '../helpers/api-key.helper';

describe('KeyApprovalService', () => {
  let service: KeyApprovalService;
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
        KeyApprovalService,
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

    service = module.get<KeyApprovalService>(KeyApprovalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('approve', () => {
    it('should approve a pending API key', async () => {
      const key = createMockApiKey({
        id: 'key-1',
        name: 'Test Key',
        state: 'pending',
      });

      mockAdapter.findById.mockResolvedValue(key);
      mockAdapter.approve.mockResolvedValue({ ...key, state: 'active', approvedAt: new Date() });

      const result = await service.approve('key-1');

      expect(result.state).toBe('active');
      expect(mockAdapter.approve).toHaveBeenCalledWith('key-1');
      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith('key.approved', expect.any(Object));
    });

    it('should throw error if key not found', async () => {
      mockAdapter.findById.mockResolvedValue(null);

      await expect(service.approve('key-1')).rejects.toThrow(ApiKeyNotFoundException);
    });

    it('should throw error if key is not pending', async () => {
      const key = createMockApiKey({
        id: 'key-1',
        name: 'Test Key',
        state: 'active',
      });

      mockAdapter.findById.mockResolvedValue(key);

      await expect(service.approve('key-1')).rejects.toThrow('not pending approval');
    });
  });

  describe('reject', () => {
    it('should reject a pending API key', async () => {
      const key = createMockApiKey({
        id: 'key-1',
        name: 'Test Key',
        state: 'pending',
      });

      mockAdapter.findById.mockResolvedValue(key);
      mockAdapter.revoke.mockResolvedValue({ ...key, state: 'revoked', revokedAt: new Date() });

      const result = await service.reject('key-1', 'Does not meet requirements');

      expect(result.state).toBe('revoked');
      expect(mockAdapter.revoke).toHaveBeenCalledWith('key-1', 'Does not meet requirements');
      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith('key.rejected', expect.any(Object));
    });
  });

  describe('getPendingKeys', () => {
    it('should return all pending keys', async () => {
      const pendingKeys = [
        createMockApiKey({
          id: 'key-1',
          name: 'Pending Key 1',
          state: 'pending',
        }),
      ];

      mockAdapter.query.mockResolvedValue(pendingKeys);

      const result = await service.getPendingKeys();

      expect(result).toEqual(pendingKeys);
      expect(mockAdapter.query).toHaveBeenCalledWith({ state: 'pending' });
    });
  });
});

