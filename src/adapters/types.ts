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
  lastUsedAt: Date | null;
  ipWhitelist?: string[];
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
  lastUsedAt: Date | null;
  ipWhitelist?: string[];
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
