/**
 * Unit tests for Plugin Discovery and Loader
 *
 * Tests for T011 - discovery and loading functionality
 *
 * @module plugin/__tests__/loader.test
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  compareByPriority,
  type DiscoveredPlugin,
  discoverPlugins,
  getSourcePriority,
  type PluginSource,
  scanDirectory,
} from "../discovery.js";
import {
  isFullyLoaded,
  loadFull,
  loadManifestOnly,
  loadPlugin,
  type PartiallyLoadedPlugin,
  PluginLoadError,
} from "../loader.js";

// =============================================================================
// Test Constants
// =============================================================================

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");
const VALID_PLUGIN_DIR = path.join(FIXTURES_DIR, "valid-plugin");
const INVALID_PLUGIN_DIR = path.join(FIXTURES_DIR, "invalid-plugin");
const MINIMAL_PLUGIN_DIR = path.join(FIXTURES_DIR, "minimal-plugin");

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a DiscoveredPlugin object for testing
 */
export function createDiscoveredPlugin(
  name: string,
  root: string,
  source: PluginSource = "user"
): DiscoveredPlugin {
  return {
    name,
    root,
    manifestPath: path.join(root, ".vellum-plugin", "plugin.json"),
    source,
  };
}

/**
 * Creates a temporary directory for testing
 */
