import { DynamicModule, Module, Provider } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ApiKeyService } from './services/api-key.service';
import { PrismaAdapter, PRISMA_CLIENT_KEY } from './adapters/prisma.adapter';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ScopesGuard } from './guards/scopes.guard';
import { ApiKeyModuleOptions } from './interfaces';

@Module({})
export class ApiKeyModule {
  static register(options: ApiKeyModuleOptions = {}): DynamicModule {
    const defaultOptions: ApiKeyModuleOptions = {
      secretLength: 32,
      headerName: 'x-api-key',
      queryParamName: 'api_key',
      cookieName: 'api_key',
      ...options,
    };

    const providers: Provider[] = [];

    if (options.prismaClient) {
      providers.push({
        provide: PRISMA_CLIENT_KEY,
        useValue: options.prismaClient,
      });
    }

    providers.push(
      {
        provide: PrismaAdapter,
        useFactory: (prismaClient?: PrismaClient) => {
          return new PrismaAdapter(prismaClient);
        },
        inject: options.prismaClient ? [PRISMA_CLIENT_KEY] : [],
      },
      {
        provide: ApiKeyService,
        useFactory: (adapter: PrismaAdapter) => {
          return new ApiKeyService(adapter, defaultOptions.secretLength);
        },
        inject: [PrismaAdapter],
      },
      {
        provide: ApiKeyGuard,
        useFactory: (apiKeyService: ApiKeyService, reflector: Reflector) => {
          return new ApiKeyGuard(apiKeyService, reflector, defaultOptions);
        },
        inject: [ApiKeyService, Reflector],
      },
      {
        provide: ScopesGuard,
        useFactory: (reflector: Reflector) => {
          return new ScopesGuard(reflector);
        },
        inject: [Reflector],
      },
      Reflector,
      {
        provide: 'API_KEY_OPTIONS',
        useValue: defaultOptions,
      },
    );

    return {
      module: ApiKeyModule,
      providers,
      exports: [ApiKeyService, ApiKeyGuard, ScopesGuard],
    };
  }
}
