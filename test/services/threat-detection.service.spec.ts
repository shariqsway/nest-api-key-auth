import { Test, TestingModule } from '@nestjs/testing';
import { ThreatDetectionService } from '../../src/services/threat-detection.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { AuditLogService } from '../../src/services/audit-log.service';
import { WebhookService } from '../../src/services/webhook.service';
import { API_KEY_ADAPTER } from '../../src/api-key.module';
import { AUDIT_LOG_SERVICE_TOKEN } from '../../src/services/audit-log.service';
import { WEBHOOK_SERVICE_TOKEN } from '../../src/services/webhook.service';

describe('ThreatDetectionService', () => {
  let service: ThreatDetectionService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;
  let mockAuditLogService: jest.Mocked<AuditLogService>;
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

    mockAuditLogService = {
      logFailure: jest.fn().mockResolvedValue(undefined),
      logSuccess: jest.fn().mockResolvedValue(undefined),
      log: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockWebhookService = {
      sendWebhook: jest.fn().mockResolvedValue(undefined),
      registerWebhook: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ThreatDetectionService,
          useFactory: (
            adapter: IApiKeyAdapter,
            auditLogService?: AuditLogService,
            webhookService?: WebhookService,
          ) => {
            return new ThreatDetectionService(adapter, auditLogService, webhookService, undefined);
          },
          inject: [API_KEY_ADAPTER, AUDIT_LOG_SERVICE_TOKEN, WEBHOOK_SERVICE_TOKEN],
        },
        {
          provide: API_KEY_ADAPTER,
          useValue: mockAdapter,
        },
        {
          provide: AUDIT_LOG_SERVICE_TOKEN,
          useValue: mockAuditLogService,
        },
        {
          provide: WEBHOOK_SERVICE_TOKEN,
          useValue: mockWebhookService,
        },
      ],
    }).compile();

    service = module.get<ThreatDetectionService>(ThreatDetectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordFailedAttempt', () => {
    it('should record a failed attempt', async () => {
      await service.recordFailedAttempt('192.168.1.1');
      const stats = await service.getThreatStats('192.168.1.1');
      expect(stats.failedAttempts).toBe(1);
    });

    it('should detect brute force after threshold', async () => {
      const ipAddress = '192.168.1.1';
      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(ipAddress);
      }
      const stats = await service.getThreatStats(ipAddress);
      expect(stats.isBlocked).toBe(true);
    });
  });

  describe('recordSuccessfulRequest', () => {
    it('should reset failed attempts on success', async () => {
      const keyId = 'key-123';
      await service.recordFailedAttempt('192.168.1.1', keyId);
      await service.recordSuccessfulRequest(keyId, '192.168.1.1', '/test');
      const stats = await service.getThreatStats(keyId);
      expect(stats.failedAttempts).toBe(0);
    });
  });

  describe('getThreatStats', () => {
    it('should return threat statistics', async () => {
      await service.recordFailedAttempt('192.168.1.1');
      const stats = await service.getThreatStats('192.168.1.1');
      expect(stats).toHaveProperty('failedAttempts');
      expect(stats).toHaveProperty('isBlocked');
      expect(stats).toHaveProperty('lastAttempt');
    });
  });

  describe('clearThreatData', () => {
    it('should clear threat data', async () => {
      await service.recordFailedAttempt('192.168.1.1');
      service.clearThreatData('192.168.1.1');
      const stats = await service.getThreatStats('192.168.1.1');
      expect(stats.failedAttempts).toBe(0);
    });
  });
});
