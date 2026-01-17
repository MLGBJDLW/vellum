/**
 * Tests for new batch/parallel tools:
 * - glob
 * - read_many_files
 * - batch
 * - multi_edit
 * - insert_at_line
 *
 * @module builtin/__tests__/new-tools
 */

import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolRegistry } from "../../tool/registry.js";
import type { ToolContext } from "../../types/tool.js";
import { batchTool, setBatchToolRegistry } from "../batch.js";
import { globTool } from "../glob.js";
import { insertAtLineTool } from "../insert-at-line.js";
import { multiEditTool } from "../multi-edit.js";
import { readManyFilesTool } from "../read-many-files.js";

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
}));

// Mock path-security module
vi.mock("../utils/path-security.js", () => ({
  validatePath: vi.fn((filePath: string, workingDir: string) => {
    if (filePath.includes("..")) {
      return { valid: false, error: "Path traversal not allowed" };
    }
    // Handle absolute paths
    if (filePath.startsWith("/")) {
      return { valid: true, sanitizedPath: filePath };
    }
    return { valid: true, sanitizedPath: `${workingDir}/${filePath}` };
  }),
}));

// Create mock context factory
function createMockContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDir: "/test/workspace",
    sessionId: "test-session",
    messageId: "test-message",
    callId: "test-call",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ==============================================================
// GLOB TOOL TESTS
// ==============================================================
describe("globTool", () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(globTool.definition.name).toBe("glob");
    });

    it("should have correct kind", () => {
      expect(globTool.definition.kind).toBe("read");
    });

    it("should have description", () => {
      expect(globTool.definition.description).toBeTruthy();
      expect(globTool.definition.description).toContain("glob");
    });
  });

  describe("execute", () => {
    it("should match .ts files with pattern", async () => {
      // Mock readdir to return directory entries
      const mockEntries = [
        { name: "index.ts", isDirectory: () => false, isFile: () => true },
        { name: "utils.ts", isDirectory: () => false, isFile: () => true },
        { name: "types.ts", isDirectory: () => false, isFile: () => true },
        { name: "readme.md", isDirectory: () => false, isFile: () => true },
      ];
      vi.mocked(fs.readdir).mockResolvedValue(
        mockEntries as unknown as Awaited<ReturnType<typeof fs.readdir>>
      );
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);

      const result = await globTool.execute(
        { patterns: ["**/*.ts"], dot: false, maxFiles: 1000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.files).toContain("index.ts");
        expect(result.output.files).toContain("utils.ts");
        expect(result.output.files).not.toContain("readme.md");
        expect(result.output.count).toBe(3);
      }
    });

    it("should respect maxFiles limit", async () => {
      const mockEntries = Array.from({ length: 100 }, (_, i) => ({
        name: `file${i}.ts`,
        isDirectory: () => false,
        isFile: () => true,
      }));
      vi.mocked(fs.readdir).mockResolvedValue(
        mockEntries as unknown as Awaited<ReturnType<typeof fs.readdir>>
      );
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as unknown as Awaited<
        ReturnType<typeof fs.stat>
      >);

      const result = await globTool.execute(
        { patterns: ["**/*.ts"], dot: false, maxFiles: 10 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.files.length).toBeLessThanOrEqual(10);
        expect(result.output.truncated).toBe(true);
      }
    });

    it("should fail on cancelled operation", async () => {
      const abortController = new AbortController();
      abortController.abort();
      const ctx = createMockContext({ abortSignal: abortController.signal });

      const result = await globTool.execute(
        { patterns: ["**/*.ts"], dot: false, maxFiles: 1000 },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });
});

