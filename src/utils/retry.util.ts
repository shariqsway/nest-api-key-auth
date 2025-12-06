/**
 * Utility for retrying operations with exponential backoff.
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: Array<new (...args: unknown[]) => Error>;
}

/**
 * Retries an async operation with exponential backoff.
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration
 * @returns The result of the operation
 * @throws The last error if all retries fail
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    backoffMultiplier = 2,
    retryableErrors = [],
  } = options;

  let lastError: Error | unknown;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (retryableErrors.length > 0) {
        const isRetryable = retryableErrors.some((ErrorClass) => error instanceof ErrorClass);
        if (!isRetryable) {
          throw error;
        }
      }

      // Don't retry on last attempt
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * backoffMultiplier, maxDelayMs);
      }
    }
  }

  throw lastError;
}
