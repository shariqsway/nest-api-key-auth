# nest-api-key-auth

[![npm version](https://img.shields.io/npm/v/nest-api-key-auth.svg)](https://www.npmjs.com/package/nest-api-key-auth)
[![npm downloads](https://img.shields.io/npm/dm/nest-api-key-auth.svg)](https://www.npmjs.com/package/nest-api-key-auth)
[![Node.js CI](https://github.com/shariqsway/nest-api-key-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/shariqsway/nest-api-key-auth/actions/workflows/ci.yml)
[![GitHub issues](https://img.shields.io/github/issues/shariqsway/nest-api-key-auth.svg)](https://github.com/shariqsway/nest-api-key-auth/issues)
[![GitHub license](https://img.shields.io/github/license/shariqsway/nest-api-key-auth.svg)](https://github.com/shariqsway/nest-api-key-auth/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

A comprehensive NestJS module for API key-based authentication with built-in security, scopes, and multiple database adapters.

> **Development Status:** This library is **actively being developed** and is **NOT ready for production use**. While many features are implemented, extensive testing, security audits, and performance optimization are still required. The API may change in future versions.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Basic Setup](#basic-setup)
  - [Protect Routes](#protect-routes)
  - [Create API Keys](#create-api-keys)
  - [Use API Keys](#use-api-keys)
- [CLI Tool](#cli-tool)
- [Configuration](#configuration)
  - [Module Options](#module-options)
  - [Adapter Selection](#adapter-selection)
  - [Custom Key Sources](#custom-key-sources)
- [API Reference](#api-reference)
  - [ApiKeyService](#apikeyservice)
  - [Decorators](#decorators)
  - [Exceptions](#exceptions)
- [Database Support](#database-support)
  - [Supported Databases](#supported-databases)
  - [Database Configuration](#database-configuration)
  - [Database Schema](#database-schema)
  - [ORM Setup Guides](#orm-setup-guides)
- [Advanced Features](#advanced-features)
  - [Rate Limiting](#rate-limiting)
  - [Usage Quotas](#usage-quotas)
  - [IP Whitelisting](#ip-whitelisting)
  - [Audit Logging](#audit-logging)
  - [Caching](#caching)
  - [Redis Support](#redis-support)
  - [Usage Analytics](#usage-analytics)
  - [Webhook Notifications](#webhook-notifications)
  - [Bulk Operations](#bulk-operations)
  - [Expiration Monitoring](#expiration-monitoring)
  - [Key Metadata](#key-metadata)
  - [Automated Rotation Policies](#automated-rotation-policies)
  - [Advanced Filtering and Querying](#advanced-filtering-and-querying)
  - [Export/Import Functionality](#exportimport-functionality)
  - [Request Signing (HMAC)](#request-signing-hmac)
  - [Key Templates](#key-templates)
- [Security](#security)
- [Testing](#testing)
- [Logging](#logging)
- [Validation](#validation)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

`nest-api-key-auth` is a comprehensive NestJS module that simplifies API key-based authentication. It provides a complete solution for managing API keys, protecting routes, and enforcing fine-grained permissions through scopes.

**Key Benefits:**

- Zero boilerplate - Get started in minutes
- Database-agnostic - Works with any database through ORM adapters
- Type-safe - Full TypeScript support
- Secure by default - Built-in hashing, validation, and security features
- Highly configurable - Customize every aspect of the authentication flow
- Comprehensive feature set - Rate limiting, quotas, analytics, webhooks, and more

---

## Features

**Core Features:**

- API key creation with secure hashing (bcrypt or argon2)
- Route protection with `@ApiKeyAuth()` decorator
- Scope-based permissions with `@Scopes()` decorator
- Multiple key sources (headers, query params, cookies)
- Key expiration dates and last used tracking
- Key management (create, find, list, revoke, rotate)
- Key rotation with grace period support

**Advanced Features:**

- Rate limiting - Per-key rate limiting with configurable limits
- Usage quotas - Per-key usage limits (daily, monthly, yearly) with automatic reset
- Redis support - Distributed rate limiting and caching with Redis (with in-memory fallback)
- IP whitelisting - Restrict keys to specific IP addresses or CIDR ranges
- Audit logging - Comprehensive request logging for security and compliance (with database storage)
- Caching layer - In-memory or Redis-based caching for improved performance
- Usage analytics - Track API key usage, performance metrics, and request statistics
- Webhook notifications - Real-time notifications for key events (create, revoke, rotate, expire)
- Bulk operations - Create or revoke multiple API keys in a single operation
- Expiration monitoring - Automatic monitoring and notifications for expiring keys
- CLI tool - Command-line interface for managing API keys directly from terminal
- Database audit logging - Store audit logs in database with query and analytics capabilities
- Key metadata - Store custom metadata, tags, owner, environment, and descriptions for better organization
- Automated rotation policies - Schedule and automate API key rotations based on policies
- Advanced filtering - Query API keys by tags, owner, environment, scopes, and more
- Export/Import - Export key configurations and import metadata for backup and migration
- Request signing (HMAC) - Support for HMAC signature verification for enhanced security
- Key templates - Define reusable API key configurations and presets

**Developer Experience:**

- Comprehensive input validation (token format, scope format, configuration)
- Robust error handling with detailed logging
- Multiple ORM support (Prisma, TypeORM, Mongoose, Custom)
- PrismaClient injection support
- Built-in logging mechanism
- Health check functionality
- Comprehensive test suite
- Ready-to-use migration files
- Example implementations

---

## Installation

```bash
npm install nest-api-key-auth @prisma/client
npm install -D prisma
```

**Peer Dependencies:**

- `@nestjs/common` ^10.0.0
- `@nestjs/core` ^10.0.0
- `reflect-metadata` ^0.1.13
- `rxjs` ^7.8.0

**Optional Dependencies:**

- `@prisma/client` ^7.0.0 (for Prisma adapter)
- `typeorm` (for TypeORM adapter)
- `mongoose` (for Mongoose adapter)
- `ioredis` (for Redis support)

---

## Quick Start

### Basic Setup

1. **Initialize Prisma** (if using Prisma adapter):

```bash
npx prisma init
```

2. **Update your `schema.prisma`** to include the API key schema, or run:

```bash
npx prisma migrate dev --name add_api_keys
```

3. **Generate Prisma Client**:

```bash
npx prisma generate
```

4. **Import the Module**:

```typescript
import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';

@Module({
  imports: [
    ApiKeyModule.register({
      adapter: 'prisma', // Optional: 'prisma' is the default
      secretLength: 32,
      headerName: 'x-api-key',
    }),
  ],
})
export class AppModule {}
```

### Protect Routes

```typescript
import { Controller, Get, Post } from '@nestjs/common';
import { ApiKeyAuth, Scopes } from 'nest-api-key-auth';

@Controller('projects')
export class ProjectController {
  @Get()
  @ApiKeyAuth()
  findAll() {
    return [];
  }

  @Get(':id')
  @ApiKeyAuth()
  @Scopes('read:projects')
  findOne() {
    return {};
  }

  @Post()
  @ApiKeyAuth()
  @Scopes('write:projects')
  create() {
    return {};
  }
}
```

### Create API Keys

```typescript
import { Injectable } from '@nestjs/common';
import { ApiKeyService } from 'nest-api-key-auth';

@Injectable()
export class AppService {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async createKey() {
    const result = await this.apiKeyService.create({
      name: 'My App',
      scopes: ['read:projects'], // Optional
      expiresAt: new Date('2025-12-31'), // Optional: key expiration date
    });

    console.log('API Key created:', result.token);
    // Store this token securely - it's only shown once!

    return result;
  }

  async listKeys() {
    const activeKeys = await this.apiKeyService.findAllActive();
    return activeKeys;
  }

  async revokeKey(id: string) {
    return await this.apiKeyService.revoke(id);
  }
}
```

### Use API Keys

API keys can be provided via headers, query parameters, or cookies:

```bash
# Header (recommended)
curl -H "x-api-key: your-api-key-here" http://localhost:3000/projects

# Query parameter
curl "http://localhost:3000/projects?api_key=your-api-key-here"

# Cookie
curl -H "Cookie: api_key=your-api-key-here" http://localhost:3000/projects
```

---

## CLI Tool

The library includes a command-line tool for managing API keys directly from your terminal:

```bash
# Create a new API key
npx nest-api-key create --name "My App" --scopes "read:projects,write:projects"

# List all API keys
npx nest-api-key list

# List including revoked keys
npx nest-api-key list --all

# Revoke an API key
npx nest-api-key revoke <key-id>

# Rotate an API key (create new, optionally revoke old)
npx nest-api-key rotate <key-id> --revoke-old

# Set database URL via environment variable
export DATABASE_URL="postgresql://user:password@localhost:5432/mydb"
npx nest-api-key create --name "My App"

# Or pass database URL directly
npx nest-api-key create --name "My App" --db-url "postgresql://..."
```

**CLI Features:**

- Direct database access (no NestJS app required)
- Create, list, revoke, and rotate API keys
- Support for all key features (scopes, expiration, IP whitelisting, rate limits)
- Works with Prisma adapter (TypeORM and Mongoose support coming soon)

---

## Configuration

### Module Options

```typescript
ApiKeyModule.register({
  // Basic configuration
  secretLength: 32, // Length of generated API keys
  headerName: 'x-api-key', // Header name for API keys
  queryParamName: 'api_key', // Query parameter name
  cookieName: 'api_key', // Cookie name

  // Adapter configuration
  adapter: 'prisma', // 'prisma' | 'typeorm' | 'mongoose' | 'custom'
  prismaClient: prisma, // Optional: use existing PrismaClient instance
  typeOrmRepository: repository, // Required for TypeORM adapter
  mongooseModel: model, // Required for Mongoose adapter
  customAdapter: adapter, // Required for custom adapter

  // Hashing configuration
  hashAlgorithm: 'bcrypt', // 'bcrypt' | 'argon2'
  bcryptRounds: 10, // Only used when hashAlgorithm is 'bcrypt'

  // Feature flags
  enableRateLimiting: true,
  enableAuditLogging: true,
  enableCaching: true,
  enableAnalytics: true,
  enableWebhooks: true,

  // Cache configuration
  cacheTtlMs: 300000, // Cache TTL in milliseconds (default: 5 minutes)

  // Redis configuration
  redisClient: redis, // Optional: Redis client for distributed rate limiting/caching

  // Audit logging configuration
  auditLogOptions: {
    logToConsole: true,
    logToDatabase: false,
    retentionDays: 90,
    onLog: async (entry) => {
      // Custom logging logic
    },
  },

  // Webhook configuration
  webhooks: [
    {
      url: 'https://your-app.com/webhooks/api-keys',
      secret: 'your-webhook-secret',
      events: ['key.created', 'key.revoked', 'key.rotated', 'key.expired'],
      retryAttempts: 3,
      timeout: 5000,
    },
  ],

  // Expiration notification configuration
  expirationNotificationOptions: {
    enabled: true,
    checkIntervalMs: 3600000, // 1 hour
    warningThresholdsDays: [30, 7, 1],
  },
});
```

### Adapter Selection

**Prisma (Default):**

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Module({
  imports: [
    ApiKeyModule.register({
      adapter: 'prisma',
      prismaClient: prisma, // Optional: use existing instance
    }),
  ],
})
export class AppModule {}
```

**TypeORM:**

```typescript
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiKeyEntity } from './entities/api-key.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKeyEntity]),
    ApiKeyModule.register({
      adapter: 'typeorm',
      typeOrmRepository: getRepositoryToken(ApiKeyEntity),
    }),
  ],
})
export class AppModule {}
```

**Mongoose:**

```typescript
import { getModelToken } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'ApiKey', schema: ApiKeySchema }]),
    ApiKeyModule.register({
      adapter: 'mongoose',
      mongooseModel: getModelToken('ApiKey'),
    }),
  ],
})
export class AppModule {}
```

**Custom Adapter:**

```typescript
import { IApiKeyAdapter } from 'nest-api-key-auth';

class MyCustomAdapter implements IApiKeyAdapter {
  // Implement all required methods
}

@Module({
  imports: [
    ApiKeyModule.register({
      adapter: 'custom',
      customAdapter: new MyCustomAdapter(),
    }),
  ],
})
export class AppModule {}
```

### Custom Key Sources

Configure which sources to check for API keys:

```typescript
ApiKeyModule.register({
  headerName: 'x-api-key', // Custom header name
  queryParamName: 'api_key', // Custom query param name
  cookieName: 'api_key', // Custom cookie name
});
```

---

## API Reference

### ApiKeyService

#### `create(dto: CreateApiKeyDto): Promise<CreateApiKeyResponse>`

Creates a new API key. Returns the plaintext token **only once** - store it securely!

```typescript
const key = await apiKeyService.create({
  name: 'My App',
  scopes: ['read:projects'], // Optional
  expiresAt: new Date('2025-12-31'), // Optional: expiration date
  ipWhitelist: ['192.168.1.0/24'], // Optional: IP restrictions
  rateLimitMax: 1000, // Optional: max requests per window
  rateLimitWindowMs: 60000, // Optional: time window in milliseconds
  quotaMax: 10000, // Optional: maximum requests per quota period
  quotaPeriod: 'daily', // Optional: 'daily', 'monthly', or 'yearly'
  metadata: { appVersion: '1.0.0', region: 'us-east-1' }, // Optional: custom metadata
  tags: ['production', 'api-v2'], // Optional: tags for organization
  owner: 'team-backend', // Optional: owner identifier
  environment: 'production', // Optional: 'production', 'staging', or 'development'
  description: 'API key for production mobile app', // Optional: description
});

console.log(key.token); // Store this securely!
```

**Throws:**

- `BadRequestException` if name is empty, scopes are invalid, or IP format is invalid

#### `findById(id: string): Promise<ApiKey>`

Finds an API key by its ID.

```typescript
const key = await apiKeyService.findById('key-id-123');
console.log(key.name, key.scopes);
```

**Throws:**

- `BadRequestException` if id is invalid
- `ApiKeyNotFoundException` if key doesn't exist

#### `findAll(): Promise<ApiKey[]>`

Retrieves all API keys, including revoked ones.

```typescript
const allKeys = await apiKeyService.findAll();
console.log(`Total keys: ${allKeys.length}`);
```

#### `findAllActive(): Promise<ApiKey[]>`

Retrieves only active (non-revoked) API keys.

```typescript
const activeKeys = await apiKeyService.findAllActive();
console.log(`Active keys: ${activeKeys.length}`);
```

#### `revoke(id: string): Promise<ApiKey>`

Revokes an API key by ID. Once revoked, the key can no longer be used.

```typescript
const revokedKey = await apiKeyService.revoke('key-id-123');
console.log(`Revoked at: ${revokedKey.revokedAt}`);
```

**Throws:**

- `BadRequestException` if id is invalid
- `ApiKeyNotFoundException` if key doesn't exist
- `ApiKeyAlreadyRevokedException` if key is already revoked

#### `rotate(oldKeyId: string, options?: RotateOptions): Promise<CreateApiKeyResponse>`

Rotates an API key by creating a new key and optionally revoking the old one.

```typescript
const newKey = await apiKeyService.rotate('old-key-id', {
  revokeOldKey: true,
  gracePeriodHours: 24, // Optional: grace period before revoking old key
});
```

### Decorators

#### `@ApiKeyAuth()`

Protects a route with API key authentication. The validated API key data is attached to `request.apiKey`.

```typescript
@ApiKeyAuth()
@Get()
findAll(@Req() req: Request) {
  console.log(req.apiKey.name); // Access the API key data
  return [];
}
```

#### `@Scopes(...scopes: string[])`

Specifies required scopes for a route. Can be used with `@ApiKeyAuth()` to enforce fine-grained permissions. Multiple scopes are treated as AND (all required).

```typescript
@ApiKeyAuth()
@Scopes('read:projects')
@Get('projects')
getProjects() {
  return [];
}

@ApiKeyAuth()
@Scopes('read:projects', 'write:projects')
@Post('projects')
createProject() {
  return {};
}
```

**Throws:**

- `ForbiddenException` if the API key lacks required scopes

### Exceptions

The library provides custom exceptions for better error handling:

- `ApiKeyNotFoundException` - Thrown when an API key is not found
- `ApiKeyAlreadyRevokedException` - Thrown when trying to revoke an already revoked key

---

## Database Support

The library is **database-agnostic** and works with **any database** through ORM adapters. You configure your database in your ORM, and the library works with it.

### Supported Databases

**Via Prisma Adapter:**

- PostgreSQL
- MySQL
- SQLite
- MongoDB
- SQL Server
- CockroachDB
- And any database Prisma supports

**Via TypeORM Adapter:**

- PostgreSQL
- MySQL
- MariaDB
- SQLite
- SQL Server
- Oracle
- MongoDB (with limitations)
- And any database TypeORM supports

**Via Mongoose Adapter:**

- MongoDB

### Database Configuration

The library doesn't care which database you use - you configure it in your ORM:

**Prisma Example (PostgreSQL):**

```prisma
datasource db {
  provider = "postgresql"
  // DATABASE_URL in .env
}
```

**Prisma Example (MySQL):**

```prisma
datasource db {
  provider = "mysql"
  // DATABASE_URL in .env
}
```

**Prisma Example (MongoDB):**

```prisma
datasource db {
  provider = "mongodb"
  // DATABASE_URL in .env
}
```

See [Database Configuration Examples](./examples/database-configs/) for complete examples for each database.

### Database Schema

The `ApiKey` table/collection contains:

- `id`: Unique identifier
- `name`: Human-readable name
- `keyPrefix`: First 8 characters for fast lookup
- `hashedKey`: Hashed key (bcrypt or argon2, depending on `hashAlgorithm` configuration)
- `scopes`: Array of permission scopes
- `expiresAt`: Expiration timestamp (null if no expiration)
- `revokedAt`: Revocation timestamp (null if active)
- `lastUsedAt`: Last usage timestamp (null if never used)
- `ipWhitelist`: Array of allowed IP addresses
- `rateLimitMax`: Maximum requests per window
- `rateLimitWindowMs`: Rate limit window in milliseconds
- `quotaMax`: Maximum requests allowed within a quota period (null if no quota)
- `quotaPeriod`: Quota period - 'daily', 'monthly', or 'yearly' (null if no quota)
- `quotaUsed`: Number of requests used in current quota period
- `quotaResetAt`: Timestamp when quota resets
- `metadata`: Custom metadata as JSON object (null if none)
- `tags`: Array of tags for organization
- `owner`: Owner identifier (null if none)
- `environment`: Environment - 'production', 'staging', or 'development' (null if none)
- `description`: Description of the API key (null if none)
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

**Important:** After updating the schema, run:

```bash
# For Prisma
npx prisma migrate dev --name add_api_keys
npx prisma generate

# For TypeORM
npm run typeorm migration:run

# For Mongoose
# Schema is automatically created on first use
```

### ORM Setup Guides

**TypeORM Setup:**

1. Create your entity:

```typescript
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('api_keys')
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  keyPrefix: string;

  @Column()
  hashedKey: string;

  @Column('simple-array')
  scopes: string[];

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  revokedAt: Date;

  @Column({ nullable: true })
  lastUsedAt: Date;

  @Column()
  createdAt: Date;

  @Column()
  updatedAt: Date;
}
```

2. Register the module:

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKeyEntity]),
    ApiKeyModule.register({
      adapter: 'typeorm',
      typeOrmRepository: getRepositoryToken(ApiKeyEntity),
    }),
  ],
})
export class AppModule {}
```

**Mongoose Setup:**

1. Create your schema:

```typescript
import { Schema } from 'mongoose';

export const ApiKeySchema = new Schema({
  name: String,
  keyPrefix: String,
  hashedKey: String,
  scopes: [String],
  expiresAt: Date,
  revokedAt: Date,
  lastUsedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
```

2. Register the module:

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'ApiKey', schema: ApiKeySchema }]),
    ApiKeyModule.register({
      adapter: 'mongoose',
      mongooseModel: getModelToken('ApiKey'),
    }),
  ],
})
export class AppModule {}
```

---

## Advanced Features

### Rate Limiting

Per-key rate limiting with configurable limits:

```typescript
const key = await apiKeyService.create({
  name: 'My App',
  rateLimitMax: 1000, // Max requests
  rateLimitWindowMs: 60000, // Per minute
});
```

### IP Whitelisting

Restrict keys to specific IP addresses or CIDR ranges:

```typescript
const key = await apiKeyService.create({
  name: 'My App',
  ipWhitelist: ['192.168.1.0/24', '10.0.0.1'],
});
```

### Audit Logging

Comprehensive request logging for security and compliance:

```typescript
ApiKeyModule.register({
  enableAuditLogging: true,
  auditLogOptions: {
    logToConsole: true,
    logToDatabase: true, // Enable database storage
    retentionDays: 90,
  },
});
```

**Query Audit Logs:**

```typescript
import { AuditLogService, AUDIT_LOG_SERVICE_TOKEN } from 'nest-api-key-auth';

@Injectable()
export class AuditService {
  constructor(@Inject(AUDIT_LOG_SERVICE_TOKEN) private readonly auditLogService: AuditLogService) {}

  async getKeyLogs(keyId: string) {
    return await this.auditLogService.query({ keyId, limit: 100 });
  }

  async getStats() {
    return await this.auditLogService.getStats();
  }
}
```

### Caching

In-memory or Redis-based caching for improved performance:

```typescript
ApiKeyModule.register({
  enableCaching: true,
  cacheTtlMs: 300000, // 5 minutes
});
```

### Redis Support

For distributed systems with multiple instances, use Redis for rate limiting and caching:

**Installation:**

```bash
npm install ioredis
npm install -D @types/ioredis
```

**Configuration:**

```typescript
import Redis from 'ioredis';
import { ApiKeyModule } from 'nest-api-key-auth';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

@Module({
  imports: [
    ApiKeyModule.register({
      redisClient: redis,
      enableRateLimiting: true,
      enableCaching: true,
    }),
  ],
})
export class AppModule {}
```

When `redisClient` is provided, the library automatically uses Redis for:

- **Rate limiting**: Distributed rate limit tracking across all instances
- **Caching**: Shared cache across all instances

If Redis is unavailable, the library automatically falls back to in-memory implementations.

### Usage Quotas

Enforce usage quotas per API key with automatic reset:

```typescript
import { QuotaService, QUOTA_SERVICE_TOKEN } from 'nest-api-key-auth';
import { Inject } from '@nestjs/common';

@Injectable()
export class AppService {
  constructor(@Inject(QUOTA_SERVICE_TOKEN) private readonly quotaService: QuotaService) {}

  async checkQuota(keyId: string) {
    const status = await this.quotaService.getQuotaStatus(keyId);
    if (status && !status.allowed) {
      throw new Error(`Quota exceeded: ${status.used}/${status.limit}`);
    }
  }
}
```

**Create API key with quota:**

```typescript
const key = await apiKeyService.create({
  name: 'Limited API Key',
  quotaMax: 10000, // Maximum requests
  quotaPeriod: 'daily', // Reset daily ('daily', 'monthly', or 'yearly')
});
```

**Enable quota limiting in module:**

```typescript
ApiKeyModule.register({
  enableQuotaLimiting: true,
  // ... other options
});
```

The quota service automatically:

- Tracks usage per API key
- Resets quotas at the end of each period (daily, monthly, yearly)
- Supports Redis for distributed quota tracking
- Falls back to in-memory tracking if Redis is unavailable

### Usage Analytics

Track API key usage and performance metrics:

```typescript
ApiKeyModule.register({
  enableAnalytics: true,
});
```

**Using Analytics Service:**

```typescript
import { AnalyticsService, ANALYTICS_SERVICE_TOKEN } from 'nest-api-key-auth';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    @Inject(ANALYTICS_SERVICE_TOKEN) private readonly analyticsService: AnalyticsService,
  ) {}

  @Get('key/:keyId')
  async getKeyMetrics(@Param('keyId') keyId: string) {
    return await this.analyticsService.getKeyMetrics(keyId);
  }

  @Get('overview')
  async getAnalytics() {
    return await this.analyticsService.getAnalytics();
  }
}
```

**Metrics tracked:**

- Request counts (total, success, failure)
- Response times
- Last used timestamps
- Error rates
- Top performing keys

### Webhook Notifications

Receive real-time notifications for API key events:

**Configuration:**

```typescript
ApiKeyModule.register({
  enableWebhooks: true,
  webhooks: [
    {
      url: 'https://your-app.com/webhooks/api-keys',
      secret: 'your-webhook-secret',
      events: ['key.created', 'key.revoked', 'key.rotated', 'key.expired', 'key.expiring'],
      retryAttempts: 3,
      timeout: 5000,
    },
  ],
});
```

**Supported Events:**

- `key.created` - When a new API key is created
- `key.revoked` - When an API key is revoked
- `key.rotated` - When an API key is rotated
- `key.expired` - When an API key expires
- `key.expiring` - When an API key is about to expire (configurable thresholds)

**Webhook Payload Format:**

```json
{
  "event": "key.created",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "data": {
    "keyId": "key-123",
    "keyName": "My API Key",
    "scopes": ["read:projects"],
    "expiresAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### Bulk Operations

Create or revoke multiple API keys efficiently:

```typescript
import { BulkOperationsService } from 'nest-api-key-auth';

@Injectable()
export class KeyManagementService {
  constructor(private readonly bulkOps: BulkOperationsService) {}

  async createMultipleKeys(names: string[]) {
    const result = await this.bulkOps.bulkCreate(
      names.map((name) => ({ name, scopes: ['read:projects'] })),
    );
    return result;
  }

  async revokeMultipleKeys(keyIds: string[]) {
    const result = await this.bulkOps.bulkRevoke(keyIds);
    return result;
  }
}
```

### Expiration Monitoring

Automatically monitor and notify about expiring API keys:

```typescript
import { ExpirationNotificationService } from 'nest-api-key-auth';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private readonly expirationService: ExpirationNotificationService) {}

  onModuleInit() {
    this.expirationService.startMonitoring();
  }
}
```

The service automatically:

- Checks for expiring keys at configurable intervals (default: 24 hours)
- Sends notifications when keys are about to expire (default: 30, 7, 1 days before)
- Sends notifications when keys have expired
- Integrates with webhook service if enabled

### Usage Quotas

Enforce usage quotas per API key with automatic reset:

```typescript
import { QuotaService } from 'nest-api-key-auth';

@Injectable()
export class AppService {
  constructor(private readonly quotaService: QuotaService) {}

  async checkQuota(keyId: string) {
    const status = await this.quotaService.getQuotaStatus(keyId);
    if (status && !status.allowed) {
      throw new Error(`Quota exceeded: ${status.used}/${status.limit}`);
    }
  }
}
```

**Create API key with quota:**

```typescript
const key = await apiKeyService.create({
  name: 'Limited API Key',
  quotaMax: 10000, // Maximum requests
  quotaPeriod: 'daily', // Reset daily
});
```

### Key Metadata

Store custom metadata and organizational information with API keys:

```typescript
const key = await apiKeyService.create({
  name: 'Production API Key',
  metadata: {
    appVersion: '2.0.0',
    region: 'us-east-1',
    deploymentId: 'deploy-123',
  },
  tags: ['production', 'api-v2', 'mobile'],
  owner: 'team-backend',
  environment: 'production',
  description: 'API key for production mobile application',
});
```

**Query keys by metadata (using adapter directly):**

```typescript
import { IApiKeyAdapter, API_KEY_ADAPTER } from 'nest-api-key-auth';
import { Inject } from '@nestjs/common';

@Injectable()
export class AppService {
  constructor(@Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter) {}

  async queryKeys() {
    const keys = await this.adapter.query({
      tags: ['production'],
      owner: 'team-backend',
      environment: 'production',
    });
    return keys;
  }
}
```

### Automated Rotation Policies

Schedule and automate API key rotations:

```typescript
import { RotationPolicyService } from 'nest-api-key-auth';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private readonly rotationService: RotationPolicyService) {}

  async onModuleInit() {
    // Register a rotation policy
    this.rotationService.registerPolicy({
      id: 'monthly-rotation',
      name: 'Monthly Key Rotation',
      rotationIntervalDays: 30,
      revokeOldKey: true,
      gracePeriodHours: 24,
      enabled: true,
      nextRunAt: new Date(),
    });
  }
}
```

**Policy-based rotation:**

```typescript
// Rotate keys matching specific criteria
this.rotationService.registerPolicy({
  id: 'production-rotation',
  name: 'Production Keys Rotation',
  tags: ['production'],
  owner: 'team-backend',
  rotationIntervalDays: 90,
  revokeOldKey: true,
  enabled: true,
  nextRunAt: new Date(),
});
```

### Advanced Filtering and Querying

Query API keys with advanced filters using the adapter:

```typescript
import { IApiKeyAdapter, API_KEY_ADAPTER } from 'nest-api-key-auth';
import { Inject } from '@nestjs/common';

@Injectable()
export class AppService {
  constructor(@Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter) {}

  async queryKeys() {
    // Query by multiple criteria
    const keys = await this.adapter.query({
      tags: ['production', 'api-v2'],
      owner: 'team-backend',
      environment: 'production',
      scopes: ['read:projects'],
      active: true,
      createdAfter: new Date('2024-01-01'),
      limit: 50,
      offset: 0,
    });
    return keys;
  }
}
```

### Export/Import Functionality

Export and import API key configurations:

```typescript
import { ExportImportService } from 'nest-api-key-auth';

@Injectable()
export class AppService {
  constructor(private readonly exportService: ExportImportService) {}

  async exportKeys() {
    const json = await this.exportService.exportKeys({
      includeRevoked: false,
      format: 'json',
      filters: {
        tags: ['production'],
        environment: 'production',
      },
    });
    // Save to file or send to backup service
    return json;
  }

  async importKeys(jsonData: string) {
    const result = await this.exportService.importKeys(jsonData);
    console.log(`Imported: ${result.success}, Failed: ${result.failed}`);
  }
}
```

### Request Signing (HMAC)

Verify HMAC signatures for enhanced security:

```typescript
import { RequestSigningService } from 'nest-api-key-auth';

@Injectable()
export class AppService {
  constructor(private readonly signingService: RequestSigningService) {}

  verifyRequest(secret: string, payload: string, signature: string, timestamp: number) {
    return this.signingService.verifyRequest(secret, payload, signature, timestamp, {
      algorithm: 'sha256',
      timestampToleranceMs: 300000, // 5 minutes
    });
  }
}
```

**Sign a request:**

```typescript
const signed = this.signingService.signRequest(apiKeyToken, `${method}${path}${body}`, Date.now());
// Include signature and timestamp in headers
headers['x-signature'] = signed.signature;
headers['x-timestamp'] = signed.timestamp.toString();
```

### Key Templates

Define reusable API key configurations:

```typescript
import { KeyTemplateService } from 'nest-api-key-auth';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(
    private readonly templateService: KeyTemplateService,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async onModuleInit() {
    // Register a template
    this.templateService.registerTemplate({
      id: 'production-template',
      name: 'Production API Key Template',
      description: 'Standard production key configuration',
      config: {
        scopes: ['read:projects', 'write:projects'],
        quotaMax: 100000,
        quotaPeriod: 'monthly',
        environment: 'production',
        tags: ['production'],
        rateLimitMax: 1000,
        rateLimitWindowMs: 60000,
      },
    });
  }

  async createFromTemplate(name: string) {
    const dto = this.templateService.createFromTemplate('production-template', name, {
      owner: 'team-backend', // Override template value
    });
    return await this.apiKeyService.create(dto);
  }
}
```

---

## Security

**Hashing:**

- API keys are hashed using bcrypt (default) or argon2 before storage
- Choose your preferred hashing algorithm: `hashAlgorithm: 'bcrypt'` or `hashAlgorithm: 'argon2'`
- Argon2 is recommended for new projects (winner of Password Hashing Competition)
- Only the hashed version is stored in the database
- Plaintext token is returned only once during creation

**Key Management:**

- Keys can be revoked at any time
- Keys can have expiration dates
- Last used timestamp tracking for security monitoring
- Automatic expiration checking on validation

**Validation:**

- Token format validation (hexadecimal only)
- Scope format validation (resource:action pattern)
- Configuration validation at module initialization

**Security Features:**

- Rate limiting - Prevent abuse with per-key rate limits
- IP whitelisting - Restrict access to specific IP addresses
- Audit logging - Track all API key usage for security monitoring

---

## Testing

The library includes a comprehensive test suite. Run tests with:

```bash
npm test
npm run test:watch
npm run test:cov
npm run test:integration  # Integration tests
```

### HealthService

#### `checkHealth(): Promise<HealthStatus>`

Performs a health check on the adapter and database connection.

```typescript
const health = await healthService.checkHealth();
console.log(health.status); // 'healthy' or 'unhealthy'
console.log(health.adapter.status); // 'connected' or 'disconnected'
```

#### `isHealthy(): Promise<boolean>`

Quick health check that returns a boolean.

```typescript
if (await healthService.isHealthy()) {
  console.log('System is healthy');
}
```

---

## Logging

The library includes built-in logging for debugging and monitoring. Logs are automatically generated for:

- API key creation, revocation, and validation
- Database connection issues
- Invalid token/scope attempts
- Configuration errors

Logs use NestJS's Logger by default, but you can provide a custom logger:

```typescript
import { Logger } from '@nestjs/common';
import { ApiKeyLogger } from 'nest-api-key-auth';

const logger = new Logger('MyApp');
ApiKeyLogger.setLogger(logger);
```

---

## Validation

### Token Format

Tokens must be hexadecimal strings (0-9, a-f). Invalid formats are rejected early.

### Scope Format

Scopes must follow the `resource:action` pattern:

- Valid: `read:projects`, `write:users`, `admin:*`
- Invalid: `read`, `read-projects`, `read/projects`

### Configuration

Module options are validated at startup:

- `secretLength`: Must be between 8 and 128
- `headerName`, `queryParamName`, `cookieName`: Must be non-empty strings

---

## Documentation

Additional documentation and examples:

- [Migration Guide](./MIGRATION_GUIDE.md) - Migrate existing databases to support new features
- [Database Configuration Examples](./examples/database-configs/) - Examples for PostgreSQL, MySQL, SQLite, MongoDB, etc.
- [Code Examples](./examples/) - Code examples for all features
- [Advanced Features Examples](./examples/advanced-features/) - Rate limiting, IP whitelisting, audit logging, caching
- [Database Setup Examples](./examples/database-setup/) - PostgreSQL, MySQL, SQLite, MongoDB setup examples

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## License

MIT

---

**Author:** Mohammad Shariq
