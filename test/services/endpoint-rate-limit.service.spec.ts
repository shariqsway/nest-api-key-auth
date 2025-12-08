import { Test, TestingModule } from '@nestjs/testing';
import { EndpointRateLimitService } from '../../src/services/endpoint-rate-limit.service';
import { REDIS_CLIENT_KEY } from '../../src/api-key.module';
import { RedisClient } from '../../src/types/redis.types';

describe('EndpointRateLimitService', () => {
  let service: EndpointRateLimitService;
  let mockRedisClient: jest.Mocked<RedisClient>;

  beforeEach(async () => {
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      mget: jest.fn(),
      incr: jest.fn(),
      pipeline: jest.fn(),
      zremrangebyscore: jest.fn(),
      zcard: jest.fn(),
      zadd: jest.fn(),
      expire: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EndpointRateLimitService,
        {
          provide: REDIS_CLIENT_KEY,
          useValue: mockRedisClient,
        },
      ],
    }).compile();

    service = module.get<EndpointRateLimitService>(EndpointRateLimitService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerEndpointLimit', () => {
    it('should register an endpoint limit', () => {
      service.registerEndpointLimit({
        path: '/test',
        method: 'GET',
        maxRequests: 100,
        windowMs: 60000,
      });
      const limits = service.getEndpointLimits();
      expect(limits.length).toBe(1);
    });
  });

  describe('checkEndpointLimit', () => {
    it('should return null if no limit is set', async () => {
      const result = await service.checkEndpointLimit('key-123', '/test', 'GET');
      expect(result).toBeNull();
    });

    it('should check in-memory limit when Redis is not available', async () => {
      // Create service without Redis
      const serviceWithoutRedis = new EndpointRateLimitService(undefined);
      serviceWithoutRedis.registerEndpointLimit({
        path: '/test',
        maxRequests: 2,
        windowMs: 60000,
      });

      const result1 = await serviceWithoutRedis.checkEndpointLimit('key-123', '/test');
      expect(result1?.allowed).toBe(true);
      expect(result1?.remaining).toBe(1);

      const result2 = await serviceWithoutRedis.checkEndpointLimit('key-123', '/test');
      expect(result2?.allowed).toBe(true);
      expect(result2?.remaining).toBe(0);

      const result3 = await serviceWithoutRedis.checkEndpointLimit('key-123', '/test');
      expect(result3?.allowed).toBe(false);
      expect(result3?.remaining).toBe(0);
    });

    it('should check Redis limit when available', async () => {
      mockRedisClient.get.mockResolvedValue('1');
      mockRedisClient.incr.mockResolvedValue(2);
      mockRedisClient.expire.mockResolvedValue(1);

      service.registerEndpointLimit({
        path: '/test',
        maxRequests: 100,
        windowMs: 60000,
      });

      const result = await service.checkEndpointLimit('key-123', '/test');
      expect(result).not.toBeNull();
      expect(mockRedisClient.get).toHaveBeenCalled();
    });
  });

  describe('removeEndpointLimit', () => {
    it('should remove an endpoint limit', () => {
      service.registerEndpointLimit({
        path: '/test',
        maxRequests: 100,
        windowMs: 60000,
      });
      service.removeEndpointLimit('/test');
      const limits = service.getEndpointLimits();
      expect(limits.length).toBe(0);
    });
  });
});

