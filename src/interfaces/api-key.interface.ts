export interface ApiKey {
  id: string;
  name: string;
  keyPrefix?: string;
  hashedKey: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  ipWhitelist?: string[];
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyDto {
  name: string;
  scopes?: string[];
  expiresAt?: Date;
  ipWhitelist?: string[];
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  token: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

import { PrismaClient } from '@prisma/client';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { TypeOrmApiKeyRepository, MongooseApiKeyModel } from '../adapters/types';

export type AdapterType = 'prisma' | 'typeorm' | 'mongoose' | 'custom';

import { AuditLogOptions } from '../services/audit-log.service';
import { HashAlgorithm } from '../utils/hash.util';
import { WebhookConfig } from '../services/webhook.service';
import { RedisClient } from '../types/redis.types';

export interface ApiKeyModuleOptions {
  secretLength?: number;
  headerName?: string;
  queryParamName?: string;
  cookieName?: string;
  adapter?: AdapterType;
  prismaClient?: PrismaClient;
  customAdapter?: IApiKeyAdapter;
  typeOrmRepository?: TypeOrmApiKeyRepository;
  mongooseModel?: MongooseApiKeyModel;
  enableRateLimiting?: boolean;
  enableAuditLogging?: boolean;
  enableCaching?: boolean;
  enableAnalytics?: boolean;
  enableWebhooks?: boolean;
  cacheTtlMs?: number;
  auditLogOptions?: AuditLogOptions;
  hashAlgorithm?: HashAlgorithm;
  bcryptRounds?: number;
  redisClient?: RedisClient;
  webhooks?: WebhookConfig[];
}
