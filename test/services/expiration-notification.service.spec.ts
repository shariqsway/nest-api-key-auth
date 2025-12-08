import { ExpirationNotificationService } from '../../src/services/expiration-notification.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { WebhookService } from '../../src/services/webhook.service';
import { ApiKey } from '../../src/interfaces';
import { createMockApiKey } from '../helpers/api-key.helper';

describe('ExpirationNotificationService', () => {
  let service: ExpirationNotificationService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;
  let mockWebhookService: jest.Mocked<WebhookService>;

  const createMockKey = (id: string, expiresAt: Date | null): ApiKey =>
    createMockApiKey({
      id,
      name: `Key ${id}`,
      keyPrefix: 'abc',
      expiresAt,
    });

  beforeEach(() => {
    mockAdapter = {
      create: jest.fn(),
      findById: jest.fn(),
      findByKeyPrefix: jest.fn(),
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
    } as unknown as jest.Mocked<IApiKeyAdapter>;

    mockWebhookService = {
      registerWebhook: jest.fn(),
      sendWebhook: jest.fn(),
      unregisterWebhook: jest.fn(),
      getWebhooks: jest.fn(),
    } as unknown as jest.Mocked<WebhookService>;

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (service) {
      service.stopMonitoring();
    }
  });

  describe('startMonitoring', () => {
    it('should start monitoring interval', () => {
      service = new ExpirationNotificationService(mockAdapter, mockWebhookService);
      service.startMonitoring();

      expect(service['checkInterval']).not.toBeNull();
    });

    it('should not start multiple intervals', () => {
      service = new ExpirationNotificationService(mockAdapter, mockWebhookService);
      service.startMonitoring();
      const interval1 = service['checkInterval'];
      service.startMonitoring();
      const interval2 = service['checkInterval'];

      expect(interval1).toBe(interval2);
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring interval', () => {
      service = new ExpirationNotificationService(mockAdapter, mockWebhookService);
      service.startMonitoring();
      service.stopMonitoring();

      expect(service['checkInterval']).toBeNull();
    });
  });

  describe('checkExpiringKeys', () => {
    it('should notify for expired keys', async () => {
      const expiredKey = createMockKey('key-1', new Date(Date.now() - 1000));
      mockAdapter.findAllActive = jest.fn().mockResolvedValue([expiredKey]);
      mockWebhookService.sendWebhook = jest.fn().mockResolvedValue(undefined);

      service = new ExpirationNotificationService(mockAdapter, mockWebhookService, {
        enableWebhooks: true,
      });

      await service.checkExpiringKeys();

      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith(
        'key.expired',
        expect.objectContaining({
          keyId: 'key-1',
        }),
      );
    });

    it('should notify for keys expiring soon', async () => {
      const expiringKey = createMockKey('key-1', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      mockAdapter.findAllActive = jest.fn().mockResolvedValue([expiringKey]);
      mockWebhookService.sendWebhook = jest.fn().mockResolvedValue(undefined);

      service = new ExpirationNotificationService(mockAdapter, mockWebhookService, {
        enableWebhooks: true,
        warningDaysBeforeExpiration: [30, 7, 1],
      });

      await service.checkExpiringKeys();

      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith(
        'key.expiring',
        expect.objectContaining({
          keyId: 'key-1',
          daysUntilExpiration: 7,
        }),
      );
    });

    it('should not notify for keys not expiring soon', async () => {
      const futureKey = createMockKey('key-1', new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));
      mockAdapter.findAllActive = jest.fn().mockResolvedValue([futureKey]);

      service = new ExpirationNotificationService(mockAdapter, mockWebhookService, {
        enableWebhooks: true,
        warningDaysBeforeExpiration: [30, 7, 1],
      });

      await service.checkExpiringKeys();

      expect(mockWebhookService.sendWebhook).not.toHaveBeenCalled();
    });

    it('should skip keys without expiration', async () => {
      const noExpirationKey = createMockKey('key-1', null);
      mockAdapter.findAllActive = jest.fn().mockResolvedValue([noExpirationKey]);

      service = new ExpirationNotificationService(mockAdapter, mockWebhookService);

      await service.checkExpiringKeys();

      expect(mockWebhookService.sendWebhook).not.toHaveBeenCalled();
    });
  });

  describe('getKeysExpiringSoon', () => {
    it('should return keys expiring within specified days', async () => {
      const now = new Date();
      const keys: ApiKey[] = [
        createMockKey('key-1', new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)),
        createMockKey('key-2', new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)),
        createMockKey('key-3', new Date(now.getTime() - 1000)),
      ];

      mockAdapter.findAllActive = jest.fn().mockResolvedValue(keys);

      service = new ExpirationNotificationService(mockAdapter);

      const result = await service.getKeysExpiringSoon(10);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('key-1');
    });

    it('should not return expired keys', async () => {
      const now = new Date();
      const keys: ApiKey[] = [
        createMockKey('key-1', new Date(now.getTime() - 1000)),
        createMockKey('key-2', new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)),
      ];

      mockAdapter.findAllActive = jest.fn().mockResolvedValue(keys);

      service = new ExpirationNotificationService(mockAdapter);

      const result = await service.getKeysExpiringSoon(10);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('key-2');
    });
  });
});

