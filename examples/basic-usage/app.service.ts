import { Injectable } from '@nestjs/common';
import { ApiKeyService } from 'nest-api-key-auth';

@Injectable()
export class AppService {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async createApiKey() {
    const key = await this.apiKeyService.create({
      name: 'My Application',
      scopes: ['read:projects', 'write:projects'],
      expiresAt: new Date('2025-12-31'),
    });

    console.log('API Key created!');
    console.log('Token:', key.token);
    console.log('⚠️  Store this token securely - it will not be shown again!');

    return key;
  }

  async listKeys() {
    const activeKeys = await this.apiKeyService.findAllActive();
    return activeKeys.map((key) => ({
      id: key.id,
      name: key.name,
      scopes: key.scopes,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
    }));
  }

  async rotateKey(oldKeyId: string) {
    const newKey = await this.apiKeyService.rotate(oldKeyId, {
      revokeOldKey: true,
      gracePeriodHours: 24,
    });

    console.log('Key rotated!');
    console.log('New token:', newKey.token);
    console.log('⚠️  Store this token securely!');

    return newKey;
  }
}

