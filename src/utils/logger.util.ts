import { Logger } from '@nestjs/common';

/**
 * Logger instance for the API key module.
 * Can be configured to use a custom logger or the default NestJS logger.
 */
export class ApiKeyLogger {
  private static logger: Logger | null = null;

  /**
   * Sets a custom logger instance.
   *
   * @param logger - The logger instance to use
   */
  static setLogger(logger: Logger): void {
    ApiKeyLogger.logger = logger;
  }

  /**
   * Gets the logger instance, creating a default one if none exists.
   *
   * @returns The logger instance
   */
  private static getLogger(): Logger {
    if (!ApiKeyLogger.logger) {
      ApiKeyLogger.logger = new Logger('ApiKeyModule');
    }
    return ApiKeyLogger.logger;
  }

  /**
   * Logs an info message.
   *
   * @param message - The message to log
   * @param context - Optional context
   */
  static log(message: string, context?: string): void {
    ApiKeyLogger.getLogger().log(message, context || 'ApiKeyModule');
  }

  /**
   * Logs a warning message.
   *
   * @param message - The message to log
   * @param context - Optional context
   */
  static warn(message: string, context?: string): void {
    ApiKeyLogger.getLogger().warn(message, context || 'ApiKeyModule');
  }

  /**
   * Logs an error message.
   *
   * @param message - The message to log
   * @param error - Optional error object
   * @param context - Optional context
   */
  static error(message: string, error?: Error | string, context?: string): void {
    ApiKeyLogger.getLogger().error(
      message,
      error instanceof Error ? error.stack : error,
      context || 'ApiKeyModule',
    );
  }

  /**
   * Logs a debug message.
   *
   * @param message - The message to log
   * @param context - Optional context
   */
  static debug(message: string, context?: string): void {
    ApiKeyLogger.getLogger().debug(message, context || 'ApiKeyModule');
  }
}
