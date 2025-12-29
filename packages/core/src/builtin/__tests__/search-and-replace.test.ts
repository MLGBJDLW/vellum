/**
 * Tests for search_and_replace tool
 */

import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { searchAndReplaceTool } from "../search-and-replace.js";

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock path-security module
vi.mock("../utils/path-security.js", () => ({
  validatePath: vi.fn((filePath: string, workingDir: string) => {
    if (filePath.includes("..")) {
      return { valid: false, error: "Path traversal not allowed" };
    }
    return { valid: true, sanitizedPath: `${workingDir}/${filePath}` };
  }),
}));

describe("searchAndReplaceTool", () => {
  const mockContext: ToolContext = {
    workingDir: "/test/workspace",
    sessionId: "test-session",
    messageId: "test-message",
    callId: "test-call",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(searchAndReplaceTool.definition.name).toBe("search_and_replace");
    });

    it("should have correct kind", () => {
      expect(searchAndReplaceTool.definition.kind).toBe("write");
    });
  });

  describe("execute", () => {
    it("should replace literal string", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("Hello old world!");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await searchAndReplaceTool.execute(
        {
          pattern: "old",
          replacement: "new",
          paths: ["test.txt"],
          isRegex: false,
          caseSensitive: true,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.totalReplacements).toBe(1);
        expect(result.output.filesModified).toBe(1);
      }
      expect(fs.writeFile).toHaveBeenCalledWith("/test/workspace/test.txt", "Hello new world!", {
        encoding: "utf-8",
      });
    });

    it("should handle regex patterns", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("foo123bar456baz");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await searchAndReplaceTool.execute(
        {
          pattern: "\\d+",
          replacement: "#",
          paths: ["test.txt"],
          isRegex: true,
          caseSensitive: true,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.totalReplacements).toBe(2);
      }
      expect(fs.writeFile).toHaveBeenCalledWith("/test/workspace/test.txt", "foo#bar#baz", {
        encoding: "utf-8",
      });
    });

    it("should support regex capture groups", async () => {
      vi.mocked(fs.readFile).mockResolvedValue('console.log("hello")');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await searchAndReplaceTool.execute(
        {
          pattern: "console\\.log\\((.+)\\)",
          replacement: "logger.debug($1)",
          paths: ["test.ts"],
          isRegex: true,
          caseSensitive: true,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        "/test/workspace/test.ts",
        'logger.debug("hello")',
        { encoding: "utf-8" }
      );
    });

    it("should handle case insensitive search", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("Hello HELLO hello");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await searchAndReplaceTool.execute(
        {
          pattern: "hello",
          replacement: "hi",
          paths: ["test.txt"],
          isRegex: false,
          caseSensitive: false,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.totalReplacements).toBe(3);
      }
    });

    it("should process multiple files", async () => {
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce("old content 1")
        .mockResolvedValueOnce("old content 2");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await searchAndReplaceTool.execute(
        {
          pattern: "old",
          replacement: "new",
          paths: ["file1.txt", "file2.txt"],
          isRegex: false,
          caseSensitive: true,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.filesModified).toBe(2);
        expect(result.output.filesProcessed).toBe(2);
        expect(result.output.totalReplacements).toBe(2);
      }
    });

    it("should not modify file if no matches", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("content without match");

      const result = await searchAndReplaceTool.execute(
        {
          pattern: "nonexistent",
          replacement: "new",
          paths: ["test.txt"],
          isRegex: false,
          caseSensitive: true,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.filesModified).toBe(0);
        expect(result.output.totalReplacements).toBe(0);
      }
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it("should handle file not found gracefully", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await searchAndReplaceTool.execute(
        {
          pattern: "old",
          replacement: "new",
          paths: ["nonexistent.txt"],
          isRegex: false,
          caseSensitive: true,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.results[0]?.error).toContain("not found");
        expect(result.output.filesModified).toBe(0);
      }
    });

    it("should fail for path traversal", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("content");

      const result = await searchAndReplaceTool.execute(
        {
          pattern: "old",
          replacement: "new",
          paths: ["../../../etc/passwd"],
          isRegex: false,
          caseSensitive: true,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.results[0]?.error).toContain("Path traversal");
      }
    });

    it("should fail for invalid regex", async () => {
      const result = await searchAndReplaceTool.execute(
        {
          pattern: "[invalid",
          replacement: "new",
          paths: ["test.txt"],
          isRegex: true,
          caseSensitive: true,
        },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid regex");
      }
    });

    it("should check permissions for each file", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("old content");
      vi.mocked(mockContext.checkPermission)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await searchAndReplaceTool.execute(
        {
          pattern: "old",
          replacement: "new",
          paths: ["allowed.txt", "denied.txt"],
          isRegex: false,
          caseSensitive: true,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.filesModified).toBe(1);
        expect(result.output.results[1]?.error).toContain("Permission denied");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should require confirmation for multiple files", () => {
      expect(
        searchAndReplaceTool.shouldConfirm?.(
          {
            pattern: "old",
            replacement: "new",
            paths: ["a.txt", "b.txt"],
            isRegex: false,
            caseSensitive: true,
          },
          mockContext
        )
      ).toBe(true);
    });

    it("should not require confirmation for single file", () => {
      expect(
        searchAndReplaceTool.shouldConfirm?.(
          {
            pattern: "old",
            replacement: "new",
            paths: ["a.txt"],
            isRegex: false,
            caseSensitive: true,
          },
          mockContext
        )
      ).toBe(false);
    });
  });
});