// ==============================================================
// READ_MANY_FILES TOOL TESTS
// ==============================================================
describe("readManyFilesTool", () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(readManyFilesTool.definition.name).toBe("read_many_files");
    });

    it("should have correct kind", () => {
      expect(readManyFilesTool.definition.kind).toBe("read");
    });
  });

  describe("execute", () => {
    it("should read multiple files by paths", async () => {
      vi.mocked(fs.readFile).mockImplementation(async (path: unknown) => {
        const pathStr = String(path);
        if (pathStr.includes("a.ts")) return "content A";
        if (pathStr.includes("b.ts")) return "content B";
        return "";
      });
      // stat must return an object with isFile() method
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        size: 100,
      } as unknown as Awaited<ReturnType<typeof fs.stat>>);

      const result = await readManyFilesTool.execute(
        { paths: ["src/a.ts", "src/b.ts"], maxFiles: 1000, maxSizePerFile: 100000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.files.length).toBe(2);
        expect(result.output.successCount).toBe(2);
        expect(result.output.errorCount).toBe(0);
      }
    });

    it("should handle file read errors gracefully", async () => {
      // First call succeeds, second call throws
      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ isFile: () => true, size: 100 } as unknown as Awaited<
          ReturnType<typeof fs.stat>
        >)
        .mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
      vi.mocked(fs.readFile).mockResolvedValue("content A");

      const result = await readManyFilesTool.execute(
        { paths: ["src/a.ts", "src/missing.ts"], maxFiles: 1000, maxSizePerFile: 100000 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.successCount).toBe(1);
        expect(result.output.errorCount).toBe(1);
      }
    });

    it("should require paths or patterns", async () => {
      const result = await readManyFilesTool.execute(
        { maxFiles: 1000, maxSizePerFile: 100000 } as {
          paths?: string[];
          patterns?: string[];
          maxFiles: number;
          maxSizePerFile: number;
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("paths");
      }
    });
  });
});

// ==============================================================
// BATCH TOOL TESTS
// ==============================================================
describe("batchTool", () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset registry
    setBatchToolRegistry(null as unknown as ToolRegistry);
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(batchTool.definition.name).toBe("batch");
    });

    it("should have correct kind", () => {
      expect(batchTool.definition.kind).toBe("read");
    });
  });

  describe("execute", () => {
    it("should fail if registry not set", async () => {
      const result = await batchTool.execute(
        {
          operations: [{ tool: "read_file", params: { path: "a.ts" } }],
          concurrency: 1,
          stopOnError: true,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("registry");
      }
    });

    it("should execute multiple operations in parallel", async () => {
      // Create mock registry with typed mock tool
      const mockReadFile = {
        definition: {
          name: "read_file",
          description: "Test",
          parameters: {},
          kind: "read" as const,
        },
        execute: vi.fn().mockResolvedValue({
          success: true,
          output: { content: "test content" },
        }),
      };

      const mockRegistry = {
        get: vi.fn().mockImplementation((name: string) => {
          if (name === "read_file") return mockReadFile;
          return undefined;
        }),
        all: vi.fn().mockReturnValue([mockReadFile]),
        register: vi.fn(),
        unregister: vi.fn(),
        has: vi.fn().mockReturnValue(true),
      } as unknown as ToolRegistry;

      setBatchToolRegistry(mockRegistry);

      const result = await batchTool.execute(
        {
          operations: [
            { tool: "read_file", params: { path: "a.ts" }, id: "file-a" },
            { tool: "read_file", params: { path: "b.ts" }, id: "file-b" },
            { tool: "read_file", params: { path: "c.ts" }, id: "file-c" },
          ],
          concurrency: 3,
          stopOnError: true,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.results.length).toBe(3);
        expect(result.output.successCount).toBe(3);
        expect(result.output.errorCount).toBe(0);
      }
    });

    it("should prevent nested batch calls", async () => {
      const mockBatch = {
        definition: {
          name: "batch",
          description: "Test",
          parameters: {},
          kind: "read" as const,
        },
        execute: vi.fn(),
      };

      const mockRegistry: ToolRegistry = {
        get: vi.fn().mockReturnValue(mockBatch),
        all: vi.fn().mockReturnValue([mockBatch]),
        register: vi.fn(),
        unregister: vi.fn(),
        has: vi.fn().mockReturnValue(true),
      } as unknown as ToolRegistry;

      setBatchToolRegistry(mockRegistry);

      const result = await batchTool.execute(
        {
          operations: [{ tool: "batch", params: { operations: [] } }],
          concurrency: 1,
          stopOnError: true,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("nest");
      }
    });
  });
});

