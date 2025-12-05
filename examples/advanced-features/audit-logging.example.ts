import { Module } from '@nestjs/common';
import { ApiKeyModule } from 'nest-api-key-auth';
import { AuditLogOptions } from 'nest-api-key-auth';

/**
 * Example: Audit Logging Configuration
 *
 * This example shows how to configure audit logging for API key usage.
 */

@Module({
  imports: [
    ApiKeyModule.register({
      enableAuditLogging: true, // Enable audit logging (default: true)
      auditLogOptions: {
        logToConsole: true, // Log to console (default: true)
        logToDatabase: false, // Set to true if you implement database logging
        onLog: async (entry) => {
          // Custom logging logic
          // You can send to external services, write to files, etc.
          console.log('Audit Log Entry:', {
            keyId: entry.keyId,
            keyName: entry.keyName,
            ipAddress: entry.ipAddress,
            method: entry.method,
            path: entry.path,
            success: entry.success,
            timestamp: entry.timestamp,
            requestId: entry.requestId,
          });

          // Example: Send to external logging service
          // await sendToLoggingService(entry);

          // Example: Write to file
          // await writeToFile('audit.log', JSON.stringify(entry));
        },
      },
    }),
  ],
})
export class AuditLoggingModule {}

/**
 * Audit Log Entry Structure:
 * {
 *   keyId: string;           // API key ID
 *   keyName?: string;        // API key name (if available)
 *   ipAddress: string;       // Client IP address
 *   method: string;          // HTTP method (GET, POST, etc.)
 *   path: string;            // Request path
 *   statusCode?: number;     // HTTP status code
 *   success: boolean;        // Whether request was successful
 *   errorMessage?: string;   // Error message (if failed)
 *   timestamp: Date;         // Timestamp of the request
 *   requestId?: string;      // Optional request ID
 * }
 *
 * Audit logs are automatically generated for:
 * - Successful API key validations
 * - Failed API key validations
 * - Rate limit exceeded
 * - IP address not allowed
 * - Missing or invalid API keys
 */

