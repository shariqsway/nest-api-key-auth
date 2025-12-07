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
import { QuotaService } from './services/quota.service';
import { RotationPolicyService } from './services/rotation-policy.service';
import { KeyTemplateService } from './services/key-template.service';
import { ExportImportService } from './services/export-import.service';
import { RequestSigningService } from './services/request-signing.service';
import { RedisClient } from './types/redis.types';
import { PrismaAuditLogAdapter } from './adapters/prisma-audit-log.adapter';
import {
  TypeOrmAuditLogAdapter,
  TYPEORM_AUDIT_LOG_REPOSITORY_KEY,
  TypeOrmAuditLogRepository,
} from './adapters/typeorm-audit-log.adapter';
import {
  MongooseAuditLogAdapter,
  MONGOOSE_AUDIT_LOG_MODEL_KEY,
  MongooseAuditLogModel,
} from './adapters/mongoose-audit-log.adapter';
import { IAuditLogAdapter } from './adapters/audit-log.adapter';
import { AUDIT_LOG_ADAPTER_TOKEN } from './services/audit-log.service';

export const CACHE_SERVICE_TOKEN = 'CACHE_SERVICE';
export const RATE_LIMIT_SERVICE_TOKEN = 'RATE_LIMIT_SERVICE';
export const AUDIT_LOG_SERVICE_TOKEN = 'AUDIT_LOG_SERVICE';
export const ANALYTICS_SERVICE_TOKEN = 'ANALYTICS_SERVICE';
export const WEBHOOK_SERVICE_TOKEN = 'WEBHOOK_SERVICE';
export const QUOTA_SERVICE_TOKEN = 'QUOTA_SERVICE';
export { REDIS_CLIENT_KEY } from './services/redis-rate-limit.service';

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
      // Always provide PRISMA_CLIENT_KEY for audit log adapter
      if (options.prismaClient) {
        providers.push({
          provide: PRISMA_CLIENT_KEY,
          useValue: options.prismaClient,
        });
      } else {
        // Create a shared PrismaClient instance
        const sharedPrisma = new PrismaClient();
        providers.push({
          provide: PRISMA_CLIENT_KEY,
          useValue: sharedPrisma,
        });
      }

      providers.push({
        provide: API_KEY_ADAPTER,
        useFactory: (prismaClient: PrismaClient) => {
          return new PrismaAdapter(prismaClient);
        },
        inject: [PRISMA_CLIENT_KEY],
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
      // Setup audit log adapter if database logging is enabled
      if (defaultOptions.auditLogOptions?.logToDatabase) {
        const adapterType = defaultOptions.adapter || 'prisma';

        if (adapterType === 'prisma') {
          providers.push({
            provide: AUDIT_LOG_ADAPTER_TOKEN,
            useFactory: (prisma: PrismaClient) => {
              const prismaInstance = options.prismaClient || prisma;
              return new PrismaAuditLogAdapter(prismaInstance);
            },
            inject: options.prismaClient ? [PRISMA_CLIENT_KEY] : [PRISMA_CLIENT_KEY],
          });
        } else if (adapterType === 'typeorm') {
          if (!options.typeOrmAuditLogRepository) {
            ApiKeyLogger.warn(
              'TypeORM audit log repository not provided. Database audit logging will not work.',
              'ApiKeyModule',
            );
          } else {
            providers.push({
              provide: TYPEORM_AUDIT_LOG_REPOSITORY_KEY,
              useValue: options.typeOrmAuditLogRepository,
            });
            providers.push({
              provide: AUDIT_LOG_ADAPTER_TOKEN,
              useFactory: (repo: TypeOrmAuditLogRepository) => new TypeOrmAuditLogAdapter(repo),
              inject: [TYPEORM_AUDIT_LOG_REPOSITORY_KEY],
            });
          }
        } else if (adapterType === 'mongoose') {
          if (!options.mongooseAuditLogModel) {
            ApiKeyLogger.warn(
              'Mongoose audit log model not provided. Database audit logging will not work.',
              'ApiKeyModule',
            );
          } else {
            providers.push({
              provide: MONGOOSE_AUDIT_LOG_MODEL_KEY,
              useValue: options.mongooseAuditLogModel,
            });
            providers.push({
              provide: AUDIT_LOG_ADAPTER_TOKEN,
              useFactory: (model: MongooseAuditLogModel) => new MongooseAuditLogAdapter(model),
              inject: [MONGOOSE_AUDIT_LOG_MODEL_KEY],
            });
          }
        }
      }

      providers.push({
        provide: AUDIT_LOG_SERVICE_TOKEN,
        useFactory: (adapter?: IAuditLogAdapter) => {
          return new AuditLogService(defaultOptions.auditLogOptions, adapter);
        },
        inject: [
          ...(defaultOptions.auditLogOptions?.logToDatabase ? [AUDIT_LOG_ADAPTER_TOKEN] : []),
        ],
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

    // Add quota service (always enabled for quota support)
    providers.push({
      provide: QUOTA_SERVICE_TOKEN,
      useFactory: (adapter: IApiKeyAdapter, redisClient?: RedisClient) => {
        return new QuotaService(adapter, redisClient);
      },
      inject: [API_KEY_ADAPTER, ...(defaultOptions.redisClient ? [REDIS_CLIENT_KEY] : [])],
    });

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
          rateLimitService?: RateLimitService | RedisRateLimitService,
          auditLogService?: AuditLogService,
          analyticsService?: AnalyticsService,
          quotaService?: QuotaService,
        ) => {
          return new ApiKeyGuard(
            apiKeyService,
            reflector,
            defaultOptions,
            rateLimitService,
            auditLogService,
            analyticsService,
            quotaService,
          );
        },
        inject: [
          ApiKeyService,
          Reflector,
          ...(defaultOptions.enableRateLimiting !== false ? [RATE_LIMIT_SERVICE_TOKEN] : []),
          ...(defaultOptions.enableAuditLogging !== false ? [AUDIT_LOG_SERVICE_TOKEN] : []),
          ...(defaultOptions.enableAnalytics !== false ? [ANALYTICS_SERVICE_TOKEN] : []),
          QUOTA_SERVICE_TOKEN,
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
      {
        provide: RotationPolicyService,
        useFactory: (adapter: IApiKeyAdapter, apiKeyService: ApiKeyService) => {
          return new RotationPolicyService(adapter, apiKeyService);
        },
        inject: [API_KEY_ADAPTER, ApiKeyService],
      },
      {
        provide: KeyTemplateService,
        useClass: KeyTemplateService,
      },
      {
        provide: ExportImportService,
        useFactory: (adapter: IApiKeyAdapter) => {
          return new ExportImportService(adapter);
        },
        inject: [API_KEY_ADAPTER],
      },
      {
        provide: RequestSigningService,
        useClass: RequestSigningService,
      },
    );

    const moduleExports: Array<
      | typeof ApiKeyService
      | typeof ApiKeyGuard
      | typeof ScopesGuard
      | typeof HealthService
      | typeof BulkOperationsService
      | typeof ExpirationNotificationService
      | typeof RotationPolicyService
      | typeof KeyTemplateService
      | typeof ExportImportService
      | typeof RequestSigningService
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
      RotationPolicyService as typeof RotationPolicyService,
      KeyTemplateService as typeof KeyTemplateService,
      ExportImportService as typeof ExportImportService,
      RequestSigningService as typeof RequestSigningService,
    );

    // Always export quota service
    moduleExports.push(QUOTA_SERVICE_TOKEN);

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
