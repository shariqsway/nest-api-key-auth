import { RedisRateLimitService } from '../../src/services/redis-rate-limit.service';
import { RedisClient } from '../../src/types/redis.types';

describe('RedisRateLimitService', () => {
  let service: RedisRateLimitService;
  let mockRedisClient: jest.Mocked<RedisClient>;

  beforeEach(() => {
    mockRedisClient = {
      pipeline: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      mget: jest.fn(),
      zremrangebyscore: jest.fn(),
      zcard: jest.fn(),
      zadd: jest.fn(),
      expire: jest.fn(),
    } as unknown as jest.Mocked<RedisClient>;

    service = new RedisRateLimitService(mockRedisClient);
  });

  describe('checkRateLimit with Redis', () => {
    it('should allow request when under limit', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0],
          [null, 5],
          [null, 1],
          [null, 1],
        ]),
      };

      mockRedisClient.pipeline = jest.fn().mockReturnValue(mockPipeline);

      const result = await service.checkRateLimit('key-123', 100, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should reject request when over limit', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 0],
          [null, 100], // Current count is already at limit
          [null, 1],
          [null, 1],
        ]),
      };

      mockRedisClient.pipeline = jest.fn().mockReturnValue(mockPipeline);

      const result = await service.checkRateLimit('key-123', 100, 60000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should fallback to in-memory on Redis error', async () => {
      const mockPipeline = {
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Redis error')),
      };

      mockRedisClient.pipeline = jest.fn().mockReturnValue(mockPipeline);

      const result = await service.checkRateLimit('key-123', 100, 60000);

      expect(result.allowed).toBe(true);
    });
  });

  describe('checkRateLimit without Redis', () => {
    beforeEach(() => {
      service = new RedisRateLimitService(undefined);
    });

    it('should use in-memory rate limiting', async () => {
      const result1 = await service.checkRateLimit('key-123', 2, 60000);
      expect(result1.allowed).toBe(true);

      const result2 = await service.checkRateLimit('key-123', 2, 60000);
      expect(result2.allowed).toBe(true);

      const result3 = await service.checkRateLimit('key-123', 2, 60000);
      expect(result3.allowed).toBe(false);
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit in Redis', async () => {
      mockRedisClient.del = jest.fn().mockResolvedValue(1);

      await service.resetRateLimit('key-123');

      expect(mockRedisClient.del).toHaveBeenCalledWith('ratelimit:key-123');
    });

    it('should reset rate limit in memory when Redis not available', async () => {
      service = new RedisRateLimitService(undefined);

      await service.checkRateLimit('key-123', 2, 60000);
      await service.resetRateLimit('key-123');

      const result = await service.checkRateLimit('key-123', 2, 60000);
      expect(result.allowed).toBe(true);
    });
  });
});

