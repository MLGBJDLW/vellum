import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  BrowserConfigSchema,
  CacheConfigSchema,
  DomainControlSchema,
  parseWebBrowsingConfig,
  RateLimitSchema,
  SecurityConfigSchema,
  WebBrowsingConfigSchema,
} from "../web-browsing.js";

describe("DomainControlSchema", () => {
  it("applies defaults with empty config", () => {
    const config = DomainControlSchema.parse({});
    expect(config.whitelist).toBeUndefined();
    expect(config.blacklist).toEqual([]);
    expect(config.allowSubdomains).toBe(true);
  });

  it("accepts empty whitelist array", () => {
    const config = DomainControlSchema.parse({ whitelist: [] });
    expect(config.whitelist).toEqual([]);
  });

  it("accepts valid whitelist domains", () => {
    const config = DomainControlSchema.parse({
      whitelist: ["example.com", "api.github.com"],
    });
    expect(config.whitelist).toEqual(["example.com", "api.github.com"]);
  });

  it("accepts valid blacklist domains", () => {
    const config = DomainControlSchema.parse({
      blacklist: ["malicious.com", "blocked.org"],
    });
    expect(config.blacklist).toEqual(["malicious.com", "blocked.org"]);
  });

  it("allows overriding allowSubdomains", () => {
    const config = DomainControlSchema.parse({ allowSubdomains: false });
    expect(config.allowSubdomains).toBe(false);
  });

  it("rejects non-string array items", () => {
    expect(() => DomainControlSchema.parse({ whitelist: [123, "valid.com"] })).toThrow(ZodError);
  });
});

describe("RateLimitSchema", () => {
  it("applies correct defaults", () => {
    const config = RateLimitSchema.parse({});
    expect(config.maxRequests).toBe(100);
    expect(config.windowMs).toBe(60_000);
    expect(config.maxConcurrent).toBe(10);
  });

  it("accepts custom values", () => {
    const config = RateLimitSchema.parse({
      maxRequests: 50,
      windowMs: 30_000,
      maxConcurrent: 5,
    });
    expect(config.maxRequests).toBe(50);
    expect(config.windowMs).toBe(30_000);
    expect(config.maxConcurrent).toBe(5);
  });

  it("rejects negative maxRequests", () => {
    expect(() => RateLimitSchema.parse({ maxRequests: -1 })).toThrow(ZodError);
  });

  it("rejects zero maxRequests", () => {
    expect(() => RateLimitSchema.parse({ maxRequests: 0 })).toThrow(ZodError);
  });

  it("rejects negative windowMs", () => {
    expect(() => RateLimitSchema.parse({ windowMs: -1000 })).toThrow(ZodError);
  });

  it("rejects negative maxConcurrent", () => {
    expect(() => RateLimitSchema.parse({ maxConcurrent: -5 })).toThrow(ZodError);
  });

  it("rejects non-integer values", () => {
    expect(() => RateLimitSchema.parse({ maxRequests: 10.5 })).toThrow(ZodError);
  });
});

describe("CacheConfigSchema", () => {
  it("applies correct defaults", () => {
    const config = CacheConfigSchema.parse({});
    expect(config.enabled).toBe(true);
    expect(config.maxEntries).toBe(1000);
    expect(config.defaultTtlMs).toBe(300_000);
    expect(config.maxResponseSize).toBe(1_048_576);
  });

  it("accepts custom values", () => {
    const config = CacheConfigSchema.parse({
      enabled: false,
      maxEntries: 500,
      defaultTtlMs: 60_000,
      maxResponseSize: 512_000,
    });
    expect(config.enabled).toBe(false);
    expect(config.maxEntries).toBe(500);
    expect(config.defaultTtlMs).toBe(60_000);
    expect(config.maxResponseSize).toBe(512_000);
  });

  it("rejects negative maxEntries", () => {
    expect(() => CacheConfigSchema.parse({ maxEntries: -100 })).toThrow(ZodError);
  });

  it("rejects zero defaultTtlMs", () => {
    expect(() => CacheConfigSchema.parse({ defaultTtlMs: 0 })).toThrow(ZodError);
  });

  it("rejects negative maxResponseSize", () => {
    expect(() => CacheConfigSchema.parse({ maxResponseSize: -1 })).toThrow(ZodError);
  });
});

