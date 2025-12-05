import * as bcrypt from 'bcrypt';
import * as argon2 from 'argon2';

export type HashAlgorithm = 'bcrypt' | 'argon2';

export interface HashOptions {
  algorithm?: HashAlgorithm;
  bcryptRounds?: number;
}

/**
 * Utility for hashing API keys using different algorithms.
 */
export class HashUtil {
  /**
   * Hashes a plaintext token using the specified algorithm.
   *
   * @param token - The plaintext token to hash
   * @param options - Hashing options
   * @returns The hashed token
   */
  static async hash(token: string, options: HashOptions = {}): Promise<string> {
    const algorithm = options.algorithm || 'bcrypt';

    if (algorithm === 'argon2') {
      return await argon2.hash(token);
    }

    const rounds = options.bcryptRounds || 10;
    return await bcrypt.hash(token, rounds);
  }

  /**
   * Compares a plaintext token with a hash.
   *
   * @param token - The plaintext token
   * @param hash - The hashed token
   * @param algorithm - The algorithm used for hashing
   * @returns true if the token matches the hash
   */
  static async compare(
    token: string,
    hash: string,
    algorithm: HashAlgorithm = 'bcrypt',
  ): Promise<boolean> {
    if (algorithm === 'argon2') {
      try {
        return await argon2.verify(hash, token);
      } catch {
        return false;
      }
    }

    return await bcrypt.compare(token, hash);
  }

  /**
   * Detects the hash algorithm from a hash string.
   *
   * @param hash - The hash string
   * @returns The detected algorithm
   */
  static detectAlgorithm(hash: string): HashAlgorithm {
    if (hash.startsWith('$argon2')) {
      return 'argon2';
    }
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
      return 'bcrypt';
    }
    return 'bcrypt';
  }
}
