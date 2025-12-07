import { Test, TestingModule } from '@nestjs/testing';
import {
  RequestSigningService,
  SignedRequest,
  SigningOptions,
} from '../../src/services/request-signing.service';

describe('RequestSigningService', () => {
  let service: RequestSigningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RequestSigningService],
    }).compile();

    service = module.get<RequestSigningService>(RequestSigningService);
  });

  describe('signRequest', () => {
    it('should sign a request with default options', () => {
      const secret = 'test-secret';
      const payload = 'GET /api/users';
      const timestamp = Date.now();

      const signed: SignedRequest = service.signRequest(secret, payload, timestamp);

      expect(signed).toHaveProperty('signature');
      expect(signed).toHaveProperty('timestamp');
      expect(signed.timestamp).toBe(timestamp);
      expect(typeof signed.signature).toBe('string');
      expect(signed.signature.length).toBeGreaterThan(0);
    });

    it('should use current timestamp if not provided', () => {
      const secret = 'test-secret';
      const payload = 'GET /api/users';
      const before = Date.now();

      const signed: SignedRequest = service.signRequest(secret, payload);

      const after = Date.now();
      expect(signed.timestamp).toBeGreaterThanOrEqual(before);
      expect(signed.timestamp).toBeLessThanOrEqual(after);
    });

    it('should use custom algorithm', () => {
      const secret = 'test-secret';
      const payload = 'GET /api/users';
      const options: SigningOptions = {
        algorithm: 'sha512',
      };

      const signed: SignedRequest = service.signRequest(secret, payload, undefined, options);

      expect(signed.signature).toBeTruthy();
      // SHA512 produces longer signatures than SHA256
      expect(signed.signature.length).toBeGreaterThan(64);
    });

    it('should produce consistent signatures for same input', () => {
      const secret = 'test-secret';
      const payload = 'GET /api/users';
      const timestamp = 1234567890;

      const signed1 = service.signRequest(secret, payload, timestamp);
      const signed2 = service.signRequest(secret, payload, timestamp);

      expect(signed1.signature).toBe(signed2.signature);
    });
  });

  describe('verifyRequest', () => {
    it('should verify a valid signature', () => {
      const secret = 'test-secret';
      const payload = 'GET /api/users';
      const timestamp = Date.now();

      const signed = service.signRequest(secret, payload, timestamp);
      const isValid = service.verifyRequest(secret, payload, signed.signature, timestamp);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const secret = 'test-secret';
      const payload = 'GET /api/users';
      const timestamp = Date.now();

      const isValid = service.verifyRequest(secret, payload, 'invalid-signature', timestamp);

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong secret', () => {
      const secret1 = 'secret-1';
      const secret2 = 'secret-2';
      const payload = 'GET /api/users';
      const timestamp = Date.now();

      const signed = service.signRequest(secret1, payload, timestamp);
      const isValid = service.verifyRequest(secret2, payload, signed.signature, timestamp);

      expect(isValid).toBe(false);
    });

    it('should reject expired timestamp', () => {
      const secret = 'test-secret';
      const payload = 'GET /api/users';
      const oldTimestamp = Date.now() - 400000; // 6+ minutes ago

      const signed = service.signRequest(secret, payload, oldTimestamp);
      const isValid = service.verifyRequest(secret, payload, signed.signature, oldTimestamp);

      expect(isValid).toBe(false);
    });

    it('should accept timestamp within tolerance', () => {
      const secret = 'test-secret';
      const payload = 'GET /api/users';
      const timestamp = Date.now() - 60000; // 1 minute ago

      const signed = service.signRequest(secret, payload, timestamp);
      const options: SigningOptions = {
        timestampToleranceMs: 300000, // 5 minutes
      };
      const isValid = service.verifyRequest(secret, payload, signed.signature, timestamp, options);

      expect(isValid).toBe(true);
    });

    it('should use custom timestamp tolerance', () => {
      const secret = 'test-secret';
      const payload = 'GET /api/users';
      const timestamp = Date.now() - 10000; // 10 seconds ago

      const signed = service.signRequest(secret, payload, timestamp);
      const options: SigningOptions = {
        timestampToleranceMs: 5000, // 5 seconds
      };
      const isValid = service.verifyRequest(secret, payload, signed.signature, timestamp, options);

      expect(isValid).toBe(false);
    });
  });

  describe('extractSignature', () => {
    it('should extract signature from default headers', () => {
      const signed = service.signRequest('secret', 'payload');
      const headers = {
        'x-signature': signed.signature,
        'x-timestamp': signed.timestamp.toString(),
      };

      const extracted = service.extractSignature(headers);

      expect(extracted).toEqual({
        signature: signed.signature,
        timestamp: signed.timestamp,
      });
    });

    it('should extract signature from custom headers', () => {
      const signed = service.signRequest('secret', 'payload');
      const headers = {
        'custom-signature': signed.signature,
        'custom-timestamp': signed.timestamp.toString(),
      };

      const options: SigningOptions = {
        headerName: 'custom-signature',
        timestampHeader: 'custom-timestamp',
      };

      const extracted = service.extractSignature(headers, options);

      expect(extracted).toEqual({
        signature: signed.signature,
        timestamp: signed.timestamp,
      });
    });

    it('should return null for missing headers', () => {
      const headers = {};

      const extracted = service.extractSignature(headers);

      expect(extracted).toBeNull();
    });

    it('should return null for invalid timestamp', () => {
      const headers = {
        'x-signature': 'signature',
        'x-timestamp': 'invalid',
      };

      const extracted = service.extractSignature(headers);

      expect(extracted).toBeNull();
    });
  });
});

