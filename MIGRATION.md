# Database Migration Guide

## Prisma Migration

After installing the package, you need to add the API key schema to your Prisma schema and run migrations.

### Option 1: Add to Existing Schema

Add this model to your existing `schema.prisma`:

```prisma
model ApiKey {
  id        String   @id @default(cuid())
  name      String
  keyPrefix String
  hashedKey String
  scopes    String[]
  revokedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([keyPrefix, hashedKey])
  @@index([keyPrefix])
  @@map("api_keys")
}
```

Then run:
```bash
npx prisma migrate dev --name add_api_keys
npx prisma generate
```

### Option 2: Use the Provided Schema

If you're starting fresh, you can use the schema provided in `prisma/schema.prisma` and customize it for your database provider.

## Database Providers

The schema uses PostgreSQL by default. To use a different provider, update the `datasource` in your `schema.prisma`:

```prisma
datasource db {
  provider = "mysql" // or "sqlite", "sqlserver", "mongodb"
  // URL is provided via DATABASE_URL environment variable (Prisma 7 requirement)
}
```

**Important for Prisma 7+**: The `url` field is no longer allowed in the schema file. You must provide the database URL via the `DATABASE_URL` environment variable in your `.env` file.

Note: For MongoDB, the schema syntax is slightly different. You may need to adjust the model definition.

