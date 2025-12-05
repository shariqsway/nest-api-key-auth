import { Test, TestingModule } from '@nestjs/testing';
import { PrismaAdapter, PRISMA_CLIENT_KEY } from '../../src/adapters/prisma.adapter';
import { PrismaClient } from '@prisma/client';

describe('PrismaAdapter', () => {
  let adapter: PrismaAdapter;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      apiKey: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $connect: jest.fn(),
      $disconnect: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: PRISMA_CLIENT_KEY,
          useValue: mockPrisma,
        },
        PrismaAdapter,
      ],
    }).compile();

    adapter = module.get<PrismaAdapter>(PrismaAdapter);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an API key', async () => {
      const mockKey = {
        id: '123',
        name: 'Test',
        keyPrefix: 'abc12345',
        hashedKey: 'hashed',
        scopes: ['read:projects'],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.apiKey.create as jest.Mock).mockResolvedValue(mockKey);

      const result = await adapter.create({
        name: 'Test',
        keyPrefix: 'abc12345',
        hashedKey: 'hashed',
        scopes: ['read:projects'],
      });

      expect(result).toHaveProperty('id', '123');
      expect(result.name).toBe('Test');
      expect(mockPrisma.apiKey.create as jest.Mock).toHaveBeenCalled();
    });
  });

  describe('findByKeyPrefix', () => {
    it('should find keys by prefix', async () => {
      const mockKeys = [
        {
          id: '123',
          name: 'Test',
          keyPrefix: 'abc12345',
          hashedKey: 'hashed',
          scopes: [],
          expiresAt: null,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockPrisma.apiKey.findMany as jest.Mock).mockResolvedValue(mockKeys);

      const result = await adapter.findByKeyPrefix('abc12345');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('123');
      expect(result[0].name).toBe('Test');
    });
  });

  describe('findById', () => {
    it('should find key by ID', async () => {
      const mockKey = {
        id: '123',
        name: 'Test',
        keyPrefix: 'abc12345',
        hashedKey: 'hashed',
        scopes: [],
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.apiKey.findUnique as jest.Mock).mockResolvedValue(mockKey);

      const result = await adapter.findById('123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('123');
    });

    it('should return null if not found', async () => {
      (mockPrisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await adapter.findById('123');

      expect(result).toBeNull();
    });
  });

  describe('revoke', () => {
    it('should revoke a key', async () => {
      const mockKey = {
        id: '123',
        name: 'Test',
        keyPrefix: 'abc12345',
        hashedKey: 'hashed',
        scopes: [],
        expiresAt: null,
        revokedAt: new Date(),
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.apiKey.update as jest.Mock).mockResolvedValue(mockKey);

      const result = await adapter.revoke('123');

      expect(result.revokedAt).toBeDefined();
      expect(mockPrisma.apiKey.update as jest.Mock).toHaveBeenCalled();
    });
  });
});

