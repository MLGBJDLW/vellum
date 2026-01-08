/**
 * Version Checker Tests (Phase 39)
 *
 * Unit tests for version checking functionality including
 * semver parsing, comparison, and update detection.
 *
 * @module core/update/__tests__/version-checker.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  compareSemVer,
  isNewerVersion,
  isPrerelease,
  parseSemVer,
  VersionChecker,
} from "../version-checker.js";

// =============================================================================
// Semver Parsing Tests
// =============================================================================

describe("parseSemVer", () => {
  it("should parse simple version", () => {
    const result = parseSemVer("1.2.3");
    expect(result).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: undefined,
    });
  });

  it("should parse version with v prefix", () => {
    const result = parseSemVer("v1.2.3");
    expect(result).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: undefined,
    });
  });

  it("should parse version with prerelease", () => {
    const result = parseSemVer("1.2.3-beta.1");
    expect(result).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: "beta.1",
    });
  });

  it("should parse version with alpha prerelease", () => {
    const result = parseSemVer("2.0.0-alpha");
    expect(result).toEqual({
      major: 2,
      minor: 0,
      patch: 0,
      prerelease: "alpha",
    });
  });

  it("should return null for invalid version", () => {
    expect(parseSemVer("invalid")).toBeNull();
    expect(parseSemVer("1.2")).toBeNull();
    expect(parseSemVer("1")).toBeNull();
    expect(parseSemVer("")).toBeNull();
  });

  it("should handle zero versions", () => {
    const result = parseSemVer("0.0.0");
    expect(result).toEqual({
      major: 0,
      minor: 0,
      patch: 0,
      prerelease: undefined,
    });
  });
});

// =============================================================================
// Semver Comparison Tests
// =============================================================================

describe("compareSemVer", () => {
  it("should return 0 for equal versions", () => {
    const a = parseSemVer("1.2.3")!;
    const b = parseSemVer("1.2.3")!;
    expect(compareSemVer(a, b)).toBe(0);
  });

  it("should compare major versions", () => {
    const a = parseSemVer("1.0.0")!;
    const b = parseSemVer("2.0.0")!;
    expect(compareSemVer(a, b)).toBeLessThan(0);
    expect(compareSemVer(b, a)).toBeGreaterThan(0);
  });

  it("should compare minor versions", () => {
    const a = parseSemVer("1.1.0")!;
    const b = parseSemVer("1.2.0")!;
    expect(compareSemVer(a, b)).toBeLessThan(0);
    expect(compareSemVer(b, a)).toBeGreaterThan(0);
  });

  it("should compare patch versions", () => {
    const a = parseSemVer("1.1.1")!;
    const b = parseSemVer("1.1.2")!;
    expect(compareSemVer(a, b)).toBeLessThan(0);
    expect(compareSemVer(b, a)).toBeGreaterThan(0);
  });

  it("should rank stable higher than prerelease", () => {
    const stable = parseSemVer("1.0.0")!;
    const prerelease = parseSemVer("1.0.0-beta")!;
    expect(compareSemVer(stable, prerelease)).toBeGreaterThan(0);
    expect(compareSemVer(prerelease, stable)).toBeLessThan(0);
  });

  it("should compare prereleases alphabetically", () => {
    const alpha = parseSemVer("1.0.0-alpha")!;
    const beta = parseSemVer("1.0.0-beta")!;
    expect(compareSemVer(alpha, beta)).toBeLessThan(0);
    expect(compareSemVer(beta, alpha)).toBeGreaterThan(0);
  });
});

// =============================================================================
// isPrerelease Tests
// =============================================================================

describe("isPrerelease", () => {
  it("should return true for prerelease versions", () => {
    expect(isPrerelease("1.0.0-beta")).toBe(true);
    expect(isPrerelease("1.0.0-alpha.1")).toBe(true);
    expect(isPrerelease("2.0.0-rc.1")).toBe(true);
  });

  it("should return false for stable versions", () => {
    expect(isPrerelease("1.0.0")).toBe(false);
    expect(isPrerelease("2.5.3")).toBe(false);
  });

  it("should return false for invalid versions", () => {
    expect(isPrerelease("invalid")).toBe(false);
  });
});

// =============================================================================
// isNewerVersion Tests
// =============================================================================

describe("isNewerVersion", () => {
  it("should return true when new version is higher", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
  });

  it("should return false when current version is higher", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.1.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(false);
  });

  it("should return false for equal versions", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("should return false for invalid versions", () => {
    expect(isNewerVersion("invalid", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "invalid")).toBe(false);
  });

  it("should handle prerelease comparisons correctly", () => {
    // Stable is newer than prerelease of same version
    expect(isNewerVersion("1.0.0-beta", "1.0.0")).toBe(true);
    // Prerelease is not newer than stable of same version
    expect(isNewerVersion("1.0.0", "1.0.0-beta")).toBe(false);
  });
});

// =============================================================================
// VersionChecker Tests
// =============================================================================

describe("VersionChecker", () => {
  let checker: VersionChecker;

  beforeEach(() => {
    checker = new VersionChecker({
      packageName: "@vellum/cli",
      registryUrl: "https://registry.npmjs.org",
      timeoutMs: 5000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("check", () => {
    it("should return success with update info on successful fetch", async () => {
      // Mock fetch response
      const mockMetadata = {
        name: "@vellum/cli",
        "dist-tags": {
          latest: "1.1.0",
          next: "2.0.0-beta.1",
        },
        versions: {
          "1.0.0": { version: "1.0.0", dist: { tarball: "url", shasum: "sha" } },
          "1.1.0": { version: "1.1.0", dist: { tarball: "url", shasum: "sha" } },
          "2.0.0-beta.1": { version: "2.0.0-beta.1", dist: { tarball: "url", shasum: "sha" } },
        },
        time: {
          "1.1.0": "2025-01-01T00:00:00.000Z",
        },
      };

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as Response);

      const result = await checker.check("1.0.0", true);

      expect(result.success).toBe(true);
      expect(result.updateInfo).toBeDefined();
      expect(result.updateInfo?.hasUpdate).toBe(true);
      expect(result.updateInfo?.currentVersion).toBe("1.0.0");
      expect(result.updateInfo?.latestVersion).toBe("1.1.0");
    });

    it("should return no update when already on latest", async () => {
      const mockMetadata = {
        name: "@vellum/cli",
        "dist-tags": { latest: "1.0.0" },
        versions: {
          "1.0.0": { version: "1.0.0", dist: { tarball: "url", shasum: "sha" } },
        },
      };

      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as Response);

      const result = await checker.check("1.0.0", true);

      expect(result.success).toBe(true);
      expect(result.updateInfo?.hasUpdate).toBe(false);
    });

    it("should return error on fetch failure", async () => {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));

      const result = await checker.check("1.0.0", true);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("should return error on non-ok response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      const result = await checker.check("1.0.0", true);

      expect(result.success).toBe(false);
      expect(result.error).toContain("404");
    });
  });

  describe("clearCache", () => {
    it("should not throw on missing cache file", async () => {
      await expect(checker.clearCache()).resolves.not.toThrow();
    });
  });
});