// ==============================================================
// MULTI_EDIT TOOL TESTS
// ==============================================================
describe("multiEditTool", () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(multiEditTool.definition.name).toBe("multi_edit");
    });

    it("should have correct kind", () => {
      expect(multiEditTool.definition.kind).toBe("write");
    });
  });

  describe("execute", () => {
    it("should support dry run mode", async () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      vi.mocked(fs.readFile).mockResolvedValue(content);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await multiEditTool.execute(
        {
          path: "test.ts",
          edits: [{ type: "replace", startLine: 2, endLine: 2, content: "REPLACED" }],
          dryRun: true,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.dryRun).toBe(true);
        expect(result.output.preview).toBeDefined();
        // File should NOT be written in dry run
        expect(fs.writeFile).not.toHaveBeenCalled();
      }
    });

    it("should apply multiple edits atomically", async () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      vi.mocked(fs.readFile).mockResolvedValue(content);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await multiEditTool.execute(
        {
          path: "test.ts",
          edits: [
            { type: "insert", startLine: 1, content: "// Header" },
            { type: "delete", startLine: 3, endLine: 3 },
          ],
          dryRun: false,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.editCount).toBe(2);
        expect(fs.writeFile).toHaveBeenCalled();
      }
    });

    it("should validate edit operations", async () => {
      const content = "line1\nline2";
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await multiEditTool.execute(
        {
          path: "test.ts",
          edits: [
            { type: "replace", startLine: 100, content: "REPLACED" }, // Line doesn't exist
          ],
          dryRun: false,
        },
        mockContext
      );

      expect(result.success).toBe(false);
    });
  });
});

// ==============================================================
// INSERT_AT_LINE TOOL TESTS
// ==============================================================
describe("insertAtLineTool", () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(insertAtLineTool.definition.name).toBe("insert_at_line");
    });

    it("should have correct kind", () => {
      expect(insertAtLineTool.definition.kind).toBe("write");
    });
  });

  describe("execute", () => {
    it("should insert content before specified line", async () => {
      const content = "line1\nline2\nline3";
      vi.mocked(fs.readFile).mockResolvedValue(content);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await insertAtLineTool.execute(
        {
          path: "test.ts",
          line: 2,
          content: "// Inserted",
          position: "before",
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.insertedAtLine).toBe(2);
        expect(result.output.linesInserted).toBe(1);
        expect(result.output.newLineCount).toBe(4);

        // Verify the write call
        const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
        const writtenContent = writeCall?.[1] as string;
        expect(writtenContent).toContain("// Inserted\nline2");
      }
    });

    it("should insert content after specified line", async () => {
      const content = "line1\nline2\nline3";
      vi.mocked(fs.readFile).mockResolvedValue(content);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await insertAtLineTool.execute(
        {
          path: "test.ts",
          line: 1,
          content: "// After line 1",
          position: "after",
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.insertedAtLine).toBe(2);
        expect(result.output.linesInserted).toBe(1);

        // Verify the write call
        const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
        const writtenContent = writeCall?.[1] as string;
        expect(writtenContent).toContain("line1\n// After line 1\nline2");
      }
    });

    it("should handle multi-line insertions", async () => {
      const content = "line1\nline2";
      vi.mocked(fs.readFile).mockResolvedValue(content);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await insertAtLineTool.execute(
        {
          path: "test.ts",
          line: 1,
          content: "// Comment\n// More comment",
          position: "before",
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.linesInserted).toBe(2);
        expect(result.output.newLineCount).toBe(4);
      }
    });

    it("should reject invalid line numbers", async () => {
      const content = "line1\nline2";
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await insertAtLineTool.execute(
        {
          path: "test.ts",
          line: 100,
          content: "// Won't work",
          position: "after",
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("exceeds");
      }
    });

    it("should handle file not found", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await insertAtLineTool.execute(
        {
          path: "nonexistent.ts",
          line: 1,
          content: "// Won't work",
          position: "after",
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });
});
