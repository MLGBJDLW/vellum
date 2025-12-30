import { z } from "zod";

/**
 * Domain control configuration for whitelist/blacklist
 */
export const DomainControlSchema = z
  .object({
    /** Domains to allow (if set, only these are allowed) */
    whitelist: z.array(z.string()).optional(),
    /** Domains to block (checked after whitelist) */
    blacklist: z.array(z.string()).default([]),
    /** Whether to allow subdomains of whitelisted domains */
    allowSubdomains: z.boolean().default(true),
  })
  .default({});

export type DomainControl = z.infer<typeof DomainControlSchema>;

/**
 * Rate limiting configuration
 */
export const RateLimitSchema = z
  .object({
    /** Maximum requests per window */
    maxRequests: z.number().int().positive().default(100),
    /** Window size in milliseconds */
    windowMs: z.number().int().positive().default(60_000), // 1 minute
    /** Maximum concurrent requests */
    maxConcurrent: z.number().int().positive().default(10),
  })
  .default({});

export type RateLimit = z.infer<typeof RateLimitSchema>;

/**
 * Response cache configuration
 */
export const CacheConfigSchema = z
  .object({
    /** Enable caching for GET requests */
    enabled: z.boolean().default(true),
    /** Maximum number of cached entries */
    maxEntries: z.number().int().positive().default(1000),
    /** Default TTL in milliseconds */
    defaultTtlMs: z.number().int().positive().default(300_000), // 5 minutes
    /** Maximum response size to cache (bytes) */
    maxResponseSize: z.number().int().positive().default(1_048_576), // 1MB
  })
  .default({});

export type CacheConfig = z.infer<typeof CacheConfigSchema>;

/**
 * Browser (Playwright) configuration
 */
export const BrowserConfigSchema = z
  .object({
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
  })
  .default({});

export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;

/**
 * Security configuration for SSRF protection
 */
export const SecurityConfigSchema = z
  .object({
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
  })
  .default({});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

/**
 * Complete web browsing configuration schema
 */
export const WebBrowsingConfigSchema = z
  .object({
    /** Security settings (SSRF protection) */
    security: SecurityConfigSchema,
    /** Domain control (whitelist/blacklist) */
    domains: DomainControlSchema,
    /** Rate limiting settings */
    rateLimit: RateLimitSchema,
    /** Response cache settings */
    cache: CacheConfigSchema,
    /** Browser settings */
    browser: BrowserConfigSchema,
    /** Request timeout in milliseconds */
    timeout: z.number().int().positive().default(30_000),
    /** Maximum response size in bytes */
    maxResponseSize: z.number().int().positive().default(10_485_760), // 10MB
  })
  .default({});

export type WebBrowsingConfig = z.infer<typeof WebBrowsingConfigSchema>;

/**
 * Parse and validate web browsing configuration
 * @param config Raw configuration object
 * @returns Validated configuration with defaults applied
 */
export function parseWebBrowsingConfig(config: unknown = {}): WebBrowsingConfig {
  return WebBrowsingConfigSchema.parse(config);
}
