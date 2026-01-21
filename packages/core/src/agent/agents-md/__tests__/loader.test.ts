// ============================================
// AGENTS.md Loader Tests
// ============================================

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentsMdLoader, createAgentsMdLoader } from "../loader.js";

describe("AgentsMdLoader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-md-loader-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("scan", () => {
    it("should scan project and return results", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root instructions");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const result = await loader.scan();

      expect(result.files).toHaveLength(1);
      expect(result.tree.projectRoot).toBe(tempDir);
      expect(result.errors).toHaveLength(0);
      expect(result.scanTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle scan errors gracefully", async () => {
      // Use non-existent directory
      const loader = new AgentsMdLoader({ projectRoot: "/nonexistent/path/xyz" });
      const result = await loader.scan();

      expect(result.files).toHaveLength(0);
      expect(result.tree.files).toHaveLength(0);
    });

    it("should find nested AGENTS.md files", async () => {
      const srcDir = path.join(tempDir, "src");
      const componentsDir = path.join(srcDir, "components");
      await fs.mkdir(componentsDir, { recursive: true });

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root");
      await fs.writeFile(path.join(srcDir, "AGENTS.md"), "Src");
      await fs.writeFile(path.join(componentsDir, "AGENTS.md"), "Components");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const result = await loader.scan();

      expect(result.files).toHaveLength(3);
    });
  });

  describe("resolve", () => {
    it("should resolve scope for target file", async () => {
      const srcDir = path.join(tempDir, "src");
      await fs.mkdir(srcDir);

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root instructions");
      await fs.writeFile(path.join(srcDir, "AGENTS.md"), "Src instructions");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const scope = await loader.resolve(path.join(srcDir, "file.ts"));

      expect(scope.instructions).toContain("Root instructions");
      expect(scope.instructions).toContain("Src instructions");
      expect(scope.sources).toHaveLength(2);
    });

    it("should handle REPLACE marker", async () => {
      const srcDir = path.join(tempDir, "src");
      await fs.mkdir(srcDir);

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root instructions");
      await fs.writeFile(path.join(srcDir, "AGENTS.md"), "# REPLACE\nReplaced instructions");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const scope = await loader.resolve(path.join(srcDir, "file.ts"));

      expect(scope.instructions).toBe("Replaced instructions");
      expect(scope.instructions).not.toContain("Root");
    });

    it("should handle PREPEND marker", async () => {
      const srcDir = path.join(tempDir, "src");
      await fs.mkdir(srcDir);

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Second");
      await fs.writeFile(path.join(srcDir, "AGENTS.md"), "# PREPEND\nFirst");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const scope = await loader.resolve(path.join(srcDir, "file.ts"));

      expect(scope.instructions).toBe("First\n\nSecond");
    });
  });

  describe("getHierarchy", () => {
    it("should return tree structure", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const tree = await loader.getHierarchy();

      expect(tree.projectRoot).toBe(tempDir);
      expect(tree.root.path).toBe(tempDir);
      expect(tree.files).toHaveLength(1);
    });
  });

  describe("getInstructionsFor", () => {
    it("should return formatted instructions", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Instructions");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const instructions = await loader.getInstructionsFor(path.join(tempDir, "file.ts"));

      expect(instructions).toContain("AGENTS.md Sources:");
      expect(instructions).toContain("Instructions");
    });

    it("should return empty string when no files apply", async () => {
      // No AGENTS.md files
      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const instructions = await loader.getInstructionsFor(path.join(tempDir, "file.ts"));

      expect(instructions).toBe("");
    });
  });

  describe("caching", () => {
    it("should cache scan results", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Original");

      const loader = new AgentsMdLoader({ projectRoot: tempDir, cacheTtlMs: 10000 });

      // First scan
      const result1 = await loader.scan();
      expect(result1.files[0]?.instructions).toBe("Original");

      // Modify file
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Modified");

      // Second scan should use cache
      const result2 = await loader.getHierarchy();
      expect(result2.files[0]?.instructions).toBe("Original");
    });

    it("should invalidate cache", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Original");

      const loader = new AgentsMdLoader({ projectRoot: tempDir, cacheTtlMs: 10000 });

      // First scan
      await loader.scan();

      // Modify file
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Modified");

      // Invalidate and rescan
      loader.invalidate();
      const result = await loader.getHierarchy();

      expect(result.files[0]?.instructions).toBe("Modified");
    });

    it("should respect enableCache option", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Original");

      const loader = new AgentsMdLoader({ projectRoot: tempDir, enableCache: false });

      // First scan
      await loader.scan();

      // Modify file
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Modified");

      // Should get new content since caching is disabled
      const result = await loader.getHierarchy();
      expect(result.files[0]?.instructions).toBe("Modified");
    });
  });

  describe("hasScope", () => {
    it("should return true when files apply", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });

      expect(await loader.hasScope(path.join(tempDir, "file.ts"))).toBe(true);
    });

    it("should return false when no files apply", async () => {
      const loader = new AgentsMdLoader({ projectRoot: tempDir });

      expect(await loader.hasScope(path.join(tempDir, "file.ts"))).toBe(false);
    });
  });

  describe("getFiles", () => {
    it("should return all discovered files", async () => {
      const srcDir = path.join(tempDir, "src");
      await fs.mkdir(srcDir);

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root");
      await fs.writeFile(path.join(srcDir, "AGENTS.md"), "Src");

      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      const files = await loader.getFiles();

      expect(files).toHaveLength(2);
    });
  });

  describe("getProjectRoot", () => {
    it("should return project root", () => {
      const loader = new AgentsMdLoader({ projectRoot: tempDir });
      expect(loader.getProjectRoot()).toBe(tempDir);
    });
  });
});

describe("createAgentsMdLoader", () => {
  it("should create loader instance", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-md-factory-test-"));

    try {
      const loader = createAgentsMdLoader({ projectRoot: tempDir });
      expect(loader).toBeInstanceOf(AgentsMdLoader);
      expect(loader.getProjectRoot()).toBe(tempDir);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
