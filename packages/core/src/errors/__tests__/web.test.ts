import { describe, expect, it } from "vitest";
import {
  BrowserError,
  CDPConnectionError,
  CloudMetadataError,
  ConnectionError,
  DNSRebindingError,
  DomainBlockedError,
  PrivateIPError,
  RateLimitError,
  UnsafeRedirectError,
  WebError,
  WebErrorCode,
} from "../web.js";

describe("WebErrorCode", () => {
  describe("SSRF Protection codes (3100-3109)", () => {
    it("should have PRIVATE_IP_BLOCKED at 3100", () => {
      expect(WebErrorCode.PRIVATE_IP_BLOCKED).toBe(3100);
    });

    it("should have DNS_REBINDING_DETECTED at 3101", () => {
      expect(WebErrorCode.DNS_REBINDING_DETECTED).toBe(3101);
    });

    it("should have CLOUD_METADATA_BLOCKED at 3102", () => {
      expect(WebErrorCode.CLOUD_METADATA_BLOCKED).toBe(3102);
    });

    it("should have UNSAFE_REDIRECT at 3103", () => {
      expect(WebErrorCode.UNSAFE_REDIRECT).toBe(3103);
    });

    it("should have DNS_RESOLUTION_FAILED at 3104", () => {
      expect(WebErrorCode.DNS_RESOLUTION_FAILED).toBe(3104);
    });
  });

  describe("Domain Control codes (3110-3119)", () => {
    it("should have DOMAIN_BLOCKED at 3110", () => {
      expect(WebErrorCode.DOMAIN_BLOCKED).toBe(3110);
    });

    it("should have DOMAIN_NOT_WHITELISTED at 3111", () => {
      expect(WebErrorCode.DOMAIN_NOT_WHITELISTED).toBe(3111);
    });
  });

  describe("Rate Limiting codes (3120-3129)", () => {
    it("should have RATE_LIMIT_EXCEEDED at 3120", () => {
      expect(WebErrorCode.RATE_LIMIT_EXCEEDED).toBe(3120);
    });

    it("should have CONCURRENT_LIMIT_EXCEEDED at 3121", () => {
      expect(WebErrorCode.CONCURRENT_LIMIT_EXCEEDED).toBe(3121);
    });
  });

  describe("Connection Error codes (3130-3139)", () => {
    it("should have CONNECTION_TIMEOUT at 3130", () => {
      expect(WebErrorCode.CONNECTION_TIMEOUT).toBe(3130);
    });

    it("should have CONNECTION_REFUSED at 3131", () => {
      expect(WebErrorCode.CONNECTION_REFUSED).toBe(3131);
    });

    it("should have TLS_ERROR at 3132", () => {
      expect(WebErrorCode.TLS_ERROR).toBe(3132);
    });
  });

  describe("Response Error codes (3140-3149)", () => {
    it("should have RESPONSE_TOO_LARGE at 3140", () => {
      expect(WebErrorCode.RESPONSE_TOO_LARGE).toBe(3140);
    });

    it("should have INVALID_CONTENT_TYPE at 3141", () => {
      expect(WebErrorCode.INVALID_CONTENT_TYPE).toBe(3141);
    });

    it("should have PARSE_ERROR at 3142", () => {
      expect(WebErrorCode.PARSE_ERROR).toBe(3142);
    });
  });

  describe("Browser Error codes (3150-3159)", () => {
    it("should have BROWSER_NOT_AVAILABLE at 3150", () => {
      expect(WebErrorCode.BROWSER_NOT_AVAILABLE).toBe(3150);
    });

    it("should have CDP_CONNECTION_FAILED at 3151", () => {
      expect(WebErrorCode.CDP_CONNECTION_FAILED).toBe(3151);
    });

    it("should have PAGE_LOAD_TIMEOUT at 3152", () => {
      expect(WebErrorCode.PAGE_LOAD_TIMEOUT).toBe(3152);
    });

    it("should have NAVIGATION_FAILED at 3153", () => {
      expect(WebErrorCode.NAVIGATION_FAILED).toBe(3153);
    });
  });
});

