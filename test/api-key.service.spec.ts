import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyService } from '../src/services/api-key.service';
import { IApiKeyAdapter } from '../src/adapters/base.adapter';
import { BadRequestException } from '@nestjs/common';
import { ApiKeyNotFoundException, ApiKeyAlreadyRevokedException } from '../src/exceptions';

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  const mockAdapter: jest.Mocked<IApiKeyAdapter> = {
    create: jest.fn(),
    findByKeyPrefix: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    findAllActive: jest.fn(),
    revoke: jest.fn(),
    updateLastUsed: jest.fn(),
  };

  beforeEach(() => {
    service = new ApiKeyService(mockAdapter, 32);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an API key with valid data', async () => {
      const dto = { name: 'Test Key', scopes: ['read:projects'] };
      const mockKey = {
        id: '123',
        name: 'Test Key',
        hashedKey: 'hashed',
        scopes: ['read:projects'],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAdapter.create.mockResolvedValue(mockKey);

      const result = await service.create(dto);

      expect(result).toHaveProperty('token');
      expect(result.name).toBe('Test Key');
      expect(result.scopes).toEqual(['read:projects']);
      expect(mockAdapter.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException for empty name', async () => {
      const dto = { name: '' };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid scopes', async () => {
      const dto = { name: 'Test', scopes: 'invalid' as unknown as string[] };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired date in past', async () => {
      const dto = {
        name: 'Test',
        expiresAt: new Date('2020-01-01'),
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('validate', () => {
    it('should return null for invalid token', async () => {
      mockAdapter.findByKeyPrefix.mockResolvedValue([]);

      const result = await service.validate('invalid');

      expect(result).toBeNull();
    });

    it('should return null for revoked key', async () => {
      const mockKey = {
        id: '123',
        name: 'Test',
        hashedKey: 'hashed',
        scopes: [],
        expiresAt: null,
        revokedAt: new Date(),
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAdapter.findByKeyPrefix.mockResolvedValue([mockKey]);

      const result = await service.validate('token');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return API key when found', async () => {
      const mockKey = {
        id: '123',
        name: 'Test',
        hashedKey: 'hashed',
        scopes: [],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAdapter.findById.mockResolvedValue(mockKey);

      const result = await service.findById('123');

      expect(result).toEqual(mockKey);
    });

    it('should throw ApiKeyNotFoundException when not found', async () => {
      mockAdapter.findById.mockResolvedValue(null);

      await expect(service.findById('123')).rejects.toThrow(ApiKeyNotFoundException);
    });
  });

  describe('revoke', () => {
    it('should revoke an active key', async () => {
      const mockKey = {
        id: '123',
        name: 'Test',
        hashedKey: 'hashed',
        scopes: [],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const revokedKey = { ...mockKey, revokedAt: new Date() };

      mockAdapter.findById.mockResolvedValue(mockKey);
      mockAdapter.revoke.mockResolvedValue(revokedKey);

      const result = await service.revoke('123');

      expect(result.revokedAt).toBeDefined();
    });

    it('should throw ApiKeyAlreadyRevokedException for already revoked key', async () => {
      const mockKey = {
        id: '123',
        name: 'Test',
        hashedKey: 'hashed',
        scopes: [],
        expiresAt: null,
        revokedAt: new Date(),
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAdapter.findById.mockResolvedValue(mockKey);

      await expect(service.revoke('123')).rejects.toThrow(ApiKeyAlreadyRevokedException);
    });
  });
});
