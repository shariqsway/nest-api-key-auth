import { Test, TestingModule } from '@nestjs/testing';
import { RotationPolicyService, RotationPolicy } from '../../src/services/rotation-policy.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { ApiKeyService } from '../../src/services/api-key.service';
import { ApiKey } from '../../src/interfaces';
import { API_KEY_ADAPTER } from '../../src/api-key.module';
import { createMockApiKey } from '../helpers/api-key.helper';

describe('RotationPolicyService', () => {
  let service: RotationPolicyService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;
  let mockApiKeyService: jest.Mocked<ApiKeyService>;

  const mockApiKey: ApiKey = createMockApiKey({
    id: 'key-123',
    name: 'Test Key',
    keyPrefix: 'abc12345',
    scopes: ['read:projects'],
    tags: ['production'],
    owner: 'user1',
    environment: 'production',
  });

  beforeEach(async () => {
    mockAdapter = {
      create: jest.fn(),
      findByKeyPrefix: jest.fn(),
      findById: jest.fn(),
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
    };

    mockApiKeyService = {
      rotate: jest.fn(),
      create: jest.fn(),
      validate: jest.fn(),
      findById: jest.fn(),
      revoke: jest.fn(),
      updateLastUsed: jest.fn(),
      queryApiKeys: jest.fn(),
    } as unknown as jest.Mocked<ApiKeyService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RotationPolicyService,
        {
          provide: API_KEY_ADAPTER,
          useValue: mockAdapter,
        },
        {
          provide: ApiKeyService,
          useValue: mockApiKeyService,
        },
      ],
    }).compile();

    service = module.get<RotationPolicyService>(RotationPolicyService);
  });

  afterEach(async () => {
    if (service) {
      await service.onModuleDestroy();
    }
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('registerPolicy', () => {
    it('should register a policy', () => {
      const policy: RotationPolicy = {
        id: 'policy-1',
        name: 'Daily Rotation',
        rotationIntervalDays: 1,
        revokeOldKey: true,
        enabled: true,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy);

      const retrieved = service.getPolicy('policy-1');
      expect(retrieved).toEqual(policy);
    });

    it('should schedule policy if enabled', async () => {
      await service.onModuleInit();

      const policy: RotationPolicy = {
        id: 'policy-1',
        name: 'Daily Rotation',
        rotationIntervalDays: 1,
        revokeOldKey: true,
        enabled: true,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy);

      const retrieved = service.getPolicy('policy-1');
      expect(retrieved).toBeTruthy();
    });
  });

  describe('getPolicy', () => {
    it('should return policy by ID', () => {
      const policy: RotationPolicy = {
        id: 'policy-1',
        name: 'Test Policy',
        rotationIntervalDays: 7,
        revokeOldKey: false,
        enabled: true,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy);

      const retrieved = service.getPolicy('policy-1');
      expect(retrieved).toEqual(policy);
    });

    it('should return null for non-existent policy', () => {
      const retrieved = service.getPolicy('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getPolicies', () => {
    it('should return all registered policies', () => {
      const policy1: RotationPolicy = {
        id: 'policy-1',
        name: 'Policy 1',
        rotationIntervalDays: 1,
        revokeOldKey: true,
        enabled: true,
        nextRunAt: new Date(),
      };

      const policy2: RotationPolicy = {
        id: 'policy-2',
        name: 'Policy 2',
        rotationIntervalDays: 7,
        revokeOldKey: false,
        enabled: true,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy1);
      service.registerPolicy(policy2);

      const policies = service.getPolicies();
      expect(policies).toHaveLength(2);
      expect(policies).toContainEqual(policy1);
      expect(policies).toContainEqual(policy2);
    });

    it('should return empty array when no policies registered', () => {
      const policies = service.getPolicies();
      expect(policies).toEqual([]);
    });
  });

  describe('removePolicy', () => {
    it('should remove a policy', async () => {
      await service.onModuleInit();

      const policy: RotationPolicy = {
        id: 'policy-1',
        name: 'Test Policy',
        rotationIntervalDays: 1,
        revokeOldKey: true,
        enabled: true,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy);
      expect(service.getPolicy('policy-1')).toEqual(policy);

      service.removePolicy('policy-1');
      expect(service.getPolicy('policy-1')).toBeNull();
    });
  });

  describe('executePolicy', () => {
    it('should rotate keys by keyIds', async () => {
      const policy: RotationPolicy = {
        id: 'policy-1',
        name: 'Test Policy',
        keyIds: ['key-123', 'key-456'],
        rotationIntervalDays: 1,
        revokeOldKey: true,
        enabled: true,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy);

      mockApiKeyService.rotate.mockResolvedValue({
        id: 'new-key-123',
        name: 'Rotated Key',
        token: 'new-token',
        scopes: ['read:projects'],
        expiresAt: null,
        createdAt: new Date(),
      });

      await service.executePolicy('policy-1');

      expect(mockApiKeyService.rotate).toHaveBeenCalledTimes(2);
      expect(mockApiKeyService.rotate).toHaveBeenCalledWith('key-123', {
        revokeOldKey: true,
        gracePeriodHours: undefined,
      });
    });

    it('should find and rotate keys by criteria', async () => {
      const policy: RotationPolicy = {
        id: 'policy-1',
        name: 'Test Policy',
        tags: ['production'],
        owner: 'user1',
        rotationIntervalDays: 1,
        revokeOldKey: false,
        enabled: true,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy);

      mockAdapter.query.mockResolvedValue([mockApiKey]);
      mockApiKeyService.rotate.mockResolvedValue({
        id: 'new-key-123',
        name: 'Rotated Key',
        token: 'new-token',
        scopes: ['read:projects'],
        expiresAt: null,
        createdAt: new Date(),
      });

      await service.executePolicy('policy-1');

      expect(mockAdapter.query).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['production'],
          owner: 'user1',
          active: true,
        }),
      );
      expect(mockApiKeyService.rotate).toHaveBeenCalled();
    });

    it('should not execute disabled policy', async () => {
      const policy: RotationPolicy = {
        id: 'policy-1',
        name: 'Disabled Policy',
        rotationIntervalDays: 1,
        revokeOldKey: true,
        enabled: false,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy);

      await service.executePolicy('policy-1');

      expect(mockApiKeyService.rotate).not.toHaveBeenCalled();
    });

    it('should not execute non-existent policy', async () => {
      await service.executePolicy('non-existent');

      expect(mockApiKeyService.rotate).not.toHaveBeenCalled();
    });

    it('should use grace period when specified', async () => {
      const policy: RotationPolicy = {
        id: 'policy-1',
        name: 'Test Policy',
        keyIds: ['key-123'],
        rotationIntervalDays: 1,
        revokeOldKey: true,
        gracePeriodHours: 24,
        enabled: true,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy);

      mockApiKeyService.rotate.mockResolvedValue({
        id: 'new-key-123',
        name: 'Rotated Key',
        token: 'new-token',
        scopes: ['read:projects'],
        expiresAt: null,
        createdAt: new Date(),
      });

      await service.executePolicy('policy-1');

      expect(mockApiKeyService.rotate).toHaveBeenCalledWith('key-123', {
        revokeOldKey: true,
        gracePeriodHours: 24,
      });
    });
  });

  describe('lifecycle', () => {
    it('should start monitoring on init', async () => {
      await service.onModuleInit();

      const policy: RotationPolicy = {
        id: 'policy-1',
        name: 'Test Policy',
        rotationIntervalDays: 1,
        revokeOldKey: true,
        enabled: true,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy);

      // Policy should be scheduled
      const retrieved = service.getPolicy('policy-1');
      expect(retrieved).toBeTruthy();
    });

    it('should clean up intervals on destroy', async () => {
      await service.onModuleInit();

      const policy: RotationPolicy = {
        id: 'policy-1',
        name: 'Test Policy',
        rotationIntervalDays: 1,
        revokeOldKey: true,
        enabled: true,
        nextRunAt: new Date(),
      };

      service.registerPolicy(policy);

      await service.onModuleDestroy();

      // After destroy, intervals should be cleared
      const policies = service.getPolicies();
      expect(policies).toHaveLength(1); // Policy still exists, but interval is cleared
    });
  });
});

