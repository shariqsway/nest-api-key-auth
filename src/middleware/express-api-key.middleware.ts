import { Request, Response, NextFunction } from 'express';
import { ApiKeyService } from '../services/api-key.service';
import { ApiKeyModuleOptions } from '../interfaces';
import { ApiKeyLogger } from '../utils/logger.util';
import { extractClientIp, isIpAllowed, isIpBlocked } from '../utils/ip.util';

/**
 * Express middleware for API key authentication.
 * Can be used in non-NestJS Express applications.
 */
export function createApiKeyMiddleware(
  apiKeyService: ApiKeyService,
  options: ApiKeyModuleOptions = {},
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apiKey = extractApiKey(req, options);

      if (!apiKey) {
        ApiKeyLogger.debug('API key missing from request');
        res.status(401).json({ error: 'API key is missing' });
        return;
      }

      const keyData = await apiKeyService.validate(apiKey);

      if (!keyData) {
        ApiKeyLogger.warn('Invalid API key provided');
        res.status(401).json({ error: 'Invalid API key' });
        return;
      }

      const ipAddress = extractClientIp(req);

      // Check IP blacklist
      if (keyData.ipBlacklist && keyData.ipBlacklist.length > 0) {
        if (isIpBlocked(ipAddress, keyData.ipBlacklist)) {
          res.status(403).json({ error: 'IP address is blocked' });
          return;
        }
      }

      // Check IP whitelist
      if (keyData.ipWhitelist && keyData.ipWhitelist.length > 0) {
        if (!isIpAllowed(ipAddress, keyData.ipWhitelist)) {
          res.status(403).json({ error: 'IP address not allowed' });
          return;
        }
      }

      // Attach API key to request
      (req as Request & { apiKey: typeof keyData }).apiKey = keyData;

      // Update last used
      await apiKeyService.updateLastUsed(keyData.id);

      next();
    } catch (error) {
      ApiKeyLogger.error(
        'Error in API key middleware',
        error instanceof Error ? error : String(error),
      );
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

function extractApiKey(request: Request, options: ApiKeyModuleOptions): string | null {
  // Check header
  const headerName = options.headerName || 'x-api-key';
  const headerValue = request.headers[headerName.toLowerCase()];
  if (headerValue) {
    return Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }

  // Check query parameter
  const queryParamName = options.queryParamName || 'api_key';
  const queryValue = request.query[queryParamName];
  if (queryValue) {
    return Array.isArray(queryValue) ? queryValue[0] : queryValue;
  }

  // Check cookie
  const cookieName = options.cookieName || 'api_key';
  const cookieValue = request.cookies?.[cookieName];
  if (cookieValue) {
    return cookieValue;
  }

  return null;
}
