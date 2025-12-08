import { Test, TestingModule } from '@nestjs/testing';
import { MultiTenancyService } from '../../src/services/multi-tenancy.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { API_KEY_ADAPTER } from '../../src/api-key.module';
import { ApiKey } from '../../src/interfaces';
import { createMockApiKey } from '../helpers/api-key.helper';

describe('MultiTenancyService', () => {
  let service: MultiTenancyService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;

  beforeEach(async () => {
    mockAdapter = {
      create: jest.fn(),
      findByKeyPrefix: jest.fn(),
      findById: jest.fn().mockResolvedValue(
        createMockApiKey({
          id: 'key-123',
          name: 'Test Key',
          keyPrefix: 'abc12345',
        }),
      ),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultiTenancyService,
        {
          provide: API_KEY_ADAPTER,
          useValue: mockAdapter,
        },
      ],
    }).compile();

    service = module.get<MultiTenancyService>(MultiTenancyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTenant', () => {
    it('should create a tenant', () => {
      const tenant = service.createTenant('Test Tenant');
      expect(tenant.name).toBe('Test Tenant');
      expect(tenant.id).toBeDefined();
    });
  });

  describe('assignKeyToTenant', () => {
    it('should assign a key to a tenant', () => {
      const tenant = service.createTenant('Test Tenant');
      service.assignKeyToTenant('key-123', tenant.id);
      const keyTenant = service.getKeyTenant('key-123');
      expect(keyTenant?.id).toBe(tenant.id);
    });
  });

  describe('getTenantKeys', () => {
    it('should return keys for a tenant', async () => {
      const tenant = service.createTenant('Test Tenant');
      service.assignKeyToTenant('key-123', tenant.id);
      const keys = await service.getTenantKeys(tenant.id);
      expect(keys.length).toBe(1);
    });
  });
});

