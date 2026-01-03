/**
 * Unit tests for TrustedPluginsManager
 *
 * Tests for T032 - Hash verification and trust management
 *
 * @module plugin/trust/__tests__/manager.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrustedPluginsManager } from "../manager.js";
import { TrustStore } from "../store.js";
import type { PluginCapability, TrustedPlugin } from "../types.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a valid SHA-256 hash for testing
 */
function createValidHash(seed: string = "default"): string {
  // Generate a deterministic 64-char hex string based on seed
  const base = seed.padEnd(64, "0").slice(0, 64);
  return base.replace(/[^a-f0-9]/g, "a");
}

/**
 * Creates a minimal TrustedPlugin for testing
 */
function createTrustedPlugin(overrides: Partial<TrustedPlugin> = {}): TrustedPlugin {
  return {
    pluginName: "test-plugin",
    version: "1.0.0",
    trustedAt: new Date().toISOString(),
    capabilities: ["execute-hooks"],
    contentHash: createValidHash(),
    trustLevel: "limited",
    ...overrides,
  };
}

/**
 * Creates a mock TrustStore for testing
 */
function createMockStore(plugins: Map<string, TrustedPlugin> = new Map()): TrustStore {
  const store = {
    get: vi.fn((name: string) => plugins.get(name)),
    set: vi.fn((name: string, trust: TrustedPlugin) => {
      plugins.set(name, trust);
    }),
    delete: vi.fn((name: string) => plugins.delete(name)),
    list: vi.fn(() => Array.from(plugins.values())),
    has: vi.fn((name: string) => plugins.has(name)),
  } as unknown as TrustStore;

  return store;
}

// =============================================================================
// Hash Computation Tests
// =============================================================================

describe("TrustedPluginsManager - hash verification", () => {
  let store: TrustStore;
  let manager: TrustedPluginsManager;
  let plugins: Map<string, TrustedPlugin>;

  beforeEach(() => {
    plugins = new Map();
    store = createMockStore(plugins);
    manager = new TrustedPluginsManager(store);
  });

  describe("verifyIntegrity", () => {
    it("should return true when hash matches stored hash", () => {
      const hash = createValidHash("matching-hash");
      const plugin = createTrustedPlugin({
        pluginName: "secure-plugin",
        contentHash: hash,
      });
      plugins.set("secure-plugin", plugin);

      const result = manager.verifyIntegrity("secure-plugin", hash);

      expect(result).toBe(true);
    });

    it("should return false when hash does not match stored hash", () => {
      const originalHash = createValidHash("original");
      const modifiedHash = createValidHash("modified");
      const plugin = createTrustedPlugin({
        pluginName: "modified-plugin",
        contentHash: originalHash,
      });
      plugins.set("modified-plugin", plugin);

      const result = manager.verifyIntegrity("modified-plugin", modifiedHash);

      expect(result).toBe(false);
    });

    it("should return false when plugin is not found", () => {
      const hash = createValidHash("unknown");

      const result = manager.verifyIntegrity("unknown-plugin", hash);

      expect(result).toBe(false);
    });

    it("should be case-sensitive for hash comparison", () => {
      const lowerHash = "a".repeat(64);
      const upperHash = "A".repeat(64);
      const plugin = createTrustedPlugin({
        pluginName: "case-plugin",
        contentHash: lowerHash,
      });
      plugins.set("case-plugin", plugin);

      expect(manager.verifyIntegrity("case-plugin", lowerHash)).toBe(true);
      expect(manager.verifyIntegrity("case-plugin", upperHash)).toBe(false);
    });

    it("should detect single character hash difference", () => {
      const hash1 = "a".repeat(63) + "0";
      const hash2 = "a".repeat(63) + "1";
      const plugin = createTrustedPlugin({
        pluginName: "subtle-plugin",
        contentHash: hash1,
      });
      plugins.set("subtle-plugin", plugin);

      expect(manager.verifyIntegrity("subtle-plugin", hash1)).toBe(true);
      expect(manager.verifyIntegrity("subtle-plugin", hash2)).toBe(false);
    });
  });

  describe("hash mismatch detection", () => {
    it("should detect file modification via hash mismatch", () => {
      const originalHash = createValidHash("original-content");
      const plugin = createTrustedPlugin({
        pluginName: "tampered-plugin",
        contentHash: originalHash,
      });
      plugins.set("tampered-plugin", plugin);

      // Simulate file modification with different hash
      const tamperedHash = createValidHash("tampered-content");

      expect(manager.verifyIntegrity("tampered-plugin", tamperedHash)).toBe(false);
    });

    it("should pass integrity check for unmodified plugin", () => {
      const stableHash = createValidHash("stable-content");
      const plugin = createTrustedPlugin({
        pluginName: "stable-plugin",
        contentHash: stableHash,
      });
      plugins.set("stable-plugin", plugin);

      // Same hash means file unchanged
      expect(manager.verifyIntegrity("stable-plugin", stableHash)).toBe(true);
    });

    it("should handle empty hash comparison correctly", () => {
      const emptyLikeHash = "0".repeat(64);
      const plugin = createTrustedPlugin({
        pluginName: "empty-hash-plugin",
        contentHash: emptyLikeHash,
      });
      plugins.set("empty-hash-plugin", plugin);

      expect(manager.verifyIntegrity("empty-hash-plugin", emptyLikeHash)).toBe(true);
      expect(manager.verifyIntegrity("empty-hash-plugin", "f".repeat(64))).toBe(false);
    });
  });

  describe("file modification detection", () => {
    it("should track trust with content hash for later verification", () => {
      const contentHash = createValidHash("initial-version");

      manager.trustPlugin("new-plugin", ["execute-hooks"], contentHash);

      expect(store.set).toHaveBeenCalledWith(
        "new-plugin",
        expect.objectContaining({
          pluginName: "new-plugin",
          contentHash: contentHash,
        })
      );
    });

    it("should allow re-trusting plugin with updated hash", () => {
      const oldHash = createValidHash("v1");
      const newHash = createValidHash("v2");

      manager.trustPlugin("upgradeable-plugin", ["execute-hooks"], oldHash);
      manager.trustPlugin("upgradeable-plugin", ["execute-hooks", "network-access"], newHash);

      expect(store.set).toHaveBeenCalledTimes(2);
      expect(store.set).toHaveBeenLastCalledWith(
        "upgradeable-plugin",
        expect.objectContaining({
          contentHash: newHash,
          capabilities: ["execute-hooks", "network-access"],
        })
      );
    });
  });
});

