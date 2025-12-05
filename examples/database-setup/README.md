# Database Setup Examples

This directory contains database-specific setup examples for different database providers.

## Supported Databases

### SQL Databases (via Prisma or TypeORM)

- **PostgreSQL** - `postgresql.prisma.example`
- **MySQL** - `mysql.prisma.example`
- **SQLite** - `sqlite.prisma.example`
- **SQL Server** - Similar to PostgreSQL, change provider to `sqlserver`
- **MariaDB** - Similar to MySQL, use TypeORM adapter

### NoSQL Databases

- **MongoDB** - Use Prisma with `provider = "mongodb"` or use Mongoose adapter

## Usage

1. Copy the example file for your database
2. Rename it to `schema.prisma` (for Prisma) or configure your TypeORM/Mongoose setup
3. Update the connection string in your `.env` file:

```env
# PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"

# MySQL
DATABASE_URL="mysql://user:password@localhost:3306/mydb"

# SQLite
DATABASE_URL="file:./dev.db"

# MongoDB (Prisma)
DATABASE_URL="mongodb://user:password@localhost:27017/mydb"

# MongoDB (Mongoose)
MONGODB_URI="mongodb://user:password@localhost:27017/mydb"
```

4. Run migrations:

```bash
# Prisma
npx prisma migrate dev
npx prisma generate

# TypeORM
npm run typeorm migration:run

# Mongoose
# Schema is created automatically
```

## Database-Specific Notes

### PostgreSQL
- Full support for arrays
- Best performance for complex queries
- Recommended for production

### MySQL
- Arrays stored as JSON strings
- Good performance
- Widely supported

### SQLite
- Arrays stored as JSON strings
- Perfect for development and small applications
- No server required

### MongoDB
- Native array support
- Use Prisma or Mongoose adapter
- Great for document-based storage

## See Also

- [Main README](../../README.md)
- [Migration Guide](../../MIGRATION_GUIDE.md)
- [Basic Usage Examples](../basic-usage/)

