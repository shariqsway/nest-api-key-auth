import { Module } from '@nestjs/common';
import { Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyModule, ApiKeyService, ApiKeyAuth, Scopes } from 'nest-api-key-auth';

/**
 * Complete Example: All Features Combined
 *
 * This example shows how to use all features together:
 * - Rate limiting
 * - IP whitelisting
 * - Audit logging
 * - Caching
 */

@Module({
  imports: [
    ApiKeyModule.register({
      secretLength: 32,
      headerName: 'x-api-key',
      enableRateLimiting: true,
      enableAuditLogging: true,
      enableCaching: true,
      cacheTtlMs: 300000, // 5 minutes
      auditLogOptions: {
        logToConsole: true,
        onLog: async (entry) => {
          // Custom audit logging
          if (!entry.success) {
            console.error('Failed request:', entry);
          }
        },
      },
    }),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class CompleteExampleModule {}

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiKeyAuth()
  @Scopes('read:projects')
  findAll(@Req() req: Request) {
    return this.projectsService.findAll(req.apiKey);
  }

  @Post()
  @ApiKeyAuth()
  @Scopes('write:projects')
  create(@Req() req: Request) {
    return this.projectsService.create(req.apiKey);
  }
}

@Injectable()
export class ProjectsService {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async findAll(apiKey: any) {
    console.log('Request from:', apiKey.name);
    return [];
  }

  async create(apiKey: any) {
    console.log('Create request from:', apiKey.name);
    return { id: '123' };
  }

  /**
   * Create a production-ready API key with all security features
   */
  async createProductionKey() {
    return await this.apiKeyService.create({
      name: 'Production API Client',
      scopes: ['read:projects', 'write:projects'],
      expiresAt: new Date('2025-12-31'),
      ipWhitelist: ['192.168.1.0/24'], // Office network
      rateLimitMax: 1000, // 1000 requests
      rateLimitWindowMs: 60000, // per minute
    });
  }

  /**
   * Create a development key with relaxed restrictions
   */
  async createDevelopmentKey() {
    return await this.apiKeyService.create({
      name: 'Development API Client',
      scopes: ['read:projects', 'write:projects'],
      // No IP restrictions for development
      // No rate limiting for development
    });
  }
}

