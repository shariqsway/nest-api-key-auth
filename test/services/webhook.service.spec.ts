import { WebhookService, WebhookConfig } from '../../src/services/webhook.service';

// Mock fetch globally
global.fetch = jest.fn();

describe('WebhookService', () => {
  let service: WebhookService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    service = new WebhookService();
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    jest.clearAllMocks();
  });

  describe('registerWebhook', () => {
    it('should register a webhook', () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['key.created'],
      };

      service.registerWebhook(config);

      const webhooks = service.getWebhooks();
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].url).toBe('https://example.com/webhook');
    });

    it('should set default retry attempts and timeout', () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['key.created'],
      };

      service.registerWebhook(config);

      const webhooks = service.getWebhooks();
      expect(webhooks[0].retryAttempts).toBe(3);
      expect(webhooks[0].timeout).toBe(5000);
    });
  });

  describe('sendWebhook', () => {
    it('should send webhook for registered event', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['key.created'],
      };

      service.registerWebhook(config);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      await service.sendWebhook('key.created', {
        keyId: 'key-123',
        keyName: 'Test Key',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should not send webhook for unregistered event', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['key.created'],
      };

      service.registerWebhook(config);

      await service.sendWebhook('key.revoked', {
        keyId: 'key-123',
        keyName: 'Test Key',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should include webhook secret in headers', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        secret: 'my-secret',
        events: ['key.created'],
      };

      service.registerWebhook(config);

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      await service.sendWebhook('key.created', {
        keyId: 'key-123',
        keyName: 'Test Key',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Secret': 'my-secret',
          }),
        }),
      );
    });

    it('should retry on failure', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['key.created'],
        retryAttempts: 2,
      };

      service.registerWebhook(config);

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        } as Response);

      await service.sendWebhook('key.created', {
        keyId: 'key-123',
        keyName: 'Test Key',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['key.created'],
        retryAttempts: 2,
      };

      service.registerWebhook(config);

      mockFetch.mockRejectedValue(new Error('Network error'));

      await service.sendWebhook('key.created', {
        keyId: 'key-123',
        keyName: 'Test Key',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('unregisterWebhook', () => {
    it('should remove webhook by URL', () => {
      const config: WebhookConfig = {
        url: 'https://example.com/webhook',
        events: ['key.created'],
      };

      service.registerWebhook(config);
      expect(service.getWebhooks()).toHaveLength(1);

      service.unregisterWebhook('https://example.com/webhook');
      expect(service.getWebhooks()).toHaveLength(0);
    });

    it('should not throw when webhook not found', () => {
      expect(() => {
        service.unregisterWebhook('https://nonexistent.com/webhook');
      }).not.toThrow();
    });
  });
});

