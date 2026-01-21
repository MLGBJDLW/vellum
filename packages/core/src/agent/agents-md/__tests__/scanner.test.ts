// ============================================
// AGENTS.md Scanner Tests
// ============================================

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AgentsMdScanner,
  DEFAULT_EXCLUDE_DIRS,
  DEFAULT_PATTERNS,
  detectMergeMarker,
} from "../scanner.js";

describe("detectMergeMarker", () => {
  it("should detect REPLACE marker", () => {
    const content = "# REPLACE\nThese instructions replace all parent instructions.";
    const result = detectMergeMarker(content);

    expect(result.marker).toBe("REPLACE");
    expect(result.instructions).toBe("These instructions replace all parent instructions.");
  });

  it("should detect PREPEND marker", () => {
    const content = "# PREPEND\nThese instructions come first.";
    const result = detectMergeMarker(content);

    expect(result.marker).toBe("PREPEND");
    expect(result.instructions).toBe("These instructions come first.");
  });

  it("should detect APPEND marker", () => {
    const content = "# APPEND\nThese instructions come last.";
    const result = detectMergeMarker(content);

    expect(result.marker).toBe("APPEND");
    expect(result.instructions).toBe("These instructions come last.");
  });

  it("should default to APPEND when no marker", () => {
    const content = "Regular instructions without a marker.";
    const result = detectMergeMarker(content);

    expect(result.marker).toBe("APPEND");
    expect(result.instructions).toBe("Regular instructions without a marker.");
  });

  it("should handle marker with extra whitespace", () => {
    const content = "#   REPLACE   \nInstructions here.";
    const result = detectMergeMarker(content);

    // The regex matches REPLACE with flexible whitespace
    expect(result.marker).toBe("REPLACE");
  });

  it("should handle marker in middle of file", () => {
    const content = "Some content\n# REPLACE\nMore content";
    const result = detectMergeMarker(content);

    expect(result.marker).toBe("REPLACE");
    expect(result.instructions).toBe("Some content\n\nMore content");
  });

  it("should trim resulting instructions", () => {
    const content = "# APPEND\n\n  Instructions with whitespace  \n\n";
    const result = detectMergeMarker(content);

    expect(result.instructions).toBe("Instructions with whitespace");
  });
});

describe("AgentsMdScanner", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-md-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("scan", () => {
    it("should find AGENTS.md at project root", async () => {
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root instructions");

      const scanner = new AgentsMdScanner(tempDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]?.scope).toBe(tempDir);
      expect(files[0]?.instructions).toBe("Root instructions");
      expect(files[0]?.priority).toBe(0);
    });

    it("should find AGENTS.md in subdirectories", async () => {
      // Create directory structure
      const srcDir = path.join(tempDir, "src");
      const utilsDir = path.join(srcDir, "utils");
      await fs.mkdir(utilsDir, { recursive: true });

      // Create AGENTS.md files
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root");
      await fs.writeFile(path.join(srcDir, "AGENTS.md"), "Src");
      await fs.writeFile(path.join(utilsDir, "AGENTS.md"), "Utils");

      const scanner = new AgentsMdScanner(tempDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(3);
      // Should be sorted by priority (depth) - root first
      expect(files[0]?.scope).toBe(tempDir);
      expect(files[1]?.scope).toBe(srcDir);
      expect(files[2]?.scope).toBe(utilsDir);
    });

    it("should respect excludeDirs option", async () => {
      const nodeModulesDir = path.join(tempDir, "node_modules", "pkg");
      await fs.mkdir(nodeModulesDir, { recursive: true });

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root");
      await fs.writeFile(path.join(nodeModulesDir, "AGENTS.md"), "Should be excluded");

      const scanner = new AgentsMdScanner(tempDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]?.scope).toBe(tempDir);
    });

    it("should respect maxDepth option", async () => {
      // Create deeply nested structure
      const deep1 = path.join(tempDir, "a");
      const deep2 = path.join(deep1, "b");
      const deep3 = path.join(deep2, "c");
      await fs.mkdir(deep3, { recursive: true });

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root");
      await fs.writeFile(path.join(deep1, "AGENTS.md"), "Depth 1");
      await fs.writeFile(path.join(deep2, "AGENTS.md"), "Depth 2");
      await fs.writeFile(path.join(deep3, "AGENTS.md"), "Depth 3");

      const scanner = new AgentsMdScanner(tempDir, { maxDepth: 2 });
      const files = await scanner.scan();

      expect(files).toHaveLength(3); // Root + depth 1 + depth 2
    });

    it("should detect merge markers in files", async () => {
      const srcDir = path.join(tempDir, "src");
      await fs.mkdir(srcDir);

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root instructions");
      await fs.writeFile(path.join(srcDir, "AGENTS.md"), "# REPLACE\nSrc instructions");

      const scanner = new AgentsMdScanner(tempDir);
      const files = await scanner.scan();

      expect(files[0]?.mergeMarker).toBe("APPEND");
      expect(files[1]?.mergeMarker).toBe("REPLACE");
    });

    it("should find first matching pattern in same directory", async () => {
      // Note: Both patterns exist, first one found wins (AGENTS.md is checked first)
      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Uppercase");

      const scanner = new AgentsMdScanner(tempDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(1);
      expect(files[0]?.path).toContain("AGENTS.md");
    });

    it("should handle empty project (no AGENTS.md files)", async () => {
      const scanner = new AgentsMdScanner(tempDir);
      const files = await scanner.scan();

      expect(files).toHaveLength(0);
    });
  });

  describe("buildTree", () => {
    it("should build tree from files", async () => {
      const srcDir = path.join(tempDir, "src");
      const utilsDir = path.join(srcDir, "utils");
      await fs.mkdir(utilsDir, { recursive: true });

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root");
      await fs.writeFile(path.join(srcDir, "AGENTS.md"), "Src");
      await fs.writeFile(path.join(utilsDir, "AGENTS.md"), "Utils");

      const scanner = new AgentsMdScanner(tempDir);
      const files = await scanner.scan();
      const tree = scanner.buildTree(files);

      expect(tree.projectRoot).toBe(tempDir);
      expect(tree.files).toHaveLength(3);
      expect(tree.root.file).not.toBeNull();
      expect(tree.root.file?.instructions).toBe("Root");
    });

    it("should handle missing intermediate directories", async () => {
      const deepDir = path.join(tempDir, "a", "b", "c");
      await fs.mkdir(deepDir, { recursive: true });

      await fs.writeFile(path.join(tempDir, "AGENTS.md"), "Root");
      // Skip a and b directories - only have file in c
      await fs.writeFile(path.join(deepDir, "AGENTS.md"), "Deep");

      const scanner = new AgentsMdScanner(tempDir);
      const files = await scanner.scan();
      const tree = scanner.buildTree(files);

      expect(tree.files).toHaveLength(2);
    });
  });
});

describe("DEFAULT_PATTERNS", () => {
  it("should include standard patterns", () => {
    expect(DEFAULT_PATTERNS).toContain("AGENTS.md");
    expect(DEFAULT_PATTERNS).toContain("agents.md");
    expect(DEFAULT_PATTERNS).toContain(".agents.md");
  });
});

describe("DEFAULT_EXCLUDE_DIRS", () => {
  it("should include common excluded directories", () => {
    expect(DEFAULT_EXCLUDE_DIRS).toContain("node_modules");
    expect(DEFAULT_EXCLUDE_DIRS).toContain(".git");
    expect(DEFAULT_EXCLUDE_DIRS).toContain("dist");
    expect(DEFAULT_EXCLUDE_DIRS).toContain("build");
  });
});
