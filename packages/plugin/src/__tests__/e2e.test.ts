/**
 * End-to-End Integration Tests
 *
 * T048: Full workflow: discover → load → trust → execute
 *
 * @module plugin/__tests__/e2e.test
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PluginManager } from "../manager.js";
import { TrustStore } from "../trust/store.js";

// =============================================================================
// Test Constants
// =============================================================================

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");
const E2E_TEST_DIR = path.join(FIXTURES_DIR, "e2e-test");

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a complete plugin with commands
 */
async function createCompletePlugin(baseDir: string, pluginName: string): Promise<string> {
  const pluginRoot = path.join(baseDir, pluginName);
  const metaDir = path.join(pluginRoot, ".vellum-plugin");
  const commandsDir = path.join(metaDir, "commands");

  await fs.mkdir(commandsDir, { recursive: true });

  // Create manifest
  const manifest = {
    name: pluginName,
    version: "1.0.0",
    displayName: `E2E Plugin ${pluginName}`,
    description: `End-to-end test plugin ${pluginName}`,
    entrypoint: "./index.js",
    commands: ["./.vellum-plugin/commands/test-cmd.md"],
  };

  await fs.writeFile(path.join(metaDir, "plugin.json"), JSON.stringify(manifest, null, 2), "utf8");

  // Create test command
  const commandContent = `---
name: test-cmd
description: Test command for ${pluginName}
---

# Test Command

This is a test command for ${pluginName}.

## Instructions

Execute test workflow.
`;

  await fs.writeFile(path.join(commandsDir, "test-cmd.md"), commandContent, "utf8");

  // Create entrypoint file
  const entrypoint = path.join(pluginRoot, "index.js");
  await fs.writeFile(entrypoint, "// Test plugin entry point\n", "utf8");

  return pluginRoot;
}

/**
 * Creates a plugin with agents
 */
async function createPluginWithAgents(baseDir: string, pluginName: string): Promise<string> {
  const pluginRoot = path.join(baseDir, pluginName);
  const metaDir = path.join(pluginRoot, ".vellum-plugin");
  const agentsDir = path.join(metaDir, "agents");

  await fs.mkdir(agentsDir, { recursive: true });

  // Create manifest
  const manifest = {
    name: pluginName,
    version: "1.0.0",
    displayName: `Agent Plugin ${pluginName}`,
    description: `Plugin with agents ${pluginName}`,
    entrypoint: "./index.js",
    agents: ["./.vellum-plugin/agents/test-agent.md"],
  };

  await fs.writeFile(path.join(metaDir, "plugin.json"), JSON.stringify(manifest, null, 2), "utf8");

  // Create test agent
  const agentContent = `---
slug: test-agent
name: Test Agent
mode: code
---

# Test Agent

Agent for ${pluginName}.

## Instructions

You are a test agent.
`;

  await fs.writeFile(path.join(agentsDir, "test-agent.md"), agentContent, "utf8");

  // Create entrypoint file
  const entrypoint = path.join(pluginRoot, "index.js");
  await fs.writeFile(entrypoint, "// Test plugin entry point\n", "utf8");

  return pluginRoot;
}

/**
 * Creates a plugin with hooks
 */
