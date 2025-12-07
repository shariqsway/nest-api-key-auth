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
  quotaMax?: number | null;
  quotaPeriod?: 'daily' | 'monthly' | 'yearly' | null;
  quotaUsed?: number;
  quotaResetAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[];
  owner?: string | null;
  environment?: 'production' | 'staging' | 'development' | null;
  description?: string | null;
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
  quotaMax?: number;
  quotaPeriod?: 'daily' | 'monthly' | 'yearly';
  metadata?: Record<string, unknown>;
  tags?: string[];
  owner?: string;
  environment?: 'production' | 'staging' | 'development';
  description?: string;
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
import type { TypeOrmAuditLogRepository } from '../adapters/typeorm-audit-log.adapter';
import type { MongooseAuditLogModel } from '../adapters/mongoose-audit-log.adapter';

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
  typeOrmAuditLogRepository?: TypeOrmAuditLogRepository;
  mongooseAuditLogModel?: MongooseAuditLogModel;
}
