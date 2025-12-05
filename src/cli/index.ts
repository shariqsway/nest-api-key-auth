#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const { Command } = require('commander');
const readline = require('readline');

const program = new Command();

program.name('nest-api-key').description('CLI tool for managing API keys').version('0.1.0');

program
  .command('create')
  .description('Create a new API key')
  .option('-n, --name <name>', 'API key name')
  .option('-s, --scopes <scopes>', 'Comma-separated scopes (e.g., read:projects,write:projects)')
  .option('-e, --expires <date>', 'Expiration date (YYYY-MM-DD)')
  .option('-i, --ip <ips>', 'Comma-separated IP whitelist')
  .option('-r, --rate-limit <number>', 'Rate limit max requests')
  .option('-w, --window <ms>', 'Rate limit window in milliseconds')
  .action(async (options) => {
    console.log('Creating API key...');
    console.log('Options:', options);

    if (!options.name) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const name = await new Promise<string>((resolve) => {
        rl.question('Enter API key name: ', (answer: string) => {
          rl.close();
          resolve(answer);
        });
      });

      options.name = name;
    }

    console.log('\n⚠️  Note: This CLI tool requires a running NestJS application.');
    console.log('For now, use the ApiKeyService in your application code.');
    console.log('\nExample:');
    console.log(`
import { ApiKeyService } from 'nest-api-key-auth';

const key = await apiKeyService.create({
  name: '${options.name}',
  ${
    options.scopes
      ? `scopes: [${options.scopes
          .split(',')
          .map((s: string) => `'${s.trim()}'`)
          .join(', ')}],`
      : ''
  }
  ${options.expires ? `expiresAt: new Date('${options.expires}'),` : ''}
  ${
    options.ip
      ? `ipWhitelist: [${options.ip
          .split(',')
          .map((ip: string) => `'${ip.trim()}'`)
          .join(', ')}],`
      : ''
  }
  ${options.rateLimit ? `rateLimitMax: ${options.rateLimit},` : ''}
  ${options.window ? `rateLimitWindowMs: ${options.window},` : ''}
});

console.log('API Key:', key.token);
    `);
  });

program
  .command('list')
  .description('List all API keys')
  .option('-a, --all', 'Show all keys including revoked')
  .action((options) => {
    console.log('Listing API keys...');
    console.log('Options:', options);
    console.log('\n⚠️  Note: This CLI tool requires a running NestJS application.');
    console.log('Use ApiKeyService.findAll() or ApiKeyService.findAllActive() in your code.');
  });

program
  .command('revoke')
  .description('Revoke an API key')
  .argument('<id>', 'API key ID')
  .action((id) => {
    console.log(`Revoking API key: ${id}`);
    console.log('\n⚠️  Note: This CLI tool requires a running NestJS application.');
    console.log(`Use apiKeyService.revoke('${id}') in your code.`);
  });

program
  .command('rotate')
  .description('Rotate an API key')
  .argument('<id>', 'API key ID')
  .option('-g, --grace <hours>', 'Grace period in hours')
  .action((id, options) => {
    console.log(`Rotating API key: ${id}`);
    console.log('Options:', options);
    console.log('\n⚠️  Note: This CLI tool requires a running NestJS application.');
    console.log(
      `Use apiKeyService.rotate('${id}', { revokeOldKey: true, gracePeriodHours: ${options.grace || 24} }) in your code.`,
    );
  });

program.parse();
