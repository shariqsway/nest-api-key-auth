import { Test, TestingModule } from '@nestjs/testing';
import { KeyLifecycleService } from '../../src/services/key-lifecycle.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { API_KEY_ADAPTER } from '../../src/api-key.module';
import { WEBHOOK_SERVICE_TOKEN } from '../../src/services/webhook.service';
import { WebhookService } from '../../src/services/webhook.service';
import { createMockApiKey } from '../helpers/api-key.helper';

describe('KeyLifecycleService', () => {
  let service: KeyLifecycleService;
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
        KeyLifecycleService,
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

    service = module.get<KeyLifecycleService>(KeyLifecycleService);
  });

  afterEach(() => {
    service.stopMonitoring();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerPolicy', () => {
    it('should register a lifecycle policy', () => {
      const policy = {
        id: 'test-policy',
        name: 'Test Policy',
        enabled: true,
        autoArchiveExpiredAfterDays: 30,
      };

      service.registerPolicy(policy);
      const policies = service.getPolicies();

      expect(policies).toHaveLength(1);
      expect(policies[0]).toEqual(policy);
    });
  });

  describe('removePolicy', () => {
    it('should remove a lifecycle policy', () => {
      const policy = {
        id: 'test-policy',
        name: 'Test Policy',
        enabled: true,
      };

      service.registerPolicy(policy);
      service.removePolicy('test-policy');

      const policies = service.getPolicies();
      expect(policies).toHaveLength(0);
    });
  });

  describe('processLifecyclePolicies', () => {
    it('should process enabled policies', async () => {
      const expiredKey = createMockApiKey({
        id: 'expired-key',
        state: 'expired',
        expiresAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
      });

      mockAdapter.findAll.mockResolvedValue([expiredKey]);

      service.registerPolicy({
        id: 'archive-expired',
        name: 'Archive Expired',
        enabled: true,
        autoArchiveExpiredAfterDays: 30,
      });

      await service.processLifecyclePolicies();

      expect(mockAdapter.findAll).toHaveBeenCalled();
    });

    it('should not process disabled policies', async () => {
      service.registerPolicy({
        id: 'disabled-policy',
        name: 'Disabled Policy',
        enabled: false,
        autoArchiveExpiredAfterDays: 30,
      });

      await service.processLifecyclePolicies();

      expect(mockAdapter.findAll).not.toHaveBeenCalled();
    });
  });

  describe('triggerLifecycleCheck', () => {
    it('should manually trigger lifecycle processing', async () => {
      const expiredKey = createMockApiKey({
        id: 'expired-key',
        state: 'expired',
        expiresAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
      });

      mockAdapter.findAll.mockResolvedValue([expiredKey]);

      service.registerPolicy({
        id: 'test-policy',
        name: 'Test Policy',
        enabled: true,
        autoArchiveExpiredAfterDays: 30,
      });

      await service.triggerLifecycleCheck();

      expect(mockAdapter.findAll).toHaveBeenCalled();
    });
  });
});

