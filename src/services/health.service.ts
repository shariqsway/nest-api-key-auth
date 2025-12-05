import { Injectable } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKeyLogger } from '../utils/logger.util';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  adapter: {
    status: 'connected' | 'disconnected';
    error?: string;
  };
  timestamp: Date;
}

/**
 * Service for checking the health of the API key module and database adapter.
 */
@Injectable()
export class HealthService {
  constructor(private readonly adapter: IApiKeyAdapter) {}

  /**
   * Performs a health check on the adapter by attempting a simple database operation.
   *
   * @returns Health status information
   */
  async checkHealth(): Promise<HealthStatus> {
    const status: HealthStatus = {
      status: 'healthy',
      adapter: {
        status: 'connected',
      },
      timestamp: new Date(),
    };

    try {
      await this.adapter.findAllActive();
      ApiKeyLogger.debug('Health check passed');
    } catch (error) {
      status.status = 'unhealthy';
      status.adapter.status = 'disconnected';
      status.adapter.error = error instanceof Error ? error.message : String(error);
      ApiKeyLogger.error('Health check failed', error instanceof Error ? error : String(error));
    }

    return status;
  }

  /**
   * Quick health check that returns a boolean.
   *
   * @returns true if healthy, false otherwise
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.adapter.findAllActive();
      return true;
    } catch {
      return false;
    }
  }
}
