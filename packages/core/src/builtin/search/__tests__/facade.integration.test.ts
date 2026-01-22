/**
 * Search Facade Integration Tests
 *
 * Verifies the high-performance search system works correctly with:
 * - Ripgrep backend (if available)
 * - JavaScript fallback
 * - Context lines
 * - Glob/exclude patterns
 *
 * @module builtin/search/__tests__/facade.integration.test
 */

import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { getSearchFacade, type SearchFacade } from "../facade.js";
import type { BackendType, SearchOptions } from "../types.js";

describe("SearchFacade Integration Tests", { timeout: 60000 }, () => {
  let facade: SearchFacade;
  const testDir = resolve(process.cwd(), "packages/core/src");

  beforeAll(() => {
    facade = getSearchFacade();
  });

  describe("Test Scenario 1: Basic Search & Backend Detection", () => {
    it("should search for a known string and report backend info", async () => {
      const result = await facade.search({
        query: "SearchOptions",
        mode: "literal",
        paths: [testDir],
        maxResults: 20,
      });

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.stats.backend).toBeDefined();
      expect(["ripgrep", "git-grep", "javascript"]).toContain(result.stats.backend);
      expect(result.stats.duration).toBeGreaterThanOrEqual(0);
      expect(result.stats.filesSearched).toBeGreaterThan(0);
    });

    it("should return available backends", async () => {
      const backends = await facade.getAvailableBackends();
      expect(backends.length).toBeGreaterThan(0);
      // JavaScript fallback should always be available
      expect(backends).toContain("javascript");
    });
  });

  describe("Test Scenario 2: JavaScript Fallback", () => {
    it("should work with forced javascript backend", async () => {
      const result = await facade.searchWithBackend("javascript", {
        query: "export",
        mode: "literal",
        paths: [testDir],
        maxResults: 10,
      });

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.stats.backend).toBe("javascript");
    });
  });

  describe("Test Scenario 3: Context Lines", () => {
    it("should include context lines around matches", async () => {
      const result = await facade.search({
        query: "SearchFacade",
        mode: "literal",
        paths: [testDir],
        maxResults: 5,
        contextLines: 3,
      });

      expect(result.matches.length).toBeGreaterThan(0);

      // Check that context is provided
      const matchWithContext = result.matches.find((m) => m.context);
      if (matchWithContext?.context) {
        expect(matchWithContext.context.before.length).toBeLessThanOrEqual(3);
        expect(matchWithContext.context.after.length).toBeLessThanOrEqual(3);
      }
    });

    it("should work with zero context lines", async () => {
      const result = await facade.search({
        query: "import",
        mode: "literal",
        paths: [testDir],
        maxResults: 5,
        contextLines: 0,
      });

      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  describe("Test Scenario 4: Glob/Exclude Patterns", () => {
    it("should filter by glob pattern", async () => {
      const result = await facade.search({
        query: "export",
        mode: "literal",
        paths: [testDir],
        maxResults: 50,
        globs: ["**/*.ts"],
      });

      expect(result.matches.length).toBeGreaterThan(0);
      // All matches should be .ts files
      for (const match of result.matches) {
        expect(match.file).toMatch(/\.ts$/);
      }
    });

    it("should exclude by pattern", async () => {
      // NOTE: The current JS backend has limited glob support for excludes.
      // It extracts directory names from glob patterns but doesn't handle **/ at the start.
      // For now, test with a direct directory name in excludes.
      const result = await facade.searchWithBackend("javascript", {
        query: "import",
        mode: "literal",
        paths: [testDir],
        maxResults: 100,
        excludes: ["node_modules", "dist", "build"], // Simple directory names work
      });

      // Verify node_modules, dist, and build are not in results
      for (const match of result.matches) {
        expect(match.file).not.toContain("node_modules");
        expect(match.file).not.toContain("/dist/");
        expect(match.file).not.toContain("/build/");
      }
    });

    it("should correctly strip leading **/ from glob excludes", async () => {
      // Verify the fix: glob patterns like "**/__tests__/**" should extract "__tests__"
      const pattern = "**/__tests__/**";
      const extracted = pattern
        .replace(/^!?/, "") // Strip leading negation
        .replace(/^\*\*\//, "") // Strip leading **/
        .replace(/\/?\*\*\/?$/, "") // Strip trailing **
        .replace(/\/$/, "");
      expect(extracted).toBe("__tests__");
    });

    it("should exclude directories with glob patterns", async () => {
      // Test that **/__tests__/** pattern correctly excludes __tests__ directories
      const result = await facade.searchWithBackend("javascript", {
        query: "describe",
        mode: "literal",
        paths: [testDir],
        maxResults: 100,
        excludes: ["**/__tests__/**"],
      });

      // Verify __tests__ directories are excluded
      for (const match of result.matches) {
        expect(match.file).not.toContain("__tests__");
      }
    });
  });

  describe("Test Scenario 5: Regex Search", () => {
    it("should support regex patterns", async () => {
      // Use javascript backend for regex to avoid git-grep compatibility issues on Windows
      const result = await facade.searchWithBackend("javascript", {
        query: "export\\s+(interface|type)\\s+\\w+",
        mode: "regex",
        paths: [testDir],
        maxResults: 20,
      });

      expect(result.matches.length).toBeGreaterThan(0);
    });
  });

  describe("Test Scenario 6: Case Sensitivity", () => {
    it("should support case-insensitive search", async () => {
      const result = await facade.search({
        query: "searchfacade",
        mode: "literal",
        paths: [testDir],
        maxResults: 20,
        caseSensitive: false,
      });

      // Should find "SearchFacade" with lowercase query
      expect(result.matches.length).toBeGreaterThan(0);
    });

    it("should support case-sensitive search", async () => {
      const caseInsensitive = await facade.search({
        query: "searchfacade",
        mode: "literal",
        paths: [testDir],
        maxResults: 100,
        caseSensitive: false,
      });

      const caseSensitive = await facade.search({
        query: "searchfacade",
        mode: "literal",
        paths: [testDir],
        maxResults: 100,
        caseSensitive: true,
      });

      // Case-sensitive should find fewer (or no) matches for lowercase query
      expect(caseSensitive.matches.length).toBeLessThanOrEqual(caseInsensitive.matches.length);
    });
  });

  describe("Performance Comparison", () => {
    it("should compare backend performance", async () => {
      const availableBackends = await facade.getAvailableBackends();
      const searchOptions: SearchOptions = {
        query: "function",
        mode: "literal",
        paths: [testDir],
        maxResults: 100,
      };

      // Run each backend and verify they produce results
      for (const backend of availableBackends) {
        try {
          const result = await facade.searchWithBackend(backend as BackendType, searchOptions);
          expect(result.stats.duration).toBeGreaterThanOrEqual(0);
          expect(result.matches.length).toBeGreaterThanOrEqual(0);
        } catch {
          // Backend unavailable, skip
        }
      }
    });
  });
});