describe("BrowserConfigSchema", () => {
  it("applies correct defaults", () => {
    const config = BrowserConfigSchema.parse({});
    expect(config.headless).toBe(true);
    expect(config.timeout).toBe(30_000);
    expect(config.viewportWidth).toBe(1280);
    expect(config.viewportHeight).toBe(720);
    expect(config.cdpEndpoint).toBeUndefined();
    expect(config.userAgent).toBeUndefined();
  });

  it("accepts custom values", () => {
    const config = BrowserConfigSchema.parse({
      headless: false,
      timeout: 60_000,
      viewportWidth: 1920,
      viewportHeight: 1080,
      userAgent: "Custom Agent/1.0",
    });
    expect(config.headless).toBe(false);
    expect(config.timeout).toBe(60_000);
    expect(config.viewportWidth).toBe(1920);
    expect(config.viewportHeight).toBe(1080);
    expect(config.userAgent).toBe("Custom Agent/1.0");
  });

  it("accepts valid CDP endpoint URL", () => {
    const config = BrowserConfigSchema.parse({
      cdpEndpoint: "http://localhost:9222",
    });
    expect(config.cdpEndpoint).toBe("http://localhost:9222");
  });

  it("accepts WebSocket CDP endpoint URL", () => {
    const config = BrowserConfigSchema.parse({
      cdpEndpoint: "ws://127.0.0.1:9222/devtools/browser",
    });
    expect(config.cdpEndpoint).toBe("ws://127.0.0.1:9222/devtools/browser");
  });

  it("rejects invalid CDP endpoint URL", () => {
    expect(() => BrowserConfigSchema.parse({ cdpEndpoint: "not-a-valid-url" })).toThrow(ZodError);
  });

  it("rejects negative timeout", () => {
    expect(() => BrowserConfigSchema.parse({ timeout: -1000 })).toThrow(ZodError);
  });

  it("rejects zero viewport dimensions", () => {
    expect(() => BrowserConfigSchema.parse({ viewportWidth: 0 })).toThrow(ZodError);
    expect(() => BrowserConfigSchema.parse({ viewportHeight: 0 })).toThrow(ZodError);
  });
});

describe("SecurityConfigSchema", () => {
  it("applies correct defaults - all security features enabled", () => {
    const config = SecurityConfigSchema.parse({});
    expect(config.blockPrivateIPs).toBe(true);
    expect(config.blockCloudMetadata).toBe(true);
    expect(config.validateDNS).toBe(true);
    expect(config.maxRedirects).toBe(5);
    expect(config.validateRedirects).toBe(true);
  });

  it("allows disabling security features", () => {
    const config = SecurityConfigSchema.parse({
      blockPrivateIPs: false,
      blockCloudMetadata: false,
      validateDNS: false,
      validateRedirects: false,
    });
    expect(config.blockPrivateIPs).toBe(false);
    expect(config.blockCloudMetadata).toBe(false);
    expect(config.validateDNS).toBe(false);
    expect(config.validateRedirects).toBe(false);
  });

  it("accepts zero maxRedirects (disable redirects)", () => {
    const config = SecurityConfigSchema.parse({ maxRedirects: 0 });
    expect(config.maxRedirects).toBe(0);
  });

  it("accepts custom maxRedirects", () => {
    const config = SecurityConfigSchema.parse({ maxRedirects: 10 });
    expect(config.maxRedirects).toBe(10);
  });

  it("rejects negative maxRedirects", () => {
    expect(() => SecurityConfigSchema.parse({ maxRedirects: -1 })).toThrow(ZodError);
  });

  it("rejects non-integer maxRedirects", () => {
    expect(() => SecurityConfigSchema.parse({ maxRedirects: 2.5 })).toThrow(ZodError);
  });
});