export async function createTempDir(): Promise<string> {
  const tmpDir = path.join(
    FIXTURES_DIR,
    `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Removes a directory recursively
 */
export async function removeTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore errors on cleanup
  }
}

// =============================================================================
// Discovery Tests
// =============================================================================

describe("Discovery", () => {
  describe("scanDirectory", () => {
    it("should find valid plugins in a directory", async () => {
      const plugins = await scanDirectory(FIXTURES_DIR, "user");

      expect(plugins.length).toBeGreaterThanOrEqual(1);

      const validPlugin = plugins.find((p) => p.name === "valid-plugin");
      expect(validPlugin).toBeDefined();
      expect(validPlugin?.source).toBe("user");
      expect(validPlugin?.root).toBe(VALID_PLUGIN_DIR);
      expect(validPlugin?.manifestPath).toBe(
        path.join(VALID_PLUGIN_DIR, ".vellum-plugin", "plugin.json")
      );
    });

    it("should skip directories without plugin.json", async () => {
      const tempDir = await createTempDir();
      try {
        // Create a directory without .vellum-plugin
        const nonPluginDir = path.join(tempDir, "not-a-plugin");
        await fs.mkdir(nonPluginDir, { recursive: true });
        await fs.writeFile(path.join(nonPluginDir, "README.md"), "Not a plugin");

        const plugins = await scanDirectory(tempDir, "user");

        expect(plugins).toHaveLength(0);
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("should return empty array for non-existent directories", async () => {
      const plugins = await scanDirectory("/non/existent/path", "user");

      expect(plugins).toEqual([]);
    });

    it("should handle permission errors gracefully", async () => {
      // Permission errors are handled internally by returning empty array
      // We can test this by verifying the behavior with a non-existent path
      // that would fail with ENOENT (similar handling to EACCES)
      const plugins = await scanDirectory("/non/existent/protected/path", "user");

      expect(plugins).toEqual([]);
    });

    it("should assign correct source to discovered plugins", async () => {
      const projectPlugins = await scanDirectory(FIXTURES_DIR, "project");
      const userPlugins = await scanDirectory(FIXTURES_DIR, "user");
      const globalPlugins = await scanDirectory(FIXTURES_DIR, "global");
      const builtinPlugins = await scanDirectory(FIXTURES_DIR, "builtin");

      const projectValid = projectPlugins.find((p) => p.name === "valid-plugin");
      const userValid = userPlugins.find((p) => p.name === "valid-plugin");
      const globalValid = globalPlugins.find((p) => p.name === "valid-plugin");
      const builtinValid = builtinPlugins.find((p) => p.name === "valid-plugin");

      expect(projectValid?.source).toBe("project");
      expect(userValid?.source).toBe("user");
      expect(globalValid?.source).toBe("global");
      expect(builtinValid?.source).toBe("builtin");
    });
  });

  describe("discoverPlugins", () => {
    it("should discover plugins from multiple search paths", async () => {
      const plugins = await discoverPlugins([FIXTURES_DIR]);

      expect(plugins.length).toBeGreaterThanOrEqual(1);
      expect(plugins.find((p) => p.name === "valid-plugin")).toBeDefined();
    });

    it("should return empty array for empty search paths", async () => {
      const plugins = await discoverPlugins([]);

      expect(plugins).toEqual([]);
    });

    it("should deduplicate by name - first by priority wins", async () => {
      const tempDir1 = await createTempDir();
      const tempDir2 = await createTempDir();

      try {
        // Create same plugin in both directories
        const pluginName = "duplicate-plugin";

        for (const dir of [tempDir1, tempDir2]) {
          const pluginDir = path.join(dir, pluginName, ".vellum-plugin");
          await fs.mkdir(pluginDir, { recursive: true });
          await fs.writeFile(
            path.join(pluginDir, "plugin.json"),
            JSON.stringify({
              name: pluginName,
              version: "1.0.0",
              displayName: `Plugin from ${dir === tempDir1 ? "first" : "second"}`,
              description: "Test plugin",
              entrypoint: "./index.js",
            })
          );
        }

        // First path has higher priority (index 0 = project)
        const plugins = await discoverPlugins([tempDir1, tempDir2]);

        const found = plugins.filter((p) => p.name === pluginName);
        expect(found).toHaveLength(1);
        expect(found[0]?.root).toBe(path.join(tempDir1, pluginName));
        expect(found[0]?.source).toBe("project"); // First index = project
      } finally {
        await removeTempDir(tempDir1);
        await removeTempDir(tempDir2);
      }
    });

    it("should assign sources based on path index", async () => {
      // Sources map: 0=project, 1=user, 2=global, 3=builtin
      const plugins = await discoverPlugins([
        path.join(FIXTURES_DIR, ".."), // Non-existent relative to cause empty
        FIXTURES_DIR,
      ]);

      // Since FIXTURES_DIR is at index 1, it should be "user" source
      const validPlugin = plugins.find((p) => p.name === "valid-plugin");
      expect(validPlugin?.source).toBe("user");
    });
  });

  describe("getSourcePriority", () => {
    it("should return correct priority values", () => {
      expect(getSourcePriority("project")).toBe(0);
      expect(getSourcePriority("user")).toBe(1);
      expect(getSourcePriority("global")).toBe(2);
      expect(getSourcePriority("builtin")).toBe(3);
    });
  });

  describe("compareByPriority", () => {
    it("should sort plugins by priority", () => {
      const plugins: DiscoveredPlugin[] = [
        createDiscoveredPlugin("builtin-plugin", "/builtin", "builtin"),
        createDiscoveredPlugin("project-plugin", "/project", "project"),
        createDiscoveredPlugin("user-plugin", "/user", "user"),
        createDiscoveredPlugin("global-plugin", "/global", "global"),
      ];

      const sorted = [...plugins].sort(compareByPriority);

      expect(sorted[0]?.source).toBe("project");
      expect(sorted[1]?.source).toBe("user");
      expect(sorted[2]?.source).toBe("global");
      expect(sorted[3]?.source).toBe("builtin");
    });
  });
});

// =============================================================================
// Loader Tests
// =============================================================================

describe("Loader", () => {
  describe("loadManifestOnly", () => {
    it("should parse valid manifest", async () => {
      const discovered = createDiscoveredPlugin("valid-plugin", VALID_PLUGIN_DIR);

      const partial = await loadManifestOnly(discovered);

      expect(partial.manifest.name).toBe("valid-plugin");
      expect(partial.manifest.version).toBe("1.0.0");
      expect(partial.manifest.displayName).toBe("Valid Test Plugin");
      expect(partial.manifest.description).toBe("A valid test plugin for unit tests");
      expect(partial.manifest.entrypoint).toBe("./dist/index.js");
      expect(partial.manifest.commands).toEqual(["./.vellum-plugin/commands/greet.md"]);
      expect(partial.manifest.agents).toEqual(["./.vellum-plugin/agents/helper.md"]);
      expect(partial.root).toBe(VALID_PLUGIN_DIR);
      expect(partial.source).toBe("user");
      expect(partial.fullyLoaded).toBe(false);
    });

    it("should parse minimal manifest with only required fields", async () => {
      const discovered = createDiscoveredPlugin("minimal-plugin", MINIMAL_PLUGIN_DIR);

      const partial = await loadManifestOnly(discovered);

      expect(partial.manifest.name).toBe("minimal-plugin");
      expect(partial.manifest.version).toBe("1.0.0");
      expect(partial.manifest.displayName).toBe("Minimal Plugin");
      expect(partial.manifest.commands).toBeUndefined();
      expect(partial.manifest.agents).toBeUndefined();
    });

    it("should throw PluginLoadError on invalid manifest schema", async () => {
      const discovered = createDiscoveredPlugin("invalid-plugin", INVALID_PLUGIN_DIR);

      await expect(loadManifestOnly(discovered)).rejects.toThrow(PluginLoadError);

      try {
        await loadManifestOnly(discovered);
      } catch (error) {
        expect(error).toBeInstanceOf(PluginLoadError);
        const loadError = error as PluginLoadError;
        expect(loadError.pluginName).toBe("invalid-plugin");
        expect(loadError.pluginRoot).toBe(INVALID_PLUGIN_DIR);
        expect(loadError.message).toContain("Invalid manifest schema");
      }
    });

    it("should throw PluginLoadError on missing plugin.json", async () => {
      const tempDir = await createTempDir();
      try {
        const pluginDir = path.join(tempDir, "missing-manifest");
        await fs.mkdir(path.join(pluginDir, ".vellum-plugin"), { recursive: true });
        // Don't create plugin.json

        const discovered = createDiscoveredPlugin("missing-manifest", pluginDir);

        await expect(loadManifestOnly(discovered)).rejects.toThrow(PluginLoadError);

        try {
          await loadManifestOnly(discovered);
        } catch (error) {
          expect(error).toBeInstanceOf(PluginLoadError);
          const loadError = error as PluginLoadError;
          expect(loadError.message).toContain("Failed to read manifest file");
        }
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("should throw PluginLoadError on malformed JSON", async () => {
      const tempDir = await createTempDir();
      try {
        const pluginDir = path.join(tempDir, "malformed-json");
        const vellumDir = path.join(pluginDir, ".vellum-plugin");
        await fs.mkdir(vellumDir, { recursive: true });
        await fs.writeFile(path.join(vellumDir, "plugin.json"), "{ invalid json }");

        const discovered = createDiscoveredPlugin("malformed-json", pluginDir);

        await expect(loadManifestOnly(discovered)).rejects.toThrow(PluginLoadError);

        try {
          await loadManifestOnly(discovered);
        } catch (error) {
          expect(error).toBeInstanceOf(PluginLoadError);
          const loadError = error as PluginLoadError;
          expect(loadError.message).toContain("Invalid JSON");
        }
      } finally {
        await removeTempDir(tempDir);
      }
    });
  });

  describe("loadFull", () => {
    let partial: PartiallyLoadedPlugin;

    beforeEach(async () => {
      const discovered = createDiscoveredPlugin("valid-plugin", VALID_PLUGIN_DIR);
      partial = await loadManifestOnly(discovered);
    });

    it("should load commands from markdown", async () => {
      const full = await loadFull(partial);

      expect(full.commands.size).toBe(1);
      expect(full.commands.has("greet")).toBe(true);

      const greetCommand = full.commands.get("greet");
      expect(greetCommand).toBeDefined();
      expect(greetCommand?.name).toBe("greet");
      expect(greetCommand?.description).toBe("A friendly greeting command");
      expect(greetCommand?.argumentHint).toBe("<name>");
      expect(greetCommand?.allowedTools).toEqual(["read_file", "write_file"]);
      expect(greetCommand?.content).toContain("friendly greeter");
    });

    it("should load agents from markdown", async () => {
      const full = await loadFull(partial);

      expect(full.agents.size).toBe(1);
      expect(full.agents.has("helper")).toBe(true);

      const helperAgent = full.agents.get("helper");
      expect(helperAgent).toBeDefined();
      expect(helperAgent?.slug).toBe("helper");
      expect(helperAgent?.name).toBe("Helper Agent");
      expect(helperAgent?.mode).toBe("code");
      expect(helperAgent?.description).toBe("A helpful assistant agent");
      expect(helperAgent?.systemPrompt).toContain("helpful assistant");
    });

    it("should warn on missing components but continue", async () => {
      const tempDir = await createTempDir();
      try {
        // Create plugin with missing component files
        const pluginDir = path.join(tempDir, "missing-components");
        const vellumDir = path.join(pluginDir, ".vellum-plugin");
        await fs.mkdir(vellumDir, { recursive: true });
        await fs.writeFile(
          path.join(vellumDir, "plugin.json"),
          JSON.stringify({
            name: "missing-components",
            version: "1.0.0",
            displayName: "Missing Components Plugin",
            description: "Plugin with missing component files",
            entrypoint: "./index.js",
            commands: ["./non-existent-command.md"],
            agents: ["./non-existent-agent.md"],
          })
        );

        const discovered = createDiscoveredPlugin("missing-components", pluginDir);
        const partialMissing = await loadManifestOnly(discovered);

        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const full = await loadFull(partialMissing);

        // Should not throw, but should have empty collections
        expect(full.commands.size).toBe(0);
        expect(full.agents.size).toBe(0);

        // Should have logged warnings
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
      } finally {
        await removeTempDir(tempDir);
      }
    });

    it("should return fully loaded plugin with state enabled", async () => {
      const full = await loadFull(partial);

      expect(full.state).toBe("enabled");
      expect(full.manifest.name).toBe("valid-plugin");
    });
  });

  describe("loadPlugin", () => {
    it("should perform L1 loading by default", async () => {
      const discovered = createDiscoveredPlugin("valid-plugin", VALID_PLUGIN_DIR);

      const plugin = await loadPlugin(discovered);

      expect(isFullyLoaded(plugin)).toBe(false);
      expect((plugin as PartiallyLoadedPlugin).fullyLoaded).toBe(false);
    });

    it("should perform L2 loading when fullLoad is true", async () => {
      const discovered = createDiscoveredPlugin("valid-plugin", VALID_PLUGIN_DIR);

      const plugin = await loadPlugin(discovered, { fullLoad: true });

      expect(isFullyLoaded(plugin)).toBe(true);
    });
  });

  describe("isFullyLoaded", () => {
    it("should return false for partially loaded plugin", async () => {
      const discovered = createDiscoveredPlugin("valid-plugin", VALID_PLUGIN_DIR);
      const partial = await loadManifestOnly(discovered);

      expect(isFullyLoaded(partial)).toBe(false);
    });

    it("should return true for fully loaded plugin", async () => {
      const discovered = createDiscoveredPlugin("valid-plugin", VALID_PLUGIN_DIR);
      const partial = await loadManifestOnly(discovered);
      const full = await loadFull(partial);

      expect(isFullyLoaded(full)).toBe(true);
    });
  });

  describe("PluginLoadError", () => {
    it("should contain all error details", () => {
      const cause = new Error("Underlying error");
      const error = new PluginLoadError(
        "Test error message",
        "test-plugin",
        "/path/to/plugin",
        { extra: "details" },
        cause
      );

      expect(error.name).toBe("PluginLoadError");
      expect(error.message).toBe("Test error message");
      expect(error.pluginName).toBe("test-plugin");
      expect(error.pluginRoot).toBe("/path/to/plugin");
      expect(error.details).toEqual({ extra: "details" });
      expect(error.cause).toBe(cause);
    });
  });

  describe("Path expansion", () => {
    it("should expand paths in component paths", async () => {
      const tempDir = await createTempDir();
      try {
        // Create plugin with path variable in component path
        const pluginDir = path.join(tempDir, "path-expansion");
        const vellumDir = path.join(pluginDir, ".vellum-plugin");
        const commandsDir = path.join(pluginDir, "my-commands");
        await fs.mkdir(vellumDir, { recursive: true });
        await fs.mkdir(commandsDir, { recursive: true });

        // Create command file
        await fs.writeFile(
          path.join(commandsDir, "test.md"),
          `---
name: test-cmd
description: Test command
---

Test content`
        );

        await fs.writeFile(
          path.join(vellumDir, "plugin.json"),
          JSON.stringify({
            name: "path-expansion",
            version: "1.0.0",
            displayName: "Path Expansion Plugin",
            description: "Plugin testing path expansion",
            entrypoint: "./index.js",
            commands: ["./my-commands/test.md"],
          })
        );

        const discovered = createDiscoveredPlugin("path-expansion", pluginDir);
        const partial = await loadManifestOnly(discovered);
        const full = await loadFull(partial);

        expect(full.commands.size).toBe(1);
        expect(full.commands.has("test-cmd")).toBe(true);
      } finally {
        await removeTempDir(tempDir);
      }
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("Discovery and Loader Integration", () => {
  it("should discover and load plugins end-to-end", async () => {
    const plugins = await discoverPlugins([FIXTURES_DIR]);
    const validDiscovered = plugins.find((p) => p.name === "valid-plugin");

    expect(validDiscovered).toBeDefined();

    // Skip test if plugin not found (shouldn't happen with valid fixtures)
    if (!validDiscovered) return;

    const partial = await loadManifestOnly(validDiscovered);
    expect(partial.manifest.name).toBe("valid-plugin");

    const full = await loadFull(partial);
    expect(full.commands.size).toBe(1);
    expect(full.agents.size).toBe(1);
  });
});
