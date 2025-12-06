import { AnalyticsService } from '../../src/services/analytics.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { ApiKey } from '../../src/interfaces';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;

  const mockApiKey: ApiKey = {
    id: 'key-123',
    name: 'Test Key',
    keyPrefix: 'abc12345',
    hashedKey: 'hashed',
    scopes: ['read:projects'],
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockAdapter = {
      create: jest.fn(),
      findById: jest.fn(),
      findByKeyPrefix: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      revoke: jest.fn(),
      updateLastUsed: jest.fn(),
    } as unknown as jest.Mocked<IApiKeyAdapter>;

    service = new AnalyticsService(mockAdapter);
  });

  describe('recordSuccess', () => {
    it('should record successful request', () => {
      service.recordSuccess('key-123', 100);

      const metrics = service['usageMetrics'].get('key-123');
      expect(metrics).toBeDefined();
      expect(metrics?.successCount).toBe(1);
      expect(metrics?.requestCount).toBe(1);
      expect(metrics?.failureCount).toBe(0);
    });

    it('should track response time', () => {
      service.recordSuccess('key-123', 150);
      service.recordSuccess('key-123', 200);

      const metrics = service['usageMetrics'].get('key-123');
      expect(metrics?.responseTimes).toHaveLength(2);
      expect(metrics?.responseTimes).toContain(150);
      expect(metrics?.responseTimes).toContain(200);
    });

    it('should limit response times to 100 entries', () => {
      for (let i = 0; i < 150; i++) {
        service.recordSuccess('key-123', i);
      }

      const metrics = service['usageMetrics'].get('key-123');
      expect(metrics?.responseTimes).toHaveLength(100);
    });
  });

  describe('recordFailure', () => {
    it('should record failed request', () => {
      service.recordFailure('key-123', 50);

      const metrics = service['usageMetrics'].get('key-123');
      expect(metrics).toBeDefined();
      expect(metrics?.failureCount).toBe(1);
      expect(metrics?.requestCount).toBe(1);
      expect(metrics?.successCount).toBe(0);
    });

    it('should not record failure without keyId', () => {
      service.recordFailure();

      expect(service['usageMetrics'].size).toBe(0);
    });
  });

  describe('getKeyMetrics', () => {
    it('should return metrics for a key', async () => {
      service.recordSuccess('key-123', 100);
      service.recordSuccess('key-123', 200);
      service.recordFailure('key-123');

      mockAdapter.findById = jest.fn().mockResolvedValue(mockApiKey);

      const metrics = await service.getKeyMetrics('key-123');

      expect(metrics).toBeDefined();
      expect(metrics?.keyId).toBe('key-123');
      expect(metrics?.requestCount).toBe(3);
      expect(metrics?.successCount).toBe(2);
      expect(metrics?.failureCount).toBe(1);
      expect(metrics?.averageResponseTime).toBe(150);
    });

    it('should return null when key not found', async () => {
      mockAdapter.findById = jest.fn().mockResolvedValue(null);

      const metrics = await service.getKeyMetrics('key-123');

      expect(metrics).toBeNull();
    });

    it('should return null when no metrics exist', async () => {
      mockAdapter.findById = jest.fn().mockResolvedValue(mockApiKey);

      const metrics = await service.getKeyMetrics('key-123');

      expect(metrics).toBeNull();
    });
  });

  describe('getAnalytics', () => {
    it('should return overall analytics', async () => {
      const allKeys: ApiKey[] = [
        mockApiKey,
        { ...mockApiKey, id: 'key-456', revokedAt: new Date() },
        { ...mockApiKey, id: 'key-789', expiresAt: new Date('2025-12-31') },
      ];

      mockAdapter.findAll = jest.fn().mockResolvedValue(allKeys);

      service.recordSuccess('key-123', 100);
      service.recordSuccess('key-123', 200);
      service.recordFailure('key-123');
      service.recordSuccess('key-789', 150);

      const analytics = await service.getAnalytics();

      expect(analytics.totalRequests).toBe(4);
      expect(analytics.totalKeys).toBe(3);
      expect(analytics.activeKeys).toBe(2);
      expect(analytics.errorRate).toBe(25);
      expect(analytics.topKeys).toHaveLength(2);
    });
  });

  describe('resetMetrics', () => {
    it('should reset metrics for a key', () => {
      service.recordSuccess('key-123');
      service.resetMetrics('key-123');

      expect(service['usageMetrics'].has('key-123')).toBe(false);
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      service.recordSuccess('key-123');
      service.recordSuccess('key-456');
      service.clearMetrics();

      expect(service['usageMetrics'].size).toBe(0);
    });
  });
});

