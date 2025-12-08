import { Test, TestingModule } from '@nestjs/testing';
import { KeyAliasService } from '../../src/services/key-alias.service';

describe('KeyAliasService', () => {
  let service: KeyAliasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KeyAliasService],
    }).compile();

    service = module.get<KeyAliasService>(KeyAliasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addAlias', () => {
    it('should add an alias to a key', () => {
      service.addAlias('key-123', 'production-key');
      const aliases = service.getAliases('key-123');
      expect(aliases).toContain('production-key');
    });

    it('should throw if alias already exists', () => {
      service.addAlias('key-123', 'production-key');
      expect(() => service.addAlias('key-456', 'production-key')).toThrow();
    });
  });

  describe('getKeyByAlias', () => {
    it('should return key ID for an alias', () => {
      service.addAlias('key-123', 'production-key');
      const keyId = service.getKeyByAlias('production-key');
      expect(keyId).toBe('key-123');
    });
  });

  describe('removeAlias', () => {
    it('should remove an alias', () => {
      service.addAlias('key-123', 'production-key');
      service.removeAlias('key-123', 'production-key');
      const aliases = service.getAliases('key-123');
      expect(aliases).not.toContain('production-key');
    });
  });

  describe('clearAliases', () => {
    it('should clear all aliases for a key', () => {
      service.addAlias('key-123', 'alias-1');
      service.addAlias('key-123', 'alias-2');
      service.clearAliases('key-123');
      const aliases = service.getAliases('key-123');
      expect(aliases.length).toBe(0);
    });
  });
});

