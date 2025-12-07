import { Test, TestingModule } from '@nestjs/testing';
import { KeyTemplateService, KeyTemplate } from '../../src/services/key-template.service';

describe('KeyTemplateService', () => {
  let service: KeyTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KeyTemplateService],
    }).compile();

    service = module.get<KeyTemplateService>(KeyTemplateService);
  });

  describe('registerTemplate', () => {
    it('should register a template', () => {
      const template: KeyTemplate = {
        id: 'template-1',
        name: 'Read Only Template',
        description: 'Template for read-only access',
        config: {
          scopes: ['read:projects', 'read:users'],
          environment: 'production',
        },
      };

      service.registerTemplate(template);

      const retrieved = service.getTemplate('template-1');
      expect(retrieved).toEqual(template);
    });
  });

  describe('getTemplate', () => {
    it('should return template by ID', () => {
      const template: KeyTemplate = {
        id: 'template-1',
        name: 'Test Template',
        config: {
          scopes: ['read:projects'],
        },
      };

      service.registerTemplate(template);

      const retrieved = service.getTemplate('template-1');
      expect(retrieved).toEqual(template);
    });

    it('should return null for non-existent template', () => {
      const retrieved = service.getTemplate('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('getTemplates', () => {
    it('should return all registered templates', () => {
      const template1: KeyTemplate = {
        id: 'template-1',
        name: 'Template 1',
        config: { scopes: ['read:projects'] },
      };

      const template2: KeyTemplate = {
        id: 'template-2',
        name: 'Template 2',
        config: { scopes: ['write:projects'] },
      };

      service.registerTemplate(template1);
      service.registerTemplate(template2);

      const templates = service.getTemplates();
      expect(templates).toHaveLength(2);
      expect(templates).toContainEqual(template1);
      expect(templates).toContainEqual(template2);
    });

    it('should return empty array when no templates registered', () => {
      const templates = service.getTemplates();
      expect(templates).toEqual([]);
    });
  });

  describe('createFromTemplate', () => {
    it('should create key DTO from template', () => {
      const template: KeyTemplate = {
        id: 'template-1',
        name: 'Read Only Template',
        config: {
          scopes: ['read:projects', 'read:users'],
          environment: 'production',
          tags: ['readonly', 'production'],
          quotaMax: 1000,
          quotaPeriod: 'daily',
        },
      };

      service.registerTemplate(template);

      const dto = service.createFromTemplate('template-1', 'My API Key');

      expect(dto.name).toBe('My API Key');
      expect(dto.scopes).toEqual(['read:projects', 'read:users']);
      expect(dto.environment).toBe('production');
      expect(dto.tags).toEqual(['readonly', 'production']);
      expect(dto.quotaMax).toBe(1000);
      expect(dto.quotaPeriod).toBe('daily');
    });

    it('should apply overrides when provided', () => {
      const template: KeyTemplate = {
        id: 'template-1',
        name: 'Read Only Template',
        config: {
          scopes: ['read:projects'],
          environment: 'production',
        },
      };

      service.registerTemplate(template);

      const dto = service.createFromTemplate('template-1', 'My API Key', {
        scopes: ['read:users'],
      });

      expect(dto.name).toBe('My API Key');
      expect(dto.scopes).toEqual(['read:users']); // Overridden
      expect(dto.environment).toBe('production'); // From template
    });

    it('should throw error for non-existent template', () => {
      expect(() => {
        service.createFromTemplate('non-existent', 'My API Key');
      }).toThrow('Template non-existent not found');
    });
  });

  describe('removeTemplate', () => {
    it('should remove a template', () => {
      const template: KeyTemplate = {
        id: 'template-1',
        name: 'Test Template',
        config: { scopes: ['read:projects'] },
      };

      service.registerTemplate(template);
      expect(service.getTemplate('template-1')).toEqual(template);

      service.removeTemplate('template-1');
      expect(service.getTemplate('template-1')).toBeNull();
    });
  });
});

