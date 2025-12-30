import type { LookupAddress } from "node:dns";
import * as dns from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isCloudMetadata,
  isPrivateIP,
  isUnspecifiedIP,
  normalizeIP,
  validateUrlWithDNS,
} from "../url-validator.js";

// Mock dns module
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

describe("url-validator", () => {
  describe("isPrivateIP", () => {
    describe("RFC 1918 ranges", () => {
      it("should detect 10.x.x.x as private", () => {
        expect(isPrivateIP("10.0.0.0")).toBe(true);
        expect(isPrivateIP("10.0.0.1")).toBe(true);
        expect(isPrivateIP("10.255.255.255")).toBe(true);
        expect(isPrivateIP("10.50.100.200")).toBe(true);
      });

      it("should detect 172.16-31.x.x as private", () => {
        expect(isPrivateIP("172.16.0.0")).toBe(true);
        expect(isPrivateIP("172.16.0.1")).toBe(true);
        expect(isPrivateIP("172.31.255.255")).toBe(true);
        expect(isPrivateIP("172.20.50.100")).toBe(true);
        expect(isPrivateIP("172.24.0.1")).toBe(true);
      });

      it("should NOT detect 172.15.x.x or 172.32.x.x as private", () => {
        expect(isPrivateIP("172.15.255.255")).toBe(false);
        expect(isPrivateIP("172.32.0.0")).toBe(false);
      });

      it("should detect 192.168.x.x as private", () => {
        expect(isPrivateIP("192.168.0.0")).toBe(true);
        expect(isPrivateIP("192.168.0.1")).toBe(true);
        expect(isPrivateIP("192.168.255.255")).toBe(true);
        expect(isPrivateIP("192.168.1.100")).toBe(true);
      });
    });

    describe("Loopback range (127.x)", () => {
      it("should detect loopback addresses as private", () => {
        expect(isPrivateIP("127.0.0.1")).toBe(true);
        expect(isPrivateIP("127.0.0.0")).toBe(true);
        expect(isPrivateIP("127.255.255.255")).toBe(true);
        expect(isPrivateIP("127.1.2.3")).toBe(true);
      });
    });

    describe("Link-local range (169.254.x)", () => {
      it("should detect link-local addresses as private", () => {
        expect(isPrivateIP("169.254.0.0")).toBe(true);
        expect(isPrivateIP("169.254.0.1")).toBe(true);
        expect(isPrivateIP("169.254.255.255")).toBe(true);
        expect(isPrivateIP("169.254.169.254")).toBe(true);
      });
    });

    describe("CGNAT range (100.64.x)", () => {
      it("should detect CGNAT addresses in 100.64.x prefix as private", () => {
        // Implementation uses prefix matching for 100.64.
        expect(isPrivateIP("100.64.0.0")).toBe(true);
        expect(isPrivateIP("100.64.0.1")).toBe(true);
        expect(isPrivateIP("100.64.255.255")).toBe(true);
      });

      it("should NOT detect IPs outside CGNAT 100.64.x prefix as private", () => {
        // Note: RFC 6598 CGNAT is 100.64.0.0/10 (100.64-127.x) but implementation
        // only matches 100.64.x prefix, so 100.127.x is not blocked
        expect(isPrivateIP("100.127.255.255")).toBe(false);
        // 100.100.100.200 is also not matched by prefix
        // Note: isCloudMetadata catches Alibaba's 100.100.100.200 separately
        expect(isPrivateIP("100.100.100.200")).toBe(false);
      });
    });

    describe("Documentation ranges", () => {
      it("should detect documentation IPs as private", () => {
        expect(isPrivateIP("192.0.2.0")).toBe(true);
        expect(isPrivateIP("192.0.2.255")).toBe(true);
        expect(isPrivateIP("198.51.100.0")).toBe(true);
        expect(isPrivateIP("198.51.100.255")).toBe(true);
        expect(isPrivateIP("203.0.113.0")).toBe(true);
        expect(isPrivateIP("203.0.113.255")).toBe(true);
      });
    });

    describe("Special addresses", () => {
      it("should detect broadcast address as private", () => {
        expect(isPrivateIP("255.255.255.255")).toBe(true);
      });

      it("should detect current network (0.x) as private", () => {
        expect(isPrivateIP("0.0.0.0")).toBe(true);
        expect(isPrivateIP("0.0.0.1")).toBe(true);
        expect(isPrivateIP("0.255.255.255")).toBe(true);
      });
    });

    describe("IPv6 private addresses", () => {
      it("should detect IPv6 loopback (::1)", () => {
        expect(isPrivateIP("::1")).toBe(true);
      });

      it("should detect expanded IPv6 loopback (0:0:0:0:0:0:0:1)", () => {
        expect(isPrivateIP("0:0:0:0:0:0:0:1")).toBe(true);
      });

      it("should detect unique local addresses (fc/fd)", () => {
        expect(isPrivateIP("fc00::1")).toBe(true);
        expect(isPrivateIP("fd00::1")).toBe(true);
        expect(isPrivateIP("fdab:cdef:1234::1")).toBe(true);
      });

      it("should detect link-local addresses (fe80)", () => {
        expect(isPrivateIP("fe80::1")).toBe(true);
        expect(isPrivateIP("fe80::1234:5678:abcd:ef00")).toBe(true);
      });

      it("should detect unspecified address (::)", () => {
        expect(isPrivateIP("::")).toBe(true);
      });
    });

    describe("IPv4-mapped IPv6 addresses", () => {
      it("should detect IPv4-mapped private addresses", () => {
        expect(isPrivateIP("::ffff:10.0.0.1")).toBe(true);
        expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
        expect(isPrivateIP("::ffff:192.168.1.1")).toBe(true);
        expect(isPrivateIP("::ffff:169.254.1.1")).toBe(true);
      });

      it("should detect 172.16-31 mapped addresses", () => {
        expect(isPrivateIP("::ffff:172.16.0.1")).toBe(true);
        expect(isPrivateIP("::ffff:172.20.0.1")).toBe(true);
        expect(isPrivateIP("::ffff:172.31.255.255")).toBe(true);
      });
    });

    describe("Public IPs should return false", () => {
      it("should allow public IPv4 addresses", () => {
        expect(isPrivateIP("8.8.8.8")).toBe(false);
        expect(isPrivateIP("1.1.1.1")).toBe(false);
        expect(isPrivateIP("142.250.80.46")).toBe(false);
        expect(isPrivateIP("93.184.216.34")).toBe(false);
        expect(isPrivateIP("172.15.0.1")).toBe(false);
        expect(isPrivateIP("172.32.0.1")).toBe(false);
      });

      it("should allow public IPv6 addresses", () => {
        expect(isPrivateIP("2001:4860:4860::8888")).toBe(false);
        expect(isPrivateIP("2606:4700:4700::1111")).toBe(false);
      });
    });

    describe("Edge cases", () => {
      it("should return false for empty input", () => {
        expect(isPrivateIP("")).toBe(false);
      });

      it("should return false for invalid IP formats", () => {
        expect(isPrivateIP("not-an-ip")).toBe(false);
        expect(isPrivateIP("256.256.256.256")).toBe(false);
      });
    });
  });

  describe("isUnspecifiedIP", () => {
    it("should detect IPv4 unspecified address", () => {
      expect(isUnspecifiedIP("0.0.0.0")).toBe(true);
    });

    it("should detect IPv6 unspecified address", () => {
      expect(isUnspecifiedIP("::")).toBe(true);
      expect(isUnspecifiedIP("0:0:0:0:0:0:0:0")).toBe(true);
    });

    it("should return false for normal addresses", () => {
      expect(isUnspecifiedIP("127.0.0.1")).toBe(false);
      expect(isUnspecifiedIP("8.8.8.8")).toBe(false);
    });
  });

  describe("normalizeIP", () => {
    describe("Decimal encoding", () => {
      it("should convert decimal 2130706433 to 127.0.0.1", () => {
        expect(normalizeIP("2130706433")).toBe("127.0.0.1");
      });

      it("should convert decimal 167772161 to 10.0.0.1", () => {
        expect(normalizeIP("167772161")).toBe("10.0.0.1");
      });

      it("should convert decimal 3232235777 to 192.168.1.1", () => {
        expect(normalizeIP("3232235777")).toBe("192.168.1.1");
      });

      it("should handle decimal 0 (0.0.0.0)", () => {
        expect(normalizeIP("0")).toBe("0.0.0.0");
      });

      it("should handle max decimal 4294967295 (255.255.255.255)", () => {
        expect(normalizeIP("4294967295")).toBe("255.255.255.255");
      });
    });

    describe("Octal encoding", () => {
      it("should convert octal 0177.0.0.1 to 127.0.0.1", () => {
        expect(normalizeIP("0177.0.0.1")).toBe("127.0.0.1");
      });

      it("should convert octal 012.0.0.1 to 10.0.0.1", () => {
        expect(normalizeIP("012.0.0.1")).toBe("10.0.0.1");
      });

      it("should convert octal 0300.0250.0.1 to 192.168.0.1", () => {
        expect(normalizeIP("0300.0250.0.1")).toBe("192.168.0.1");
      });
    });

    describe("Hex encoding", () => {
      it("should convert hex 0x7f.0x0.0x0.0x1 to 127.0.0.1", () => {
        expect(normalizeIP("0x7f.0x0.0x0.0x1")).toBe("127.0.0.1");
      });

      it("should convert hex 0x0a.0x00.0x00.0x01 to 10.0.0.1", () => {
        expect(normalizeIP("0x0a.0x00.0x00.0x01")).toBe("10.0.0.1");
      });

      it("should convert hex 0xc0.0xa8.0x01.0x01 to 192.168.1.1", () => {
        expect(normalizeIP("0xc0.0xa8.0x01.0x01")).toBe("192.168.1.1");
      });

      it("should handle uppercase hex", () => {
        expect(normalizeIP("0X7F.0X0.0X0.0X1")).toBe("127.0.0.1");
      });
    });

    describe("Valid IPs passthrough", () => {
      it("should passthrough valid IPv4 addresses", () => {
        expect(normalizeIP("127.0.0.1")).toBe("127.0.0.1");
        expect(normalizeIP("192.168.1.1")).toBe("192.168.1.1");
        expect(normalizeIP("8.8.8.8")).toBe("8.8.8.8");
      });

      it("should passthrough valid IPv6 addresses", () => {
        expect(normalizeIP("::1")).toBe("::1");
        expect(normalizeIP("2001:4860:4860::8888")).toBe("2001:4860:4860::8888");
      });
    });

    describe("Invalid inputs return null", () => {
      it("should return null for non-IP strings", () => {
        expect(normalizeIP("not-an-ip")).toBeNull();
        expect(normalizeIP("google.com")).toBeNull();
        expect(normalizeIP("")).toBeNull();
      });

      it("should return null for out of range decimals", () => {
        expect(normalizeIP("4294967296")).toBeNull(); // > max uint32
      });

      it("should return null for invalid octal", () => {
        expect(normalizeIP("0999.0.0.1")).toBeNull(); // 9 is invalid in octal
      });

      it("should return null for invalid hex", () => {
        expect(normalizeIP("0xgg.0x0.0x0.0x1")).toBeNull(); // gg is invalid
      });
    });
  });

  describe("isCloudMetadata", () => {
    describe("AWS metadata endpoint", () => {
      it("should detect AWS metadata IP 169.254.169.254", () => {
        const result = isCloudMetadata("http://169.254.169.254/latest/meta-data");
        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBeDefined();
      });

      it("should detect AWS metadata with different paths", () => {
        expect(isCloudMetadata("http://169.254.169.254/").isMetadata).toBe(true);
        expect(isCloudMetadata("http://169.254.169.254/latest/user-data").isMetadata).toBe(true);
        expect(isCloudMetadata("http://169.254.169.254/latest/api/token").isMetadata).toBe(true);
      });
    });

    describe("GCP metadata endpoint", () => {
      it("should detect GCP metadata hostname", () => {
        const result = isCloudMetadata("http://metadata.google.internal/computeMetadata/v1/");
        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("GCP");
      });

      it("should detect GCP metadata.goog hostname", () => {
        const result = isCloudMetadata("http://metadata.goog/computeMetadata/v1/");
        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("GCP");
      });
    });

    describe("Azure metadata endpoint", () => {
      it("should detect Azure IMDS IP 168.63.129.16", () => {
        const result = isCloudMetadata("http://168.63.129.16/metadata/instance");
        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("Azure");
      });

      it("should detect Azure metadata via 169.254.169.254", () => {
        const result = isCloudMetadata("http://169.254.169.254/metadata/instance");
        expect(result.isMetadata).toBe(true);
      });
    });

    describe("Alibaba Cloud metadata endpoint", () => {
      it("should detect Alibaba Cloud IP 100.100.100.200", () => {
        const result = isCloudMetadata("http://100.100.100.200/latest/meta-data");
        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("Alibaba");
      });
    });

    describe("Kubernetes endpoints", () => {
      it("should detect kubernetes.default", () => {
        const result = isCloudMetadata("https://kubernetes.default/api/v1");
        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("Kubernetes");
      });

      it("should detect kubernetes.default.svc", () => {
        const result = isCloudMetadata("https://kubernetes.default.svc/api/v1");
        expect(result.isMetadata).toBe(true);
        expect(result.provider).toBe("Kubernetes");
      });

      it("should NOT detect extended kubernetes hostnames (implementation limitation)", () => {
        // Note: kubernetes.default.svc.cluster.local is NOT detected because
        // the pattern matcher checks for hostname === pattern || hostname.endsWith('.' + pattern)
        // but 'kubernetes.default.svc.cluster.local'.endsWith('.kubernetes.default.svc') is false
        const result = isCloudMetadata("https://kubernetes.default.svc.cluster.local/api/v1");
        expect(result.isMetadata).toBe(false);
      });
    });

    describe("Non-metadata URLs return false", () => {
      it("should allow public URLs", () => {
        expect(isCloudMetadata("https://example.com").isMetadata).toBe(false);
        expect(isCloudMetadata("https://google.com").isMetadata).toBe(false);
        expect(isCloudMetadata("https://api.github.com").isMetadata).toBe(false);
      });

      it("should allow random IPs that are not metadata endpoints", () => {
        expect(isCloudMetadata("http://8.8.8.8/").isMetadata).toBe(false);
        expect(isCloudMetadata("http://1.1.1.1/").isMetadata).toBe(false);
      });

      it("should return false for invalid URLs", () => {
        expect(isCloudMetadata("not-a-url").isMetadata).toBe(false);
        expect(isCloudMetadata("").isMetadata).toBe(false);
      });
    });

    describe("URL object input", () => {
      it("should accept URL objects", () => {
        const url = new URL("http://169.254.169.254/latest/meta-data");
        const result = isCloudMetadata(url);
        expect(result.isMetadata).toBe(true);
      });
    });

    describe("Metadata path pattern detection", () => {
      it("should detect AWS path pattern on metadata IP", () => {
        const result = isCloudMetadata("http://169.254.169.254/latest/meta-data/ami-id");
        expect(result.isMetadata).toBe(true);
      });

      it("should detect Azure path pattern on metadata IP", () => {
        const result = isCloudMetadata(
          "http://168.63.129.16/metadata/instance?api-version=2021-02-01"
        );
        expect(result.isMetadata).toBe(true);
      });

      it("should detect GCP path pattern on metadata IP", () => {
        const result = isCloudMetadata("http://169.254.169.254/computeMetadata/v1/instance");
        expect(result.isMetadata).toBe(true);
      });

      it("should NOT detect metadata path on non-metadata IPs", () => {
        // Path matches but IP is not a metadata endpoint
        const result = isCloudMetadata("http://8.8.8.8/latest/meta-data");
        expect(result.isMetadata).toBe(false);
      });

      it("should NOT detect metadata path on regular hostnames", () => {
        const result = isCloudMetadata("http://example.com/latest/meta-data");
        expect(result.isMetadata).toBe(false);
      });
    });
  });

  describe("validateUrlWithDNS", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe("Invalid URLs rejected", () => {
      it("should reject invalid URL format", async () => {
        const result = await validateUrlWithDNS("not-a-url");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid URL");
      });

      it("should reject URLs without protocol", async () => {
        const result = await validateUrlWithDNS("example.com");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid URL");
      });
    });

    describe("Non-http/https rejected", () => {
      it("should reject ftp protocol", async () => {
        const result = await validateUrlWithDNS("ftp://example.com");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid protocol");
      });

      it("should reject file protocol", async () => {
        const result = await validateUrlWithDNS("file:///etc/passwd");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid protocol");
      });

      it("should reject javascript protocol", async () => {
        const result = await validateUrlWithDNS("javascript:alert(1)");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid protocol");
      });

      it("should reject data protocol", async () => {
        const result = await validateUrlWithDNS("data:text/html,<script>alert(1)</script>");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Invalid protocol");
      });
    });

    describe("IP URLs checked for private ranges", () => {
      it("should block private IP 127.0.0.1", async () => {
        const result = await validateUrlWithDNS("http://127.0.0.1/");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP blocked");
      });

      it("should block private IP 192.168.1.1", async () => {
        const result = await validateUrlWithDNS("http://192.168.1.1/");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP blocked");
      });

      it("should block private IP 10.0.0.1", async () => {
        const result = await validateUrlWithDNS("http://10.0.0.1/");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP blocked");
      });

      it("should block private IP 169.254.169.254", async () => {
        const result = await validateUrlWithDNS("http://169.254.169.254/");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP blocked");
      });

      it("should allow private IPs when explicitly enabled", async () => {
        const result = await validateUrlWithDNS("http://127.0.0.1/", { allowPrivateIPs: true });
        expect(result.valid).toBe(true);
        expect(result.resolvedIPs).toContain("127.0.0.1");
      });

      it("should block obfuscated private IPs (decimal)", async () => {
        // 2130706433 = 127.0.0.1
        const result = await validateUrlWithDNS("http://2130706433/");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Private IP blocked");
      });
    });

    describe("DNS resolution", () => {
      it("should validate hostname that resolves to public IP", async () => {
        mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

        const result = await validateUrlWithDNS("http://example.com/");
        expect(result.valid).toBe(true);
        expect(result.resolvedIPs).toContain("93.184.216.34");
      });

      it("should block hostname that resolves to private IP (DNS rebinding)", async () => {
        mockedLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

        const result = await validateUrlWithDNS("http://evil.com/");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("DNS rebinding detected");
        expect(result.error).toContain("127.0.0.1");
      });

      it("should block if any resolved IP is private", async () => {
        mockedLookup.mockResolvedValue([
          { address: "8.8.8.8", family: 4 },
          { address: "192.168.1.1", family: 4 },
        ]);

        const result = await validateUrlWithDNS("http://mixed-results.com/");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("DNS rebinding detected");
      });

      it("should allow private IPs in DNS results when allowPrivateIPs is true", async () => {
        mockedLookup.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);

        const result = await validateUrlWithDNS("http://internal.example.com/", {
          allowPrivateIPs: true,
        });
        expect(result.valid).toBe(true);
        expect(result.resolvedIPs).toContain("10.0.0.1");
      });

      it("should handle DNS resolution failure", async () => {
        mockedLookup.mockRejectedValue(new Error("ENOTFOUND"));

        const result = await validateUrlWithDNS("http://nonexistent.invalid.domain.test/");
        expect(result.valid).toBe(false);
        expect(result.error).toContain("DNS resolution failed");
      });
    });

    describe("Valid public URLs", () => {
      it("should allow public IP URLs", async () => {
        // Note: This validates the IP directly without DNS
        const result = await validateUrlWithDNS("http://8.8.8.8/");
        expect(result.valid).toBe(true);
        expect(result.resolvedIPs).toContain("8.8.8.8");
      });
    });
  });
});
