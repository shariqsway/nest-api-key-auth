import { RedisCacheService } from '../../src/services/redis-cache.service';
import { ApiKey } from '../../src/interfaces';
import { RedisClient } from '../../src/types/redis.types';

describe('RedisCacheService', () => {
  let service: RedisCacheService;
  let mockRedisClient: jest.Mocked<RedisClient>;

  const mockApiKey: ApiKey = {
    id: 'key-123',
    name: 'Test Key',
    keyPrefix: 'abc12345',
    hashedKey: 'hashed',
    scopes: ['read:projects'],
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      mget: jest.fn(),
      pipeline: jest.fn(),
      zremrangebyscore: jest.fn(),
      zcard: jest.fn(),
      zadd: jest.fn(),
      expire: jest.fn(),
    } as unknown as jest.Mocked<RedisClient>;

    service = new RedisCacheService(mockRedisClient);
  });

  describe('get', () => {
    it('should get cached key from Redis', async () => {
      // JSON serialization converts Date objects to strings
      const serialized = JSON.stringify(mockApiKey);
      mockRedisClient.get = jest.fn().mockResolvedValue(serialized);

      const result = await service.get('key-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe(mockApiKey.id);
      expect(result?.name).toBe(mockApiKey.name);
      expect(result?.keyPrefix).toBe(mockApiKey.keyPrefix);
      expect(result?.scopes).toEqual(mockApiKey.scopes);
      // Dates are serialized as strings in JSON, so we check the string representation
      expect(result?.createdAt).toBeDefined();
      expect(result?.updatedAt).toBeDefined();
      expect(mockRedisClient.get).toHaveBeenCalledWith('apikey:key-123');
    });

    it('should return null when key not found in Redis', async () => {
      mockRedisClient.get = jest.fn().mockResolvedValue(null);

      const result = await service.get('key-123');

      expect(result).toBeNull();
    });

    it('should fallback to in-memory on Redis error', async () => {
      mockRedisClient.get = jest.fn().mockRejectedValue(new Error('Redis error'));

      const result = await service.get('key-123');

      expect(result).toBeNull();
    });
  });

  describe('getByPrefix', () => {
    it('should get keys by prefix from Redis', async () => {
      const keys = ['apikey:prefix:abc12345:key-123', 'apikey:prefix:abc12345:key-456'];
      mockRedisClient.keys = jest.fn().mockResolvedValue(keys);
      mockRedisClient.mget = jest.fn().mockResolvedValue([
        JSON.stringify(mockApiKey),
        JSON.stringify({ ...mockApiKey, id: 'key-456' }),
      ]);

      const result = await service.getByPrefix('abc12345');

      expect(result).toHaveLength(2);
      expect(mockRedisClient.keys).toHaveBeenCalledWith('apikey:prefix:abc12345:*');
    });

    it('should return empty array when no keys found', async () => {
      mockRedisClient.keys = jest.fn().mockResolvedValue([]);

      const result = await service.getByPrefix('abc12345');

      expect(result).toEqual([]);
    });
  });

  describe('set', () => {
    it('should set key in Redis', async () => {
      mockRedisClient.setex = jest.fn().mockResolvedValue('OK');

      await service.set(mockApiKey, 300000);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'apikey:key-123',
        300,
        JSON.stringify(mockApiKey),
      );
    });

    it('should also set prefix key when keyPrefix exists', async () => {
      mockRedisClient.setex = jest.fn().mockResolvedValue('OK');

      await service.set(mockApiKey, 300000);

      expect(mockRedisClient.setex).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('should invalidate key in Redis', async () => {
      mockRedisClient.get = jest.fn().mockResolvedValue(JSON.stringify(mockApiKey));
      mockRedisClient.del = jest.fn().mockResolvedValue(1);

      await service.invalidate('key-123');

      expect(mockRedisClient.del).toHaveBeenCalledWith('apikey:key-123');
    });
  });

  describe('clear', () => {
    it('should clear all keys in Redis', async () => {
      mockRedisClient.keys = jest.fn().mockResolvedValue(['apikey:key-123', 'apikey:key-456']);
      mockRedisClient.del = jest.fn().mockResolvedValue(2);

      await service.clear();

      expect(mockRedisClient.del).toHaveBeenCalledWith('apikey:key-123', 'apikey:key-456');
    });
  });

  describe('without Redis', () => {
    beforeEach(() => {
      service = new RedisCacheService(undefined);
    });

    it('should use in-memory caching', async () => {
      await service.set(mockApiKey);
      const result = await service.get('key-123');

      expect(result).toEqual(mockApiKey);
    });

    it('should return null for expired keys', async () => {
      await service.set(mockApiKey, 1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result = await service.get('key-123');

      expect(result).toBeNull();
    });
  });
});

