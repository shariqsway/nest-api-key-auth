# nest-api-key-auth

A NestJS module that makes API key–based authentication extremely easy, secure, and configurable.

> **⚠️ Development Status:** This library is currently under active development and is not yet ready for production use. The API may change in future versions.

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

```typescript
import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';

@Module({
  imports: [
    ApiKeyModule.register({
      secretLength: 32, // Optional: length of API key (default: 32)
      headerName: 'x-api-key', // Optional: header name (default: 'x-api-key')
      queryParamName: 'api_key', // Optional: query param name (default: 'api_key')
      cookieName: 'api_key', // Optional: cookie name (default: 'api_key')
      prismaClient: prisma, // Optional: use existing PrismaClient instance
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
✅ Key management (create, find, list, revoke)  
✅ Input validation and error handling  
✅ PrismaClient injection support  
✅ Prisma adapter support  
✅ Comprehensive test suite

## 🔒 Security

- API keys are hashed using bcrypt before storage
- Only the hashed version is stored in the database
- Plaintext token is returned only once during creation
- Keys can be revoked at any time
- Keys can have expiration dates
- Last used timestamp tracking for security monitoring
- Automatic expiration checking on validation

## 📝 API Reference

### ApiKeyService

#### `create(dto: CreateApiKeyDto): Promise<CreateApiKeyResponse>`

Creates a new API key. Returns the plaintext token **only once** - store it securely!

```typescript
const key = await apiKeyService.create({
  name: 'My App',
  scopes: ['read:projects'], // Optional
});

console.log(key.token); // Store this securely!
```

**Throws:**

- `BadRequestException` if name is empty or scopes is invalid

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

## 🗄️ Database Schema

The module uses Prisma and creates an `ApiKey` table with:

- `id`: Unique identifier
- `name`: Human-readable name
- `keyPrefix`: First 8 characters for fast lookup
- `hashedKey`: Bcrypt hashed key
- `scopes`: Array of permission scopes
- `expiresAt`: Expiration timestamp (null if no expiration)
- `revokedAt`: Revocation timestamp (null if active)
- `lastUsedAt`: Last usage timestamp (null if never used)
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

**Important:** After updating the schema, run:

```bash
npx prisma migrate dev --name add_expiration_and_tracking
npx prisma generate
```

## 🔧 Advanced Configuration

### Using Your Own PrismaClient

If you already have a PrismaClient instance, you can inject it to avoid connection pool issues:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

@Module({
  imports: [
    ApiKeyModule.register({
      prismaClient: prisma, // Use existing instance
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
```

## 🚧 Coming Soon

- Additional database adapters (TypeORM, Mongoose)
- Key rotation
- CLI tooling
- Rate limiting hooks
- Usage analytics

## 👤 Author

**Mohammad Shariq**

## 📄 License

MIT

---

**Note:** This library is under active development and is not yet ready for production use. The API may change in future versions. Please report any issues or suggestions.
