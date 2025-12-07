import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ApiKeyLogger } from '../utils/logger.util';

export interface SigningOptions {
  algorithm?: 'sha256' | 'sha512';
  headerName?: string;
  timestampHeader?: string;
  timestampToleranceMs?: number;
}

export interface SignedRequest {
  signature: string;
  timestamp: number;
}

/**
 * Service for HMAC request signing and verification.
 */
@Injectable()
export class RequestSigningService {
  private readonly defaultOptions: Required<SigningOptions> = {
    algorithm: 'sha256',
    headerName: 'x-signature',
    timestampHeader: 'x-timestamp',
    timestampToleranceMs: 300000, // 5 minutes
  };

  /**
   * Signs a request payload with HMAC.
   *
   * @param secret - The API key secret
   * @param payload - The request payload (method + path + body)
   * @param timestamp - Optional timestamp (defaults to now)
   * @param options - Signing options
   * @returns Signed request data
   */
  signRequest(
    secret: string,
    payload: string,
    timestamp?: number,
    options?: SigningOptions,
  ): SignedRequest {
    const opts = { ...this.defaultOptions, ...options };
    const ts = timestamp || Date.now();
    const message = `${ts}.${payload}`;
    const signature = crypto.createHmac(opts.algorithm, secret).update(message).digest('hex');

    return {
      signature,
      timestamp: ts,
    };
  }

  /**
   * Verifies a signed request.
   *
   * @param secret - The API key secret
   * @param payload - The request payload
   * @param signature - The provided signature
   * @param timestamp - The provided timestamp
   * @param options - Signing options
   * @returns True if signature is valid
   */
  verifyRequest(
    secret: string,
    payload: string,
    signature: string,
    timestamp: number,
    options?: SigningOptions,
  ): boolean {
    try {
      const opts = { ...this.defaultOptions, ...options };

      // Check timestamp tolerance
      const now = Date.now();
      const tolerance = opts.timestampToleranceMs;
      if (Math.abs(now - timestamp) > tolerance) {
        ApiKeyLogger.warn(
          `Request timestamp out of tolerance: ${Math.abs(now - timestamp)}ms`,
          'RequestSigningService',
        );
        return false;
      }

      // Verify signature
      const message = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac(opts.algorithm, secret)
        .update(message)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );

      if (!isValid) {
        ApiKeyLogger.warn('Invalid request signature', 'RequestSigningService');
      }

      return isValid;
    } catch (error) {
      ApiKeyLogger.error(
        'Error verifying request signature',
        error instanceof Error ? error : String(error),
        'RequestSigningService',
      );
      return false;
    }
  }

  /**
   * Extracts signature and timestamp from request headers.
   *
   * @param headers - Request headers
   * @param options - Signing options
   * @returns Signature and timestamp or null
   */
  extractSignature(
    headers: Record<string, string | string[] | undefined>,
    options?: SigningOptions,
  ): { signature: string; timestamp: number } | null {
    const opts = { ...this.defaultOptions, ...options };

    const signatureHeader = headers[opts.headerName.toLowerCase()];
    const timestampHeader = headers[opts.timestampHeader.toLowerCase()];

    if (!signatureHeader || !timestampHeader) {
      return null;
    }

    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;

    if (!signature || !timestamp) {
      return null;
    }

    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum)) {
      return null;
    }

    return {
      signature,
      timestamp: timestampNum,
    };
  }
}
