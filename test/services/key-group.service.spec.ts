import { Test, TestingModule } from '@nestjs/testing';
import { KeyGroupService } from '../../src/services/key-group.service';
import { IApiKeyAdapter } from '../../src/adapters/base.adapter';
import { API_KEY_ADAPTER } from '../../src/api-key.module';
import { ApiKey } from '../../src/interfaces';

describe('KeyGroupService', () => {
  let service: KeyGroupService;
  let mockAdapter: jest.Mocked<IApiKeyAdapter>;

  beforeEach(async () => {
    mockAdapter = {
      create: jest.fn(),
      findByKeyPrefix: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 'key-123',
        name: 'Test Key',
        keyPrefix: 'abc12345',
        hashedKey: 'hash',
        scopes: [],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ApiKey),
      revoke: jest.fn(),
      findAll: jest.fn(),
      findAllActive: jest.fn(),
      updateLastUsed: jest.fn(),
      updateQuotaUsage: jest.fn(),
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyGroupService,
        {
          provide: API_KEY_ADAPTER,
          useValue: mockAdapter,
        },
      ],
    }).compile();

    service = module.get<KeyGroupService>(KeyGroupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createGroup', () => {
    it('should create a new group', async () => {
      const group = await service.createGroup({
        name: 'Test Group',
        description: 'Test Description',
      });
      expect(group.name).toBe('Test Group');
      expect(group.id).toBeDefined();
    });
  });

  describe('addKeyToGroup', () => {
    it('should add a key to a group', async () => {
      const group = await service.createGroup({ name: 'Test Group' });
      await service.addKeyToGroup(group.id, 'key-123');
      const keys = await service.getGroupKeys(group.id);
      expect(keys.length).toBe(1);
    });
  });

  describe('removeKeyFromGroup', () => {
    it('should remove a key from a group', async () => {
      const group = await service.createGroup({ name: 'Test Group' });
      await service.addKeyToGroup(group.id, 'key-123');
      service.removeKeyFromGroup(group.id, 'key-123');
      const keys = await service.getGroupKeys(group.id);
      expect(keys.length).toBe(0);
    });
  });

  describe('getGroupsByOwner', () => {
    it('should return groups by owner', async () => {
      await service.createGroup({ name: 'Group 1', owner: 'user-1' });
      await service.createGroup({ name: 'Group 2', owner: 'user-2' });
      const groups = service.getGroupsByOwner('user-1');
      expect(groups.length).toBe(1);
      expect(groups[0].owner).toBe('user-1');
    });
  });
});

