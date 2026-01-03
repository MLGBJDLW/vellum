/**
 * Error Isolation Integration Tests
 *
 * T047: Verify broken plugin doesn't affect other plugins
 *
 * @module plugin/__tests__/error-isolation.test
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PluginManager } from "../manager.js";

// =============================================================================
// Test Constants
// =============================================================================

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");
const ISOLATION_TEST_DIR = path.join(FIXTURES_DIR, "isolation-test");

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a valid plugin manifest
 */
function createValidManifest(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "1.0.0",
      displayName: `Plugin ${name}`,
      description: `Test plugin ${name}`,
      entrypoint: "./index.js",
    },
    null,
    2
  );
}

/**
 * Creates a malformed JSON manifest
 */
function createBrokenManifest(name: string): string {
  return `{
  "name": "${name}",
  "version": "1.0.0",
  INVALID JSON HERE
  "description": "This will fail to parse"
}`;
}

/**
 * Creates a manifest with invalid schema
 */
function createInvalidSchemaManifest(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "not-a-semver",
      // Missing required fields
    },
    null,
    2
  );
}

/**
 * Creates a test plugin
 */
async function createPlugin(
  baseDir: string,
  pluginName: string,
  manifestContent: string
): Promise<string> {
  const pluginRoot = path.join(baseDir, pluginName);
  const metaDir = path.join(pluginRoot, ".vellum-plugin");

  await fs.mkdir(metaDir, { recursive: true });

  const manifestPath = path.join(metaDir, "plugin.json");
  await fs.writeFile(manifestPath, manifestContent, "utf8");

  // Create a minimal entrypoint file
  const entrypoint = path.join(pluginRoot, "index.js");
  await fs.writeFile(entrypoint, "// Test plugin entry point\n", "utf8");

  return pluginRoot;
}

/**
 * Removes test directory recursively
 */
async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// Error Isolation Tests
// =============================================================================

