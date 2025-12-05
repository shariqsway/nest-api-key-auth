import { Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyAuth, Scopes } from 'nest-api-key-auth';

@Controller('projects')
export class ProjectsController {
  @Get()
  @ApiKeyAuth()
  findAll(@Req() req: Request) {
    return {
      message: 'All projects',
      apiKey: req.apiKey?.name,
    };
  }

  @Get(':id')
  @ApiKeyAuth()
  @Scopes('read:projects')
  findOne(@Req() req: Request) {
    return {
      message: 'Project details',
      apiKey: req.apiKey?.name,
    };
  }

  @Post()
  @ApiKeyAuth()
  @Scopes('write:projects')
  create(@Req() req: Request) {
    return {
      message: 'Project created',
      apiKey: req.apiKey?.name,
    };
  }
}

