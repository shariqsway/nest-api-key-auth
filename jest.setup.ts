import { Logger } from '@nestjs/common';
import { ApiKeyLogger } from './src/utils/logger.util';

/**
 * Silent logger for tests
 */
class SilentLogger extends Logger {
  log() {
    // Silent
  }

  error() {
    // Silent
  }

  warn() {
    // Silent
  }

  debug() {
    // Silent
  }

  verbose() {
    // Silent
  }
}

// Set silent logger for all tests
ApiKeyLogger.setLogger(new SilentLogger());

