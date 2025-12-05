# Migration Guide

This guide helps you migrate your existing database schema to support the new features: IP whitelisting, rate limiting, and audit logging.

## Prisma Migration

### Step 1: Update Your Schema

Add the new fields to your `prisma/schema.prisma`:

```prisma
model ApiKey {
  id               String   @id @default(cuid())
  name             String
  keyPrefix        String
  hashedKey        String
  scopes           String[] @default([])
  expiresAt        DateTime?
  revokedAt        DateTime?
  lastUsedAt       DateTime?
  ipWhitelist      String[] @default([])      // NEW
  rateLimitMax     Int?                       // NEW
  rateLimitWindowMs Int?                      // NEW
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([keyPrefix, hashedKey])
  @@index([keyPrefix])
  @@index([expiresAt])
  @@map("api_keys")
}
```

### Step 2: Create Migration

```bash
npx prisma migrate dev --name add_rate_limiting_and_ip_restrictions
```

### Step 3: Generate Prisma Client

```bash
npx prisma generate
```

## TypeORM Migration

### Step 1: Update Your Entity

```typescript
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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

  // NEW FIELDS
  @Column('simple-array', { nullable: true, default: '' })
  ipWhitelist: string[];

  @Column({ nullable: true })
  rateLimitMax: number;

  @Column({ nullable: true })
  rateLimitWindowMs: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Step 2: Create Migration

```bash
npm run typeorm migration:generate -- -n AddRateLimitingAndIpRestrictions
npm run typeorm migration:run
```

Or manually create a migration:

```typescript
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRateLimitingAndIpRestrictions1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'api_keys',
      new TableColumn({
        name: 'ipWhitelist',
        type: 'text',
        isArray: true,
        isNullable: true,
        default: "'{}'",
      }),
    );

    await queryRunner.addColumn(
      'api_keys',
      new TableColumn({
        name: 'rateLimitMax',
        type: 'int',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'api_keys',
      new TableColumn({
        name: 'rateLimitWindowMs',
        type: 'int',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('api_keys', 'ipWhitelist');
    await queryRunner.dropColumn('api_keys', 'rateLimitMax');
    await queryRunner.dropColumn('api_keys', 'rateLimitWindowMs');
  }
}
```

## Mongoose Migration

### Step 1: Update Your Schema

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'api_keys' })
export class ApiKey {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  keyPrefix: string;

  @Prop({ required: true })
  hashedKey: string;

  @Prop({ type: [String], default: [] })
  scopes: string[];

  @Prop({ required: false })
  expiresAt: Date;

  @Prop({ required: false })
  revokedAt: Date;

  @Prop({ required: false })
  lastUsedAt: Date;

  // NEW FIELDS
  @Prop({ type: [String], default: [] })
  ipWhitelist: string[];

  @Prop({ required: false })
  rateLimitMax: number;

  @Prop({ required: false })
  rateLimitWindowMs: number;
}

export const ApiKeySchema = SchemaFactory.createForClass(ApiKey);
```

### Step 2: Run Migration Script

Create a migration script:

```typescript
import { connect, model, Schema } from 'mongoose';

async function migrate() {
  await connect(process.env.DATABASE_URL);

  const ApiKeySchema = new Schema({}, { strict: false });
  const ApiKey = model('ApiKey', ApiKeySchema);

  await ApiKey.updateMany(
    {},
    {
      $set: {
        ipWhitelist: [],
        rateLimitMax: null,
        rateLimitWindowMs: null,
      },
    },
  );

  console.log('Migration completed');
  process.exit(0);
}

migrate();
```

Run it:

```bash
npx ts-node migrate.ts
```

## Backward Compatibility

All new fields are optional and have default values:
- `ipWhitelist`: Defaults to empty array (no restrictions)
- `rateLimitMax`: Defaults to `null` (uses module default)
- `rateLimitWindowMs`: Defaults to `null` (uses module default)

Existing API keys will continue to work without modification. The new features are opt-in.

## Testing After Migration

1. Verify existing keys still work:
```typescript
const keys = await apiKeyService.findAll();
console.log('All keys:', keys.length);
```

2. Test new features:
```typescript
const newKey = await apiKeyService.create({
  name: 'Test Key',
  ipWhitelist: ['192.168.1.1'],
  rateLimitMax: 100,
});
```

3. Check database:
```bash
# Prisma
npx prisma studio

# Or query directly
SELECT * FROM api_keys LIMIT 1;
```

## Rollback

If you need to rollback:

### Prisma
```bash
npx prisma migrate reset
# Or
npx prisma migrate resolve --rolled-back <migration_name>
```

### TypeORM
```bash
npm run typeorm migration:revert
```

### Mongoose
Run a reverse migration script to remove the fields.

