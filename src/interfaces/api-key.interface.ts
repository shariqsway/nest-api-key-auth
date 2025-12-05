export interface ApiKey {
  id: string;
  name: string;
  keyPrefix?: string;
  hashedKey: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyDto {
  name: string;
  scopes?: string[];
  expiresAt?: Date;
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

export interface ApiKeyModuleOptions {
  secretLength?: number;
  headerName?: string;
  queryParamName?: string;
  cookieName?: string;
  prismaClient?: PrismaClient;
}
