import type { Repository } from 'typeorm';
import type { Model, Document } from 'mongoose';

/**
 * TypeORM entity interface that represents the API key in the database.
 * Users should create an entity that matches this structure.
 */
export interface TypeOrmApiKeyEntity {
  id: string;
  name: string;
  keyPrefix: string;
  hashedKey: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  revocationReason?: string | null;
  lastUsedAt: Date | null;
  ipWhitelist?: string[];
  ipBlacklist?: string[];
  rateLimitMax?: number | null;
  rateLimitWindowMs?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mongoose document interface that represents the API key in the database.
 * Users should create a schema that matches this structure.
 * Note: _id is inherited from Document as ObjectId, but will be converted to string in mapToApiKey.
 */
export interface MongooseApiKeyDocument extends Document {
  name: string;
  keyPrefix: string;
  hashedKey: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  revocationReason?: string | null;
  lastUsedAt: Date | null;
  ipWhitelist?: string[];
  ipBlacklist?: string[];
  rateLimitMax?: number | null;
  rateLimitWindowMs?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Type for TypeORM repository.
 */
export type TypeOrmApiKeyRepository = Repository<TypeOrmApiKeyEntity>;

/**
 * Type for Mongoose model.
 */
export type MongooseApiKeyModel = Model<MongooseApiKeyDocument>;

/**
 * Mongoose query filter type for API keys.
 */
export interface MongooseApiKeyFilter {
  tags?: { $all: string[] };
  owner?: string;
  environment?: 'production' | 'staging' | 'development';
  scopes?: { $all: string[] };
  revokedAt?: null | { $ne: null };
  expiresAt?: null | { $gt: Date } | { $lte: Date };
  createdAt?: { $gte?: Date } | { $lte?: Date } | { $gte?: Date; $lte?: Date };
  lastUsedAt?: { $gte?: Date } | { $lte?: Date } | { $gte?: Date; $lte?: Date };
  $or?: Array<
    | { expiresAt: null }
    | { expiresAt: { $gt: Date } }
    | { revokedAt: { $ne: null } }
    | { expiresAt: { $lte: Date } }
  >;
}

/**
 * TypeORM entity data type for creating API keys.
 */
export interface TypeOrmApiKeyEntityData {
  name: string;
  keyPrefix: string;
  hashedKey: string;
  scopes: string[];
  expiresAt: Date | null;
  ipWhitelist: string[];
  ipBlacklist: string[];
  rateLimitMax: number | null;
  rateLimitWindowMs: number | null;
  quotaMax: number | null;
  quotaPeriod: 'daily' | 'monthly' | 'yearly' | null;
  quotaUsed: number;
  quotaResetAt: Date | null;
  metadata: string | null;
  tags: string[];
  owner: string | null;
  environment: 'production' | 'staging' | 'development' | null;
  description: string | null;
}

/**
 * TypeORM update data type for quota updates.
 */
export interface TypeOrmQuotaUpdateData {
  quotaUsed: number;
  quotaResetAt: Date;
}
