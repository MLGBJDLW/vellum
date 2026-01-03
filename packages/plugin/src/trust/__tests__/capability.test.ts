/**
 * Unit tests for Capability verification
 *
 * Tests for T033 - Capability grant verification, denial, and modification
 *
 * @module plugin/trust/__tests__/capability.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrustedPluginsManager } from "../manager.js";
import { TrustStore } from "../store.js";
import type { PluginCapability, TrustedPlugin } from "../types.js";
import { PLUGIN_CAPABILITIES } from "../types.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a valid SHA-256 hash for testing
 */
function createValidHash(seed: string = "default"): string {
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
// Capability Grant Verification Tests
// =============================================================================

describe("TrustedPluginsManager - capability grant verification", () => {
  let store: TrustStore;
  let manager: TrustedPluginsManager;
  let plugins: Map<string, TrustedPlugin>;

  beforeEach(() => {
    plugins = new Map();
    store = createMockStore(plugins);
    manager = new TrustedPluginsManager(store);
  });

  describe("hasCapability - grant verification", () => {
    it("should return true when plugin has the exact capability", () => {
      const plugin = createTrustedPlugin({
        pluginName: "capable-plugin",
        capabilities: ["execute-hooks"],
        trustLevel: "limited",
      });
      plugins.set("capable-plugin", plugin);

      expect(manager.hasCapability("capable-plugin", "execute-hooks")).toBe(true);
    });

    it("should return true for each granted capability", () => {
      const allCapabilities: PluginCapability[] = [
        "execute-hooks",
        "spawn-subagent",
        "access-filesystem",
        "network-access",
        "mcp-servers",
      ];
      const plugin = createTrustedPlugin({
        pluginName: "full-capability-plugin",
        capabilities: allCapabilities,
        trustLevel: "full",
      });
      plugins.set("full-capability-plugin", plugin);

      for (const cap of allCapabilities) {
        expect(manager.hasCapability("full-capability-plugin", cap)).toBe(true);
      }
    });

    it("should return true when multiple capabilities are granted", () => {
      const plugin = createTrustedPlugin({
        pluginName: "multi-cap-plugin",
        capabilities: ["execute-hooks", "network-access", "mcp-servers"],
        trustLevel: "limited",
      });
      plugins.set("multi-cap-plugin", plugin);

      expect(manager.hasCapability("multi-cap-plugin", "execute-hooks")).toBe(true);
      expect(manager.hasCapability("multi-cap-plugin", "network-access")).toBe(true);
      expect(manager.hasCapability("multi-cap-plugin", "mcp-servers")).toBe(true);
    });

    it("should verify capability order does not affect access", () => {
      const plugin = createTrustedPlugin({
        pluginName: "ordered-plugin",
        capabilities: ["mcp-servers", "execute-hooks", "network-access"],
        trustLevel: "limited",
      });
      plugins.set("ordered-plugin", plugin);

      expect(manager.hasCapability("ordered-plugin", "execute-hooks")).toBe(true);
      expect(manager.hasCapability("ordered-plugin", "mcp-servers")).toBe(true);
    });
  });

  describe("hasCapability - denial verification", () => {
    it("should return false when plugin does not have the capability", () => {
      const plugin = createTrustedPlugin({
        pluginName: "limited-plugin",
        capabilities: ["execute-hooks"],
        trustLevel: "limited",
      });
      plugins.set("limited-plugin", plugin);

      expect(manager.hasCapability("limited-plugin", "network-access")).toBe(false);
    });

    it("should return false for all capabilities when plugin not trusted", () => {
      for (const cap of PLUGIN_CAPABILITIES) {
        expect(manager.hasCapability("nonexistent-plugin", cap)).toBe(false);
      }
    });

    it("should return false when plugin has trust level none", () => {
      const plugin = createTrustedPlugin({
        pluginName: "no-trust-plugin",
        capabilities: ["execute-hooks"], // Has capability but trust level is none
        trustLevel: "none",
      });
      plugins.set("no-trust-plugin", plugin);

      expect(manager.hasCapability("no-trust-plugin", "execute-hooks")).toBe(false);
    });

    it("should return false when plugin has empty capabilities", () => {
      const plugin = createTrustedPlugin({
        pluginName: "empty-cap-plugin",
        capabilities: [],
        trustLevel: "none",
      });
      plugins.set("empty-cap-plugin", plugin);

      expect(manager.hasCapability("empty-cap-plugin", "execute-hooks")).toBe(false);
    });

    it("should deny capability not in granted list", () => {
      const plugin = createTrustedPlugin({
        pluginName: "partial-plugin",
        capabilities: ["execute-hooks", "spawn-subagent"],
        trustLevel: "limited",
      });
      plugins.set("partial-plugin", plugin);

      expect(manager.hasCapability("partial-plugin", "access-filesystem")).toBe(false);
      expect(manager.hasCapability("partial-plugin", "network-access")).toBe(false);
      expect(manager.hasCapability("partial-plugin", "mcp-servers")).toBe(false);
    });
  });

  describe("capability denial when not trusted", () => {
    it("should deny all capabilities for unknown plugin", () => {
      expect(manager.hasCapability("unknown", "execute-hooks")).toBe(false);
      expect(manager.hasCapability("unknown", "network-access")).toBe(false);
      expect(manager.hasCapability("unknown", "access-filesystem")).toBe(false);
    });

    it("should deny capabilities after trust is revoked", () => {
      const plugin = createTrustedPlugin({
        pluginName: "revoked-plugin",
        capabilities: ["execute-hooks", "network-access"],
        trustLevel: "limited",
      });
      plugins.set("revoked-plugin", plugin);

      // Verify capability before revocation
      expect(manager.hasCapability("revoked-plugin", "execute-hooks")).toBe(true);

      // Revoke trust
      manager.revokeTrust("revoked-plugin");

      // Capability should now be denied (plugin deleted from map)
      expect(manager.hasCapability("revoked-plugin", "execute-hooks")).toBe(false);
    });

    it("should treat trust level none as not trusted", () => {
      const plugin = createTrustedPlugin({
        pluginName: "none-level-plugin",
        capabilities: ["execute-hooks", "network-access", "mcp-servers"],
        trustLevel: "none",
      });
      plugins.set("none-level-plugin", plugin);

      // Even with capabilities listed, none trust level means denied
      expect(manager.hasCapability("none-level-plugin", "execute-hooks")).toBe(false);
      expect(manager.isTrusted("none-level-plugin")).toBe(false);
    });
  });
});

// =============================================================================
// Capability Modification Tests
// =============================================================================

describe("TrustedPluginsManager - capability modification", () => {
  let store: TrustStore;
  let manager: TrustedPluginsManager;
  let plugins: Map<string, TrustedPlugin>;

  beforeEach(() => {
    plugins = new Map();
    store = createMockStore(plugins);
    manager = new TrustedPluginsManager(store);
  });

  describe("adding capabilities", () => {
    it("should add new capability when re-trusting with expanded list", () => {
      const hash = createValidHash();

      // Initial trust with limited capabilities
      manager.trustPlugin("upgradeable-plugin", ["execute-hooks"], hash);

      // Re-trust with additional capability
      manager.trustPlugin("upgradeable-plugin", ["execute-hooks", "network-access"], hash);

      expect(store.set).toHaveBeenLastCalledWith(
        "upgradeable-plugin",
        expect.objectContaining({
          capabilities: ["execute-hooks", "network-access"],
        })
      );
    });

    it("should add multiple capabilities at once", () => {
      const hash = createValidHash();

      manager.trustPlugin("multi-add-plugin", ["execute-hooks"], hash);
      manager.trustPlugin(
        "multi-add-plugin",
        ["execute-hooks", "network-access", "mcp-servers", "access-filesystem"],
        hash
      );

      expect(store.set).toHaveBeenLastCalledWith(
        "multi-add-plugin",
        expect.objectContaining({
          capabilities: ["execute-hooks", "network-access", "mcp-servers", "access-filesystem"],
        })
      );
    });

    it("should grant all capabilities in single trust call", () => {
      const hash = createValidHash();
      const allCapabilities: PluginCapability[] = [
        "execute-hooks",
        "spawn-subagent",
        "access-filesystem",
        "network-access",
        "mcp-servers",
      ];

      manager.trustPlugin("full-cap-plugin", allCapabilities, hash);

      expect(store.set).toHaveBeenCalledWith(
        "full-cap-plugin",
        expect.objectContaining({
          capabilities: allCapabilities,
        })
      );
    });
  });

  describe("removing capabilities", () => {
    it("should reduce capabilities when re-trusting with smaller list", () => {
      const hash = createValidHash();

      // Initial trust with multiple capabilities
      manager.trustPlugin("downgradeable-plugin", ["execute-hooks", "network-access", "mcp-servers"], hash);

      // Re-trust with fewer capabilities
      manager.trustPlugin("downgradeable-plugin", ["execute-hooks"], hash);

      expect(store.set).toHaveBeenLastCalledWith(
        "downgradeable-plugin",
        expect.objectContaining({
          capabilities: ["execute-hooks"],
        })
      );
    });

    it("should remove all capabilities by trusting with empty list", () => {
      const hash = createValidHash();

      manager.trustPlugin("clear-cap-plugin", ["execute-hooks", "network-access"], hash);
      manager.trustPlugin("clear-cap-plugin", [], hash);

      expect(store.set).toHaveBeenLastCalledWith(
        "clear-cap-plugin",
        expect.objectContaining({
          capabilities: [],
          trustLevel: "none",
        })
      );
    });

    it("should selectively remove specific capabilities", () => {
      const hash = createValidHash();

      manager.trustPlugin(
        "selective-plugin",
        ["execute-hooks", "network-access", "mcp-servers"],
        hash
      );
      // Remove network-access but keep others
      manager.trustPlugin("selective-plugin", ["execute-hooks", "mcp-servers"], hash);

      expect(store.set).toHaveBeenLastCalledWith(
        "selective-plugin",
        expect.objectContaining({
          capabilities: ["execute-hooks", "mcp-servers"],
        })
      );
    });
  });

  describe("replacing capabilities", () => {
    it("should completely replace capability set", () => {
      const hash = createValidHash();

      manager.trustPlugin("replace-plugin", ["execute-hooks", "spawn-subagent"], hash);
      manager.trustPlugin("replace-plugin", ["network-access", "mcp-servers"], hash);

      expect(store.set).toHaveBeenLastCalledWith(
        "replace-plugin",
        expect.objectContaining({
          capabilities: ["network-access", "mcp-servers"],
        })
      );
    });

    it("should update trust level based on new capabilities", () => {
      const hash = createValidHash();

      // Start with capabilities (limited)
      manager.trustPlugin("level-change-plugin", ["execute-hooks"], hash);
      expect(store.set).toHaveBeenCalledWith(
        "level-change-plugin",
        expect.objectContaining({ trustLevel: "limited" })
      );

      // Remove all capabilities (none)
      manager.trustPlugin("level-change-plugin", [], hash);
      expect(store.set).toHaveBeenLastCalledWith(
        "level-change-plugin",
        expect.objectContaining({ trustLevel: "none" })
      );
    });
  });

  describe("capability modification with hash update", () => {
    it("should allow capability and hash modification together", () => {
      const oldHash = createValidHash("v1");
      const newHash = createValidHash("v2");

      manager.trustPlugin("combo-plugin", ["execute-hooks"], oldHash);
      manager.trustPlugin("combo-plugin", ["execute-hooks", "network-access"], newHash);

      expect(store.set).toHaveBeenLastCalledWith(
        "combo-plugin",
        expect.objectContaining({
          capabilities: ["execute-hooks", "network-access"],
          contentHash: newHash,
        })
      );
    });

    it("should update timestamp on capability modification", () => {
      const hash = createValidHash();
      const beforeFirst = Date.now();

      manager.trustPlugin("timestamp-plugin", ["execute-hooks"], hash);

      const firstCall = (store.set as ReturnType<typeof vi.fn>).mock.calls[0]![1] as TrustedPlugin;
      const firstTimestamp = new Date(firstCall.trustedAt).getTime();

      expect(firstTimestamp).toBeGreaterThanOrEqual(beforeFirst);
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("TrustedPluginsManager - capability edge cases", () => {
  let store: TrustStore;
  let manager: TrustedPluginsManager;
  let plugins: Map<string, TrustedPlugin>;

  beforeEach(() => {
    plugins = new Map();
    store = createMockStore(plugins);
    manager = new TrustedPluginsManager(store);
  });

  it("should handle duplicate capabilities in grant list", () => {
    const hash = createValidHash();

    // Trust with duplicates (should be handled by caller, but test behavior)
    manager.trustPlugin(
      "dupe-plugin",
      ["execute-hooks", "execute-hooks", "network-access"],
      hash
    );

    // The manager passes through what it receives
    expect(store.set).toHaveBeenCalledWith(
      "dupe-plugin",
      expect.objectContaining({
        capabilities: ["execute-hooks", "execute-hooks", "network-access"],
      })
    );
  });

  it("should handle rapid capability changes", () => {
    const hash = createValidHash();

    manager.trustPlugin("rapid-plugin", ["execute-hooks"], hash);
    manager.trustPlugin("rapid-plugin", ["network-access"], hash);
    manager.trustPlugin("rapid-plugin", ["mcp-servers"], hash);
    manager.trustPlugin("rapid-plugin", ["execute-hooks", "network-access", "mcp-servers"], hash);

    expect(store.set).toHaveBeenCalledTimes(4);
    expect(store.set).toHaveBeenLastCalledWith(
      "rapid-plugin",
      expect.objectContaining({
        capabilities: ["execute-hooks", "network-access", "mcp-servers"],
      })
    );
  });

  it("should maintain plugin isolation - capabilities don't leak between plugins", () => {
    const hash = createValidHash();

    manager.trustPlugin("plugin-a", ["execute-hooks", "network-access"], hash);
    manager.trustPlugin("plugin-b", ["mcp-servers"], hash);

    // Simulate the store having both plugins
    plugins.set(
      "plugin-a",
      createTrustedPlugin({
        pluginName: "plugin-a",
        capabilities: ["execute-hooks", "network-access"],
      })
    );
    plugins.set(
      "plugin-b",
      createTrustedPlugin({
        pluginName: "plugin-b",
        capabilities: ["mcp-servers"],
      })
    );

    // Plugin A should not have Plugin B's capabilities
    expect(manager.hasCapability("plugin-a", "mcp-servers")).toBe(false);
    // Plugin B should not have Plugin A's capabilities
    expect(manager.hasCapability("plugin-b", "execute-hooks")).toBe(false);
    expect(manager.hasCapability("plugin-b", "network-access")).toBe(false);
  });
});
