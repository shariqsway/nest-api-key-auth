import { DynamicModule, Module, Provider, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ApiKeyService } from './services/api-key.service';
import { PrismaAdapter, PRISMA_CLIENT_KEY } from './adapters/prisma.adapter';
import { TypeOrmAdapter, TYPEORM_REPOSITORY_KEY } from './adapters/typeorm.adapter';
import { MongooseAdapter, MONGOOSE_MODEL_KEY } from './adapters/mongoose.adapter';
import { IApiKeyAdapter } from './adapters/base.adapter';
import { TypeOrmApiKeyRepository, MongooseApiKeyModel } from './adapters/types';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ScopesGuard } from './guards/scopes.guard';
import { ApiKeyModuleOptions } from './interfaces';
import { validateModuleOptions } from './utils/validation.util';
import { ApiKeyLogger } from './utils/logger.util';
import { HealthService } from './services/health.service';
import { RateLimitService } from './services/rate-limit.service';
import { RedisRateLimitService, REDIS_CLIENT_KEY } from './services/redis-rate-limit.service';
import { AuditLogService } from './services/audit-log.service';
import { CacheService } from './services/cache.service';
import { RedisCacheService } from './services/redis-cache.service';
import { AnalyticsService } from './services/analytics.service';
import { WebhookService } from './services/webhook.service';
import { BulkOperationsService } from './services/bulk-operations.service';
import { ExpirationNotificationService } from './services/expiration-notification.service';
import { RedisClient } from './types/redis.types';

export const CACHE_SERVICE_TOKEN = 'CACHE_SERVICE';
export const RATE_LIMIT_SERVICE_TOKEN = 'RATE_LIMIT_SERVICE';
export const AUDIT_LOG_SERVICE_TOKEN = 'AUDIT_LOG_SERVICE';
export const ANALYTICS_SERVICE_TOKEN = 'ANALYTICS_SERVICE';
export const WEBHOOK_SERVICE_TOKEN = 'WEBHOOK_SERVICE';

export const API_KEY_ADAPTER = 'API_KEY_ADAPTER';

