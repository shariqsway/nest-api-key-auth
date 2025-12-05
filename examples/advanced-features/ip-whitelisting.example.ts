import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';

/**
 * Example: IP Whitelisting Configuration
 *
 * This example shows how to restrict API keys to specific IP addresses.
 */

@Module({
  imports: [ApiKeyModule.register({})],
})
export class IpWhitelistingModule {}

// In your service:
import { Injectable } from '@nestjs/common';
import { ApiKeyService } from 'nest-api-key-auth';

@Injectable()
export class ApiKeyManagementService {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * Create an API key restricted to a single IP
   */
  async createKeyForSingleIp() {
    const key = await this.apiKeyService.create({
      name: 'Office Server',
      ipWhitelist: ['192.168.1.100'], // Only this IP can use the key
    });

    return key;
  }

  /**
   * Create an API key restricted to a CIDR range
   */
  async createKeyForCidrRange() {
    const key = await this.apiKeyService.create({
      name: 'Office Network',
      ipWhitelist: ['192.168.1.0/24'], // All IPs in 192.168.1.0-255
    });

    return key;
  }

  /**
   * Create an API key with multiple IP restrictions
   */
  async createKeyForMultipleIps() {
    const key = await this.apiKeyService.create({
      name: 'Multi-Server Setup',
      ipWhitelist: [
        '192.168.1.100', // Server 1
        '192.168.1.101', // Server 2
        '10.0.0.0/24', // Private network range
      ],
    });

    return key;
  }

  /**
   * Create an API key with wildcard pattern
   */
  async createKeyWithWildcard() {
    const key = await this.apiKeyService.create({
      name: 'Development Environment',
      ipWhitelist: ['192.168.*'], // All IPs starting with 192.168
    });

    return key;
  }
}

/**
 * IP Whitelist Formats Supported:
 * - Exact IP: "192.168.1.1"
 * - CIDR notation: "192.168.1.0/24"
 * - Wildcard: "192.168.*"
 *
 * If ipWhitelist is empty or not provided, the key can be used from any IP.
 * If an IP is not in the whitelist, a 403 Forbidden error is returned.
 */

