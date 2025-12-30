import { describe, expect, it } from "vitest";
import { WebErrorCode } from "../../../errors/web.js";
import {
  checkDomain,
  checkUrlDomain,
  extractDomain,
  matchDomainPattern,
} from "../domain-control.js";

describe("domain-control", () => {
  describe("matchDomainPattern", () => {
    describe("Exact match", () => {
      it("should match exactly equal domains", () => {
        expect(matchDomainPattern("example.com", "example.com")).toBe(true);
        expect(matchDomainPattern("api.example.com", "api.example.com")).toBe(true);
      });

      it("should be case-insensitive", () => {
        expect(matchDomainPattern("Example.COM", "example.com")).toBe(true);
        expect(matchDomainPattern("example.com", "EXAMPLE.COM")).toBe(true);
      });

      it("should not match different domains", () => {
        expect(matchDomainPattern("example.com", "other.com")).toBe(false);
        expect(matchDomainPattern("example.com", "example.org")).toBe(false);
      });
    });

    describe("Wildcard match (*.example.com)", () => {
      it("should match any subdomain with wildcard", () => {
        expect(matchDomainPattern("api.example.com", "*.example.com")).toBe(true);
        expect(matchDomainPattern("www.example.com", "*.example.com")).toBe(true);
        expect(matchDomainPattern("sub.api.example.com", "*.example.com")).toBe(true);
      });

      it("should match the base domain with wildcard", () => {
        expect(matchDomainPattern("example.com", "*.example.com")).toBe(true);
      });

      it("should not match unrelated domains with wildcard", () => {
        expect(matchDomainPattern("malicious.com", "*.example.com")).toBe(false);
        expect(matchDomainPattern("example.com.evil.com", "*.example.com")).toBe(false);
      });

      it("should handle nested wildcards", () => {
        expect(matchDomainPattern("a.b.c.example.com", "*.example.com")).toBe(true);
      });
    });

    describe("Subdomain of exact match", () => {
      it("should match subdomains when allowSubdomains is true (default)", () => {
        expect(matchDomainPattern("api.example.com", "example.com")).toBe(true);
        expect(matchDomainPattern("www.example.com", "example.com")).toBe(true);
        expect(matchDomainPattern("sub.api.example.com", "example.com")).toBe(true);
      });

      it("should not match subdomains when allowSubdomains is false", () => {
        expect(matchDomainPattern("api.example.com", "example.com", false)).toBe(false);
        expect(matchDomainPattern("www.example.com", "example.com", false)).toBe(false);
      });

      it("should still do exact match when allowSubdomains is false", () => {
        expect(matchDomainPattern("example.com", "example.com", false)).toBe(true);
      });
    });

    describe("No match cases", () => {
      it("should not match partial domain names", () => {
        expect(matchDomainPattern("myexample.com", "example.com")).toBe(false);
        expect(matchDomainPattern("example.company.com", "example.com")).toBe(false);
      });

      it("should not match similar but different TLDs", () => {
        expect(matchDomainPattern("example.org", "example.com")).toBe(false);
        expect(matchDomainPattern("example.net", "example.com")).toBe(false);
      });

      it("should not match domain with pattern as substring", () => {
        expect(matchDomainPattern("notexample.com", "example.com")).toBe(false);
      });
    });
  });

  describe("checkDomain", () => {
    describe("Blacklist blocks", () => {
      it("should block domains in blacklist", () => {
        const result = checkDomain("evil.com", {
          blacklist: ["evil.com"],
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("blacklisted");
        expect(result.matchedPattern).toBe("evil.com");
        expect(result.code).toBe(WebErrorCode.DOMAIN_BLOCKED);
      });

      it("should block subdomains with wildcard blacklist", () => {
        const result = checkDomain("sub.malicious.com", {
          blacklist: ["*.malicious.com"],
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("blacklisted");
      });

      it("should block subdomains when allowSubdomains is true", () => {
        const result = checkDomain("api.blocked.com", {
          blacklist: ["blocked.com"],
          allowSubdomains: true,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("blacklisted");
      });

      it("should not block subdomains when allowSubdomains is false", () => {
        const result = checkDomain("api.blocked.com", {
          blacklist: ["blocked.com"],
          allowSubdomains: false,
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("allowed");
      });
    });

    describe("Whitelist allows", () => {
      it("should allow domains in whitelist", () => {
        const result = checkDomain("trusted.com", {
          whitelist: ["trusted.com"],
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("allowed");
        expect(result.matchedPattern).toBe("trusted.com");
      });

      it("should allow subdomains with wildcard whitelist", () => {
        const result = checkDomain("api.trusted.com", {
          whitelist: ["*.trusted.com"],
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("allowed");
      });

      it("should allow subdomains when allowSubdomains is true", () => {
        const result = checkDomain("api.trusted.com", {
          whitelist: ["trusted.com"],
          allowSubdomains: true,
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("allowed");
      });
    });

    describe("Not in whitelist blocked", () => {
      it("should block domains not in whitelist when whitelist is defined", () => {
        const result = checkDomain("untrusted.com", {
          whitelist: ["trusted.com"],
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("not_whitelisted");
        expect(result.code).toBe(WebErrorCode.DOMAIN_NOT_WHITELISTED);
      });

      it("should block unrelated domains even with wildcard whitelist", () => {
        const result = checkDomain("evil.com", {
          whitelist: ["*.trusted.com"],
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("not_whitelisted");
      });
    });

    describe("Empty whitelist allows all", () => {
      it("should allow all domains when whitelist is empty", () => {
        const result = checkDomain("any-domain.com", {
          whitelist: [],
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("allowed");
      });

      it("should allow all domains when whitelist is undefined", () => {
        const result = checkDomain("any-domain.com", {});
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("allowed");
      });
    });

    describe("Blacklist takes precedence", () => {
      it("should block domain that is in both blacklist and whitelist", () => {
        const result = checkDomain("both.com", {
          blacklist: ["both.com"],
          whitelist: ["both.com"],
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("blacklisted");
        expect(result.code).toBe(WebErrorCode.DOMAIN_BLOCKED);
      });

      it("should block blacklisted subdomain even with whitelist", () => {
        const result = checkDomain("evil.example.com", {
          blacklist: ["evil.example.com"],
          whitelist: ["*.example.com"],
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe("blacklisted");
      });

      it("should still allow non-blacklisted domains with whitelist", () => {
        const result = checkDomain("api.example.com", {
          blacklist: ["evil.com"],
          whitelist: ["*.example.com"],
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe("allowed");
      });
    });

    describe("Case insensitivity", () => {
      it("should match blacklist case-insensitively", () => {
        const result = checkDomain("EVIL.COM", {
          blacklist: ["evil.com"],
        });
        expect(result.allowed).toBe(false);
      });

      it("should match whitelist case-insensitively", () => {
        const result = checkDomain("TRUSTED.COM", {
          whitelist: ["trusted.com"],
        });
        expect(result.allowed).toBe(true);
      });
    });

    describe("Multiple patterns", () => {
      it("should check all blacklist patterns", () => {
        const config = {
          blacklist: ["evil.com", "malicious.org", "*.bad.net"],
        };
        expect(checkDomain("evil.com", config).allowed).toBe(false);
        expect(checkDomain("malicious.org", config).allowed).toBe(false);
        expect(checkDomain("sub.bad.net", config).allowed).toBe(false);
        expect(checkDomain("good.com", config).allowed).toBe(true);
      });

      it("should check all whitelist patterns", () => {
        const config = {
          whitelist: ["trusted.com", "safe.org", "*.allowed.net"],
        };
        expect(checkDomain("trusted.com", config).allowed).toBe(true);
        expect(checkDomain("safe.org", config).allowed).toBe(true);
        expect(checkDomain("sub.allowed.net", config).allowed).toBe(true);
        expect(checkDomain("other.com", config).allowed).toBe(false);
      });
    });
  });

  describe("extractDomain", () => {
    it("should extract domain from URL string", () => {
      expect(extractDomain("https://example.com/path")).toBe("example.com");
      expect(extractDomain("http://api.example.com:8080/")).toBe("api.example.com");
    });

    it("should extract domain from URL object", () => {
      const url = new URL("https://example.com/path");
      expect(extractDomain(url)).toBe("example.com");
    });

    it("should lowercase the domain", () => {
      expect(extractDomain("https://EXAMPLE.COM/")).toBe("example.com");
    });
  });

  describe("checkUrlDomain", () => {
    it("should check URL domain against config", () => {
      const result = checkUrlDomain("https://evil.com/path", {
        blacklist: ["evil.com"],
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("blacklisted");
    });

    it("should handle URL objects", () => {
      const url = new URL("https://trusted.com/path");
      const result = checkUrlDomain(url, {
        whitelist: ["trusted.com"],
      });
      expect(result.allowed).toBe(true);
    });

    it("should block invalid URLs", () => {
      const result = checkUrlDomain("not-a-url", {});
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("blacklisted");
      expect(result.code).toBe(WebErrorCode.DOMAIN_BLOCKED);
    });
  });
});
