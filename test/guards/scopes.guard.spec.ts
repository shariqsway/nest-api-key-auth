import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopesGuard } from '../../src/guards/scopes.guard';
import { SCOPES_KEY } from '../../src/decorators/scopes.decorator';

describe('ScopesGuard', () => {
  let guard: ScopesGuard;
  let reflector: jest.Mocked<Reflector>;
  let mockContext: ExecutionContext;

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScopesGuard,
        {
          provide: Reflector,
          useValue: reflector,
        },
      ],
    }).compile();

    guard = module.get<ScopesGuard>(ScopesGuard);
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should allow access if no scopes required', () => {
      const mockHandler = jest.fn();
      const mockClass = jest.fn();

      mockContext = {
        getHandler: jest.fn().mockReturnValue(mockHandler),
        getClass: jest.fn().mockReturnValue(mockClass),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({}),
        }),
      } as any;

      reflector.getAllAndOverride.mockReturnValue(null);

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(SCOPES_KEY, [mockHandler, mockClass]);
    });

    it('should allow access if key has required scopes', () => {
      const request = {
        apiKey: {
          id: '123',
          scopes: ['read:projects', 'write:projects'],
        },
      };

      const mockHandler = jest.fn();
      const mockClass = jest.fn();

      mockContext = {
        getHandler: jest.fn().mockReturnValue(mockHandler),
        getClass: jest.fn().mockReturnValue(mockClass),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as any;

      reflector.getAllAndOverride.mockReturnValue(['read:projects']);

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException if key lacks required scopes', () => {
      const request = {
        apiKey: {
          id: '123',
          scopes: ['read:projects'],
        },
      };

      const mockHandler = jest.fn();
      const mockClass = jest.fn();

      mockContext = {
        getHandler: jest.fn().mockReturnValue(mockHandler),
        getClass: jest.fn().mockReturnValue(mockClass),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as any;

      reflector.getAllAndOverride.mockReturnValue(['write:projects']);

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if apiKey not in request', () => {
      const request: any = {};

      const mockHandler = jest.fn();
      const mockClass = jest.fn();

      mockContext = {
        getHandler: jest.fn().mockReturnValue(mockHandler),
        getClass: jest.fn().mockReturnValue(mockClass),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as any;

      reflector.getAllAndOverride.mockReturnValue(['read:projects']);

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });
  });
});

