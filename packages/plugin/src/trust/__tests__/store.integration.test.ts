/**
 * Integration tests for TrustStore persistence
 *
 * Tests for T034 - Trust persistence, revocation, and file corruption handling
 *
 * @module plugin/trust/__tests__/store.integration.test
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TrustStore } from "../store.js";
import type { TrustedPlugin } from "../types.js";

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
 * Creates a temporary directory for test files
 */
async function createTempDir(): Promise<string> {
  const tmpDir = path.join(
    os.tmpdir(),
    `vellum-trust-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Removes a directory and all its contents
 */
async function removeTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// Trust Persistence Tests
// =============================================================================

describe("TrustStore - trust persists across sessions", () => {
  let tempDir: string;
  let trustFilePath: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    trustFilePath = path.join(tempDir, "trusted-plugins.json");
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it("should persist trust to file and reload in new session", async () => {
    // Session 1: Create and save trust
    const store1 = new TrustStore(trustFilePath);
    await store1.load();

    const plugin = createTrustedPlugin({
      pluginName: "persistent-plugin",
      capabilities: ["execute-hooks", "network-access"],
      contentHash: createValidHash("persistent"),
    });
    store1.set("persistent-plugin", plugin);
    await store1.save();

    // Session 2: Load from disk
    const store2 = new TrustStore(trustFilePath);
    await store2.load();

    const loadedPlugin = store2.get("persistent-plugin");
    expect(loadedPlugin).toBeDefined();
    expect(loadedPlugin?.pluginName).toBe("persistent-plugin");
    expect(loadedPlugin?.capabilities).toEqual(["execute-hooks", "network-access"]);
    expect(loadedPlugin?.contentHash).toBe(createValidHash("persistent"));
  });

  it("should persist multiple plugins across sessions", async () => {
    // Session 1: Add multiple plugins
    const store1 = new TrustStore(trustFilePath);
    await store1.load();

    store1.set(
      "plugin-a",
      createTrustedPlugin({
        pluginName: "plugin-a",
        capabilities: ["execute-hooks"],
      })
    );
    store1.set(
      "plugin-b",
      createTrustedPlugin({
        pluginName: "plugin-b",
        capabilities: ["network-access"],
      })
    );
    store1.set(
      "plugin-c",
      createTrustedPlugin({
        pluginName: "plugin-c",
        capabilities: ["mcp-servers"],
      })
    );
    await store1.save();

    // Session 2: Verify all plugins persisted
    const store2 = new TrustStore(trustFilePath);
    await store2.load();

    expect(store2.size()).toBe(3);
    expect(store2.get("plugin-a")).toBeDefined();
    expect(store2.get("plugin-b")).toBeDefined();
    expect(store2.get("plugin-c")).toBeDefined();
  });

  it("should persist trust level correctly", async () => {
    const store1 = new TrustStore(trustFilePath);
    await store1.load();

    store1.set(
      "full-trust",
      createTrustedPlugin({
        pluginName: "full-trust",
        trustLevel: "full",
      })
    );
    store1.set(
      "limited-trust",
      createTrustedPlugin({
        pluginName: "limited-trust",
        trustLevel: "limited",
      })
    );
    store1.set(
      "no-trust",
      createTrustedPlugin({
        pluginName: "no-trust",
        trustLevel: "none",
        capabilities: [],
      })
    );
    await store1.save();

    const store2 = new TrustStore(trustFilePath);
    await store2.load();

    expect(store2.get("full-trust")?.trustLevel).toBe("full");
    expect(store2.get("limited-trust")?.trustLevel).toBe("limited");
    expect(store2.get("no-trust")?.trustLevel).toBe("none");
  });

  it("should persist all plugin properties", async () => {
    const store1 = new TrustStore(trustFilePath);
    await store1.load();

    const fullPlugin = createTrustedPlugin({
      pluginName: "complete-plugin",
      version: "2.5.0",
      trustedAt: "2025-01-02T12:00:00.000Z",
      capabilities: ["execute-hooks", "spawn-subagent", "network-access"],
      contentHash: createValidHash("complete"),
      trustLevel: "limited",
    });
    store1.set("complete-plugin", fullPlugin);
    await store1.save();

    const store2 = new TrustStore(trustFilePath);
    await store2.load();

    const loaded = store2.get("complete-plugin");
    expect(loaded).toEqual(fullPlugin);
  });

  it("should persist updates across sessions", async () => {
    // Session 1: Create initial trust
    const store1 = new TrustStore(trustFilePath);
    await store1.load();
    store1.set(
      "updateable-plugin",
      createTrustedPlugin({
        pluginName: "updateable-plugin",
        capabilities: ["execute-hooks"],
      })
    );
    await store1.save();

    // Session 2: Update trust
    const store2 = new TrustStore(trustFilePath);
    await store2.load();
    const existing = store2.get("updateable-plugin");
    expect(existing?.capabilities).toEqual(["execute-hooks"]);

    store2.set(
      "updateable-plugin",
      createTrustedPlugin({
        pluginName: "updateable-plugin",
        capabilities: ["execute-hooks", "network-access", "mcp-servers"],
      })
    );
    await store2.save();

    // Session 3: Verify update persisted
    const store3 = new TrustStore(trustFilePath);
    await store3.load();
    const updated = store3.get("updateable-plugin");
    expect(updated?.capabilities).toEqual(["execute-hooks", "network-access", "mcp-servers"]);
  });
});

// =============================================================================
// Revoke Removes Trust Tests
// =============================================================================

describe("TrustStore - revoke removes trust", () => {
  let tempDir: string;
  let trustFilePath: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    trustFilePath = path.join(tempDir, "trusted-plugins.json");
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it("should remove trust entry when deleted", async () => {
    const store = new TrustStore(trustFilePath);
    await store.load();

    store.set("to-revoke", createTrustedPlugin({ pluginName: "to-revoke" }));
    expect(store.get("to-revoke")).toBeDefined();

    store.delete("to-revoke");
    expect(store.get("to-revoke")).toBeUndefined();
  });

  it("should persist revocation across sessions", async () => {
    // Session 1: Add and revoke
    const store1 = new TrustStore(trustFilePath);
    await store1.load();
    store1.set("revoked-plugin", createTrustedPlugin({ pluginName: "revoked-plugin" }));
    await store1.save();

    // Session 2: Verify exists, then revoke
    const store2 = new TrustStore(trustFilePath);
    await store2.load();
    expect(store2.get("revoked-plugin")).toBeDefined();

    store2.delete("revoked-plugin");
    await store2.save();

    // Session 3: Verify revocation persisted
    const store3 = new TrustStore(trustFilePath);
    await store3.load();
    expect(store3.get("revoked-plugin")).toBeUndefined();
    expect(store3.has("revoked-plugin")).toBe(false);
  });

  it("should only remove specified plugin", async () => {
    const store = new TrustStore(trustFilePath);
    await store.load();

    store.set("keep-a", createTrustedPlugin({ pluginName: "keep-a" }));
    store.set("remove-b", createTrustedPlugin({ pluginName: "remove-b" }));
    store.set("keep-c", createTrustedPlugin({ pluginName: "keep-c" }));

    store.delete("remove-b");
    await store.save();

    // Reload and verify
    const store2 = new TrustStore(trustFilePath);
    await store2.load();

    expect(store2.get("keep-a")).toBeDefined();
    expect(store2.get("remove-b")).toBeUndefined();
    expect(store2.get("keep-c")).toBeDefined();
    expect(store2.size()).toBe(2);
  });

  it("should return true when deleting existing plugin", async () => {
    const store = new TrustStore(trustFilePath);
    await store.load();
    store.set("deletable", createTrustedPlugin({ pluginName: "deletable" }));

    const result = store.delete("deletable");
    expect(result).toBe(true);
  });

  it("should return false when deleting non-existent plugin", async () => {
    const store = new TrustStore(trustFilePath);
    await store.load();

    const result = store.delete("nonexistent");
    expect(result).toBe(false);
  });

  it("should clear all trust entries", async () => {
    const store = new TrustStore(trustFilePath);
    await store.load();

    store.set("plugin-1", createTrustedPlugin({ pluginName: "plugin-1" }));
    store.set("plugin-2", createTrustedPlugin({ pluginName: "plugin-2" }));
    store.set("plugin-3", createTrustedPlugin({ pluginName: "plugin-3" }));
    expect(store.size()).toBe(3);

    store.clear();
    expect(store.size()).toBe(0);
    expect(store.list()).toEqual([]);
  });
});

// =============================================================================
// File Corruption Handling Tests
// =============================================================================

describe("TrustStore - file corruption handling", () => {
  let tempDir: string;
  let trustFilePath: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    trustFilePath = path.join(tempDir, "trusted-plugins.json");
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it("should start with empty store when file does not exist", async () => {
    const store = new TrustStore(trustFilePath);
    await store.load();

    expect(store.size()).toBe(0);
    expect(store.isLoaded()).toBe(true);
  });

  it("should handle empty file as corruption", async () => {
    // Write empty file
    await fs.mkdir(path.dirname(trustFilePath), { recursive: true });
    await fs.writeFile(trustFilePath, "", "utf-8");

    const store = new TrustStore(trustFilePath);
    await store.load();

    // Should recover with empty store
    expect(store.size()).toBe(0);
    expect(store.isLoaded()).toBe(true);
  });

  it("should handle invalid JSON as corruption", async () => {
    await fs.mkdir(path.dirname(trustFilePath), { recursive: true });
    await fs.writeFile(trustFilePath, "{ invalid json content", "utf-8");

    const store = new TrustStore(trustFilePath);
    await store.load();

    // Should recover with empty store
    expect(store.size()).toBe(0);
    expect(store.isLoaded()).toBe(true);
  });

  it("should handle valid JSON with invalid schema", async () => {
    await fs.mkdir(path.dirname(trustFilePath), { recursive: true });
    const invalidSchema = JSON.stringify({
      version: 1,
      plugins: {
        "bad-plugin": {
          // Missing required fields
          pluginName: "bad-plugin",
        },
      },
    });
    await fs.writeFile(trustFilePath, invalidSchema, "utf-8");

    const store = new TrustStore(trustFilePath);
    await store.load();

    // Should recover with empty store
    expect(store.size()).toBe(0);
    expect(store.isLoaded()).toBe(true);
  });

  it("should handle missing version field", async () => {
    await fs.mkdir(path.dirname(trustFilePath), { recursive: true });
    const missingVersion = JSON.stringify({
      plugins: {
        "test-plugin": createTrustedPlugin(),
      },
    });
    await fs.writeFile(trustFilePath, missingVersion, "utf-8");

    const store = new TrustStore(trustFilePath);
    await store.load();

    // Should recover with empty store due to schema validation failure
    expect(store.size()).toBe(0);
    expect(store.isLoaded()).toBe(true);
  });

  it("should handle invalid capability values", async () => {
    await fs.mkdir(path.dirname(trustFilePath), { recursive: true });
    const invalidCapability = JSON.stringify({
      version: 1,
      plugins: {
        "test-plugin": {
          pluginName: "test-plugin",
          version: "1.0.0",
          trustedAt: new Date().toISOString(),
          capabilities: ["invalid-capability-name"],
          contentHash: createValidHash(),
          trustLevel: "limited",
        },
      },
    });
    await fs.writeFile(trustFilePath, invalidCapability, "utf-8");

    const store = new TrustStore(trustFilePath);
    await store.load();

    // Should recover with empty store
    expect(store.size()).toBe(0);
  });

  it("should handle invalid content hash format", async () => {
    await fs.mkdir(path.dirname(trustFilePath), { recursive: true });
    const invalidHash = JSON.stringify({
      version: 1,
      plugins: {
        "test-plugin": {
          pluginName: "test-plugin",
          version: "1.0.0",
          trustedAt: new Date().toISOString(),
          capabilities: ["execute-hooks"],
          contentHash: "not-a-valid-hash",
          trustLevel: "limited",
        },
      },
    });
    await fs.writeFile(trustFilePath, invalidHash, "utf-8");

    const store = new TrustStore(trustFilePath);
    await store.load();

    // Should recover with empty store
    expect(store.size()).toBe(0);
  });

  it("should create backup file when corruption detected", async () => {
    await fs.mkdir(path.dirname(trustFilePath), { recursive: true });
    await fs.writeFile(trustFilePath, "corrupted content", "utf-8");

    const store = new TrustStore(trustFilePath);
    await store.load();

    // Check backup was created
    const backupPath = `${trustFilePath}.backup`;
    const backupExists = await fs
      .access(backupPath)
      .then(() => true)
      .catch(() => false);
    expect(backupExists).toBe(true);

    const backupContent = await fs.readFile(backupPath, "utf-8");
    expect(backupContent).toBe("corrupted content");
  });

  it("should allow normal operation after corruption recovery", async () => {
    await fs.mkdir(path.dirname(trustFilePath), { recursive: true });
    await fs.writeFile(trustFilePath, "{ corrupted", "utf-8");

    const store = new TrustStore(trustFilePath);
    await store.load();

    // Should be able to add and save new entries
    store.set("new-plugin", createTrustedPlugin({ pluginName: "new-plugin" }));
    await store.save();

    // Reload and verify
    const store2 = new TrustStore(trustFilePath);
    await store2.load();
    expect(store2.get("new-plugin")).toBeDefined();
  });

  it("should handle truncated file", async () => {
    // Create valid file first
    const store1 = new TrustStore(trustFilePath);
    await store1.load();
    store1.set("test-plugin", createTrustedPlugin());
    await store1.save();

    // Truncate the file
    const content = await fs.readFile(trustFilePath, "utf-8");
    await fs.writeFile(trustFilePath, content.slice(0, content.length / 2), "utf-8");

    const store2 = new TrustStore(trustFilePath);
    await store2.load();

    // Should recover with empty store
    expect(store2.isLoaded()).toBe(true);
  });

  it("should handle binary garbage in file", async () => {
    await fs.mkdir(path.dirname(trustFilePath), { recursive: true });
    const binaryGarbage = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
    await fs.writeFile(trustFilePath, binaryGarbage);

    const store = new TrustStore(trustFilePath);
    await store.load();

    // Should recover with empty store
    expect(store.size()).toBe(0);
    expect(store.isLoaded()).toBe(true);
  });
});

// =============================================================================
// Additional Store Operations Tests
// =============================================================================

describe("TrustStore - additional operations", () => {
  let tempDir: string;
  let trustFilePath: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    trustFilePath = path.join(tempDir, "trusted-plugins.json");
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it("should list all trusted plugins", async () => {
    const store = new TrustStore(trustFilePath);
    await store.load();

    store.set("plugin-a", createTrustedPlugin({ pluginName: "plugin-a" }));
    store.set("plugin-b", createTrustedPlugin({ pluginName: "plugin-b" }));

    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.pluginName)).toContain("plugin-a");
    expect(list.map((p) => p.pluginName)).toContain("plugin-b");
  });

  it("should check if plugin exists", async () => {
    const store = new TrustStore(trustFilePath);
    await store.load();

    store.set("existing-plugin", createTrustedPlugin({ pluginName: "existing-plugin" }));

    expect(store.has("existing-plugin")).toBe(true);
    expect(store.has("nonexistent-plugin")).toBe(false);
  });

  it("should return correct size", async () => {
    const store = new TrustStore(trustFilePath);
    await store.load();

    expect(store.size()).toBe(0);

    store.set("plugin-1", createTrustedPlugin({ pluginName: "plugin-1" }));
    expect(store.size()).toBe(1);

    store.set("plugin-2", createTrustedPlugin({ pluginName: "plugin-2" }));
    expect(store.size()).toBe(2);

    store.delete("plugin-1");
    expect(store.size()).toBe(1);
  });

  it("should report file path", async () => {
    const store = new TrustStore(trustFilePath);
    expect(store.getFilePath()).toBe(trustFilePath);
  });

  it("should report loaded status", async () => {
    const store = new TrustStore(trustFilePath);
    expect(store.isLoaded()).toBe(false);

    await store.load();
    expect(store.isLoaded()).toBe(true);
  });

  it("should create parent directories when saving", async () => {
    const nestedPath = path.join(tempDir, "nested", "deep", "path", "trust.json");
    const store = new TrustStore(nestedPath);
    await store.load();

    store.set("test-plugin", createTrustedPlugin());
    await store.save();

    // Verify file was created
    const fileExists = await fs
      .access(nestedPath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);
  });
});