async function createPluginWithHooks(baseDir: string, pluginName: string): Promise<string> {
  const pluginRoot = path.join(baseDir, pluginName);
  const metaDir = path.join(pluginRoot, ".vellum-plugin");

  await fs.mkdir(metaDir, { recursive: true });

  // Create manifest
  const manifest = {
    name: pluginName,
    version: "1.0.0",
    displayName: `Hooks Plugin ${pluginName}`,
    description: `Plugin with hooks ${pluginName}`,
    entrypoint: "./index.js",
  };

  await fs.writeFile(path.join(metaDir, "plugin.json"), JSON.stringify(manifest, null, 2), "utf8");

  // Create hooks config
  const hooksConfig = {
    hooks: [
      {
        event: "PreToolUse",
        handler: "console.log",
        args: ["Pre-tool hook triggered"],
      },
    ],
  };

  await fs.writeFile(
    path.join(metaDir, "hooks.json"),
    JSON.stringify(hooksConfig, null, 2),
    "utf8"
  );

  // Create entrypoint file
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
// End-to-End Tests
// =============================================================================

describe("Plugin System E2E Workflow", () => {
  let trustStorePath: string;

  beforeEach(async () => {
    // Ensure clean state
    await cleanupTestDir(E2E_TEST_DIR);
    await fs.mkdir(E2E_TEST_DIR, { recursive: true });

    // Create temp trust store
    trustStorePath = path.join(E2E_TEST_DIR, "trust-store.json");
  });

  afterEach(async () => {
    // Clean up after tests
    await cleanupTestDir(E2E_TEST_DIR);
  });

  it("should complete full workflow: discover → load → trust → execute", async () => {
    // Step 1: Create plugins
    await createCompletePlugin(E2E_TEST_DIR, "test-plugin-1");
    await createCompletePlugin(E2E_TEST_DIR, "test-plugin-2");

    // Step 2: Initialize manager (discovery + load)
    const trustStore = new TrustStore(trustStorePath);
    const manager = new PluginManager({
      searchPaths: [E2E_TEST_DIR],
      trustStore,
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Step 3: Verify discovery
    const plugins = manager.getPlugins();
    expect(plugins).toHaveLength(2);

    const pluginNames = plugins.map((p) => p.manifest.name).sort();
    expect(pluginNames).toEqual(["test-plugin-1", "test-plugin-2"]);

    // Step 4: Verify commands loaded
    const commands = manager.getCommands();
    expect(commands.size).toBeGreaterThanOrEqual(2);

    // Step 5: Verify trust (auto-trust enabled)
    const plugin1 = manager.getPlugin("test-plugin-1");
    expect(plugin1).toBeDefined();
    expect(manager.getTrustManager().isTrusted("test-plugin-1")).toBe(true);

    // Step 6: Execute command
    // First plugin gets unnamespaced command name, second gets namespaced
    const command = commands.get("test-cmd");
    expect(command).toBeDefined();
    expect(command?.name).toBe("test-cmd");
    expect(command?.description).toContain("Test command");
  });

  it("should handle mixed plugin types (commands, agents, hooks)", async () => {
    // Create different types of plugins
    await createCompletePlugin(E2E_TEST_DIR, "cmd-plugin");
    await createPluginWithAgents(E2E_TEST_DIR, "agent-plugin");
    await createPluginWithHooks(E2E_TEST_DIR, "hook-plugin");

    const manager = new PluginManager({
      searchPaths: [E2E_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Verify all plugins loaded
    const plugins = manager.getPlugins();
    expect(plugins).toHaveLength(3);

    // Verify commands
    const commands = manager.getCommands();
    const cmdPlugin = Array.from(commands.values()).find((cmd) => cmd.source === "cmd-plugin");
    expect(cmdPlugin).toBeDefined();

    // Verify agents
    const agents = manager.getAgents();
    const agentPlugin = Array.from(agents.values()).find(
      (agent) => agent.pluginName === "agent-plugin"
    );
    expect(agentPlugin).toBeDefined();
  });

  it("should support lazy loading workflow", async () => {
    // Create plugins
    await createCompletePlugin(E2E_TEST_DIR, "lazy-1");
    await createCompletePlugin(E2E_TEST_DIR, "lazy-2");

    // Initialize with lazy loading (eagerLoad = false)
    const manager = new PluginManager({
      searchPaths: [E2E_TEST_DIR],
      autoTrust: true,
      eagerLoad: false,
    });

    await manager.initialize();

    // Initially, no plugins should be fully loaded
    let plugins = manager.getPlugins();
    expect(plugins).toHaveLength(0);

    // Explicitly load one plugin
    const loaded = await manager.loadPlugin("lazy-1");
    expect(loaded).toBeDefined();
    expect(loaded.manifest.name).toBe("lazy-1");

    // Now should have one loaded plugin
    plugins = manager.getPlugins();
    expect(plugins).toHaveLength(1);

    // Load second plugin
    await manager.loadPlugin("lazy-2");
    plugins = manager.getPlugins();
    expect(plugins).toHaveLength(2);
  });

  it("should persist trust state across manager instances", async () => {
    // Create plugin
    await createCompletePlugin(E2E_TEST_DIR, "persistent-plugin");

    // First manager instance
    const trustStore1 = new TrustStore(trustStorePath);
    const manager1 = new PluginManager({
      searchPaths: [E2E_TEST_DIR],
      trustStore: trustStore1,
      autoTrust: true,
      eagerLoad: true,
    });

    await manager1.initialize();

    // Verify plugin loaded and trusted
    expect(manager1.getTrustManager().isTrusted("persistent-plugin")).toBe(true);

    // Save trust state
    await trustStore1.save();

    // DEBUG: Verify file was created and contains data
    const fileExists = await fs
      .access(trustStorePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);
    const fileContent = await fs.readFile(trustStorePath, "utf-8");
    const parsed = JSON.parse(fileContent);
    expect(parsed.plugins).toBeDefined();
    expect(parsed.plugins["persistent-plugin"]).toBeDefined();

    // Second manager instance (new TrustStore loading same file)
    const trustStore2 = new TrustStore(trustStorePath);
    await trustStore2.load(); // Explicitly load before passing to manager
    const manager2 = new PluginManager({
      searchPaths: [E2E_TEST_DIR],
      trustStore: trustStore2,
      autoTrust: false, // Don't auto-trust
      eagerLoad: true,
    });

    await manager2.initialize();

    // Trust should persist
    expect(manager2.getTrustManager().isTrusted("persistent-plugin")).toBe(true);
  });

  it("should aggregate commands from multiple plugins", async () => {
    // Create multiple plugins with unique commands
    await createCompletePlugin(E2E_TEST_DIR, "plugin-a");
    await createCompletePlugin(E2E_TEST_DIR, "plugin-b");
    await createCompletePlugin(E2E_TEST_DIR, "plugin-c");

    const manager = new PluginManager({
      searchPaths: [E2E_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Get all commands
    const commands = manager.getCommands();

    // Should have one command from each plugin
    expect(commands.size).toBeGreaterThanOrEqual(3);

    // Verify plugin-specific namespacing
    // First plugin gets unnamespaced name, others get namespaced due to collision
    expect(commands.has("test-cmd")).toBe(true);
    expect(commands.has("plugin-b:test-cmd")).toBe(true);
    expect(commands.has("plugin-c:test-cmd")).toBe(true);
  });

  it("should aggregate agents from multiple plugins", async () => {
    // Create multiple plugins with agents
    await createPluginWithAgents(E2E_TEST_DIR, "agent-plugin-1");
    await createPluginWithAgents(E2E_TEST_DIR, "agent-plugin-2");

    const manager = new PluginManager({
      searchPaths: [E2E_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Get all agents
    const agents = manager.getAgents();

    // Should have agents from both plugins
    expect(agents.size).toBeGreaterThanOrEqual(2);

    // Verify plugin-specific namespacing
    const agentSlugs = Array.from(agents.keys());
    const hasPlugin1 = agentSlugs.some((slug) => slug.includes("agent-plugin-1"));
    const hasPlugin2 = agentSlugs.some((slug) => slug.includes("agent-plugin-2"));

    expect(hasPlugin1).toBe(true);
    expect(hasPlugin2).toBe(true);
  });

  it("should handle dynamic plugin registration", async () => {
    // Start with empty directory
    const manager = new PluginManager({
      searchPaths: [E2E_TEST_DIR],
      autoTrust: true,
    });

    await manager.initialize();

    // No plugins initially
    expect(manager.getPlugins()).toHaveLength(0);

    // Create a new plugin
    await createCompletePlugin(E2E_TEST_DIR, "dynamic-plugin");

    // Load the new plugin explicitly
    const loaded = await manager.loadPlugin("dynamic-plugin");

    expect(loaded).toBeDefined();
    expect(loaded.manifest.name).toBe("dynamic-plugin");

    // Should now be in plugins list
    const plugins = manager.getPlugins();
    expect(plugins).toHaveLength(1);
  });

  it("should support plugin reloading after updates", async () => {
    // Create initial plugin
    const pluginRoot = await createCompletePlugin(E2E_TEST_DIR, "updatable-plugin");

    const manager = new PluginManager({
      searchPaths: [E2E_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    // Verify initial state
    const plugin = manager.getPlugin("updatable-plugin");
    expect(plugin?.manifest.version).toBe("1.0.0");

    // Update the plugin manifest
    const manifestPath = path.join(pluginRoot, ".vellum-plugin", "plugin.json");
    const updatedManifest = {
      name: "updatable-plugin",
      version: "2.0.0",
      displayName: "Updated E2E Plugin",
      description: "Updated test plugin",
      entrypoint: "./index.js",
      commands: ["./.vellum-plugin/commands/test-cmd.md"],
    };

    await fs.writeFile(manifestPath, JSON.stringify(updatedManifest, null, 2), "utf8");

    // Unload then reload the plugin to pick up changes
    manager.unloadPlugin("updatable-plugin");
    const reloaded = await manager.loadPlugin("updatable-plugin");

    // Should reflect updated version
    expect(reloaded.manifest.version).toBe("2.0.0");
    expect(reloaded.manifest.displayName).toBe("Updated E2E Plugin");
  });

  it("should provide access to plugin metadata", async () => {
    // Create plugin with detailed metadata
    const pluginRoot = path.join(E2E_TEST_DIR, "metadata-plugin");
    const metaDir = path.join(pluginRoot, ".vellum-plugin");
    await fs.mkdir(metaDir, { recursive: true });

    const manifest = {
      name: "metadata-plugin",
      version: "1.2.3",
      displayName: "Metadata Test Plugin",
      description: "Plugin for testing metadata access",
      entrypoint: "./index.js",
    };

    await fs.writeFile(
      path.join(metaDir, "plugin.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );

    // Create entrypoint file
    const entrypoint = path.join(pluginRoot, "index.js");
    await fs.writeFile(entrypoint, "// Test plugin entry point\n", "utf8");

    const manager = new PluginManager({
      searchPaths: [E2E_TEST_DIR],
      autoTrust: true,
      eagerLoad: true,
    });

    await manager.initialize();

    const plugin = manager.getPlugin("metadata-plugin");
    expect(plugin).toBeDefined();
    expect(plugin?.manifest.version).toBe("1.2.3");
    expect(plugin?.manifest.displayName).toBe("Metadata Test Plugin");
  });
});
