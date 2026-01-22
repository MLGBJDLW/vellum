/**
 * @module builtin/__tests__/list-dir.test
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/index.js";
import { listDirTool } from "../list-dir.js";

describe("listDirTool", () => {
  let testDir: string;
  let mockContext: ToolContext;

  beforeEach(async () => {
    // Create a unique test directory
    testDir = join(tmpdir(), `list-dir-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    mockContext = {
      workingDir: testDir,
      sessionId: "test-session",
      messageId: "test-message",
      callId: "test-call",
      abortSignal: new AbortController().signal,
      checkPermission: vi.fn().mockResolvedValue(true),
    };
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(listDirTool.definition.name).toBe("list_dir");
    });

    it("should have correct kind", () => {
      expect(listDirTool.definition.kind).toBe("read");
    });

    it("should have description", () => {
      expect(listDirTool.definition.description).toBeTruthy();
    });
  });

  describe("execute", () => {
    it("should list empty directory", async () => {
      const result = await listDirTool.execute(
        { path: ".", recursive: false, includeHidden: false, maxDepth: 3, format: "flat" },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.entries).toEqual([]);
        expect(result.output.fileCount).toBe(0);
        expect(result.output.dirCount).toBe(0);
      }
    });

    it("should list files and directories", async () => {
      // Create test files and directories
      await writeFile(join(testDir, "file1.txt"), "content1");
      await writeFile(join(testDir, "file2.ts"), "content2");
      await mkdir(join(testDir, "subdir"));

      const result = await listDirTool.execute(
        { path: ".", recursive: false, includeHidden: false, maxDepth: 3, format: "flat" },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.entries.length).toBe(3);
        expect(result.output.fileCount).toBe(2);
        expect(result.output.dirCount).toBe(1);
        // Directories should come first
        expect(result.output.entries[0]?.type).toBe("directory");
      }
    });

    it("should include hidden files when requested", async () => {
      await writeFile(join(testDir, ".hidden"), "hidden content");
      await writeFile(join(testDir, "visible.txt"), "visible content");

      const withoutHidden = await listDirTool.execute(
        { path: ".", recursive: false, includeHidden: false, maxDepth: 3, format: "flat" },
        mockContext
      );

      const withHidden = await listDirTool.execute(
        { path: ".", recursive: false, includeHidden: true, maxDepth: 3, format: "flat" },
        mockContext
      );

      expect(withoutHidden.success).toBe(true);
      expect(withHidden.success).toBe(true);

      if (withoutHidden.success && withHidden.success) {
        expect(withoutHidden.output.entries.length).toBe(1);
        expect(withHidden.output.entries.length).toBe(2);
      }
    });

    it("should recurse into subdirectories", async () => {
      await mkdir(join(testDir, "subdir"));
      await writeFile(join(testDir, "root.txt"), "root");
      await writeFile(join(testDir, "subdir", "nested.txt"), "nested");

      const nonRecursive = await listDirTool.execute(
        { path: ".", recursive: false, includeHidden: false, maxDepth: 3, format: "flat" },
        mockContext
      );

      const recursive = await listDirTool.execute(
        { path: ".", recursive: true, includeHidden: false, maxDepth: 3, format: "flat" },
        mockContext
      );

      expect(nonRecursive.success).toBe(true);
      expect(recursive.success).toBe(true);

      if (nonRecursive.success && recursive.success) {
        expect(nonRecursive.output.fileCount).toBe(1);
        expect(recursive.output.fileCount).toBe(2);
      }
    });

    it("should respect maxDepth", async () => {
      await mkdir(join(testDir, "level1", "level2", "level3"), { recursive: true });
      await writeFile(join(testDir, "level1", "level2", "level3", "deep.txt"), "deep");

      const shallow = await listDirTool.execute(
        { path: ".", recursive: true, includeHidden: false, maxDepth: 2, format: "flat" },
        mockContext
      );

      const deep = await listDirTool.execute(
        { path: ".", recursive: true, includeHidden: false, maxDepth: 5, format: "flat" },
        mockContext
      );

      expect(shallow.success).toBe(true);
      expect(deep.success).toBe(true);

      if (shallow.success && deep.success) {
        const shallowFiles = shallow.output.entries.filter((e) => e.type === "file");
        const deepFiles = deep.output.entries.filter((e) => e.type === "file");
        expect(shallowFiles.length).toBeLessThan(deepFiles.length);
      }
    });

    it("should fail for non-existent directory", async () => {
      const result = await listDirTool.execute(
        {
          path: "nonexistent",
          recursive: false,
          includeHidden: false,
          maxDepth: 3,
          format: "flat",
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should fail for file path", async () => {
      await writeFile(join(testDir, "file.txt"), "content");

      const result = await listDirTool.execute(
        { path: "file.txt", recursive: false, includeHidden: false, maxDepth: 3, format: "flat" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not a directory");
      }
    });

    it("should fail on path traversal", async () => {
      const result = await listDirTool.execute(
        { path: "../..", recursive: false, includeHidden: false, maxDepth: 3, format: "flat" },
        mockContext
      );

      expect(result.success).toBe(false);
    });

    it("should fail when aborted", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await listDirTool.execute(
        { path: ".", recursive: false, includeHidden: false, maxDepth: 3, format: "flat" },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });

    it("should filter entries with ignorePatterns", async () => {
      await writeFile(join(testDir, "app.ts"), "app");
      await writeFile(join(testDir, "app.log"), "log");
      await writeFile(join(testDir, "debug.log"), "log");
      await mkdir(join(testDir, "node_modules"));
      await writeFile(join(testDir, "node_modules", "pkg.js"), "pkg");

      const result = await listDirTool.execute(
        {
          path: ".",
          recursive: true,
          includeHidden: false,
          maxDepth: 3,
          format: "flat",
          ignorePatterns: ["*.log", "node_modules"],
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should only have app.ts (node_modules dir and *.log files filtered)
        expect(result.output.entries.length).toBe(1);
        expect(result.output.entries[0]?.name).toBe("app.ts");
      }
    });

    it("should generate tree output when format is tree", async () => {
      await mkdir(join(testDir, "src"));
      await writeFile(join(testDir, "src", "index.ts"), "index");
      await writeFile(join(testDir, "src", "utils.ts"), "utils");
      await writeFile(join(testDir, "README.md"), "readme");

      const result = await listDirTool.execute(
        { path: ".", recursive: true, includeHidden: false, maxDepth: 3, format: "tree" },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.tree).toBeDefined();
        expect(result.output.tree).toContain("src/");
        expect(result.output.tree).toContain("index.ts");
        expect(result.output.tree).toContain("utils.ts");
        expect(result.output.tree).toContain("README.md");
        // Check tree characters
        expect(result.output.tree).toMatch(/[├└]/);
      }
    });

    it("should not include tree when format is flat", async () => {
      await writeFile(join(testDir, "file.txt"), "content");

      const result = await listDirTool.execute(
        { path: ".", recursive: false, includeHidden: false, maxDepth: 3, format: "flat" },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.tree).toBeUndefined();
      }
    });

    it("should combine ignorePatterns with tree format", async () => {
      await mkdir(join(testDir, "src"));
      await writeFile(join(testDir, "src", "app.ts"), "app");
      await mkdir(join(testDir, "dist"));
      await writeFile(join(testDir, "dist", "app.js"), "compiled");

      const result = await listDirTool.execute(
        {
          path: ".",
          recursive: true,
          includeHidden: false,
          maxDepth: 3,
          format: "tree",
          ignorePatterns: ["dist"],
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.tree).toBeDefined();
        expect(result.output.tree).toContain("src/");
        expect(result.output.tree).not.toContain("dist");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should not require confirmation for read operations", () => {
      expect(
        listDirTool.shouldConfirm?.(
          { path: ".", recursive: false, includeHidden: false, maxDepth: 3, format: "flat" },
          mockContext
        )
      ).toBe(false);
    });
  });
});
