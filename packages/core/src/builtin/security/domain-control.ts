import type { DomainControl } from "../../config/web-browsing.js";
import { WebErrorCode } from "../../errors/web.js";

/**
 * Result of domain check
 */
export interface DomainCheckResult {
  allowed: boolean;
  reason?: "blacklisted" | "not_whitelisted" | "allowed";
  matchedPattern?: string;
  code?: WebErrorCode;
}

/**
 * Input type for domain control configuration (with optional fields)
 */
export type DomainControlInput = Partial<DomainControl>;

/**
 * Apply defaults to partial domain control configuration
 */
function applyDefaults(config: DomainControlInput): DomainControl {
  return {
    blacklist: config.blacklist ?? [],
    allowSubdomains: config.allowSubdomains ?? true,
    whitelist: config.whitelist,
  };
}

/**
 * Match a domain against a pattern
 * Supports wildcards (*.) for subdomain matching
 *
 * @param domain - Domain to check (e.g., "api.example.com")
 * @param pattern - Pattern to match (e.g., "*.example.com" or "example.com")
 * @param allowSubdomains - Whether to allow subdomains of exact matches
 * @returns true if domain matches pattern
 */
export function matchDomainPattern(
  domain: string,
  pattern: string,
  allowSubdomains = true
): boolean {
  const normalizedDomain = domain.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  // Exact match
  if (normalizedDomain === normalizedPattern) {
    return true;
  }

  // Wildcard pattern (*.example.com)
  if (normalizedPattern.startsWith("*.")) {
    const baseDomain = normalizedPattern.slice(2);
    // Match exact base or any subdomain
    return normalizedDomain === baseDomain || normalizedDomain.endsWith(`.${baseDomain}`);
  }

  // Allow subdomains of exact patterns if enabled
  if (allowSubdomains && normalizedDomain.endsWith(`.${normalizedPattern}`)) {
    return true;
  }

  return false;
}

/**
 * Check if a domain is allowed based on whitelist/blacklist configuration
 *
 * @param domain - Domain to check
 * @param config - Domain control configuration (partial, defaults applied)
 * @returns Check result with reason and matched pattern
 */
export function checkDomain(domain: string, config: DomainControlInput): DomainCheckResult {
  const resolvedConfig = applyDefaults(config);
  const normalizedDomain = domain.toLowerCase();

  // Check blacklist first (always enforced)
  if (resolvedConfig.blacklist && resolvedConfig.blacklist.length > 0) {
    for (const pattern of resolvedConfig.blacklist) {
      if (matchDomainPattern(normalizedDomain, pattern, resolvedConfig.allowSubdomains)) {
        return {
          allowed: false,
          reason: "blacklisted",
          matchedPattern: pattern,
          code: WebErrorCode.DOMAIN_BLOCKED,
        };
      }
    }
  }

  // If whitelist is defined, domain must be in it
  if (resolvedConfig.whitelist && resolvedConfig.whitelist.length > 0) {
    for (const pattern of resolvedConfig.whitelist) {
      if (matchDomainPattern(normalizedDomain, pattern, resolvedConfig.allowSubdomains)) {
        return {
          allowed: true,
          reason: "allowed",
          matchedPattern: pattern,
        };
      }
    }
    // Not in whitelist
    return {
      allowed: false,
      reason: "not_whitelisted",
      code: WebErrorCode.DOMAIN_NOT_WHITELISTED,
    };
  }

  // No whitelist = all domains allowed (except blacklist)
  return {
    allowed: true,
    reason: "allowed",
  };
}

/**
 * Extract domain from a URL
 *
 * @param url - URL string or URL object
 * @returns Domain/hostname
 */
export function extractDomain(url: string | URL): string {
  const parsed = typeof url === "string" ? new URL(url) : url;
  return parsed.hostname.toLowerCase();
}

/**
 * Check if a URL is allowed based on domain control configuration
 * Convenience wrapper around checkDomain
 *
 * @param url - URL to check
 * @param config - Domain control configuration (partial, defaults applied)
 * @returns Check result
 */
export function checkUrlDomain(url: string | URL, config: DomainControlInput): DomainCheckResult {
  try {
    const domain = extractDomain(url);
    return checkDomain(domain, config);
  } catch {
    // Invalid URL - block by default
    return {
      allowed: false,
      reason: "blacklisted",
      code: WebErrorCode.DOMAIN_BLOCKED,
    };
  }
}
