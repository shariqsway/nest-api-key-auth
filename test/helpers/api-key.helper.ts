import { ApiKey, ApiKeyState } from '../../src/interfaces';

/**
 * Creates a complete mock ApiKey object with all required fields.
 */
export function createMockApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  const now = new Date();
  return {
    id: 'test-key-id',
    name: 'Test API Key',
    keyPrefix: 'test1234',
    hashedKey: 'hashed-key-value',
    scopes: [],
    expiresAt: null,
    revokedAt: null,
    revocationReason: null,
    suspendedAt: null,
    state: 'active' as ApiKeyState,
    approvedAt: null,
    expirationGracePeriodMs: null,
    lastUsedAt: null,
    ipWhitelist: [],
    ipBlacklist: [],
    rateLimitMax: null,
    rateLimitWindowMs: null,
    quotaMax: null,
    quotaPeriod: null,
    quotaUsed: 0,
    quotaResetAt: null,
    metadata: null,
    tags: [],
    owner: null,
    environment: null,
    description: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

