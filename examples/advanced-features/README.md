# Advanced Features Examples

This directory contains examples for advanced features of the nest-api-key-auth library.

## Examples

### Rate Limiting (`rate-limiting.example.ts`)
Shows how to configure and use rate limiting with API keys. Includes examples of:
- Enabling rate limiting
- Setting per-key rate limits
- Different rate limit configurations

### IP Whitelisting (`ip-whitelisting.example.ts`)
Demonstrates IP address restrictions. Includes examples of:
- Single IP restrictions
- CIDR range restrictions
- Multiple IP restrictions
- Wildcard patterns

### Audit Logging (`audit-logging.example.ts`)
Shows how to configure audit logging. Includes:
- Console logging
- Custom logging callbacks
- Database logging setup

### Caching (`caching.example.ts`)
Demonstrates caching configuration and management. Includes:
- Enabling caching
- Cache TTL configuration
- Cache statistics
- Manual cache management

### Complete Example (`complete.example.ts`)
A comprehensive example showing all features working together:
- Rate limiting
- IP whitelisting
- Audit logging
- Caching
- Full controller setup

## Usage

These are TypeScript examples. To use them:

1. Copy the relevant code into your NestJS application
2. Install required dependencies
3. Configure your database adapter
4. Run your application

## See Also

- [Main README](../../README.md)
- [Migration Guide](../../MIGRATION_GUIDE.md)
- [Basic Usage Examples](../basic-usage/)