@Module({})
export class ApiKeyModule {
  static register(options: ApiKeyModuleOptions = {}): DynamicModule {
    try {
      validateModuleOptions(options);
    } catch (error) {
      throw new BadRequestException(
        `Invalid module configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    const defaultOptions: ApiKeyModuleOptions = {
      secretLength: 32,
      headerName: 'x-api-key',
      queryParamName: 'api_key',
      cookieName: 'api_key',
      adapter: 'prisma',
      ...options,
    };

    ApiKeyLogger.log(`Initializing ApiKeyModule with adapter: ${defaultOptions.adapter}`);

    const providers: Provider[] = [];
    const adapterType = options.adapter || 'prisma';

    // Setup adapter based on type
    if (adapterType === 'custom' && options.customAdapter) {
      providers.push({
        provide: API_KEY_ADAPTER,
        useValue: options.customAdapter,
      });
    } else if (adapterType === 'prisma') {
      if (options.prismaClient) {
        providers.push({
          provide: PRISMA_CLIENT_KEY,
          useValue: options.prismaClient,
        });
      }

      providers.push({
        provide: API_KEY_ADAPTER,
        useFactory: (prismaClient?: PrismaClient) => {
          return new PrismaAdapter(prismaClient);
        },
        inject: options.prismaClient ? [PRISMA_CLIENT_KEY] : [],
      });
    } else if (adapterType === 'typeorm') {
      if (!options.typeOrmRepository) {
        throw new Error(
          'TypeORM repository must be provided when using TypeORM adapter. Use typeOrmRepository option.',
        );
      }

      providers.push({
        provide: TYPEORM_REPOSITORY_KEY,
        useValue: options.typeOrmRepository,
      });

      providers.push({
        provide: API_KEY_ADAPTER,
        useFactory: (repository: TypeOrmApiKeyRepository) => {
          return new TypeOrmAdapter(repository);
        },
        inject: [TYPEORM_REPOSITORY_KEY],
      });
    } else if (adapterType === 'mongoose') {
      if (!options.mongooseModel) {
        throw new Error(
          'Mongoose model must be provided when using Mongoose adapter. Use mongooseModel option.',
        );
      }

      providers.push({
        provide: MONGOOSE_MODEL_KEY,
        useValue: options.mongooseModel,
      });

      providers.push({
        provide: API_KEY_ADAPTER,
        useFactory: (model: MongooseApiKeyModel) => {
          return new MongooseAdapter(model);
        },
        inject: [MONGOOSE_MODEL_KEY],
      });
    } else {
      throw new Error(`Unknown adapter type: ${adapterType}`);
    }

    // Setup Redis client if provided
    if (defaultOptions.redisClient) {
      providers.push({
        provide: REDIS_CLIENT_KEY,
        useValue: defaultOptions.redisClient,
      });
    }

    // Add optional services
    if (defaultOptions.enableCaching !== false) {
      if (defaultOptions.redisClient) {
        providers.push({
          provide: CACHE_SERVICE_TOKEN,
          useFactory: (redisClient: RedisClient) => new RedisCacheService(redisClient),
          inject: [REDIS_CLIENT_KEY],
        });
      } else {
        providers.push({
          provide: CACHE_SERVICE_TOKEN,
          useClass: CacheService,
        });
      }
    }

    if (defaultOptions.enableRateLimiting !== false) {
      if (defaultOptions.redisClient) {
        providers.push({
          provide: RATE_LIMIT_SERVICE_TOKEN,
          useFactory: (redisClient: RedisClient) => new RedisRateLimitService(redisClient),
          inject: [REDIS_CLIENT_KEY],
        });
      } else {
        providers.push({
          provide: RATE_LIMIT_SERVICE_TOKEN,
          useClass: RateLimitService,
        });
      }
    }

    if (defaultOptions.enableAuditLogging !== false) {
      providers.push({
        provide: AUDIT_LOG_SERVICE_TOKEN,
        useValue: new AuditLogService(defaultOptions.auditLogOptions),
      });
    }

    if (defaultOptions.enableAnalytics !== false) {
      providers.push({
        provide: ANALYTICS_SERVICE_TOKEN,
        useFactory: (adapter: IApiKeyAdapter) => new AnalyticsService(adapter),
        inject: [API_KEY_ADAPTER],
      });
    }

    if (defaultOptions.enableWebhooks !== false) {
      const webhookService = new WebhookService();
      if (defaultOptions.webhooks) {
        defaultOptions.webhooks.forEach((config) => webhookService.registerWebhook(config));
      }
      providers.push({
        provide: WEBHOOK_SERVICE_TOKEN,
        useValue: webhookService,
      });
    }

    // Add service and guards
    providers.push(
      {
        provide: ApiKeyService,
        useFactory: (
          adapter: IApiKeyAdapter,
          cacheService?: CacheService | RedisCacheService,
          webhookService?: WebhookService,
          analyticsService?: AnalyticsService,
        ) => {
          return new ApiKeyService(
            adapter,
            defaultOptions.secretLength,
            cacheService,
            defaultOptions.hashAlgorithm || 'bcrypt',
            webhookService,
            analyticsService,
          );
        },
        inject: [
          API_KEY_ADAPTER,
          ...(defaultOptions.enableCaching !== false ? [CACHE_SERVICE_TOKEN] : []),
          ...(defaultOptions.enableWebhooks !== false ? [WEBHOOK_SERVICE_TOKEN] : []),
          ...(defaultOptions.enableAnalytics !== false ? [ANALYTICS_SERVICE_TOKEN] : []),
        ],
      },
      {
        provide: ApiKeyGuard,
        useFactory: (
          apiKeyService: ApiKeyService,
          reflector: Reflector,
          rateLimitService?: RateLimitService,
          auditLogService?: AuditLogService,
        ) => {
          return new ApiKeyGuard(
            apiKeyService,
            reflector,
            defaultOptions,
            rateLimitService,
            auditLogService,
          );
        },
        inject: [
          ApiKeyService,
          Reflector,
          ...(defaultOptions.enableRateLimiting !== false ? [RATE_LIMIT_SERVICE_TOKEN] : []),
          ...(defaultOptions.enableAuditLogging !== false ? [AUDIT_LOG_SERVICE_TOKEN] : []),
        ],
      },
      {
        provide: ScopesGuard,
        useFactory: (reflector: Reflector) => {
          return new ScopesGuard(reflector);
        },
        inject: [Reflector],
      },
      {
        provide: HealthService,
        useFactory: (adapter: IApiKeyAdapter) => {
          return new HealthService(adapter);
        },
        inject: [API_KEY_ADAPTER],
      },
      Reflector,
      {
        provide: 'API_KEY_OPTIONS',
        useValue: defaultOptions,
      },
      {
        provide: BulkOperationsService,
        useFactory: (adapter: IApiKeyAdapter, apiKeyService: ApiKeyService) => {
          return new BulkOperationsService(adapter, apiKeyService);
        },
        inject: [API_KEY_ADAPTER, ApiKeyService],
      },
      {
        provide: ExpirationNotificationService,
        useFactory: (adapter: IApiKeyAdapter, webhookService?: WebhookService) => {
          return new ExpirationNotificationService(adapter, webhookService);
        },
        inject: [
          API_KEY_ADAPTER,
          ...(defaultOptions.enableWebhooks !== false ? [WEBHOOK_SERVICE_TOKEN] : []),
        ],
      },
    );

    const moduleExports: Array<
      | typeof ApiKeyService
      | typeof ApiKeyGuard
      | typeof ScopesGuard
      | typeof HealthService
      | typeof BulkOperationsService
      | typeof ExpirationNotificationService
      | string
      | typeof CacheService
      | typeof RateLimitService
      | typeof AuditLogService
      | typeof AnalyticsService
      | typeof WebhookService
    > = [ApiKeyService, ApiKeyGuard, ScopesGuard, HealthService, API_KEY_ADAPTER];

    // Add optional services to exports
    if (defaultOptions.enableCaching !== false) {
      moduleExports.push(CACHE_SERVICE_TOKEN);
    }

    if (defaultOptions.enableRateLimiting !== false) {
      moduleExports.push(RATE_LIMIT_SERVICE_TOKEN);
    }

    if (defaultOptions.enableAuditLogging !== false) {
      moduleExports.push(AUDIT_LOG_SERVICE_TOKEN);
    }

    if (defaultOptions.enableAnalytics !== false) {
      moduleExports.push(ANALYTICS_SERVICE_TOKEN);
    }

    if (defaultOptions.enableWebhooks !== false) {
      moduleExports.push(WEBHOOK_SERVICE_TOKEN);
    }

    // Always export bulk operations and expiration services
    moduleExports.push(
      BulkOperationsService as typeof BulkOperationsService,
      ExpirationNotificationService as typeof ExpirationNotificationService,
    );

    if (defaultOptions.enableCaching !== false) {
      moduleExports.push(CACHE_SERVICE_TOKEN);
    }

    if (defaultOptions.enableRateLimiting !== false) {
      moduleExports.push(RATE_LIMIT_SERVICE_TOKEN);
    }

    if (defaultOptions.enableAuditLogging !== false) {
      moduleExports.push(AUDIT_LOG_SERVICE_TOKEN);
    }

    if (defaultOptions.enableAnalytics !== false) {
      moduleExports.push(ANALYTICS_SERVICE_TOKEN);
    }

    if (defaultOptions.enableWebhooks !== false) {
      moduleExports.push(WEBHOOK_SERVICE_TOKEN);
    }

    return {
      module: ApiKeyModule,
      providers,
      exports: moduleExports,
    };
  }
}
