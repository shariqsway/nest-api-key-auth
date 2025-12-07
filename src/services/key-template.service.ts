import { Injectable } from '@nestjs/common';
import { CreateApiKeyDto } from '../interfaces';
import { ApiKeyLogger } from '../utils/logger.util';

export interface KeyTemplate {
  id: string;
  name: string;
  description?: string;
  config: Omit<CreateApiKeyDto, 'name'>;
}

/**
 * Service for managing key templates/presets.
 */
@Injectable()
export class KeyTemplateService {
  private templates: Map<string, KeyTemplate> = new Map();

  /**
   * Registers a key template.
   *
   * @param template - The template to register
   */
  registerTemplate(template: KeyTemplate): void {
    this.templates.set(template.id, template);
    ApiKeyLogger.log(
      `Key template registered: ${template.name} (${template.id})`,
      'KeyTemplateService',
    );
  }

  /**
   * Gets a template by ID.
   *
   * @param templateId - The template ID
   * @returns The template or null
   */
  getTemplate(templateId: string): KeyTemplate | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * Gets all registered templates.
   *
   * @returns Array of templates
   */
  getTemplates(): KeyTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Removes a template.
   *
   * @param templateId - The template ID
   */
  removeTemplate(templateId: string): void {
    this.templates.delete(templateId);
    ApiKeyLogger.log(`Key template removed: ${templateId}`, 'KeyTemplateService');
  }

  /**
   * Creates a CreateApiKeyDto from a template.
   *
   * @param templateId - The template ID
   * @param name - The name for the new key
   * @param overrides - Optional overrides for template values
   * @returns CreateApiKeyDto
   */
  createFromTemplate(
    templateId: string,
    name: string,
    overrides?: Partial<CreateApiKeyDto>,
  ): CreateApiKeyDto {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    return {
      name,
      ...template.config,
      ...overrides,
    };
  }
}
