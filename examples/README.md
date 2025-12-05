# Examples

This directory contains example implementations for different use cases.

## Basic Usage

See `basic-usage/` for a simple example of:
- Setting up the module
- Creating API keys
- Protecting routes
- Using scopes

## TypeORM Usage

See `typeorm-usage/` for:
- TypeORM entity definition
- Module configuration with TypeORM

## Mongoose Usage

See `mongoose-usage/` for:
- Mongoose schema definition
- Module configuration with Mongoose

## Database Setup

See `database-setup/` for:
- PostgreSQL setup example
- MySQL setup example
- SQLite setup example
- MongoDB setup examples
- Database-specific configuration notes

## Running Examples

1. Install dependencies:
```bash
npm install
```

2. Set up your database and configure `DATABASE_URL` in `.env`

3. Run migrations:
```bash
npx prisma migrate dev
# or
# TypeORM/Mongoose migrations as per your setup
```

4. Start the application:
```bash
npm run start:dev
```