describe("WebError", () => {
  describe("constructor", () => {
    it("should set all properties correctly", () => {
      const context = { foo: "bar" };
      const error = new WebError("Test error", WebErrorCode.PRIVATE_IP_BLOCKED, true, context);

      expect(error.name).toBe("WebError");
      expect(error.message).toBe("Test error");
      expect(error.webCode).toBe(WebErrorCode.PRIVATE_IP_BLOCKED);
      expect(error.isRetryable).toBe(true);
      expect(error.webContext).toEqual(context);
      expect(error.errorId).toBeDefined();
      expect(error.timestamp).toBeDefined();
    });

    it("should default isRetryable to false", () => {
      const error = new WebError("Test", WebErrorCode.DOMAIN_BLOCKED);
      expect(error.isRetryable).toBe(false);
    });

    it("should generate unique errorId", () => {
      const error1 = new WebError("Test 1", WebErrorCode.DOMAIN_BLOCKED);
      const error2 = new WebError("Test 2", WebErrorCode.DOMAIN_BLOCKED);
      expect(error1.errorId).not.toBe(error2.errorId);
    });

    it("should set timestamp in ISO format", () => {
      const error = new WebError("Test", WebErrorCode.DOMAIN_BLOCKED);
      expect(() => new Date(error.timestamp)).not.toThrow();
    });

    it("should extend Error", () => {
      const error = new WebError("Test", WebErrorCode.DOMAIN_BLOCKED);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("category()", () => {
    it('should return "ssrf" for codes 3100-3109', () => {
      expect(new WebError("", WebErrorCode.PRIVATE_IP_BLOCKED).category()).toBe("ssrf");
      expect(new WebError("", WebErrorCode.DNS_REBINDING_DETECTED).category()).toBe("ssrf");
      expect(new WebError("", WebErrorCode.CLOUD_METADATA_BLOCKED).category()).toBe("ssrf");
      expect(new WebError("", WebErrorCode.UNSAFE_REDIRECT).category()).toBe("ssrf");
      expect(new WebError("", WebErrorCode.DNS_RESOLUTION_FAILED).category()).toBe("ssrf");
    });

    it('should return "domain" for codes 3110-3119', () => {
      expect(new WebError("", WebErrorCode.DOMAIN_BLOCKED).category()).toBe("domain");
      expect(new WebError("", WebErrorCode.DOMAIN_NOT_WHITELISTED).category()).toBe("domain");
    });

    it('should return "rate_limit" for codes 3120-3129', () => {
      expect(new WebError("", WebErrorCode.RATE_LIMIT_EXCEEDED).category()).toBe("rate_limit");
      expect(new WebError("", WebErrorCode.CONCURRENT_LIMIT_EXCEEDED).category()).toBe(
        "rate_limit"
      );
    });

    it('should return "connection" for codes 3130-3139', () => {
      expect(new WebError("", WebErrorCode.CONNECTION_TIMEOUT).category()).toBe("connection");
      expect(new WebError("", WebErrorCode.CONNECTION_REFUSED).category()).toBe("connection");
      expect(new WebError("", WebErrorCode.TLS_ERROR).category()).toBe("connection");
    });

    it('should return "response" for codes 3140-3149', () => {
      expect(new WebError("", WebErrorCode.RESPONSE_TOO_LARGE).category()).toBe("response");
      expect(new WebError("", WebErrorCode.INVALID_CONTENT_TYPE).category()).toBe("response");
      expect(new WebError("", WebErrorCode.PARSE_ERROR).category()).toBe("response");
    });

    it('should return "browser" for codes 3150-3159', () => {
      expect(new WebError("", WebErrorCode.BROWSER_NOT_AVAILABLE).category()).toBe("browser");
      expect(new WebError("", WebErrorCode.CDP_CONNECTION_FAILED).category()).toBe("browser");
      expect(new WebError("", WebErrorCode.PAGE_LOAD_TIMEOUT).category()).toBe("browser");
      expect(new WebError("", WebErrorCode.NAVIGATION_FAILED).category()).toBe("browser");
    });

    it('should return "unknown" for codes outside known ranges', () => {
      // Using type assertion to test edge case
      const error = new WebError("", 9999 as WebErrorCode);
      expect(error.category()).toBe("unknown");
    });
  });

  describe("toUserMessage()", () => {
    it("should format with uppercase category", () => {
      const error = new WebError("Connection failed", WebErrorCode.CONNECTION_TIMEOUT);
      expect(error.toUserMessage()).toBe("[CONNECTION] Connection failed");
    });

    it("should work for all categories", () => {
      expect(new WebError("msg", WebErrorCode.PRIVATE_IP_BLOCKED).toUserMessage()).toBe(
        "[SSRF] msg"
      );
      expect(new WebError("msg", WebErrorCode.DOMAIN_BLOCKED).toUserMessage()).toBe("[DOMAIN] msg");
      expect(new WebError("msg", WebErrorCode.RATE_LIMIT_EXCEEDED).toUserMessage()).toBe(
        "[RATE_LIMIT] msg"
      );
    });
  });
});

describe("PrivateIPError", () => {
  it("should set correct code (3100)", () => {
    const error = new PrivateIPError("192.168.1.1");
    expect(error.webCode).toBe(3100);
    expect(error.webCode).toBe(WebErrorCode.PRIVATE_IP_BLOCKED);
  });

  it("should store IP in context", () => {
    const error = new PrivateIPError("10.0.0.1");
    expect(error.webContext?.ip).toBe("10.0.0.1");
  });

  it("should store URL in context when provided", () => {
    const error = new PrivateIPError("192.168.1.1", "http://internal.local/api");
    expect(error.webContext?.ip).toBe("192.168.1.1");
    expect(error.webContext?.url).toBe("http://internal.local/api");
  });

  it("should not be retryable", () => {
    const error = new PrivateIPError("192.168.1.1");
    expect(error.isRetryable).toBe(false);
  });

  it("should have correct name", () => {
    const error = new PrivateIPError("192.168.1.1");
    expect(error.name).toBe("PrivateIPError");
  });

  it("should format message with IP", () => {
    const error = new PrivateIPError("172.16.0.1");
    expect(error.message).toBe("Access to private IP address blocked: 172.16.0.1");
  });
});

describe("DNSRebindingError", () => {
  it("should set correct code (3101)", () => {
    const error = new DNSRebindingError("evil.com", ["192.168.1.1"]);
    expect(error.webCode).toBe(3101);
    expect(error.webCode).toBe(WebErrorCode.DNS_REBINDING_DETECTED);
  });

  it("should store hostname in context", () => {
    const error = new DNSRebindingError("attacker.com", ["10.0.0.1"]);
    expect(error.webContext?.hostname).toBe("attacker.com");
  });

  it("should store resolvedIPs in context", () => {
    const ips = ["192.168.1.1", "10.0.0.1"];
    const error = new DNSRebindingError("evil.com", ips);
    expect(error.webContext?.resolvedIPs).toEqual(ips);
  });

  it("should not be retryable", () => {
    const error = new DNSRebindingError("evil.com", ["192.168.1.1"]);
    expect(error.isRetryable).toBe(false);
  });

  it("should have correct name", () => {
    const error = new DNSRebindingError("evil.com", ["192.168.1.1"]);
    expect(error.name).toBe("DNSRebindingError");
  });

  it("should format message with hostname", () => {
    const error = new DNSRebindingError("malicious.com", ["127.0.0.1"]);
    expect(error.message).toBe("DNS rebinding attack detected for malicious.com");
  });
});

describe("CloudMetadataError", () => {
  it("should set correct code (3102)", () => {
    const error = new CloudMetadataError("http://169.254.169.254/");
    expect(error.webCode).toBe(3102);
    expect(error.webCode).toBe(WebErrorCode.CLOUD_METADATA_BLOCKED);
  });

  it("should store url in context", () => {
    const error = new CloudMetadataError("http://169.254.169.254/latest/meta-data");
    expect(error.webContext?.url).toBe("http://169.254.169.254/latest/meta-data");
  });

  it("should store provider in context when provided", () => {
    const error = new CloudMetadataError("http://169.254.169.254/", "aws");
    expect(error.webContext?.url).toBe("http://169.254.169.254/");
    expect(error.webContext?.provider).toBe("aws");
  });

  it("should not be retryable", () => {
    const error = new CloudMetadataError("http://169.254.169.254/");
    expect(error.isRetryable).toBe(false);
  });

  it("should have correct name", () => {
    const error = new CloudMetadataError("http://169.254.169.254/");
    expect(error.name).toBe("CloudMetadataError");
  });

  it("should format message with URL", () => {
    const error = new CloudMetadataError("http://metadata.google.internal/", "gcp");
    expect(error.message).toBe(
      "Access to cloud metadata endpoint blocked: http://metadata.google.internal/"
    );
  });
});

describe("UnsafeRedirectError", () => {
  it("should set correct code (3103)", () => {
    const error = new UnsafeRedirectError(
      "http://safe.com",
      "http://192.168.1.1",
      "Redirected to private IP"
    );
    expect(error.webCode).toBe(3103);
    expect(error.webCode).toBe(WebErrorCode.UNSAFE_REDIRECT);
  });

  it("should store originalUrl in context", () => {
    const error = new UnsafeRedirectError("http://original.com", "http://evil.com", "reason");
    expect(error.webContext?.originalUrl).toBe("http://original.com");
  });

  it("should store redirectUrl in context", () => {
    const error = new UnsafeRedirectError("http://original.com", "http://internal.local", "reason");
    expect(error.webContext?.redirectUrl).toBe("http://internal.local");
  });

  it("should store reason in context", () => {
    const error = new UnsafeRedirectError("http://a.com", "http://b.com", "Protocol downgrade");
    expect(error.webContext?.reason).toBe("Protocol downgrade");
  });

  it("should not be retryable", () => {
    const error = new UnsafeRedirectError("a", "b", "reason");
    expect(error.isRetryable).toBe(false);
  });

  it("should have correct name", () => {
    const error = new UnsafeRedirectError("a", "b", "reason");
    expect(error.name).toBe("UnsafeRedirectError");
  });

  it("should format message with reason", () => {
    const error = new UnsafeRedirectError(
      "http://a.com",
      "http://b.com",
      "Cross-origin redirect blocked"
    );
    expect(error.message).toBe("Unsafe redirect blocked: Cross-origin redirect blocked");
  });
});

describe("RateLimitError", () => {
  it("should set correct code (3120)", () => {
    const error = new RateLimitError("api.example.com");
    expect(error.webCode).toBe(3120);
    expect(error.webCode).toBe(WebErrorCode.RATE_LIMIT_EXCEEDED);
  });

  it("should be retryable", () => {
    const error = new RateLimitError("example.com");
    expect(error.isRetryable).toBe(true);
  });

  it("should store domain in context", () => {
    const error = new RateLimitError("api.github.com");
    expect(error.webContext?.domain).toBe("api.github.com");
  });

  it("should calculate retryAfter in seconds from milliseconds", () => {
    const error = new RateLimitError("example.com", 5000);
    expect(error.retryAfter).toBe(5);
  });

  it("should round up retryAfter to next second", () => {
    const error = new RateLimitError("example.com", 1500);
    expect(error.retryAfter).toBe(2);
  });

  it("should have undefined retryAfter when not provided", () => {
    const error = new RateLimitError("example.com");
    expect(error.retryAfter).toBeUndefined();
  });

  it("should store retryAfterMs in context", () => {
    const error = new RateLimitError("example.com", 3000);
    expect(error.webContext?.retryAfterMs).toBe(3000);
  });

  it("should have correct name", () => {
    const error = new RateLimitError("example.com");
    expect(error.name).toBe("RateLimitError");
  });

  it("should format message with domain", () => {
    const error = new RateLimitError("api.openai.com");
    expect(error.message).toBe("Rate limit exceeded for api.openai.com");
  });
});

describe("DomainBlockedError", () => {
  describe("blacklist reason", () => {
    it("should use DOMAIN_BLOCKED code (3110)", () => {
      const error = new DomainBlockedError("evil.com", "blacklist");
      expect(error.webCode).toBe(3110);
      expect(error.webCode).toBe(WebErrorCode.DOMAIN_BLOCKED);
    });

    it("should format message for blacklist", () => {
      const error = new DomainBlockedError("malware.com", "blacklist");
      expect(error.message).toBe("Domain malware.com is blocked");
    });
  });

  describe("not_whitelisted reason", () => {
    it("should use DOMAIN_NOT_WHITELISTED code (3111)", () => {
      const error = new DomainBlockedError("unknown.com", "not_whitelisted");
      expect(error.webCode).toBe(3111);
      expect(error.webCode).toBe(WebErrorCode.DOMAIN_NOT_WHITELISTED);
    });

    it("should format message for whitelist", () => {
      const error = new DomainBlockedError("random.io", "not_whitelisted");
      expect(error.message).toBe("Domain random.io is not in whitelist");
    });
  });

  it("should store domain in context", () => {
    const error = new DomainBlockedError("blocked.com", "blacklist");
    expect(error.webContext?.domain).toBe("blocked.com");
  });

  it("should store reason in context", () => {
    const error = new DomainBlockedError("blocked.com", "blacklist");
    expect(error.webContext?.reason).toBe("blacklist");
  });

  it("should not be retryable", () => {
    const error = new DomainBlockedError("blocked.com", "blacklist");
    expect(error.isRetryable).toBe(false);
  });

  it("should have correct name", () => {
    const error = new DomainBlockedError("blocked.com", "blacklist");
    expect(error.name).toBe("DomainBlockedError");
  });
});

describe("ConnectionError", () => {
  it("should accept CONNECTION_TIMEOUT code", () => {
    const error = new ConnectionError(
      "Connection timed out",
      WebErrorCode.CONNECTION_TIMEOUT,
      "http://slow.com"
    );
    expect(error.webCode).toBe(WebErrorCode.CONNECTION_TIMEOUT);
  });

  it("should accept CONNECTION_REFUSED code", () => {
    const error = new ConnectionError(
      "Connection refused",
      WebErrorCode.CONNECTION_REFUSED,
      "http://down.com"
    );
    expect(error.webCode).toBe(WebErrorCode.CONNECTION_REFUSED);
  });

  it("should accept TLS_ERROR code", () => {
    const error = new ConnectionError(
      "TLS handshake failed",
      WebErrorCode.TLS_ERROR,
      "https://badcert.com"
    );
    expect(error.webCode).toBe(WebErrorCode.TLS_ERROR);
  });

  it("should store url in context", () => {
    const error = new ConnectionError(
      "Timeout",
      WebErrorCode.CONNECTION_TIMEOUT,
      "http://example.com/api"
    );
    expect(error.webContext?.url).toBe("http://example.com/api");
  });

  it("should default to retryable", () => {
    const error = new ConnectionError(
      "Timeout",
      WebErrorCode.CONNECTION_TIMEOUT,
      "http://example.com"
    );
    expect(error.isRetryable).toBe(true);
  });

  it("should allow overriding isRetryable", () => {
    const error = new ConnectionError(
      "TLS error",
      WebErrorCode.TLS_ERROR,
      "https://badcert.com",
      false
    );
    expect(error.isRetryable).toBe(false);
  });

  it("should have correct name", () => {
    const error = new ConnectionError(
      "Timeout",
      WebErrorCode.CONNECTION_TIMEOUT,
      "http://example.com"
    );
    expect(error.name).toBe("ConnectionError");
  });
});

describe("BrowserError", () => {
  it("should accept any WebErrorCode", () => {
    const error = new BrowserError("Browser not available", WebErrorCode.BROWSER_NOT_AVAILABLE);
    expect(error.webCode).toBe(WebErrorCode.BROWSER_NOT_AVAILABLE);
  });

  it("should store context when provided", () => {
    const context = { pageUrl: "http://example.com" };
    const error = new BrowserError("Page load failed", WebErrorCode.PAGE_LOAD_TIMEOUT, context);
    expect(error.webContext).toEqual(context);
  });

  it("should not be retryable", () => {
    const error = new BrowserError("Error", WebErrorCode.BROWSER_NOT_AVAILABLE);
    expect(error.isRetryable).toBe(false);
  });

  it("should have correct name", () => {
    const error = new BrowserError("Error", WebErrorCode.BROWSER_NOT_AVAILABLE);
    expect(error.name).toBe("BrowserError");
  });
});

describe("CDPConnectionError", () => {
  it("should set correct code (3151)", () => {
    const error = new CDPConnectionError("ws://localhost:9222");
    expect(error.webCode).toBe(3151);
    expect(error.webCode).toBe(WebErrorCode.CDP_CONNECTION_FAILED);
  });

  it("should store endpoint in context", () => {
    const error = new CDPConnectionError("ws://127.0.0.1:9222/devtools/browser");
    expect(error.webContext?.endpoint).toBe("ws://127.0.0.1:9222/devtools/browser");
  });

  it("should store cause in context when provided", () => {
    const error = new CDPConnectionError("ws://localhost:9222", "ECONNREFUSED");
    expect(error.webContext?.cause).toBe("ECONNREFUSED");
  });

  it("should not be retryable", () => {
    const error = new CDPConnectionError("ws://localhost:9222");
    expect(error.isRetryable).toBe(false);
  });

  it("should have correct name", () => {
    const error = new CDPConnectionError("ws://localhost:9222");
    expect(error.name).toBe("CDPConnectionError");
  });

  it("should format message with endpoint", () => {
    const error = new CDPConnectionError("ws://localhost:9222");
    expect(error.message).toBe("Failed to connect to CDP endpoint: ws://localhost:9222");
  });

  it("should extend BrowserError", () => {
    const error = new CDPConnectionError("ws://localhost:9222");
    expect(error).toBeInstanceOf(BrowserError);
    expect(error).toBeInstanceOf(WebError);
    expect(error).toBeInstanceOf(Error);
  });
});
