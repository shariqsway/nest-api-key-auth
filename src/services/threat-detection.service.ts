import { Injectable, Inject, Optional } from '@nestjs/common';
import { IApiKeyAdapter } from '../adapters/base.adapter';
import { ApiKeyLogger } from '../utils/logger.util';
import { API_KEY_ADAPTER } from '../api-key.module';
import { AuditLogService, AUDIT_LOG_SERVICE_TOKEN } from './audit-log.service';
import { WebhookService, WEBHOOK_SERVICE_TOKEN } from './webhook.service';
import { RedisClient } from '../types/redis.types';
import { REDIS_CLIENT_KEY } from '../api-key.module';

export interface ThreatEvent {
  type: 'brute_force' | 'anomalous_pattern' | 'geolocation_change' | 'suspicious_activity';
  keyId?: string;
  ipAddress: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ThreatDetectionOptions {
  enabled?: boolean;
  bruteForceThreshold?: number; // Failed attempts before blocking
  bruteForceWindowMs?: number; // Time window for brute force detection
  anomalousPatternDetection?: boolean;
  geolocationTracking?: boolean;
  alertOnThreat?: boolean;
  autoBlockOnCritical?: boolean;
}

/**
 * Service for detecting security threats and suspicious activities.
 */
@Injectable()
export class ThreatDetectionService {
  private readonly options: Required<ThreatDetectionOptions>;
  private readonly failedAttempts = new Map<string, { count: number; firstAttempt: Date }>();
  private readonly ipHistory = new Map<string, string[]>(); // Track IPs per key
  private readonly requestPatterns = new Map<string, { timestamps: number[]; paths: string[] }>();

  constructor(
    @Inject(API_KEY_ADAPTER) private readonly adapter: IApiKeyAdapter,
    @Optional() @Inject(AUDIT_LOG_SERVICE_TOKEN) private readonly auditLogService?: AuditLogService,
    @Optional() @Inject(WEBHOOK_SERVICE_TOKEN) private readonly webhookService?: WebhookService,
    @Optional() @Inject(REDIS_CLIENT_KEY) private readonly redisClient?: RedisClient,
    options?: ThreatDetectionOptions,
  ) {
    this.options = {
      enabled: true,
      bruteForceThreshold: 5,
      bruteForceWindowMs: 300000, // 5 minutes
      anomalousPatternDetection: true,
      geolocationTracking: false,
      alertOnThreat: true,
      autoBlockOnCritical: false,
      ...options,
    };
  }

  /**
   * Records a failed authentication attempt.
   *
   * @param ipAddress - The IP address
   * @param keyId - Optional key ID if known
   */
  async recordFailedAttempt(ipAddress: string, keyId?: string): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    const key = keyId || ipAddress;
    const now = Date.now();
    const entry = this.failedAttempts.get(key);

    if (!entry) {
      this.failedAttempts.set(key, { count: 1, firstAttempt: new Date(now) });
    } else {
      const windowStart = now - this.options.bruteForceWindowMs;
      if (entry.firstAttempt.getTime() < windowStart) {
        // Reset if outside window
        this.failedAttempts.set(key, { count: 1, firstAttempt: new Date(now) });
      } else {
        entry.count++;
        if (entry.count >= this.options.bruteForceThreshold) {
          await this.detectBruteForce(key, ipAddress, entry.count);
        }
      }
    }

    // Store in Redis if available
    if (this.redisClient) {
      const redisKey = `threat:failed:${key}`;
      const current = await this.redisClient.get(redisKey);
      const count = current ? parseInt(current, 10) + 1 : 1;
      await this.redisClient.setex(
        redisKey,
        Math.ceil(this.options.bruteForceWindowMs / 1000),
        count.toString(),
      );
    }
  }

  /**
   * Records a successful authentication and analyzes patterns.
   *
   * @param keyId - The API key ID
   * @param ipAddress - The IP address
   * @param path - The request path
   */
  async recordSuccessfulRequest(keyId: string, ipAddress: string, path: string): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    // Reset failed attempts on success
    this.failedAttempts.delete(keyId);
    this.failedAttempts.delete(ipAddress);

    // Track IP history for geolocation changes
    if (this.options.geolocationTracking) {
      const history = this.ipHistory.get(keyId) || [];
      if (!history.includes(ipAddress)) {
        history.push(ipAddress);
        if (history.length > 10) {
          history.shift();
        }
        this.ipHistory.set(keyId, history);

        // Detect rapid IP changes
        if (history.length >= 3) {
          const recent = history.slice(-3);
          const unique = new Set(recent);
          if (unique.size === 3) {
            await this.detectAnomalousPattern(keyId, ipAddress, 'rapid_ip_change');
          }
        }
      }
    }

