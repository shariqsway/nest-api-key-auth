import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyService } from '../services/api-key.service';
import { ApiKeyModuleOptions } from '../interfaces';
import { ApiKeyLogger } from '../utils/logger.util';
import { extractClientIp } from '../utils/ip.util';
import { isIpAllowed, isIpBlocked } from '../utils/ip.util';

// Optional GraphQL support - only works if @nestjs/graphql is installed
interface GraphQLContext {
  req: {
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[] | undefined>;
    cookies?: Record<string, string>;
    apiKey?: unknown;
    graphqlInfo?: unknown;
  };
}

interface GraphQLInfo {
  fieldName?: string;
  parentType?: { name?: string };
  [key: string]: unknown;
}

let GqlExecutionContext:
  | {
      create(context: ExecutionContext): {
        getContext(): GraphQLContext;
        getInfo(): GraphQLInfo;
      };
    }
  | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const graphql = require('@nestjs/graphql');
  GqlExecutionContext = graphql.GqlExecutionContext;
} catch {
  // GraphQL not available - will throw error if used
}

/**
 * GraphQL guard for API key authentication.
 * Works with GraphQL resolvers and attaches API key data to the context.
 * Requires @nestjs/graphql to be installed.
 */
@Injectable()
export class GraphQLApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly options: ApiKeyModuleOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!GqlExecutionContext) {
      throw new Error(
        '@nestjs/graphql is required for GraphQLApiKeyGuard. Install it: npm install @nestjs/graphql',
      );
    }

    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    const info = gqlContext.getInfo();

    const apiKey = this.extractApiKey(req);

    if (!apiKey) {
      ApiKeyLogger.debug('API key missing from GraphQL request');
      throw new UnauthorizedException('API key is missing');
    }

    const keyData = await this.apiKeyService.validate(apiKey);

    if (!keyData) {
      ApiKeyLogger.warn('Invalid API key provided in GraphQL request');
      throw new UnauthorizedException('Invalid API key');
    }

    const ipAddress = extractClientIp(req);

    // Check IP blacklist
    if (keyData.ipBlacklist && keyData.ipBlacklist.length > 0) {
      if (isIpBlocked(ipAddress, keyData.ipBlacklist)) {
        throw new UnauthorizedException('IP address is blocked');
      }
    }

    // Check IP whitelist
    if (keyData.ipWhitelist && keyData.ipWhitelist.length > 0) {
      if (!isIpAllowed(ipAddress, keyData.ipWhitelist)) {
        throw new UnauthorizedException('IP address not allowed');
      }
    }

    // Attach API key to GraphQL context
    req.apiKey = keyData;
    req.graphqlInfo = info;

    // Update last used
    await this.apiKeyService.updateLastUsed(keyData.id);

    return true;
  }

  private extractApiKey(request: {
    headers?: Record<string, string | string[] | undefined>;
    query?: Record<string, string | string[] | undefined>;
    cookies?: Record<string, string>;
  }): string | null {
    // Check header
    const headerName = this.options.headerName || 'x-api-key';
    const headerValue = request.headers?.[headerName.toLowerCase()];
    if (headerValue) {
      return Array.isArray(headerValue) ? headerValue[0] : headerValue;
    }

    // Check query parameter
    const queryParamName = this.options.queryParamName || 'api_key';
    const queryValue = request.query?.[queryParamName];
    if (queryValue) {
      return Array.isArray(queryValue) ? queryValue[0] : queryValue;
    }

    // Check cookie
    const cookieName = this.options.cookieName || 'api_key';
    const cookieValue = request.cookies?.[cookieName];
    if (cookieValue) {
      return cookieValue;
    }

    return null;
  }
}
