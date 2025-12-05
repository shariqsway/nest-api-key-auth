import { BadRequestException } from '@nestjs/common';
import { validateTokenFormat, validateScopeFormat, validateModuleOptions } from '../../src/utils/validation.util';

describe('Validation Utilities', () => {
  describe('validateTokenFormat', () => {
    it('should accept valid hexadecimal token', () => {
      expect(() => validateTokenFormat('abc123def456')).not.toThrow();
    });

    it('should reject non-hexadecimal characters', () => {
      expect(() => validateTokenFormat('abc123g')).toThrow(BadRequestException);
      expect(() => validateTokenFormat('abc123!')).toThrow(BadRequestException);
    });

    it('should reject empty string', () => {
      expect(() => validateTokenFormat('')).toThrow(BadRequestException);
    });

    it('should reject non-string values', () => {
      expect(() => validateTokenFormat(null as unknown as string)).toThrow(BadRequestException);
    });
  });

  describe('validateScopeFormat', () => {
    it('should accept valid scope format', () => {
      expect(() => validateScopeFormat('read:projects')).not.toThrow();
      expect(() => validateScopeFormat('write:users')).not.toThrow();
      expect(() => validateScopeFormat('admin:*')).not.toThrow();
    });

    it('should reject invalid scope format', () => {
      expect(() => validateScopeFormat('read')).toThrow(BadRequestException);
      expect(() => validateScopeFormat('read-projects')).toThrow(BadRequestException);
      expect(() => validateScopeFormat('read/projects')).toThrow(BadRequestException);
    });

    it('should reject empty string', () => {
      expect(() => validateScopeFormat('')).toThrow(BadRequestException);
    });
  });

  describe('validateModuleOptions', () => {
    it('should accept valid options', () => {
      expect(() =>
        validateModuleOptions({
          secretLength: 32,
          headerName: 'x-api-key',
          queryParamName: 'api_key',
          cookieName: 'api_key',
        }),
      ).not.toThrow();
    });

    it('should reject invalid secretLength', () => {
      expect(() => validateModuleOptions({ secretLength: 5 })).toThrow(BadRequestException);
      expect(() => validateModuleOptions({ secretLength: 200 })).toThrow(BadRequestException);
    });

    it('should reject empty headerName', () => {
      expect(() => validateModuleOptions({ headerName: '' })).toThrow(BadRequestException);
    });
  });
});

