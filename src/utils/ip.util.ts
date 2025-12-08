/**
 * Utility functions for IP address validation and matching.
 */

/**
 * Validates if an IP address matches any pattern in a whitelist.
 * Supports:
 * - Exact IP: "192.168.1.1"
 * - CIDR notation: "192.168.1.0/24"
 * - Wildcard: "192.168.*"
 *
 * @param ipAddress - The IP address to check
 * @param whitelist - Array of allowed IP patterns
 * @returns true if IP matches any pattern in whitelist, false otherwise
 */
export function isIpAllowed(ipAddress: string, whitelist?: string[]): boolean {
  if (!whitelist || whitelist.length === 0) {
    return true;
  }

  if (!ipAddress) {
    return false;
  }

  for (const pattern of whitelist) {
    if (matchesIpPattern(ipAddress, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if an IP address matches any pattern in a blacklist.
 * Supports the same patterns as whitelist:
 * - Exact IP: "192.168.1.1"
 * - CIDR notation: "192.168.1.0/24"
 * - Wildcard: "192.168.*"
 *
 * @param ipAddress - The IP address to check
 * @param blacklist - Array of blocked IP patterns
 * @returns true if IP matches any pattern in blacklist, false otherwise
 */
export function isIpBlocked(ipAddress: string, blacklist?: string[]): boolean {
  if (!blacklist || blacklist.length === 0) {
    return false;
  }

  if (!ipAddress) {
    return false;
  }

  for (const pattern of blacklist) {
    if (matchesIpPattern(ipAddress, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if an IP address matches a specific pattern.
 *
 * @param ipAddress - The IP address to check
 * @param pattern - The pattern to match against
 * @returns true if IP matches pattern
 */
function matchesIpPattern(ipAddress: string, pattern: string): boolean {
  if (ipAddress === pattern) {
    return true;
  }

  if (pattern.includes('/')) {
    return matchesCidr(ipAddress, pattern);
  }

  if (pattern.includes('*')) {
    return matchesWildcard(ipAddress, pattern);
  }

  return false;
}

/**
 * Checks if an IP address matches a CIDR notation pattern.
 *
 * @param ipAddress - The IP address to check
 * @param cidr - CIDR notation (e.g., "192.168.1.0/24")
 * @returns true if IP is within CIDR range
 */
function matchesCidr(ipAddress: string, cidr: string): boolean {
  try {
    const [network, prefixLength] = cidr.split('/');
    const prefix = parseInt(prefixLength, 10);

    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }

    const ipNum = ipToNumber(ipAddress);
    const networkNum = ipToNumber(network);

    if (ipNum === null || networkNum === null) {
      return false;
    }

    const mask = ~(0xffffffff >>> prefix);
    return (ipNum & mask) === (networkNum & mask);
  } catch {
    return false;
  }
}

/**
 * Checks if an IP address matches a wildcard pattern.
 *
 * @param ipAddress - The IP address to check
 * @param pattern - Wildcard pattern (e.g., "192.168.*")
 * @returns true if IP matches pattern
 */
function matchesWildcard(ipAddress: string, pattern: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '\\d+').replace(/\./g, '\\.') + '$');
  return regex.test(ipAddress);
}

/**
 * Converts an IP address to a number.
 *
 * @param ipAddress - The IP address to convert
 * @returns The numeric representation or null if invalid
 */
function ipToNumber(ipAddress: string): number | null {
  const parts = ipAddress.split('.');
  if (parts.length !== 4) {
    return null;
  }

  let num = 0;
  for (let i = 0; i < 4; i++) {
    const part = parseInt(parts[i], 10);
    if (isNaN(part) || part < 0 || part > 255) {
      return null;
    }
    num = num * 256 + part;
  }

  return num;
}

/**
 * Extracts the client IP address from a request.
 *
 * @param request - The HTTP request object
 * @returns The client IP address
 */
export function extractClientIp(request: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
}): string {
  if (request.ip) {
    return request.ip;
  }

  const forwarded = request.headers?.['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }

  const realIp = request.headers?.['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return request.connection?.remoteAddress || request.socket?.remoteAddress || 'unknown';
}
