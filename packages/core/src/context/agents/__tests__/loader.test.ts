/**
 * Unit tests for AgentsLoader
 *
 * Tests the orchestrated loading of AGENTS.md files with caching support.
 *
 * @module context/agents/__tests__/loader
 * @see REQ-003: Cache with 5-second TTL
 * @see REQ-014: Single entry point for loading
 * @see REQ-029: Graceful error handling
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentsLoader } from "../loader.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a temporary directory structure for testing.
 */
async function createTempDir(): Promise<string> {
  const tempDir = path.join(
    os.tmpdir(),
    `vellum-loader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Create a file with optional content.
 */
async function createFile(filePath: string, content = ""): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Clean up a directory recursively.
 */
async function cleanupDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// AgentsLoader Tests
// =============================================================================

describe("AgentsLoader", () => {
  let tempDir: string;
  let loader: AgentsLoader;

  beforeEach(async () => {
    tempDir = await createTempDir();
    loader = new AgentsLoader();
  });

  afterEach(async () => {
    await cleanupDir(tempDir);
  });

  describe("constructor", () => {
    it("should create loader with default options", () => {
      const loader = new AgentsLoader();
      expect(loader.ttlMs).toBe(5000);
      expect(loader.isCacheEnabled).toBe(true);
    });

    it("should accept custom cache TTL", () => {
      const loader = new AgentsLoader({ cacheTtlMs: 10000 });
      expect(loader.ttlMs).toBe(10000);
    });

    it("should allow disabling cache", () => {
      const loader = new AgentsLoader({ enableCache: false });
      expect(loader.isCacheEnabled).toBe(false);
    });
  });

  describe("load()", () => {
    it("should return null config when no files found", async () => {
      // Create stop boundary to limit search
      await createFile(path.join(tempDir, "package.json"), "{}");

      const result = await loader.load(tempDir);

      expect(result.config).toBeNull();
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.message).toContain("No AGENTS.md files found");
      expect(result.fromCache).toBe(false);
    });

    it("should load single AGENTS.md file", async () => {
      // Create stop boundary and AGENTS.md
      await createFile(path.join(tempDir, "package.json"), "{}");
      await createFile(
        path.join(tempDir, "AGENTS.md"),
        `---
name: TestAgent
---
# Instructions
Follow these rules.
`
      );

      const result = await loader.load(tempDir);

      expect(result.config).not.toBeNull();
      expect(result.config?.name).toBe("TestAgent");
      expect(result.config?.instructions).toContain("Follow these rules");
      // At least one source (may find multiple patterns pointing to same file on case-insensitive FS)
      expect(result.config?.sources.length).toBeGreaterThanOrEqual(1);
      expect(result.fromCache).toBe(false);
    });

    it("should load and merge multiple AGENTS.md files in hierarchy", async () => {
      // Create directory structure:
      // tempDir/
      //   package.json (boundary)
      //   AGENTS.md (parent)
      //   src/
      //     AGENTS.md (child)
      await createFile(path.join(tempDir, "package.json"), "{}");
      await createFile(
        path.join(tempDir, "AGENTS.md"),
        `---
name: ParentAgent
---
# Instructions
Parent rules.
`
      );
      await createFile(
        path.join(tempDir, "src", "AGENTS.md"),
        `---
name: ChildAgent
---
# Instructions
Child rules.
`
      );

      const result = await loader.load(path.join(tempDir, "src"));

      expect(result.config).not.toBeNull();
      // Child should override parent name
      expect(result.config?.name).toBe("ChildAgent");
      // Instructions should be merged (parent + child)
      expect(result.config?.instructions).toContain("Parent rules");
      expect(result.config?.instructions).toContain("Child rules");
      // Multiple sources should be tracked (parent + child directories)
      expect(result.config?.sources.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle parse errors gracefully", async () => {
      // Create malformed AGENTS.md
      await createFile(path.join(tempDir, "package.json"), "{}");
      await createFile(
        path.join(tempDir, "AGENTS.md"),
        `---
name: "unclosed string
---
Some content
`
      );

      const result = await loader.load(tempDir);

      // Should still have warnings but not crash
      expect(result.errors.length).toBe(0); // Errors collected as warnings
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should default to process.cwd() when no path provided", async () => {
      // This test verifies the default parameter works
      const loader = new AgentsLoader({ enableCache: false });
      const result = await loader.load();

      // Should not throw, may or may not find files in cwd
      expect(result).toBeDefined();
      expect(typeof result.fromCache).toBe("boolean");
    });
  });

  describe("caching", () => {
    it("should cache results and return from cache on second call", async () => {
      await createFile(path.join(tempDir, "package.json"), "{}");
      await createFile(
        path.join(tempDir, "AGENTS.md"),
        `---
name: CachedAgent
---
# Instructions
Cached content.
`
      );

      // First load
      const result1 = await loader.load(tempDir);
      expect(result1.fromCache).toBe(false);

      // Second load (should be cached)
      const result2 = await loader.load(tempDir);
      expect(result2.fromCache).toBe(true);
      expect(result2.config?.name).toBe("CachedAgent");
    });

    it("should invalidate cache for specific path", async () => {
      await createFile(path.join(tempDir, "package.json"), "{}");
      await createFile(
        path.join(tempDir, "AGENTS.md"),
        `---
name: Agent1
---
Content
`
      );

      // Load to populate cache
      await loader.load(tempDir);

      // Invalidate
      loader.invalidateCache(tempDir);

      // Load again - should not be from cache
      const result = await loader.load(tempDir);
      expect(result.fromCache).toBe(false);
    });

    it("should invalidate all cache when no path provided", async () => {
      await createFile(path.join(tempDir, "package.json"), "{}");
      await createFile(path.join(tempDir, "AGENTS.md"), "# Content");

      // Load to populate cache
      await loader.load(tempDir);

      // Invalidate all
      loader.invalidateCache();

      // Load again - should not be from cache
      const result = await loader.load(tempDir);
      expect(result.fromCache).toBe(false);
    });

    it("should expire cache after TTL", async () => {
      vi.useFakeTimers();

      try {
        const shortTtlLoader = new AgentsLoader({ cacheTtlMs: 1000 });

        await createFile(path.join(tempDir, "package.json"), "{}");
        await createFile(path.join(tempDir, "AGENTS.md"), "# Content");

        // First load
        const result1 = await shortTtlLoader.load(tempDir);
        expect(result1.fromCache).toBe(false);

        // Second load within TTL
        vi.advanceTimersByTime(500);
        const result2 = await shortTtlLoader.load(tempDir);
        expect(result2.fromCache).toBe(true);

        // Third load after TTL expires
        vi.advanceTimersByTime(600); // Total 1100ms
        const result3 = await shortTtlLoader.load(tempDir);
        expect(result3.fromCache).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("should not cache when caching is disabled", async () => {
      const noCacheLoader = new AgentsLoader({ enableCache: false });

      await createFile(path.join(tempDir, "package.json"), "{}");
      await createFile(path.join(tempDir, "AGENTS.md"), "# Content");

      // First load
      const result1 = await noCacheLoader.load(tempDir);
      expect(result1.fromCache).toBe(false);

      // Second load - still not from cache
      const result2 = await noCacheLoader.load(tempDir);
      expect(result2.fromCache).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should handle non-existent directory gracefully", async () => {
      const nonExistentPath = path.join(tempDir, "does-not-exist", "deeply", "nested");

      const result = await loader.load(nonExistentPath);

      // Should return null config with info warning
      expect(result.config).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("should continue loading when one file fails to parse", async () => {
      await createFile(path.join(tempDir, "package.json"), "{}");
      // Valid file in parent
      await createFile(
        path.join(tempDir, "AGENTS.md"),
        `---
name: ValidParent
---
Valid content.
`
      );
      // Invalid file in child
      await createFile(
        path.join(tempDir, "src", "AGENTS.md"),
        `---
name: [invalid yaml
---
Some content
`
      );

      const result = await loader.load(path.join(tempDir, "src"));

      // Should have loaded the parent successfully
      expect(result.config).not.toBeNull();
      expect(result.config?.sources.length).toBeGreaterThanOrEqual(1);
      // Should have warnings about the invalid file
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("merge options", () => {
    it("should pass merge options through to merge function", async () => {
      await createFile(path.join(tempDir, "package.json"), "{}");
      await createFile(path.join(tempDir, "AGENTS.md"), "# Instructions\nGeneral rules.");
      await createFile(
        path.join(tempDir, "src", "AGENTS.md"),
        "# Instructions\nSpecific rules for src."
      );

      // Load with currentFile option
      const loaderWithMergeOpts = new AgentsLoader({
        mergeOptions: { currentFile: "src/utils/helper.ts" },
      });

      const result = await loaderWithMergeOpts.load(path.join(tempDir, "src"));

      expect(result.config).not.toBeNull();
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("AgentsLoader Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupDir(tempDir);
  });

  it("should handle complete project structure", async () => {
    // Create a realistic project structure:
    // project/
    //   package.json
    //   AGENTS.md (project-level)
    //   .cursorrules (legacy format)
    //   src/
    //     AGENTS.md (src-level)
    //     components/
    //       AGENTS.md (component-level)
    await createFile(path.join(tempDir, "package.json"), "{}");
    await createFile(
      path.join(tempDir, "AGENTS.md"),
      `---
name: ProjectAgent
allowed-tools:
  - "@readonly"
---
# Instructions
Follow project guidelines.
`
    );
    await createFile(path.join(tempDir, ".cursorrules"), "Legacy cursor rules.");
    await createFile(
      path.join(tempDir, "src", "AGENTS.md"),
      `---
name: SourceAgent
---
# Instructions
Source-specific rules.
`
    );
    await createFile(
      path.join(tempDir, "src", "components", "AGENTS.md"),
      `---
name: ComponentAgent
---
# Instructions
Component rules.
`
    );

    const loader = new AgentsLoader();
    const result = await loader.load(path.join(tempDir, "src", "components"));

    expect(result.config).not.toBeNull();
    // Most specific name wins
    expect(result.config?.name).toBe("ComponentAgent");
    // All instructions should be merged
    expect(result.config?.instructions).toContain("project guidelines");
    expect(result.config?.instructions).toContain("Source-specific");
    expect(result.config?.instructions).toContain("Component rules");
  });

  it("should support allowed-tools parsing and merging", async () => {
    await createFile(path.join(tempDir, "package.json"), "{}");
    await createFile(
      path.join(tempDir, "AGENTS.md"),
      `---
allowed-tools:
  - "@readonly"
  - "Bash(npm run *)"
---
# Instructions
Project rules.
`
    );
    await createFile(
      path.join(tempDir, "src", "AGENTS.md"),
      `---
allowed-tools:
  - "!Bash"
---
# Instructions
Source rules.
`
    );

    const loader = new AgentsLoader();
    const result = await loader.load(path.join(tempDir, "src"));

    expect(result.config).not.toBeNull();
    // Should have tools from both levels (default append strategy)
    expect(result.config?.allowedTools.length).toBeGreaterThanOrEqual(2);
  });
});
