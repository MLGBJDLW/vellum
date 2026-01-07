import type { LookupAddress } from "node:dns";
import * as dns from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebErrorCode } from "../../../errors/web.js";
import { checkDomain, checkUrlDomain } from "../domain-control.js";
import { isCloudMetadata, isPrivateIP, normalizeIP, validateUrlWithDNS } from "../url-validator.js";

// Mock DNS for rebinding tests
vi.mock("node:dns/promises", async () => {
  const actual = await vi.importActual<typeof dns>("node:dns/promises");
  return {
    ...actual,
    lookup: vi.fn(),
  };
});

// Type assertion for the mocked lookup function that returns LookupAddress[]
const mockedLookup = dns.lookup as ReturnType<typeof vi.fn> & {
  mockResolvedValue: (value: LookupAddress[]) => void;
  mockRejectedValue: (error: Error) => void;
};

describe("SSRF Protection Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("DNS Rebinding Attack Prevention", () => {
    it("should block public domain resolving to private 127.0.0.1", async () => {
      // Simulate DNS rebinding: public domain resolves to localhost
      mockedLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

      const result = await validateUrlWithDNS("https://evil-rebind.example.com/api");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS rebinding detected");
      expect(result.error).toContain("127.0.0.1");
      expect(result.resolvedIPs).toContain("127.0.0.1");
    });

    it("should block public domain resolving to private 10.x.x.x", async () => {
      mockedLookup.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);

      const result = await validateUrlWithDNS("https://attacker.com/steal");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS rebinding detected");
      expect(result.error).toContain("10.0.0.1");
    });

    it("should block public domain resolving to private 192.168.x.x", async () => {
      mockedLookup.mockResolvedValue([{ address: "192.168.1.1", family: 4 }]);

      const result = await validateUrlWithDNS("https://internal-leak.test/data");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS rebinding detected");
      expect(result.error).toContain("192.168.1.1");
    });

    it("should block public domain resolving to private 172.16-31.x.x", async () => {
      mockedLookup.mockResolvedValue([{ address: "172.20.0.1", family: 4 }]);

      const result = await validateUrlWithDNS("https://fake-api.com/endpoint");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS rebinding detected");
    });

    it("should block when any resolved IP is private (multiple A records)", async () => {
      // Attacker returns mix of public and private IPs
      mockedLookup.mockResolvedValue([
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]);

      const result = await validateUrlWithDNS("https://mixed-records.com/");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS rebinding detected");
      expect(result.resolvedIPs).toContain("8.8.8.8");
      expect(result.resolvedIPs).toContain("127.0.0.1");
    });

    it("should allow public domain resolving to public IP", async () => {
      mockedLookup.mockResolvedValue([{ address: "142.250.80.46", family: 4 }]);

      const result = await validateUrlWithDNS("https://google.com/");

      expect(result.valid).toBe(true);
      expect(result.resolvedIPs).toContain("142.250.80.46");
      expect(result.error).toBeUndefined();
    });

    it("should allow private IPs when explicitly permitted", async () => {
      mockedLookup.mockResolvedValue([{ address: "192.168.1.1", family: 4 }]);

      const result = await validateUrlWithDNS("https://internal.local/", {
        allowPrivateIPs: true,
      });

      expect(result.valid).toBe(true);
      expect(result.resolvedIPs).toContain("192.168.1.1");
    });

    it("should block IPv6 loopback via DNS rebinding", async () => {
      mockedLookup.mockResolvedValue([{ address: "::1", family: 6 }]);

      const result = await validateUrlWithDNS("https://ipv6-rebind.com/");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS rebinding detected");
      expect(result.error).toContain("::1");
    });

    it("should block IPv6 unique local address via DNS rebinding", async () => {
      mockedLookup.mockResolvedValue([{ address: "fd00::1", family: 6 }]);

      const result = await validateUrlWithDNS("https://fd-rebind.test/");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS rebinding detected");
    });
  });

  describe("Cloud Metadata Endpoint Protection", () => {
    describe("AWS Metadata", () => {
      it("should block AWS metadata IP 169.254.169.254", () => {
        const result = isCloudMetadata("http://169.254.169.254/latest/meta-data/");

        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("AWS");
      });

      it("should block AWS instance-data hostname", () => {
        const result = isCloudMetadata("http://instance-data/latest/meta-data/");

        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("AWS");
      });

      it("should block AWS IMDSv2 token endpoint", () => {
        const result = isCloudMetadata("http://169.254.169.254/latest/api/token");

        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("AWS");
      });
    });

    describe("GCP Metadata", () => {
      it("should block GCP metadata.google.internal", () => {
        const result = isCloudMetadata("http://metadata.google.internal/computeMetadata/v1/");

        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("GCP");
      });

      it("should block GCP metadata.goog", () => {
        const result = isCloudMetadata("http://metadata.goog/computeMetadata/v1/");

        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("GCP");
      });
    });

    describe("Azure Metadata", () => {
      it("should block Azure IMDS 169.254.169.254", () => {
        const result = isCloudMetadata(
          "http://169.254.169.254/metadata/instance?api-version=2021-02-01"
        );

        expect(result.isMetadata).toBe(true);
        // Could be AWS or Azure - both use same IP
        expect(["AWS", "Azure", "GCP", "DigitalOcean", "Oracle"]).toContain(result.provider);
      });

      it("should block Azure special IP 168.63.129.16", () => {
        const result = isCloudMetadata("http://168.63.129.16/metadata/instance");

        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("Azure");
      });
    });

    describe("Alibaba Cloud Metadata", () => {
      it("should block Alibaba metadata IP 100.100.100.200", () => {
        const result = isCloudMetadata("http://100.100.100.200/latest/meta-data/");

        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("Alibaba");
      });
    });

    describe("Kubernetes Metadata", () => {
      it("should block kubernetes.default", () => {
        const result = isCloudMetadata("https://kubernetes.default/api/v1/secrets");

        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("Kubernetes");
      });

      it("should block kubernetes.default.svc", () => {
        const result = isCloudMetadata("https://kubernetes.default.svc/api/v1/namespaces");

        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("Kubernetes");
      });

      it("should block subdomains of kubernetes.default.svc", () => {
        // The implementation matches hostnames that end with the pattern
        const result = isCloudMetadata("https://api.kubernetes.default.svc/api");

        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("Kubernetes");
      });
    });

    describe("Non-metadata URLs", () => {
      it("should allow regular public URLs", () => {
        expect(isCloudMetadata("https://api.example.com/data").isMetadata).toBe(false);
        expect(isCloudMetadata("https://google.com/").isMetadata).toBe(false);
        expect(isCloudMetadata("https://github.com/repo").isMetadata).toBe(false);
      });

      it("should allow URLs with metadata-like paths on non-metadata hosts", () => {
        // Path patterns alone should not trigger on public hosts
        expect(isCloudMetadata("https://example.com/latest/meta-data/").isMetadata).toBe(false);
      });
    });
  });

  describe("IP Obfuscation Attack Prevention", () => {
    describe("Decimal encoding", () => {
      it("should normalize and detect decimal-encoded localhost", () => {
        // 2130706433 = 127.0.0.1
        const normalized = normalizeIP("2130706433");
        expect(normalized).toBe("127.0.0.1");
        expect(isPrivateIP(normalized ?? "")).toBe(true);
      });

      it("should normalize and detect decimal-encoded 10.0.0.1", () => {
        // 167772161 = 10.0.0.1
        const normalized = normalizeIP("167772161");
        expect(normalized).toBe("10.0.0.1");
        expect(isPrivateIP(normalized ?? "")).toBe(true);
      });

      it("should normalize and detect decimal-encoded 192.168.1.1", () => {
        // 3232235777 = 192.168.1.1
        const normalized = normalizeIP("3232235777");
        expect(normalized).toBe("192.168.1.1");
        expect(isPrivateIP(normalized ?? "")).toBe(true);
      });

      it("should block decimal-encoded private IP in URL validation", async () => {
        // Direct IP access with decimal encoding
        const result = await validateUrlWithDNS("http://2130706433/admin");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP blocked");
        expect(result.resolvedIPs).toContain("127.0.0.1");
      });
    });

    describe("Octal encoding", () => {
      it("should normalize and detect octal-encoded localhost", () => {
        // 0177.0.0.1 = 127.0.0.1
        const normalized = normalizeIP("0177.0.0.1");
        expect(normalized).toBe("127.0.0.1");
        expect(isPrivateIP(normalized ?? "")).toBe(true);
      });

      it("should normalize and detect octal-encoded 10.0.0.1", () => {
        // 012.0.0.1 = 10.0.0.1
        const normalized = normalizeIP("012.0.0.1");
        expect(normalized).toBe("10.0.0.1");
        expect(isPrivateIP(normalized ?? "")).toBe(true);
      });

      it("should block octal-encoded private IP in URL validation", async () => {
        const result = await validateUrlWithDNS("http://0177.0.0.1/secret");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP blocked");
      });
    });

    describe("Hexadecimal encoding", () => {
      it("should normalize and detect hex-encoded localhost", () => {
        // 0x7f.0x0.0x0.0x1 = 127.0.0.1
        const normalized = normalizeIP("0x7f.0x0.0x0.0x1");
        expect(normalized).toBe("127.0.0.1");
        expect(isPrivateIP(normalized ?? "")).toBe(true);
      });

      it("should normalize and detect hex-encoded 192.168.0.1", () => {
        // 0xc0.0xa8.0x0.0x1 = 192.168.0.1
        const normalized = normalizeIP("0xc0.0xa8.0x0.0x1");
        expect(normalized).toBe("192.168.0.1");
        expect(isPrivateIP(normalized ?? "")).toBe(true);
      });

      it("should block hex-encoded private IP in URL validation", async () => {
        const result = await validateUrlWithDNS("http://0x7f.0x0.0x0.0x1/api");

        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP blocked");
      });
    });

    describe("Mixed obfuscation", () => {
      it("should handle standard IP format correctly", () => {
        expect(normalizeIP("127.0.0.1")).toBe("127.0.0.1");
        expect(normalizeIP("192.168.1.1")).toBe("192.168.1.1");
        expect(normalizeIP("8.8.8.8")).toBe("8.8.8.8");
      });

      it("should return null for invalid IP strings", () => {
        expect(normalizeIP("not-an-ip")).toBeNull();
        expect(normalizeIP("hello.world")).toBeNull();
      });
    });
  });

  describe("Domain Control Integration", () => {
    describe("Blacklist precedence over implicit allow", () => {
      it("should block blacklisted domain even without whitelist", () => {
        const result = checkDomain("malicious.com", {
          blacklist: ["malicious.com", "evil.org"],
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("blacklisted");
        expect(result.code).toBe(WebErrorCode.DOMAIN_BLOCKED);
        expect(result.matchedPattern).toBe("malicious.com");
      });

      it("should allow non-blacklisted domain without whitelist", () => {
        const result = checkDomain("safe.com", {
          blacklist: ["malicious.com"],
        });

        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("allowed");
      });
    });

    describe("Whitelist with blacklist combination", () => {
      it("should block blacklisted domain even if in whitelist", () => {
        // Blacklist takes precedence
        const result = checkDomain("api.example.com", {
          whitelist: ["*.example.com"],
          blacklist: ["api.example.com"],
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("blacklisted");
        expect(result.matchedPattern).toBe("api.example.com");
      });

      it("should allow whitelisted domain not in blacklist", () => {
        const result = checkDomain("www.example.com", {
          whitelist: ["*.example.com"],
          blacklist: ["api.example.com"],
        });

        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("allowed");
      });

      it("should block domain not in whitelist", () => {
        const result = checkDomain("other.com", {
          whitelist: ["example.com", "trusted.org"],
          blacklist: ["evil.com"],
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("not_whitelisted");
        expect(result.code).toBe(WebErrorCode.DOMAIN_NOT_WHITELISTED);
      });
    });

    describe("Wildcard pattern matching", () => {
      it("should match wildcard subdomains", () => {
        const result = checkDomain("sub.api.example.com", {
          whitelist: ["*.example.com"],
        });

        expect(result.allowed).toBe(true);
      });

      it("should match base domain with wildcard pattern", () => {
        const result = checkDomain("example.com", {
          whitelist: ["*.example.com"],
        });

        expect(result.allowed).toBe(true);
      });

      it("should not match unrelated domains with wildcard", () => {
        const result = checkDomain("example.com.evil.com", {
          whitelist: ["*.example.com"],
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("not_whitelisted");
      });
    });

    describe("Subdomain control", () => {
      it("should allow subdomains by default", () => {
        const result = checkDomain("api.example.com", {
          whitelist: ["example.com"],
          allowSubdomains: true,
        });

        expect(result.allowed).toBe(true);
      });

      it("should block subdomains when disabled", () => {
        const result = checkDomain("api.example.com", {
          whitelist: ["example.com"],
          allowSubdomains: false,
        });

        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("not_whitelisted");
      });
    });

    describe("URL-based domain checking", () => {
      it("should extract and check domain from full URL", () => {
        const result = checkUrlDomain("https://api.example.com/v1/data?key=123", {
          whitelist: ["*.example.com"],
        });

        expect(result.allowed).toBe(true);
      });

      it("should handle ports in URL correctly", () => {
        const result = checkUrlDomain("https://example.com:8443/api", {
          whitelist: ["example.com"],
        });

        expect(result.allowed).toBe(true);
      });

      it("should block invalid URLs", () => {
        const result = checkUrlDomain("not-a-valid-url", {
          whitelist: ["example.com"],
        });

        expect(result.allowed).toBe(false);
      });
    });
  });

  describe("Combined SSRF Attack Scenarios", () => {
    it("should block DNS rebinding to cloud metadata IP", async () => {
      // Attacker's domain resolves to AWS metadata IP
      mockedLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

      const result = await validateUrlWithDNS("https://steal-aws-creds.com/");

      expect(result.valid).toBe(false);
      // Should be caught by private IP check (link-local range)
      expect(result.error).toContain("DNS rebinding detected");
    });

    it("should detect metadata endpoint with obfuscated IP", () => {
      // Decimal-encoded metadata IP: 2852039166 = 169.254.169.254
      const normalized = normalizeIP("2852039166");
      expect(normalized).toBe("169.254.169.254");

      const metadataCheck = isCloudMetadata(`http://${normalized}/latest/meta-data/`);
      expect(metadataCheck.isMetadata).toBe(true);
    });

    it("should block protocol downgrade attempts", async () => {
      const result = await validateUrlWithDNS("ftp://internal-server/data");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid protocol");
    });

    it("should block file protocol", async () => {
      const result = await validateUrlWithDNS("file:///etc/passwd");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid protocol");
    });

    it("should handle DNS resolution timeout", async () => {
      mockedLookup.mockRejectedValue(new Error("ETIMEDOUT"));

      const result = await validateUrlWithDNS("https://slow-dns.com/", {
        timeout: 100,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS resolution failed");
    });

    it("should handle DNS resolution error", async () => {
      mockedLookup.mockRejectedValue(new Error("NXDOMAIN"));

      const result = await validateUrlWithDNS("https://nonexistent.invalid/");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS resolution failed");
      expect(result.error).toContain("NXDOMAIN");
    });
  });

  describe("Edge Cases and Bypass Attempts", () => {
    it("should handle IPv4-mapped IPv6 addresses", async () => {
      mockedLookup.mockResolvedValue([{ address: "::ffff:127.0.0.1", family: 6 }]);

      const result = await validateUrlWithDNS("https://ipv4-mapped.com/");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("DNS rebinding detected");
    });

    it("should block bracket-enclosed IPv6 loopback in URL", async () => {
      // IPv6 addresses are enclosed in brackets in URLs
      // The hostname from URL is "::1" (brackets stripped by URL parser)
      // normalizeIP returns "::1" which isPrivateIP detects
      const result = await validateUrlWithDNS("http://[::1]/admin");

      expect(result.valid).toBe(false);
      // URL with IPv6 loopback is blocked - either as private IP or DNS error
      expect(result.error).toBeDefined();
    });

    it("should handle empty hostname", async () => {
      const result = await validateUrlWithDNS("http:///path");

      // URL parser behavior - empty hostname
      expect(result.valid).toBe(false);
    });

    it("should validate URL with authentication credentials", async () => {
      mockedLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);

      const result = await validateUrlWithDNS("https://user:pass@example.com/api");

      expect(result.valid).toBe(true);
    });

    it("should handle URL with fragment", async () => {
      mockedLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);

      const result = await validateUrlWithDNS("https://example.com/page#section");

      expect(result.valid).toBe(true);
    });

    it("should handle URL with query parameters", async () => {
      mockedLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);

      const result = await validateUrlWithDNS("https://api.example.com/search?q=test&limit=10");

      expect(result.valid).toBe(true);
    });

    it("should block 0.0.0.0 (unspecified address)", async () => {
      const result = await validateUrlWithDNS("http://0.0.0.0/");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Private IP blocked");
    });

    it("should block broadcast address 255.255.255.255", async () => {
      const result = await validateUrlWithDNS("http://255.255.255.255/");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Private IP blocked");
    });
  });
});