describe("WebBrowsingConfigSchema", () => {
  it("applies all defaults with empty config via parseWebBrowsingConfig", () => {
    // Use parseWebBrowsingConfig to get fully resolved config with nested defaults
    const config = parseWebBrowsingConfig({});

    // Top-level defaults
    expect(config.timeout).toBe(30_000);
    expect(config.maxResponseSize).toBe(10_485_760);

    // Nested security defaults
    expect(config.security.blockPrivateIPs).toBe(true);
    expect(config.security.blockCloudMetadata).toBe(true);
    expect(config.security.validateDNS).toBe(true);
    expect(config.security.maxRedirects).toBe(5);
    expect(config.security.validateRedirects).toBe(true);

    // Nested domain defaults
    expect(config.domains.whitelist).toBeUndefined();
    expect(config.domains.blacklist).toEqual([]);
    expect(config.domains.allowSubdomains).toBe(true);

    // Nested rate limit defaults
    expect(config.rateLimit.maxRequests).toBe(100);
    expect(config.rateLimit.windowMs).toBe(60_000);
    expect(config.rateLimit.maxConcurrent).toBe(10);

    // Nested cache defaults
    expect(config.cache.enabled).toBe(true);
    expect(config.cache.maxEntries).toBe(1000);
    expect(config.cache.defaultTtlMs).toBe(300_000);

    // Nested browser defaults
    expect(config.browser.headless).toBe(true);
    expect(config.browser.timeout).toBe(30_000);
  });

  it("schema returns undefined for nested configs when not provided", () => {
    const config = WebBrowsingConfigSchema.parse({});
    expect(config.security).toBeUndefined();
    expect(config.domains).toBeUndefined();
    expect(config.rateLimit).toBeUndefined();
    expect(config.cache).toBeUndefined();
    expect(config.browser).toBeUndefined();
    expect(config.timeout).toBe(30_000); // Top-level default still applies
  });

  it("merges partial config with defaults", () => {
    const config = parseWebBrowsingConfig({
      timeout: 60_000,
      security: {
        maxRedirects: 10,
      },
      domains: {
        whitelist: ["example.com"],
      },
      rateLimit: {
        maxRequests: 50,
      },
    });

    // Custom values
    expect(config.timeout).toBe(60_000);
    expect(config.security.maxRedirects).toBe(10);
    expect(config.domains.whitelist).toEqual(["example.com"]);
    expect(config.rateLimit.maxRequests).toBe(50);

    // Defaults preserved for non-specified values
    expect(config.maxResponseSize).toBe(10_485_760);
    expect(config.security.blockPrivateIPs).toBe(true);
    expect(config.domains.blacklist).toEqual([]);
    expect(config.rateLimit.windowMs).toBe(60_000);
    expect(config.cache.enabled).toBe(true);
    expect(config.browser.headless).toBe(true);
  });

  it("rejects invalid top-level timeout", () => {
    expect(() => WebBrowsingConfigSchema.parse({ timeout: -1 })).toThrow(ZodError);
  });

  it("rejects invalid top-level maxResponseSize", () => {
    expect(() => WebBrowsingConfigSchema.parse({ maxResponseSize: 0 })).toThrow(ZodError);
  });

  it("rejects invalid nested config values", () => {
    expect(() =>
      WebBrowsingConfigSchema.parse({
        security: { maxRedirects: -1 },
      })
    ).toThrow(ZodError);

    expect(() =>
      WebBrowsingConfigSchema.parse({
        rateLimit: { maxRequests: -100 },
      })
    ).toThrow(ZodError);

    expect(() =>
      WebBrowsingConfigSchema.parse({
        browser: { cdpEndpoint: "not-a-url" },
      })
    ).toThrow(ZodError);
  });

  it("accepts complete custom config", () => {
    const customConfig = {
      timeout: 45_000,
      maxResponseSize: 5_000_000,
      security: {
        blockPrivateIPs: false,
        blockCloudMetadata: false,
        validateDNS: false,
        maxRedirects: 3,
        validateRedirects: false,
      },
      domains: {
        whitelist: ["trusted.com", "api.trusted.com"],
        blacklist: ["blocked.com"],
        allowSubdomains: false,
      },
      rateLimit: {
        maxRequests: 200,
        windowMs: 120_000,
        maxConcurrent: 20,
      },
      cache: {
        enabled: false,
        maxEntries: 500,
        defaultTtlMs: 60_000,
        maxResponseSize: 500_000,
      },
      browser: {
        headless: false,
        timeout: 60_000,
        viewportWidth: 1920,
        viewportHeight: 1080,
        cdpEndpoint: "http://localhost:9222",
        userAgent: "TestAgent/1.0",
      },
    };

    const config = WebBrowsingConfigSchema.parse(customConfig);

    expect(config.timeout).toBe(45_000);
    expect(config.maxResponseSize).toBe(5_000_000);
    expect(config.security?.blockPrivateIPs).toBe(false);
    expect(config.security?.maxRedirects).toBe(3);
    expect(config.domains?.whitelist).toEqual(["trusted.com", "api.trusted.com"]);
    expect(config.domains?.blacklist).toEqual(["blocked.com"]);
    expect(config.rateLimit?.maxRequests).toBe(200);
    expect(config.cache?.enabled).toBe(false);
    expect(config.browser?.cdpEndpoint).toBe("http://localhost:9222");
  });
});

describe("parseWebBrowsingConfig", () => {
  it("returns valid config with defaults from empty input", () => {
    const config = parseWebBrowsingConfig({});

    expect(config.security).toBeDefined();
    expect(config.domains).toBeDefined();
    expect(config.rateLimit).toBeDefined();
    expect(config.cache).toBeDefined();
    expect(config.browser).toBeDefined();
    expect(config.timeout).toBe(30_000);
  });

  it("returns valid config from undefined input", () => {
    const config = parseWebBrowsingConfig();

    expect(config.security.blockPrivateIPs).toBe(true);
    expect(config.rateLimit.maxRequests).toBe(100);
    expect(config.cache.enabled).toBe(true);
  });

  it("merges partial config correctly", () => {
    const config = parseWebBrowsingConfig({
      timeout: 15_000,
      security: { blockPrivateIPs: false },
    });

    expect(config.timeout).toBe(15_000);
    expect(config.security.blockPrivateIPs).toBe(false);
    expect(config.security.blockCloudMetadata).toBe(true); // Default preserved
    expect(config.rateLimit.maxRequests).toBe(100); // Default preserved
  });

  it("throws ZodError for invalid input", () => {
    expect(() => parseWebBrowsingConfig({ timeout: "invalid" })).toThrow(ZodError);
    expect(() => parseWebBrowsingConfig({ timeout: -1 })).toThrow(ZodError);
  });

  it("throws ZodError for invalid nested values", () => {
    expect(() =>
      parseWebBrowsingConfig({
        security: { maxRedirects: -5 },
      })
    ).toThrow(ZodError);
  });
});
