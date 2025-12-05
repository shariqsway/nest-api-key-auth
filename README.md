# nest-api-key-auth

[![npm version](https://img.shields.io/npm/v/nest-api-key-auth.svg)](https://www.npmjs.com/package/nest-api-key-auth)
[![npm downloads](https://img.shields.io/npm/dm/nest-api-key-auth.svg)](https://www.npmjs.com/package/nest-api-key-auth)
[![Node.js CI](https://github.com/shariqsway/nest-api-key-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/shariqsway/nest-api-key-auth/actions/workflows/ci.yml)
[![GitHub issues](https://img.shields.io/github/issues/shariqsway/nest-api-key-auth.svg)](https://github.com/shariqsway/nest-api-key-auth/issues)
[![GitHub license](https://img.shields.io/github/license/shariqsway/nest-api-key-auth.svg)](https://github.com/shariqsway/nest-api-key-auth/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

A NestJS module that makes API key–based authentication extremely easy, secure, and configurable.

> **⚠️ Development Status:** This library is currently under active development and is not yet ready for production use. The API may change in future versions.

## 📚 Documentation

- [Quick Start](#-quick-start) - Get started in minutes
- [Migration Guide](./MIGRATION_GUIDE.md) - Migrate existing databases to support new features
- [Database Configuration](./examples/database-configs/) - Examples for PostgreSQL, MySQL, SQLite, MongoDB, etc.
- [Examples](./examples/) - Code examples for all features
- [Advanced Features Examples](./examples/advanced-features/) - Rate limiting, IP whitelisting, audit logging, caching
- [Database Setup Examples](./examples/database-setup/) - PostgreSQL, MySQL, SQLite, MongoDB setup examples

## 🚀 Quick Start

### Installation

```bash
npm install nest-api-key-auth @prisma/client
npm install -D prisma
```

### Setup Prisma

1. Initialize Prisma (if not already done):

```bash
npx prisma init
```

2. Update your `schema.prisma` to include the API key schema, or run:

```bash
npx prisma migrate dev --name add_api_keys
```

3. Generate Prisma Client:

```bash
npx prisma generate
```

### Usage

#### 1. Import the Module

**Using Prisma (default):**

```typescript
import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';

@Module({
  imports: [
    ApiKeyModule.register({
      adapter: 'prisma', // Optional: 'prisma' is the default
      secretLength: 32,
      headerName: 'x-api-key',
      prismaClient: prisma, // Optional: use existing PrismaClient instance
      hashAlgorithm: 'argon2', // Optional: 'bcrypt' (default) or 'argon2'
      bcryptRounds: 10, // Optional: only used when hashAlgorithm is 'bcrypt'
      enableRateLimiting: true, // Optional: enable rate limiting (default: true)
      enableAuditLogging: true, // Optional: enable audit logging (default: true)
      enableCaching: true, // Optional: enable caching (default: true)
      cacheTtlMs: 300000, // Optional: cache TTL in milliseconds (default: 5 minutes)
      auditLogOptions: {
        logToConsole: true,
        logToDatabase: false,
        onLog: async (entry) => {
          // Custom logging logic
          console.log('Audit log:', entry);
        },
      },
    }),
  ],
})
export class AppModule {}
```

**Using TypeORM:**

```typescript
import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiKeyEntity } from './entities/api-key.entity';

@Module({
  imports: [
    ApiKeyModule.register({
      adapter: 'typeorm',
      typeOrmRepository: getRepositoryToken(ApiKeyEntity), // Your TypeORM repository
      secretLength: 32,
    }),
  ],
})
export class AppModule {}
```

**Using Mongoose:**

```typescript
import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';
import { getModelToken } from '@nestjs/mongoose';
import { ApiKeySchema } from './schemas/api-key.schema';

@Module({
  imports: [
    ApiKeyModule.register({
      adapter: 'mongoose',
      mongooseModel: getModelToken('ApiKey'), // Your Mongoose model
      secretLength: 32,
    }),
  ],
})
export class AppModule {}
```

**Using Custom Adapter:**

```typescript
import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';
import { IApiKeyAdapter } from 'nest-api-key-auth';

class MyCustomAdapter implements IApiKeyAdapter {
  // Implement all required methods
}

@Module({
  imports: [
    ApiKeyModule.register({
      adapter: 'custom',
      customAdapter: new MyCustomAdapter(),
      secretLength: 32,
    }),
  ],
})
export class AppModule {}
```

#### 2. Protect Your Routes

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

#### 3. Create and Manage API Keys

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
    // ⚠️ Store this token securely - it's only shown once!

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

#### 4. Use the API Key

API keys can be provided via headers, query parameters, or cookies:

```bash
# Header (recommended)
curl -H "x-api-key: your-api-key-here" http://localhost:3000/projects

# Query parameter
curl "http://localhost:3000/projects?api_key=your-api-key-here"

# Cookie
curl -H "Cookie: api_key=your-api-key-here" http://localhost:3000/projects
```

## 📋 Features

✅ API key creation with secure hashing  
✅ Route protection with `@ApiKeyAuth()` decorator  
✅ Scope-based permissions with `@Scopes()` decorator  
✅ Multiple key sources (headers, query params, cookies)  
✅ Key expiration dates  
✅ Last used timestamp tracking  
✅ Key management (create, find, list, revoke, rotate)  
✅ Key rotation with grace period support  
✅ **Rate limiting** - Per-key rate limiting with configurable limits  
✅ **IP whitelisting** - Restrict keys to specific IP addresses or CIDR ranges  
✅ **Audit logging** - Comprehensive request logging for security and compliance  
✅ **Caching layer** - In-memory caching for improved performance  
✅ Comprehensive input validation (token format, scope format, configuration)  
✅ Robust error handling with detailed logging  
✅ Multiple ORM support (Prisma, TypeORM, Mongoose, Custom)  
✅ PrismaClient injection support  
✅ Built-in logging mechanism  
✅ Health check functionality  
✅ Comprehensive test suite  
✅ Ready-to-use migration files  
✅ Example implementations

## 🔒 Security

- API keys are hashed using bcrypt (default) or argon2 before storage
- Choose your preferred hashing algorithm: `hashAlgorithm: 'bcrypt'` or `hashAlgorithm: 'argon2'`
- Argon2 is recommended for new projects (winner of Password Hashing Competition)
- Only the hashed version is stored in the database
- Plaintext token is returned only once during creation
- Keys can be revoked at any time
- Keys can have expiration dates
- Last used timestamp tracking for security monitoring
- Automatic expiration checking on validation
- Token format validation (hexadecimal only)
- Scope format validation (resource:action pattern)
- Configuration validation at module initialization
- **Rate limiting** - Prevent abuse with per-key rate limits
- **IP whitelisting** - Restrict access to specific IP addresses
- **Audit logging** - Track all API key usage for security monitoring

## 📝 API Reference

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

### Decorators

#### `@ApiKeyAuth()`

Protects a route with API key authentication. The validated API key data is attached to `request.apiKey`.
Automatically applies both `ApiKeyGuard` and `ScopesGuard` for scope checking.

```typescript
@ApiKeyAuth()
@Get()
findAll(@Req() req: Request) {
  console.log(req.apiKey.name); // Access the API key data
  return [];
}
```

#### `@Scopes(...scopes: string[])`

Specifies required scopes for a route. Can be used with `@ApiKeyAuth()` to enforce fine-grained permissions.
Multiple scopes are treated as AND (all required).

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

## 🗄️ Database Support

The library is **database-agnostic** and works with **any database** through ORM adapters. You configure your database in your ORM, and the library works with it.

### Supported Databases

#### Via Prisma Adapter
- **PostgreSQL** ✅
- **MySQL** ✅
- **SQLite** ✅
- **MongoDB** ✅
- **SQL Server** ✅
- **CockroachDB** ✅
- And any database Prisma supports

#### Via TypeORM Adapter
- **PostgreSQL** ✅
- **MySQL** ✅
- **MariaDB** ✅
- **SQLite** ✅
- **SQL Server** ✅
- **Oracle** ✅
- **MongoDB** ✅ (with limitations)
- And any database TypeORM supports

#### Via Mongoose Adapter
- **MongoDB** ✅

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

### Schema Structure

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

## 🔧 Advanced Configuration

### Multiple Database Support

The library supports **multiple databases** through ORM adapters. You can use any database that your chosen ORM supports:

#### Prisma Adapter (Default)
Supports:
- **PostgreSQL** ✅
- **MySQL** ✅
- **SQLite** ✅
- **SQL Server** ✅
- **MongoDB** ✅
- **CockroachDB** ✅
- **PlanetScale** ✅

Just change the `provider` in your `schema.prisma`:
```prisma
datasource db {
  provider = "postgresql" // or "mysql", "sqlite", "mongodb", etc.
}
```

#### TypeORM Adapter
Supports:
- **PostgreSQL** ✅
- **MySQL** ✅
- **MariaDB** ✅
- **SQLite** ✅
- **SQL Server** ✅
- **Oracle** ✅
- **CockroachDB** ✅

Configure in your TypeORM connection options.

#### Mongoose Adapter
Supports:
- **MongoDB** ✅

Perfect for MongoDB-only applications.

### Multiple ORM Support

The library supports multiple ORMs through adapters:

- **Prisma** (default) - Most popular, type-safe ORM, supports 7+ databases
- **TypeORM** - Mature ORM with decorators, supports 6+ SQL databases
- **Mongoose** - MongoDB ODM
- **Custom** - Implement your own adapter for any database

### Using Your Own PrismaClient

If you already have a PrismaClient instance, you can inject it to avoid connection pool issues:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Module({
  imports: [
    ApiKeyModule.register({
      adapter: 'prisma',
      prismaClient: prisma, // Use existing instance
    }),
  ],
})
export class AppModule {}
```

### TypeORM Setup

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

### Mongoose Setup

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

### Custom Key Sources

Configure which sources to check for API keys:

```typescript
ApiKeyModule.register({
  headerName: 'x-api-key', // Custom header name
  queryParamName: 'api_key', // Custom query param name
  cookieName: 'api_key', // Custom cookie name
});
```

## 🧪 Testing

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

## 📊 Logging

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

## ✅ Validation

### Token Format
Tokens must be hexadecimal strings (0-9, a-f). Invalid formats are rejected early.

### Scope Format
Scopes must follow the `resource:action` pattern:
- ✅ Valid: `read:projects`, `write:users`, `admin:*`
- ❌ Invalid: `read`, `read-projects`, `read/projects`

### Configuration
Module options are validated at startup:
- `secretLength`: Must be between 8 and 128
- `headerName`, `queryParamName`, `cookieName`: Must be non-empty strings

## 🛠️ CLI Tooling

The library includes a CLI tool for managing API keys (requires a running NestJS application):

```bash
# Create a new API key
npx nest-api-key create --name "My App" --scopes "read:projects,write:projects"

# List all API keys
npx nest-api-key list

# Revoke an API key
npx nest-api-key revoke <key-id>

# Rotate an API key
npx nest-api-key rotate <key-id> --grace 24
```

**Note:** The CLI tool currently provides guidance and code examples. Full implementation requires integration with your NestJS application's ApiKeyService.

## 🚧 Coming Soon

- Redis-based rate limiting and caching for distributed systems
- Usage analytics dashboard
- Webhook notifications for key events

## 👤 Author

**Mohammad Shariq**

## 📄 License

MIT

---

**Note:** This library is under active development and is not yet ready for production use. The API may change in future versions. Please report any issues or suggestions.