    // Track request patterns
    if (this.options.anomalousPatternDetection) {
      const pattern = this.requestPatterns.get(keyId) || { timestamps: [], paths: [] };
      const now = Date.now();
      pattern.timestamps.push(now);
      pattern.paths.push(path);

      // Keep only last 100 requests
      if (pattern.timestamps.length > 100) {
        pattern.timestamps.shift();
        pattern.paths.shift();
      }

      // Detect unusual patterns (e.g., too many requests in short time)
      if (pattern.timestamps.length >= 10) {
        const recent = pattern.timestamps.slice(-10);
        const timeSpan = recent[recent.length - 1] - recent[0];
        if (timeSpan < 1000) {
          // 10 requests in less than 1 second
          await this.detectAnomalousPattern(keyId, ipAddress, 'burst_requests');
        }
      }

      this.requestPatterns.set(keyId, pattern);
    }
  }

  /**
   * Detects brute force attack.
   */
  private async detectBruteForce(key: string, ipAddress: string, count: number): Promise<void> {
    const event: ThreatEvent = {
      type: 'brute_force',
      keyId: key.startsWith('key-') ? key : undefined,
      ipAddress,
      severity: count >= 10 ? 'critical' : count >= 7 ? 'high' : 'medium',
      description: `Brute force attack detected: ${count} failed attempts from ${ipAddress}`,
      timestamp: new Date(),
      metadata: { attemptCount: count },
    };

    await this.handleThreat(event);
  }

  /**
   * Detects anomalous patterns.
   */
  private async detectAnomalousPattern(
    keyId: string,
    ipAddress: string,
    patternType: string,
  ): Promise<void> {
    const event: ThreatEvent = {
      type: 'anomalous_pattern',
      keyId,
      ipAddress,
      severity: 'medium',
      description: `Anomalous pattern detected: ${patternType}`,
      timestamp: new Date(),
      metadata: { patternType },
    };

    await this.handleThreat(event);
  }

  /**
   * Handles a detected threat.
   */
  private async handleThreat(event: ThreatEvent): Promise<void> {
    ApiKeyLogger.warn(
      `[THREAT DETECTED] ${event.severity.toUpperCase()}: ${event.description}`,
      'ThreatDetectionService',
    );

    // Log to audit
    if (this.auditLogService && event.keyId) {
      await this.auditLogService.logFailure(
        event.ipAddress,
        'THREAT',
        'threat-detection',
        event.description,
        event.keyId,
      );
    }

    // Send webhook
    if (this.options.alertOnThreat && this.webhookService) {
      let keyName = 'Unknown';
      if (event.keyId) {
        try {
          const key = await this.adapter.findById(event.keyId);
          keyName = key?.name || 'Unknown';
        } catch {
          // Ignore errors fetching key name
        }
      }

      await this.webhookService
        .sendWebhook('threat.detected', {
          threatType: event.type,
          severity: event.severity,
          description: event.description,
          keyId: event.keyId || 'unknown',
          keyName,
          ipAddress: event.ipAddress,
          timestamp: event.timestamp,
          metadata: event.metadata,
        })
        .catch((error) => {
          ApiKeyLogger.error(
            'Failed to send threat webhook',
            error instanceof Error ? error : String(error),
            'ThreatDetectionService',
          );
        });
    }

    // Auto-block on critical threats
    if (this.options.autoBlockOnCritical && event.severity === 'critical' && event.keyId) {
      try {
        const key = await this.adapter.findById(event.keyId);
        if (key) {
          const currentBlacklist = key.ipBlacklist || [];
          if (!currentBlacklist.includes(event.ipAddress)) {
            // Note: This would require an update method on the adapter
            // For now, we just log the recommendation
            ApiKeyLogger.warn(
              `Recommend blocking IP ${event.ipAddress} for key ${event.keyId}`,
              'ThreatDetectionService',
            );
          }
        }
      } catch (error) {
        ApiKeyLogger.error(
          'Error checking key for auto-block',
          error instanceof Error ? error : String(error),
          'ThreatDetectionService',
        );
      }
    }
  }

  /**
   * Gets threat statistics for an IP address.
   *
   * @param ipAddress - The IP address
   * @returns Threat statistics
   */
  async getThreatStats(ipAddress: string): Promise<{
    failedAttempts: number;
    isBlocked: boolean;
    lastAttempt: Date | null;
  }> {
    const entry = this.failedAttempts.get(ipAddress);
    return {
      failedAttempts: entry?.count || 0,
      isBlocked: entry ? entry.count >= this.options.bruteForceThreshold : false,
      lastAttempt: entry?.firstAttempt || null,
    };
  }

  /**
   * Clears threat data for an IP or key.
   *
   * @param identifier - IP address or key ID
   */
  clearThreatData(identifier: string): void {
    this.failedAttempts.delete(identifier);
    this.ipHistory.delete(identifier);
    this.requestPatterns.delete(identifier);
  }
}