describe("Plugin Error Isolation", () => {
  beforeEach(async () => {
    // Ensure clean state
    await cleanupTestDir(ISOLATION_TEST_DIR);
    await fs.mkdir(ISOLATION_TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up after tests
    await cleanupTestDir(ISOLATION_TEST_DIR);
  });

  it("should load valid plugins when one has malformed JSON", async () => {
    // Create mix of valid and broken plugins
    await createPlugin(ISOLATION_TEST_DIR, "plugin-good-1", createValidManifest("plugin-good-1"));
    await createPlugin(ISOLATION_TEST_DIR, "plugin-broken", createBrokenManifest("plugin-broken"));
    await createPlugin(ISOLATION_TEST_DIR, "plugin-good-2", createValidManifest("plugin-good-2"));

    // Initialize manager
    const manager = new PluginManager({
      searchPaths: [ISOLATION_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Get loaded plugins
    const plugins = manager.getPlugins();

    // Should load the two good plugins
    expect(plugins).toHaveLength(2);

    const pluginNames = plugins.map((p) => p.manifest.name).sort();
    expect(pluginNames).toEqual(["plugin-good-1", "plugin-good-2"]);

    // Verify failed plugin is tracked
    const failures = manager.getFailedPlugins();
    expect(failures).toHaveLength(1);
    expect(failures[0]?.name).toBe("plugin-broken");
    expect(failures[0]?.error).toBeDefined();
  });

  it("should load valid plugins when one has invalid schema", async () => {
    // Create mix of valid and schema-invalid plugins
    await createPlugin(ISOLATION_TEST_DIR, "plugin-valid-a", createValidManifest("plugin-valid-a"));
    await createPlugin(
      ISOLATION_TEST_DIR,
      "plugin-invalid",
      createInvalidSchemaManifest("plugin-invalid")
    );
    await createPlugin(ISOLATION_TEST_DIR, "plugin-valid-b", createValidManifest("plugin-valid-b"));

    // Initialize manager
    const manager = new PluginManager({
      searchPaths: [ISOLATION_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Get loaded plugins
    const plugins = manager.getPlugins();

    // Should load the two valid plugins
    expect(plugins).toHaveLength(2);

    const pluginNames = plugins.map((p) => p.manifest.name).sort();
    expect(pluginNames).toEqual(["plugin-valid-a", "plugin-valid-b"]);
  });

  it("should isolate errors across multiple broken plugins", async () => {
    // Create multiple broken plugins and one good one
    await createPlugin(ISOLATION_TEST_DIR, "plugin-broken-1", createBrokenManifest("broken-1"));
    await createPlugin(ISOLATION_TEST_DIR, "plugin-valid", createValidManifest("plugin-valid"));
    await createPlugin(ISOLATION_TEST_DIR, "plugin-broken-2", createBrokenManifest("broken-2"));
    await createPlugin(
      ISOLATION_TEST_DIR,
      "plugin-invalid-schema",
      createInvalidSchemaManifest("invalid")
    );

    // Initialize manager
    const manager = new PluginManager({
      searchPaths: [ISOLATION_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Get loaded plugins
    const plugins = manager.getPlugins();

    // Should load only the valid plugin
    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.manifest.name).toBe("plugin-valid");

    // Should track all failures
    const failures = manager.getFailedPlugins();
    expect(failures).toHaveLength(3);

    const failedNames = failures.map((f) => f.name).sort();
    expect(failedNames).toEqual(["plugin-broken-1", "plugin-broken-2", "plugin-invalid-schema"]);
  });

  it("should allow accessing valid plugins even when others fail", async () => {
    // Create plugins
    await createPlugin(ISOLATION_TEST_DIR, "working-plugin", createValidManifest("working-plugin"));
    await createPlugin(ISOLATION_TEST_DIR, "broken-plugin", createBrokenManifest("broken-plugin"));

    // Initialize manager
    const manager = new PluginManager({
      searchPaths: [ISOLATION_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Should be able to get the working plugin
    const workingPlugin = manager.getPlugin("working-plugin");
    expect(workingPlugin).toBeDefined();
    expect(workingPlugin?.manifest.name).toBe("working-plugin");

    // Broken plugin should return undefined
    const brokenPlugin = manager.getPlugin("broken-plugin");
    expect(brokenPlugin).toBeUndefined();
  });

  it("should not crash when all plugins fail to load", async () => {
    // Create only broken plugins
    await createPlugin(ISOLATION_TEST_DIR, "broken-1", createBrokenManifest("broken-1"));
    await createPlugin(ISOLATION_TEST_DIR, "broken-2", createBrokenManifest("broken-2"));
    await createPlugin(ISOLATION_TEST_DIR, "invalid-1", createInvalidSchemaManifest("invalid-1"));

    // Initialize manager - should not throw
    const manager = new PluginManager({
      searchPaths: [ISOLATION_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await expect(manager.initialize()).resolves.not.toThrow();

    // Should have no loaded plugins
    const plugins = manager.getPlugins();
    expect(plugins).toHaveLength(0);

    // Should track all failures
    const failures = manager.getFailedPlugins();
    expect(failures).toHaveLength(3);
  });

  it("should continue loading after encountering a broken plugin", async () => {
    // Create plugins in alphabetical order - broken in the middle
    await createPlugin(ISOLATION_TEST_DIR, "a-good", createValidManifest("a-good"));
    await createPlugin(ISOLATION_TEST_DIR, "b-broken", createBrokenManifest("b-broken"));
    await createPlugin(ISOLATION_TEST_DIR, "c-good", createValidManifest("c-good"));
    await createPlugin(ISOLATION_TEST_DIR, "d-good", createValidManifest("d-good"));

    const manager = new PluginManager({
      searchPaths: [ISOLATION_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Should load all valid plugins regardless of order
    const plugins = manager.getPlugins();
    expect(plugins).toHaveLength(3);

    const pluginNames = plugins.map((p) => p.manifest.name).sort();
    expect(pluginNames).toEqual(["a-good", "c-good", "d-good"]);
  });

  it("should record error details for failed plugins", async () => {
    // Create a broken plugin
    await createPlugin(ISOLATION_TEST_DIR, "broken", createBrokenManifest("broken"));
    await createPlugin(ISOLATION_TEST_DIR, "good", createValidManifest("good"));

    const manager = new PluginManager({
      searchPaths: [ISOLATION_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Check failure record
    const failures = manager.getFailedPlugins();
    expect(failures).toHaveLength(1);

    const failure = failures[0];
    expect(failure).toBeDefined();
    expect(failure?.name).toBe("broken");
    expect(failure?.path).toContain("broken");
    expect(failure?.error).toBeInstanceOf(Error);
    expect(failure?.failedAt).toBeInstanceOf(Date);
  });

  it("should handle missing manifest files gracefully", async () => {
    // Create directory structure without valid manifests
    const pluginRoot = path.join(ISOLATION_TEST_DIR, "no-manifest");
    const metaDir = path.join(pluginRoot, ".vellum-plugin");
    await fs.mkdir(metaDir, { recursive: true });
    // Don't create plugin.json

    // Create a valid plugin too
    await createPlugin(ISOLATION_TEST_DIR, "valid", createValidManifest("valid"));

    const manager = new PluginManager({
      searchPaths: [ISOLATION_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Should load only the valid plugin
    const plugins = manager.getPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.manifest.name).toBe("valid");
  });

  it("should allow retry loading after fixing broken plugin", async () => {
    // Create a broken plugin
    const brokenPath = await createPlugin(
      ISOLATION_TEST_DIR,
      "fixable",
      createBrokenManifest("fixable")
    );

    const manager = new PluginManager({
      searchPaths: [ISOLATION_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Should fail to load initially
    expect(manager.getPlugin("fixable")).toBeUndefined();
    expect(manager.getFailedPlugins()).toHaveLength(1);

    // Fix the plugin manifest
    const manifestPath = path.join(brokenPath, ".vellum-plugin", "plugin.json");
    await fs.writeFile(manifestPath, createValidManifest("fixable"), "utf8");

    // Reload the specific plugin
    const reloaded = await manager.loadPlugin("fixable");

    // Should now be loaded
    expect(reloaded).toBeDefined();
    expect(reloaded.manifest.name).toBe("fixable");
  });
});