// =============================================================================
// Trust Status Tests
// =============================================================================

describe("TrustedPluginsManager - trust status", () => {
  let store: TrustStore;
  let manager: TrustedPluginsManager;
  let plugins: Map<string, TrustedPlugin>;

  beforeEach(() => {
    plugins = new Map();
    store = createMockStore(plugins);
    manager = new TrustedPluginsManager(store);
  });

  describe("isTrusted", () => {
    it("should return true for plugin with full trust level", () => {
      const plugin = createTrustedPlugin({
        pluginName: "full-trust-plugin",
        trustLevel: "full",
      });
      plugins.set("full-trust-plugin", plugin);

      expect(manager.isTrusted("full-trust-plugin")).toBe(true);
    });

    it("should return true for plugin with limited trust level", () => {
      const plugin = createTrustedPlugin({
        pluginName: "limited-trust-plugin",
        trustLevel: "limited",
      });
      plugins.set("limited-trust-plugin", plugin);

      expect(manager.isTrusted("limited-trust-plugin")).toBe(true);
    });

    it("should return false for plugin with none trust level", () => {
      const plugin = createTrustedPlugin({
        pluginName: "no-trust-plugin",
        trustLevel: "none",
        capabilities: [],
      });
      plugins.set("no-trust-plugin", plugin);

      expect(manager.isTrusted("no-trust-plugin")).toBe(false);
    });

    it("should return false for unknown plugin", () => {
      expect(manager.isTrusted("nonexistent-plugin")).toBe(false);
    });
  });

  describe("getTrustLevel", () => {
    it("should return trust level for known plugin", () => {
      const plugin = createTrustedPlugin({
        pluginName: "leveled-plugin",
        trustLevel: "full",
      });
      plugins.set("leveled-plugin", plugin);

      expect(manager.getTrustLevel("leveled-plugin")).toBe("full");
    });

    it("should return undefined for unknown plugin", () => {
      expect(manager.getTrustLevel("unknown")).toBeUndefined();
    });
  });
});

// =============================================================================
// Trust Granting Tests
// =============================================================================

describe("TrustedPluginsManager - trust granting", () => {
  let store: TrustStore;
  let manager: TrustedPluginsManager;
  let plugins: Map<string, TrustedPlugin>;

  beforeEach(() => {
    plugins = new Map();
    store = createMockStore(plugins);
    manager = new TrustedPluginsManager(store);
  });

  describe("trustPlugin", () => {
    it("should create trust entry with provided capabilities", () => {
      const hash = createValidHash();
      const capabilities: PluginCapability[] = ["execute-hooks", "network-access"];

      manager.trustPlugin("new-plugin", capabilities, hash);

      expect(store.set).toHaveBeenCalledWith(
        "new-plugin",
        expect.objectContaining({
          pluginName: "new-plugin",
          capabilities: capabilities,
          contentHash: hash,
        })
      );
    });

    it("should set trust level to limited for non-empty capabilities", () => {
      const hash = createValidHash();

      manager.trustPlugin("limited-plugin", ["execute-hooks"], hash);

      expect(store.set).toHaveBeenCalledWith(
        "limited-plugin",
        expect.objectContaining({
          trustLevel: "limited",
        })
      );
    });

    it("should set trust level to none for empty capabilities", () => {
      const hash = createValidHash();

      manager.trustPlugin("no-cap-plugin", [], hash);

      expect(store.set).toHaveBeenCalledWith(
        "no-cap-plugin",
        expect.objectContaining({
          trustLevel: "none",
        })
      );
    });

    it("should include ISO timestamp in trust entry", () => {
      const hash = createValidHash();

      manager.trustPlugin("timestamped-plugin", ["execute-hooks"], hash);

      expect(store.set).toHaveBeenCalledWith(
        "timestamped-plugin",
        expect.objectContaining({
          trustedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        })
      );
    });

    it("should include default version in trust entry", () => {
      const hash = createValidHash();

      manager.trustPlugin("versioned-plugin", ["execute-hooks"], hash);

      expect(store.set).toHaveBeenCalledWith(
        "versioned-plugin",
        expect.objectContaining({
          version: "1.0.0",
        })
      );
    });
  });

  describe("revokeTrust", () => {
    it("should delete plugin from store", () => {
      const plugin = createTrustedPlugin({ pluginName: "to-revoke" });
      plugins.set("to-revoke", plugin);

      manager.revokeTrust("to-revoke");

      expect(store.delete).toHaveBeenCalledWith("to-revoke");
    });

    it("should not throw when revoking unknown plugin", () => {
      expect(() => manager.revokeTrust("unknown")).not.toThrow();
      expect(store.delete).toHaveBeenCalledWith("unknown");
    });
  });
});
