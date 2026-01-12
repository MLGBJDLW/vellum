// ============================================
// PromptDiscovery Unit Tests
// ============================================

/**
 * Unit tests for the PromptDiscovery class.
 *
 * Tests cover:
 * - Multi-source discovery with priority ordering
 * - Deduplication by name (highest priority wins)
 * - Category filtering
 * - Missing directory handling
 * - Deprecation warnings for legacy paths
 *
 * @module @vellum/core/prompts/__tests__/prompt-discovery
 * @see T012
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROMPT_SOURCE_PRIORITY, PromptDiscovery } from "../prompt-discovery.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a temporary test directory structure.
 */
function createTempDir(prefix: string): string {
  const dir = join(
    tmpdir(),
    `vellum-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a mock prompt file.
 */
function createPromptFile(dir: string, category: string, name: string, content?: string): void {
  const categoryDir = join(dir, category);
  mkdirSync(categoryDir, { recursive: true });
  writeFileSync(
    join(categoryDir, `${name}.md`),
    content ??
      `---
id: ${name}
name: ${name}
category: ${category.replace("s", "").replace("role", "role")}
---
Test content for ${name}.`
  );
}

// =============================================================================
// Basic Discovery Tests
// =============================================================================

describe("PromptDiscovery", () => {
  let tempWorkspace: string;
  let discovery: PromptDiscovery;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempWorkspace = createTempDir("discovery");
    discovery = new PromptDiscovery({
      workspacePath: tempWorkspace,
      emitDeprecationWarnings: false,
    });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    try {
      rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Priority Constants Tests
  // ===========================================================================

  describe("PROMPT_SOURCE_PRIORITY", () => {
    it("has correct priority for project source (highest)", () => {
      expect(PROMPT_SOURCE_PRIORITY.project).toBe(1);
    });

    it("has correct priority for user source", () => {
      expect(PROMPT_SOURCE_PRIORITY.user).toBe(2);
    });

    it("has correct priority for github source", () => {
      expect(PROMPT_SOURCE_PRIORITY.github).toBe(3);
    });

    it("has correct priority for legacy claude source", () => {
      expect(PROMPT_SOURCE_PRIORITY.claude).toBe(4);
    });

    it("has correct priority for builtin source (lowest)", () => {
      expect(PROMPT_SOURCE_PRIORITY.builtin).toBe(99);
    });

    it("project priority is higher than builtin", () => {
      expect(PROMPT_SOURCE_PRIORITY.project).toBeLessThan(PROMPT_SOURCE_PRIORITY.builtin ?? 99);
    });
  });

  // ===========================================================================
  // discoverByName Tests
  // ===========================================================================

  describe("discoverByName()", () => {
    it("discovers prompt from .vellum/prompts/ (priority 1)", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "roles", "coder");

      const result = await discovery.discoverByName("coder");

      expect(result).not.toBeNull();
      expect(result?.path).toContain(".vellum");
      expect(result?.path).toContain("coder.md");
    });

    it("returns null for non-existent prompt", async () => {
      const result = await discovery.discoverByName("non-existent");

      expect(result).toBeNull();
    });

    it("returns highest priority match when prompt exists in multiple sources", async () => {
      // Create in .vellum/prompts (priority 1)
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "roles", "shared-prompt");

      // Create in .github/prompts (priority 3)
      const githubDir = join(tempWorkspace, ".github", "prompts");
      createPromptFile(githubDir, "roles", "shared-prompt");

      const result = await discovery.discoverByName("shared-prompt");

      expect(result).not.toBeNull();
      expect(result?.priority).toBe(1);
      expect(result?.path).toContain(".vellum");
    });

    it("finds prompts in different category subdirectories", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "workers", "qa-worker");

      const result = await discovery.discoverByName("qa-worker");

      expect(result).not.toBeNull();
      expect(result?.path).toContain("workers");
    });
  });

  // ===========================================================================
  // discoverByCategory Tests
  // ===========================================================================

  describe("discoverByCategory()", () => {
    it("discovers only prompts from specified category", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "roles", "coder");
      createPromptFile(vellumDir, "roles", "qa");
      createPromptFile(vellumDir, "workers", "analyst");

      const rolePrompts = await discovery.discoverByCategory("role");

      // Filter to only project prompts (not builtin)
      const projectPrompts = rolePrompts.filter((p) => p.source === "project");
      expect(projectPrompts.length).toBe(2);
      expect(rolePrompts.every((p) => p.path.includes("roles"))).toBe(true);
    });

    it("returns builtin prompts when category directory does not exist in project", async () => {
      const rolePrompts = await discovery.discoverByCategory("role");

      // Should find builtin role prompts even without project prompts
      const builtinPrompts = rolePrompts.filter((p) => p.source === "builtin");
      expect(builtinPrompts.length).toBeGreaterThan(0);
      // All should have builtin priority (99)
      expect(builtinPrompts.every((p) => p.priority === 99)).toBe(true);
    });

    it("applies priority-based deduplication within category", async () => {
      // Create same prompt in multiple sources
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "roles", "coder");

      const githubDir = join(tempWorkspace, ".github", "prompts");
      createPromptFile(githubDir, "roles", "coder");

      const rolePrompts = await discovery.discoverByCategory("role");

      // Should only have one coder prompt (deduplicated)
      const coderPrompts = rolePrompts.filter((p) => p.path.includes("coder"));
      expect(coderPrompts.length).toBe(1);
      expect(coderPrompts[0]?.path).toContain(".vellum");
    });
  });

  // ===========================================================================
  // discoverAll Tests
  // ===========================================================================

  describe("discoverAll()", () => {
    it("discovers prompts from multiple categories", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "roles", "coder");
      createPromptFile(vellumDir, "workers", "analyst");
      createPromptFile(vellumDir, "spec", "research");

      const allPrompts = await discovery.discoverAll();

      expect(allPrompts.length).toBeGreaterThanOrEqual(3);
    });

    it("deduplicates by name across all sources", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "roles", "duplicate");

      const githubDir = join(tempWorkspace, ".github", "prompts");
      createPromptFile(githubDir, "roles", "duplicate");

      const allPrompts = await discovery.discoverAll();

      const duplicates = allPrompts.filter((p) => p.path.includes("duplicate"));
      expect(duplicates.length).toBe(1);
      expect(duplicates[0]?.priority).toBe(1); // .vellum has priority 1
    });

    it("returns empty array when no prompts exist", async () => {
      const allPrompts = await discovery.discoverAll();

      // May include builtin prompts, but no project prompts
      const projectPrompts = allPrompts.filter((p) => p.source === "project");
      expect(projectPrompts.length).toBe(0);
    });
  });

  // ===========================================================================
  // Missing Directory Handling Tests
  // ===========================================================================

  describe("Missing Directory Handling", () => {
    it("handles missing .vellum/prompts/ gracefully", async () => {
      // Workspace exists but no .vellum directory
      const result = await discovery.discoverByName("test");

      expect(result).toBeNull();
    });

    it("handles missing category subdirectory gracefully and returns builtins", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      mkdirSync(vellumDir, { recursive: true });
      // No roles/ subdirectory in project

      const result = await discovery.discoverByCategory("role");

      // Should still find builtin prompts
      const projectPrompts = result.filter((p) => p.source === "project");
      expect(projectPrompts).toEqual([]);

      // Builtin prompts should exist
      const builtinPrompts = result.filter((p) => p.source === "builtin");
      expect(builtinPrompts.length).toBeGreaterThan(0);
    });

    it("handles undefined workspace path gracefully", async () => {
      const discoveryNoWorkspace = new PromptDiscovery();

      const result = await discoveryNoWorkspace.discoverByName("test");

      // Should not throw, may return builtin match or null
      expect(() => result).not.toThrow();
    });
  });

  // ===========================================================================
  // Deprecation Warning Tests
  // ===========================================================================

  describe("Deprecation Warnings", () => {
    it("emits deprecation warning for .claude/ path", async () => {
      const discoveryWithWarnings = new PromptDiscovery({
        workspacePath: tempWorkspace,
        emitDeprecationWarnings: true,
      });

      // Create prompt in deprecated .claude/prompts/ location
      const claudeDir = join(tempWorkspace, ".claude", "prompts");
      createPromptFile(claudeDir, "roles", "old-prompt");

      await discoveryWithWarnings.discoverByName("old-prompt");

      expect(consoleErrorSpy).toHaveBeenCalled();
      const calls = consoleErrorSpy.mock.calls.flat().join(" ");
      expect(calls).toContain("[DEPRECATED]");
      expect(calls).toContain("migrate");
    });

    it("does not emit warning when emitDeprecationWarnings is false", async () => {
      // Create prompt in deprecated location
      const claudeDir = join(tempWorkspace, ".claude", "prompts");
      createPromptFile(claudeDir, "roles", "old-prompt");

      await discovery.discoverByName("old-prompt");

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("emits deprecation warning only once per source", async () => {
      const discoveryWithWarnings = new PromptDiscovery({
        workspacePath: tempWorkspace,
        emitDeprecationWarnings: true,
      });

      const claudeDir = join(tempWorkspace, ".claude", "prompts");
      createPromptFile(claudeDir, "roles", "prompt1");
      createPromptFile(claudeDir, "roles", "prompt2");

      await discoveryWithWarnings.discoverByName("prompt1");
      await discoveryWithWarnings.discoverByName("prompt2");

      // Should only warn once
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Priority Ordering Tests
  // ===========================================================================

  describe("Priority Ordering", () => {
    it(".vellum/ overrides .github/", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "roles", "priority-test");

      const githubDir = join(tempWorkspace, ".github", "prompts");
      createPromptFile(githubDir, "roles", "priority-test");

      const result = await discovery.discoverByName("priority-test");

      expect(result).not.toBeNull();
      expect(result?.path).toContain(".vellum");
      expect(result?.priority).toBe(1);
    });

    it("sources are searched in correct priority order", async () => {
      // Only .github prompt exists (priority 3)
      const githubDir = join(tempWorkspace, ".github", "prompts");
      createPromptFile(githubDir, "roles", "github-only");

      const result = await discovery.discoverByName("github-only");

      expect(result).not.toBeNull();
      expect(result?.priority).toBe(3);
    });
  });

  // ===========================================================================
  // Workspace Path Management Tests
  // ===========================================================================

  describe("Workspace Path Management", () => {
    it("setWorkspacePath updates the workspace", async () => {
      const newWorkspace = createTempDir("new-workspace");
      const vellumDir = join(newWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "roles", "new-prompt");

      discovery.setWorkspacePath(newWorkspace);
      const result = await discovery.discoverByName("new-prompt");

      expect(result).not.toBeNull();

      // Cleanup
      rmSync(newWorkspace, { recursive: true, force: true });
    });

    it("getWorkspacePath returns current workspace", () => {
      expect(discovery.getWorkspacePath()).toBe(tempWorkspace);
    });

    it("getBuiltinPath returns builtin prompts directory", () => {
      const builtinPath = discovery.getBuiltinPath();

      expect(builtinPath).toBeDefined();
      expect(typeof builtinPath).toBe("string");
      expect(builtinPath.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // File Extension Filtering Tests
  // ===========================================================================

  describe("File Extension Filtering", () => {
    it("only discovers .md files", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(vellumDir, { recursive: true });
      writeFileSync(join(vellumDir, "valid.md"), "---\nid: valid\n---\nContent");
      writeFileSync(join(vellumDir, "invalid.txt"), "Not a prompt");
      writeFileSync(join(vellumDir, "invalid.json"), "{}");

      const result = await discovery.discoverByCategory("role");

      // Filter to project prompts only (exclude builtins)
      const projectPrompts = result.filter((p) => p.source === "project");
      expect(projectPrompts.length).toBe(1);
      expect(projectPrompts[0]?.path).toContain("valid.md");

      // All results should be .md files
      expect(result.every((p) => p.path.endsWith(".md"))).toBe(true);
    });

    it("ignores hidden files (starting with dot)", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts", "roles");
      mkdirSync(vellumDir, { recursive: true });
      writeFileSync(join(vellumDir, ".hidden.md"), "---\nid: hidden\n---\nContent");
      writeFileSync(join(vellumDir, "visible.md"), "---\nid: visible\n---\nContent");

      const result = await discovery.discoverByCategory("role");

      // Filter to project prompts only (exclude builtins)
      const projectPrompts = result.filter((p) => p.source === "project");
      expect(projectPrompts.length).toBe(1);
      expect(projectPrompts[0]?.path).toContain("visible.md");

      // No hidden files in any results
      const filenames = result.map((p) => p.path.split(/[\\/]/).pop());
      expect(filenames.every((f) => !f?.startsWith("."))).toBe(true);
    });
  });

  // ===========================================================================
  // PromptLocation Structure Tests
  // ===========================================================================

  describe("PromptLocation Structure", () => {
    it("returns correct source type for project prompts", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "roles", "test-source");

      const result = await discovery.discoverByName("test-source");

      expect(result).not.toBeNull();
      expect(result?.source).toBe("project");
    });

    it("returns absolute path in location", async () => {
      const vellumDir = join(tempWorkspace, ".vellum", "prompts");
      createPromptFile(vellumDir, "roles", "test-path");

      const result = await discovery.discoverByName("test-path");

      expect(result).not.toBeNull();
      expect(result?.path).toMatch(/^[A-Za-z]:|^\//); // Windows or Unix absolute path
    });
  });
});
