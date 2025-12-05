# Database Configuration Examples

This directory contains example configurations for different database providers.

## Supported Databases

The library works with **any database** through ORM adapters. You just need to configure your ORM with your chosen database.

### Via Prisma

Prisma supports:
- **PostgreSQL** - `postgresql.prisma.example`
- **MySQL** - `mysql.prisma.example`
- **SQLite** - `sqlite.prisma.example`
- **SQL Server** - Similar to PostgreSQL
- **MongoDB** - `mongodb.prisma.example`
- **CockroachDB** - Similar to PostgreSQL

### Via TypeORM

TypeORM supports:
- **PostgreSQL**
- **MySQL**
- **MariaDB**
- **SQLite**
- **SQL Server**
- **Oracle**
- **MongoDB** (with limitations)
- And more...

### Via Mongoose

Mongoose is specifically for **MongoDB**.

## Usage

1. Copy the example file for your database
2. Update the `provider` in the `datasource` block
3. Set `DATABASE_URL` in your `.env` file
4. Run migrations

## Database URL Examples

### PostgreSQL
```
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
```

### MySQL
```
DATABASE_URL="mysql://user:password@localhost:3306/mydb"
```

### SQLite
```
DATABASE_URL="file:./dev.db"
```

### MongoDB (Prisma)
```
DATABASE_URL="mongodb://user:password@localhost:27017/mydb"
```

### MongoDB (Mongoose)
```
DATABASE_URL="mongodb://user:password@localhost:27017/mydb"
```

## Important Notes

1. **Prisma 7+**: The `url` field is no longer allowed in the schema file. You must provide the database URL via the `DATABASE_URL` environment variable.

2. **Array Fields**: Some databases handle arrays differently:
   - PostgreSQL: Native array support
   - MySQL: Uses JSON type
   - SQLite: Uses JSON type
   - MongoDB: Native array support

3. **ID Generation**: 
   - SQL databases: Use `@default(cuid())` or `@default(uuid())`
   - MongoDB: Use `@default(auto()) @map("_id") @db.ObjectId`

4. **Migrations**: After configuring your database, run:
   ```bash
   # Prisma
   npx prisma migrate dev --name init
   npx prisma generate
   
   # TypeORM
   npm run typeorm migration:run
   ```

