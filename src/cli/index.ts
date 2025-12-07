#!/usr/bin/env node

import { Command } from 'commander';
import * as readline from 'readline';
import { CliService } from './cli-service';

const program = new Command();

program.name('nest-api-key').description('CLI tool for managing API keys').version('0.1.3');

async function getDatabaseUrl(): Promise<string | undefined> {
  return process.env.DATABASE_URL;
}

program
  .command('create')
  .description('Create a new API key')
  .option('-n, --name <name>', 'API key name')
  .option('-s, --scopes <scopes>', 'Comma-separated scopes (e.g., read:projects,write:projects)')
  .option('-e, --expires <date>', 'Expiration date (YYYY-MM-DD)')
  .option('-i, --ip <ips>', 'Comma-separated IP whitelist')
  .option('-r, --rate-limit <number>', 'Rate limit max requests', parseInt)
  .option('-w, --window <ms>', 'Rate limit window in milliseconds', parseInt)
  .option('--db-url <url>', 'Database URL (or set DATABASE_URL env var)')
  .action(async (options) => {
    try {
      const dbUrl = options.dbUrl || (await getDatabaseUrl());
      if (!dbUrl) {
        console.error('❌ Error: Database URL is required.');
        console.error('   Set DATABASE_URL environment variable or use --db-url option.');
        process.exit(1);
      }

      const cliService = new CliService({ databaseUrl: dbUrl });
      await cliService.initialize();

      let name = options.name;
      if (!name) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        name = await new Promise<string>((resolve) => {
          rl.question('Enter API key name: ', (answer: string) => {
            rl.close();
            resolve(answer);
          });
        });
      }

      const scopes = options.scopes
        ? options.scopes.split(',').map((s: string) => s.trim())
        : undefined;
      const expiresAt = options.expires ? new Date(options.expires) : undefined;
      const ipWhitelist = options.ip
        ? options.ip.split(',').map((ip: string) => ip.trim())
        : undefined;

      const result = await cliService.createKey({
        name,
        scopes,
        expiresAt,
        ipWhitelist,
        rateLimitMax: options.rateLimit,
        rateLimitWindowMs: options.window,
      });

      console.log('\n✅ API Key created successfully!');
      console.log(`\nID: ${result.id}`);
      console.log(`Name: ${result.name}`);
      console.log(`Token: ${result.token}`);
      console.log(`\n⚠️  IMPORTANT: Store this token securely. It will not be shown again!`);
      if (result.scopes.length > 0) {
        console.log(`Scopes: ${result.scopes.join(', ')}`);
      }
      if (result.expiresAt) {
        console.log(`Expires: ${result.expiresAt.toISOString().split('T')[0]}`);
      }

      await cliService.disconnect();
    } catch (error) {
      console.error(
        '❌ Error creating API key:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all API keys')
  .option('-a, --all', 'Show all keys including revoked')
  .option('--db-url <url>', 'Database URL (or set DATABASE_URL env var)')
  .action(async (options) => {
    try {
      const dbUrl = options.dbUrl || (await getDatabaseUrl());
      if (!dbUrl) {
        console.error('❌ Error: Database URL is required.');
        console.error('   Set DATABASE_URL environment variable or use --db-url option.');
        process.exit(1);
      }

      const cliService = new CliService({ databaseUrl: dbUrl });
      await cliService.initialize();

      const keys = await cliService.listKeys(options.all);

      if (keys.length === 0) {
        console.log('No API keys found.');
      } else {
        console.log(`\nFound ${keys.length} API key(s):\n`);
        keys.forEach((key) => {
          const status = key.revokedAt
            ? '❌ REVOKED'
            : key.expiresAt && key.expiresAt < new Date()
              ? '⏰ EXPIRED'
              : '✅ ACTIVE';
          console.log(`${status} ${key.id}`);
          console.log(`   Name: ${key.name}`);
          if (key.scopes.length > 0) {
            console.log(`   Scopes: ${key.scopes.join(', ')}`);
          }
          console.log(`   Created: ${key.createdAt.toISOString().split('T')[0]}`);
          if (key.expiresAt) {
            console.log(`   Expires: ${key.expiresAt.toISOString().split('T')[0]}`);
          }
          if (key.lastUsedAt) {
            console.log(`   Last used: ${key.lastUsedAt.toISOString().split('T')[0]}`);
          }
          if (key.revokedAt) {
            console.log(`   Revoked: ${key.revokedAt.toISOString().split('T')[0]}`);
          }
          console.log('');
        });
      }

      await cliService.disconnect();
    } catch (error) {
      console.error(
        '❌ Error listing API keys:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

program
  .command('revoke')
  .description('Revoke an API key')
  .argument('<id>', 'API key ID')
  .option('--db-url <url>', 'Database URL (or set DATABASE_URL env var)')
  .action(async (id, options) => {
    try {
      const dbUrl = options.dbUrl || (await getDatabaseUrl());
      if (!dbUrl) {
        console.error('❌ Error: Database URL is required.');
        console.error('   Set DATABASE_URL environment variable or use --db-url option.');
        process.exit(1);
      }

      const cliService = new CliService({ databaseUrl: dbUrl });
      await cliService.initialize();

      const result = await cliService.revokeKey(id);

      console.log(`\n✅ API key revoked successfully!`);
      console.log(`ID: ${result.id}`);
      console.log(`Name: ${result.name}`);
      console.log(`Revoked at: ${result.revokedAt.toISOString()}`);

      await cliService.disconnect();
    } catch (error) {
      console.error(
        '❌ Error revoking API key:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

program
  .command('rotate')
  .description('Rotate an API key (create new key and optionally revoke old one)')
  .argument('<id>', 'API key ID')
  .option('-g, --grace <hours>', 'Grace period in hours before revoking old key', parseInt)
  .option('--revoke-old', 'Immediately revoke old key (no grace period)')
  .option('--db-url <url>', 'Database URL (or set DATABASE_URL env var)')
  .action(async (id, options) => {
    try {
      const dbUrl = options.dbUrl || (await getDatabaseUrl());
      if (!dbUrl) {
        console.error('❌ Error: Database URL is required.');
        console.error('   Set DATABASE_URL environment variable or use --db-url option.');
        process.exit(1);
      }

      const cliService = new CliService({ databaseUrl: dbUrl });
      await cliService.initialize();

      const result = await cliService.rotateKey(id, {
        revokeOldKey: options.revokeOld || false,
        gracePeriodHours: options.grace,
      });

      console.log(`\n✅ API key rotated successfully!`);
      console.log(`\nNew Key:`);
      console.log(`  ID: ${result.id}`);
      console.log(`  Name: ${result.name}`);
      console.log(`  Token: ${result.token}`);
      console.log(`\n⚠️  IMPORTANT: Store this token securely. It will not be shown again!`);
      if (options.revokeOld) {
        console.log(`\nOld key ${id} has been revoked.`);
      } else if (options.grace) {
        console.log(`\nOld key ${id} will be revoked after ${options.grace} hours.`);
      }

      await cliService.disconnect();
    } catch (error) {
      console.error(
        '❌ Error rotating API key:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

program.parse();
