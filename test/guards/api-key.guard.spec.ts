import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from '../../src/guards/api-key.guard';
import { ApiKeyService } from '../../src/services/api-key.service';
import { ApiKeyModuleOptions } from '../../src/interfaces';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let apiKeyService: jest.Mocked<ApiKeyService>;
  let mockContext: ExecutionContext;
  let mockGetRequest: jest.Mock;

  const mockApiKey = {
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

  beforeEach(async () => {
    apiKeyService = {
      validate: jest.fn(),
      updateLastUsed: jest.fn(),
    } as any;

    mockGetRequest = jest.fn().mockReturnValue({
      headers: {},
      query: {},
      cookies: {},
      method: 'GET',
      url: '/test',
      path: '/test',
    });

    const mockGetResponse = jest.fn().mockReturnValue({
      setHeader: jest.fn(),
    });

    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: mockGetRequest,
        getResponse: mockGetResponse,
      }),
    } as any;

    const options: ApiKeyModuleOptions = {
      headerName: 'x-api-key',
      queryParamName: 'api_key',
      cookieName: 'api_key',
    };

    guard = new ApiKeyGuard(apiKeyService, new Reflector(), options);
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should throw UnauthorizedException if API key is missing', async () => {
      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if API key is invalid', async () => {
      const request: any = {
        headers: { 'x-api-key': 'invalid-key' },
        query: {},
        cookies: {},
      };

      mockGetRequest.mockReturnValue(request);
      apiKeyService.validate.mockResolvedValue(null);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should allow request if API key is valid', async () => {
      const request: any = {
        headers: { 'x-api-key': 'valid-key' },
        query: {},
        cookies: {},
      };

      mockGetRequest.mockReturnValue(request);
      apiKeyService.validate.mockResolvedValue(mockApiKey);
      apiKeyService.updateLastUsed.mockResolvedValue(mockApiKey);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(request.apiKey).toEqual(mockApiKey);
    });

    it('should extract key from query params', async () => {
      const request: any = {
        headers: {},
        query: { api_key: 'valid-key' },
        cookies: {},
      };

      mockGetRequest.mockReturnValue(request);
      apiKeyService.validate.mockResolvedValue(mockApiKey);
      apiKeyService.updateLastUsed.mockResolvedValue(mockApiKey);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should extract key from cookies', async () => {
      const request: any = {
        headers: {},
        query: {},
        cookies: { api_key: 'valid-key' },
      };

      mockGetRequest.mockReturnValue(request);
      apiKeyService.validate.mockResolvedValue(mockApiKey);
      apiKeyService.updateLastUsed.mockResolvedValue(mockApiKey);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
    });
  });
});

