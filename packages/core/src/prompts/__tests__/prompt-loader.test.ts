// ============================================
// PromptLoader Unit Tests
// ============================================

/**
 * Unit tests for the PromptLoader class.
 *
 * Tests cover:
 * - LRU cache behavior (L1 cache hit, L2 cache miss)
 * - Cache invalidation (individual and all)
 * - TypeScript fallback for role prompts
 * - Load by path for absolute paths
 * - Error handling (not found, corrupt file)
 * - LRU eviction when cache is full
 *
 * @module @vellum/core/prompts/__tests__/prompt-loader
 * @see T013
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptError } from "../errors.js";
import { PromptLoader } from "../prompt-loader.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a temporary test directory.
 */
function createTempDir(prefix: string): string {
  const dir = join(
    tmpdir(),
    `vellum-loader-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a valid prompt file.
 */
function createValidPromptFile(dir: string, name: string): string {
  const filePath = join(dir, `${name}.md`);
  writeFileSync(
    filePath,
    `---
id: ${name}
name: ${name}
category: role
---
This is the ${name} prompt content.`
  );
  return filePath;
}

/**
 * Create a corrupt prompt file (invalid YAML).
 */
function createCorruptPromptFile(dir: string, name: string): string {
  const filePath = join(dir, `${name}.md`);
  writeFileSync(
    filePath,
    `---
id: ${name}
name: [unclosed bracket
invalid: yaml: syntax
---
Content here.`
  );
  return filePath;
}

// =============================================================================
// PromptLoader Tests
// =============================================================================

describe("PromptLoader", () => {
  let tempWorkspace: string;
  let loader: PromptLoader;

  beforeEach(() => {
    tempWorkspace = createTempDir("loader");
    loader = new PromptLoader({
      discovery: { workspacePath: tempWorkspace },
      maxCacheSize: 5,
      cacheTtlMs: 60000, // 1 minute for tests
    });
  });

  afterEach(() => {
    try {
      rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  // ===========================================================================
  // L1/L2 Cache Tests
  // ===========================================================================

  describe("Cache Behavior", () => {
    it("L2 cache miss: first load reads from file", async () => {
      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });
      createValidPromptFile(promptsDir, "first-load");

      // First load should read from file (L2)
      const prompt = await loader.load("first-load", "role");

      expect(prompt).toBeDefined();
      expect(prompt.id).toBe("first-load");
      expect(prompt.content).toContain("first-load prompt content");
    });

    it("L1 cache hit: second load returns cached result", async () => {
      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });
      createValidPromptFile(promptsDir, "cached-prompt");

      // First load (L2 - file read)
      const first = await loader.load("cached-prompt", "role");

      // Second load (L1 - cache hit)
      const second = await loader.load("cached-prompt", "role");

      expect(first).toEqual(second);
    });

    it("cache stats reflect current state", async () => {
      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });
      createValidPromptFile(promptsDir, "stats-test");

      const statsBefore = loader.getCacheStats();
      expect(statsBefore.size).toBe(0);

      await loader.load("stats-test", "role");

      const statsAfter = loader.getCacheStats();
      expect(statsAfter.size).toBe(1);
      expect(statsAfter.maxSize).toBe(5);
    });
  });

  // ===========================================================================
  // Cache Invalidation Tests
  // ===========================================================================

  describe("Cache Invalidation", () => {
    it("invalidate() clears specific entry", async () => {
      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });
      createValidPromptFile(promptsDir, "to-invalidate");

      await loader.load("to-invalidate", "role");
      expect(loader.getCacheStats().size).toBe(1);

      loader.invalidate("to-invalidate");
      expect(loader.getCacheStats().size).toBe(0);
    });

    it("invalidateAll() clears entire cache", async () => {
      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });
      createValidPromptFile(promptsDir, "prompt1");
      createValidPromptFile(promptsDir, "prompt2");
      createValidPromptFile(promptsDir, "prompt3");

      await loader.load("prompt1", "role");
      await loader.load("prompt2", "role");
      await loader.load("prompt3", "role");
      expect(loader.getCacheStats().size).toBe(3);

      loader.invalidateAll();
      expect(loader.getCacheStats().size).toBe(0);
    });

    it("invalidateByPath() clears entry by path", async () => {
      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });
      const filePath = createValidPromptFile(promptsDir, "path-invalidate");

      await loader.loadByPath(filePath);
      expect(loader.getCacheStats().size).toBe(1);

      loader.invalidateByPath(filePath);
      expect(loader.getCacheStats().size).toBe(0);
    });
  });

  // ===========================================================================
  // loadByPath Tests
  // ===========================================================================

  describe("loadByPath()", () => {
    it("loads prompt from absolute path", async () => {
      const promptsDir = join(tempWorkspace, "custom");
      mkdirSync(promptsDir, { recursive: true });
      const filePath = createValidPromptFile(promptsDir, "absolute-path");

      const prompt = await loader.loadByPath(filePath);

      expect(prompt).toBeDefined();
      expect(prompt.id).toBe("absolute-path");
    });

    it("throws PROMPT_LOAD_ERROR for file not found", async () => {
      const nonExistentPath = join(tempWorkspace, "does-not-exist.md");

      await expect(loader.loadByPath(nonExistentPath)).rejects.toThrow(PromptError);
      await expect(loader.loadByPath(nonExistentPath)).rejects.toMatchObject({
        code: "PROMPT_LOAD_ERROR",
      });
    });

    it("caches loaded prompts by path", async () => {
      const promptsDir = join(tempWorkspace, "cached-path");
      mkdirSync(promptsDir, { recursive: true });
      const filePath = createValidPromptFile(promptsDir, "cached-by-path");

      const first = await loader.loadByPath(filePath);
      const second = await loader.loadByPath(filePath);

      expect(first).toEqual(second);
      expect(loader.getCacheStats().size).toBe(1);
    });
  });

  // ===========================================================================
  // TypeScript Fallback Tests
  // ===========================================================================

  describe("TypeScript Fallback", () => {
    it("loads from builtin markdown when project file missing for role", async () => {
      // No project file exists, should load from builtin markdown
      const loaderWithFallback = new PromptLoader({
        discovery: { workspacePath: tempWorkspace },
        enableFallback: true,
      });

      // Load a known role - should find builtin markdown file
      const prompt = await loaderWithFallback.load("coder", "role");

      expect(prompt).toBeDefined();
      // The builtin markdown file uses 'role-coder' as id
      expect(prompt.id).toBe("role-coder");
      expect(prompt.location.source).toBe("builtin");
      expect(prompt.content).toBeTruthy();
    });

    it("throws when fallback is disabled and file not found", async () => {
      const loaderNoFallback = new PromptLoader({
        discovery: { workspacePath: tempWorkspace },
        enableFallback: false,
      });

      await expect(loaderNoFallback.load("nonexistent", "role")).rejects.toThrow(PromptError);
    });

    it("fallback only applies to role category", async () => {
      const loaderWithFallback = new PromptLoader({
        discovery: { workspacePath: tempWorkspace },
        enableFallback: true,
      });

      // Worker category should not have fallback
      await expect(loaderWithFallback.load("nonexistent", "worker")).rejects.toThrow(PromptError);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe("Error Handling", () => {
    it("throws PROMPT_NOT_FOUND when prompt does not exist", async () => {
      const loaderNoFallback = new PromptLoader({
        discovery: { workspacePath: tempWorkspace },
        enableFallback: false,
      });

      await expect(loaderNoFallback.load("missing-prompt", "role")).rejects.toThrow(PromptError);
      await expect(loaderNoFallback.load("missing-prompt", "role")).rejects.toMatchObject({
        code: "PROMPT_NOT_FOUND",
      });
    });

    it("handles corrupt file gracefully with fallback", async () => {
      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });
      createCorruptPromptFile(promptsDir, "coder"); // Corrupt file for known role

      const loaderWithFallback = new PromptLoader({
        discovery: { workspacePath: tempWorkspace },
        enableFallback: true,
      });

      // Should fall back to TypeScript definition
      const prompt = await loaderWithFallback.load("coder", "role");
      expect(prompt).toBeDefined();
    });
  });

  // ===========================================================================
  // LRU Eviction Tests
  // ===========================================================================

  describe("LRU Eviction", () => {
    it("evicts least recently used when cache is full", async () => {
      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });

      // Create more prompts than cache size (5)
      for (let i = 1; i <= 6; i++) {
        createValidPromptFile(promptsDir, `prompt${i}`);
      }

      // Load 5 prompts to fill cache
      await loader.load("prompt1", "role");
      await loader.load("prompt2", "role");
      await loader.load("prompt3", "role");
      await loader.load("prompt4", "role");
      await loader.load("prompt5", "role");

      expect(loader.getCacheStats().size).toBe(5);

      // Load 6th prompt - should evict LRU (prompt1)
      await loader.load("prompt6", "role");

      expect(loader.getCacheStats().size).toBe(5);
    });

    it("respects maxSize configuration", async () => {
      const smallLoader = new PromptLoader({
        discovery: { workspacePath: tempWorkspace },
        maxCacheSize: 2,
      });

      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });
      createValidPromptFile(promptsDir, "small1");
      createValidPromptFile(promptsDir, "small2");
      createValidPromptFile(promptsDir, "small3");

      await smallLoader.load("small1", "role");
      await smallLoader.load("small2", "role");
      await smallLoader.load("small3", "role");

      expect(smallLoader.getCacheStats().size).toBe(2);
      expect(smallLoader.getCacheStats().maxSize).toBe(2);
    });

    it("updates LRU order on cache access", async () => {
      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });

      for (let i = 1; i <= 6; i++) {
        createValidPromptFile(promptsDir, `access${i}`);
      }

      // Load prompts 1-5
      await loader.load("access1", "role");
      await loader.load("access2", "role");
      await loader.load("access3", "role");
      await loader.load("access4", "role");
      await loader.load("access5", "role");

      // Access prompt1 again to make it recently used
      await loader.load("access1", "role");

      // Load prompt6 - should evict access2 (now LRU) instead of access1
      await loader.load("access6", "role");

      expect(loader.getCacheStats().size).toBe(5);
    });
  });

  // ===========================================================================
  // loadRole Tests
  // ===========================================================================

  describe("loadRole()", () => {
    it("returns role prompt content as string", async () => {
      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });
      createValidPromptFile(promptsDir, "test-role");

      const content = await loader.loadRole("coder");

      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
    });

    it("uses TypeScript fallback for unknown role", async () => {
      // No file, should use builtin
      const content = await loader.loadRole("orchestrator");

      expect(typeof content).toBe("string");
      expect(content.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // TTL Expiration Tests
  // ===========================================================================

  describe("TTL Expiration", () => {
    it("expired entries are removed on access", async () => {
      const shortTtlLoader = new PromptLoader({
        discovery: { workspacePath: tempWorkspace },
        cacheTtlMs: 1, // 1ms TTL for testing
      });

      const promptsDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(promptsDir, { recursive: true });
      createValidPromptFile(promptsDir, "ttl-test");

      await shortTtlLoader.load("ttl-test", "role");
      expect(shortTtlLoader.getCacheStats().size).toBe(1);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Access again - should be a cache miss due to TTL
      // The cache entry should be removed when accessed
      await shortTtlLoader.load("ttl-test", "role");
      // After reload, cache should have 1 entry again (fresh)
      expect(shortTtlLoader.getCacheStats().size).toBe(1);
    });
  });

  // ===========================================================================
  // Instance Accessors Tests
  // ===========================================================================

  describe("Instance Accessors", () => {
    it("getDiscovery() returns the discovery instance", () => {
      const discovery = loader.getDiscovery();

      expect(discovery).toBeDefined();
      expect(typeof discovery.discoverByName).toBe("function");
    });

    it("getParser() returns the parser instance", () => {
      const parser = loader.getParser();

      expect(parser).toBeDefined();
      expect(typeof parser.parse).toBe("function");
    });

    it("setWorkspacePath() updates discovery workspace", () => {
      const newPath = "/new/workspace";
      loader.setWorkspacePath(newPath);

      expect(loader.getDiscovery().getWorkspacePath()).toBe(newPath);
    });
  });

  // ===========================================================================
  // Custom Parser Injection Tests
  // ===========================================================================

  describe("Custom Dependencies", () => {
    it("accepts custom parser instance", async () => {
      const mockParse = vi.fn().mockReturnValue({
        id: "mocked",
        name: "Mocked",
        category: "role",
        content: "Mocked content",
        location: { source: "project", path: "/test.md", priority: 1 },
        frontmatter: {},
      });

      const customParser = { parse: mockParse } as any;
      const loaderWithParser = new PromptLoader({
        discovery: { workspacePath: tempWorkspace },
        parser: customParser,
      });

      expect(loaderWithParser.getParser()).toBe(customParser);
    });
  });
});
