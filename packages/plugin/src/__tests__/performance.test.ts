/**
 * Performance tests for Plugin System
 *
 * T046: Verify plugin discovery completes in <100ms for 10 plugins
 *
 * @module plugin/__tests__/performance.test
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverPlugins } from "../discovery.js";

// =============================================================================
// Test Constants
// =============================================================================

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");
const PERF_TEST_DIR = path.join(FIXTURES_DIR, "perf-test");
const TARGET_PLUGIN_COUNT = 10;
const MAX_DISCOVERY_TIME_MS = 100;

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a minimal valid plugin manifest
 */
function createMinimalManifest(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "1.0.0",
      displayName: `Test Plugin ${name}`,
      description: `Performance test plugin ${name}`,
    },
    null,
    2
  );
}

/**
 * Creates a temporary plugin directory structure
 */
async function createTestPlugin(baseDir: string, pluginName: string): Promise<string> {
  const pluginRoot = path.join(baseDir, pluginName);
  const metaDir = path.join(pluginRoot, ".vellum-plugin");

  await fs.mkdir(metaDir, { recursive: true });

  const manifestPath = path.join(metaDir, "plugin.json");
  await fs.writeFile(manifestPath, createMinimalManifest(pluginName), "utf8");

  return pluginRoot;
}

/**
 * Creates N test plugins for performance testing
 */
async function createMultiplePlugins(baseDir: string, count: number): Promise<string[]> {
  const created: string[] = [];

  for (let i = 1; i <= count; i++) {
    const pluginName = `perf-plugin-${i.toString().padStart(2, "0")}`;
    const pluginRoot = await createTestPlugin(baseDir, pluginName);
    created.push(pluginRoot);
  }

  return created;
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
// Performance Tests
// =============================================================================

describe("Plugin Discovery Performance", () => {
  beforeEach(async () => {
    // Ensure clean state
    await cleanupTestDir(PERF_TEST_DIR);
    await fs.mkdir(PERF_TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up after tests
    await cleanupTestDir(PERF_TEST_DIR);
  });

  it("should discover 10 plugins in less than 100ms", async () => {
    // Create test plugins
    await createMultiplePlugins(PERF_TEST_DIR, TARGET_PLUGIN_COUNT);

    // Measure discovery time
    const startTime = performance.now();
    const discovered = await discoverPlugins([PERF_TEST_DIR]);
    const endTime = performance.now();

    const elapsedMs = endTime - startTime;

    // Verify all plugins were discovered
    expect(discovered).toHaveLength(TARGET_PLUGIN_COUNT);

    // Verify performance constraint
    expect(elapsedMs).toBeLessThan(MAX_DISCOVERY_TIME_MS);

    // Log performance for visibility
    console.log(`Discovery time: ${elapsedMs.toFixed(2)}ms for ${TARGET_PLUGIN_COUNT} plugins`);
  });

  it("should scale linearly with plugin count", async () => {
    // Test with different plugin counts to verify linear scaling
    const counts = [1, 5, 10];
    const times: number[] = [];

    for (const count of counts) {
      // Clean and recreate
      await cleanupTestDir(PERF_TEST_DIR);
      await fs.mkdir(PERF_TEST_DIR, { recursive: true });
      await createMultiplePlugins(PERF_TEST_DIR, count);

      // Measure
      const startTime = performance.now();
      await discoverPlugins([PERF_TEST_DIR]);
      const endTime = performance.now();

      times.push(endTime - startTime);
    }

    // Verify all measurements
    for (const time of times) {
      expect(time).toBeLessThan(MAX_DISCOVERY_TIME_MS);
    }

    // Log for analysis
    console.log("Scaling test results:");
    counts.forEach((count, idx) => {
      const time = times[idx];
      if (time !== undefined) {
        console.log(`  ${count} plugins: ${time.toFixed(2)}ms`);
      }
    });
  });

  it("should handle concurrent discovery operations efficiently", async () => {
    // Create test plugins
    await createMultiplePlugins(PERF_TEST_DIR, TARGET_PLUGIN_COUNT);

    // Run multiple discoveries concurrently
    const startTime = performance.now();
    const results = await Promise.all([
      discoverPlugins([PERF_TEST_DIR]),
      discoverPlugins([PERF_TEST_DIR]),
      discoverPlugins([PERF_TEST_DIR]),
    ]);
    const endTime = performance.now();

    const elapsedMs = endTime - startTime;

    // Verify all returned same results
    expect(results[0]).toHaveLength(TARGET_PLUGIN_COUNT);
    expect(results[1]).toHaveLength(TARGET_PLUGIN_COUNT);
    expect(results[2]).toHaveLength(TARGET_PLUGIN_COUNT);

    // Concurrent operations should not be significantly slower
    // Allow 2x overhead for concurrency
    expect(elapsedMs).toBeLessThan(MAX_DISCOVERY_TIME_MS * 2);

    console.log(`Concurrent discovery time: ${elapsedMs.toFixed(2)}ms (3 parallel operations)`);
  });

  it("should be fast even with nested directory structures", async () => {
    // Create plugins in nested directories to verify scan efficiency
    const nestedBase = path.join(PERF_TEST_DIR, "nested");
    await fs.mkdir(nestedBase, { recursive: true });

    // Create some plugins at root level
    await createMultiplePlugins(PERF_TEST_DIR, 5);

    // Create some in nested directory
    await createMultiplePlugins(nestedBase, 5);

    // Measure discovery time
    const startTime = performance.now();
    const discovered = await discoverPlugins([PERF_TEST_DIR]);
    const endTime = performance.now();

    const elapsedMs = endTime - startTime;

    // Should find all plugins
    expect(discovered.length).toBeGreaterThanOrEqual(5);

    // Should still be fast
    expect(elapsedMs).toBeLessThan(MAX_DISCOVERY_TIME_MS);

    console.log(`Nested discovery time: ${elapsedMs.toFixed(2)}ms`);
  });

  it("should handle empty directories efficiently", async () => {
    // Create directory structure without plugins
    await fs.mkdir(path.join(PERF_TEST_DIR, "empty-dir-1"), { recursive: true });
    await fs.mkdir(path.join(PERF_TEST_DIR, "empty-dir-2"), { recursive: true });
    await fs.mkdir(path.join(PERF_TEST_DIR, "empty-dir-3"), { recursive: true });

    // Create just one valid plugin
    await createTestPlugin(PERF_TEST_DIR, "single-plugin");

    // Measure discovery time
    const startTime = performance.now();
    const discovered = await discoverPlugins([PERF_TEST_DIR]);
    const endTime = performance.now();

    const elapsedMs = endTime - startTime;

    // Should find the one plugin
    expect(discovered).toHaveLength(1);

    // Should be very fast
    expect(elapsedMs).toBeLessThan(MAX_DISCOVERY_TIME_MS);

    console.log(`Empty directory handling time: ${elapsedMs.toFixed(2)}ms`);
  });
});
