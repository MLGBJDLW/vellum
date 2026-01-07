import { z } from "zod";

/**
 * Domain control configuration for whitelist/blacklist
 */
export const DomainControlSchema = z.object({
  /** Domains to allow (if set, only these are allowed) */
  whitelist: z.array(z.string()).optional(),
  /** Domains to block (checked after whitelist) */
  blacklist: z.array(z.string()).default([]),
  /** Whether to allow subdomains of whitelisted domains */
  allowSubdomains: z.boolean().default(true),
});

export type DomainControl = z.infer<typeof DomainControlSchema>;

/**
 * Rate limiting configuration
 */
export const RateLimitSchema = z.object({
  /** Maximum requests per window */
  maxRequests: z.number().int().positive().default(100),
  /** Window size in milliseconds */
  windowMs: z.number().int().positive().default(60_000), // 1 minute
  /** Maximum concurrent requests */
  maxConcurrent: z.number().int().positive().default(10),
});

export type RateLimit = z.infer<typeof RateLimitSchema>;

/**
 * Response cache configuration
 */
export const CacheConfigSchema = z.object({
  /** Enable caching for GET requests */
  enabled: z.boolean().default(true),
  /** Maximum number of cached entries */
  maxEntries: z.number().int().positive().default(1000),
  /** Default TTL in milliseconds */
  defaultTtlMs: z.number().int().positive().default(300_000), // 5 minutes
  /** Maximum response size to cache (bytes) */
  maxResponseSize: z.number().int().positive().default(1_048_576), // 1MB
});

export type CacheConfig = z.infer<typeof CacheConfigSchema>;

/**
 * Browser (Playwright) configuration
 */
export const BrowserConfigSchema = z.object({
  /** Headless mode */
  headless: z.boolean().default(true),
  /** Page load timeout in milliseconds */
  timeout: z.number().int().positive().default(30_000),
  /** Viewport width */
  viewportWidth: z.number().int().positive().default(1280),
  /** Viewport height */
  viewportHeight: z.number().int().positive().default(720),
  /** CDP endpoint for remote browser connection */
  cdpEndpoint: z.string().url().optional(),
  /** User agent override */
  userAgent: z.string().optional(),
});

export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;

/**
 * Security configuration for SSRF protection
 */
export const SecurityConfigSchema = z.object({
  /** Block requests to private IP ranges */
  blockPrivateIPs: z.boolean().default(true),
  /** Block cloud metadata endpoints */
  blockCloudMetadata: z.boolean().default(true),
  /** Validate DNS resolution before connection */
  validateDNS: z.boolean().default(true),
  /** Maximum number of redirects to follow */
  maxRedirects: z.number().int().min(0).default(5),
  /** Validate redirect targets for SSRF */
  validateRedirects: z.boolean().default(true),
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

/**
 * Complete web browsing configuration schema
 *
 * Note: Nested schemas are optional at parse time. Use parseWebBrowsingConfig()
 * to get a fully-defaulted configuration object.
 */
export const WebBrowsingConfigSchema = z.object({
  /** Security settings (SSRF protection) */
  security: SecurityConfigSchema.optional(),
  /** Domain control (whitelist/blacklist) */
  domains: DomainControlSchema.optional(),
  /** Rate limiting settings */
  rateLimit: RateLimitSchema.optional(),
  /** Response cache settings */
  cache: CacheConfigSchema.optional(),
  /** Browser settings */
  browser: BrowserConfigSchema.optional(),
  /** Request timeout in milliseconds */
  timeout: z.number().int().positive().default(30_000),
  /** Maximum response size in bytes */
  maxResponseSize: z.number().int().positive().default(10_485_760), // 10MB
});

export type WebBrowsingConfig = z.infer<typeof WebBrowsingConfigSchema>;

/**
 * Resolved web browsing configuration with all nested defaults applied
 */
export type ResolvedWebBrowsingConfig = {
  security: SecurityConfig;
  domains: DomainControl;
  rateLimit: RateLimit;
  cache: CacheConfig;
  browser: BrowserConfig;
  timeout: number;
  maxResponseSize: number;
};

/**
 * Parse and validate web browsing configuration
 * @param config Raw configuration object
 * @returns Validated configuration with defaults applied for all nested schemas
 */
export function parseWebBrowsingConfig(config: unknown = {}): ResolvedWebBrowsingConfig {
  const parsed = WebBrowsingConfigSchema.parse(config);

  // Apply defaults for all nested schemas
  return {
    ...parsed,
    security: SecurityConfigSchema.parse(parsed.security ?? {}),
    domains: DomainControlSchema.parse(parsed.domains ?? {}),
    rateLimit: RateLimitSchema.parse(parsed.rateLimit ?? {}),
    cache: CacheConfigSchema.parse(parsed.cache ?? {}),
    browser: BrowserConfigSchema.parse(parsed.browser ?? {}),
  };
}
