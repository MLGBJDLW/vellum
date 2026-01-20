/**
 * Tests for read_file tool
 */

import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { readFileTool } from "../read-file.js";

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
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

describe("readFileTool", () => {
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
    // Default mock for stat - small file size (no warning)
    vi.mocked(fs.stat).mockResolvedValue({ size: 1000 } as Awaited<ReturnType<typeof fs.stat>>);
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(readFileTool.definition.name).toBe("read_file");
    });

    it("should have correct kind", () => {
      expect(readFileTool.definition.kind).toBe("read");
    });

    it("should have description", () => {
      expect(readFileTool.definition.description).toBeTruthy();
    });
  });

  describe("execute", () => {
    it("should read entire file content", async () => {
      const content = "line1\nline2\nline3";
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await readFileTool.execute({ path: "test.txt" }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.content).toBe(content);
        expect(result.output.totalLines).toBe(3);
        expect(result.output.startLine).toBe(1);
        expect(result.output.endLine).toBe(3);
      }
    });

    it("should read specific line range", async () => {
      const content = "line1\nline2\nline3\nline4\nline5";
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await readFileTool.execute(
        { path: "test.txt", startLine: 2, endLine: 4 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.content).toBe("line2\nline3\nline4");
        expect(result.output.startLine).toBe(2);
        expect(result.output.endLine).toBe(4);
      }
    });

    it("should clamp end line to file length", async () => {
      const content = "line1\nline2\nline3";
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await readFileTool.execute(
        { path: "test.txt", startLine: 1, endLine: 100 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.endLine).toBe(3);
      }
    });

    it("should fail if start line exceeds file length", async () => {
      const content = "line1\nline2";
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await readFileTool.execute({ path: "test.txt", startLine: 10 }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("exceeds file length");
      }
    });

    it("should fail if start line greater than end line", async () => {
      const content = "line1\nline2\nline3";
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await readFileTool.execute(
        { path: "test.txt", startLine: 3, endLine: 1 },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cannot be greater than end line");
      }
    });

    it("should fail for path traversal attempts", async () => {
      const result = await readFileTool.execute({ path: "../../../etc/passwd" }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Path traversal not allowed");
      }
    });

    it("should handle empty file", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("");

      const result = await readFileTool.execute({ path: "empty.txt" }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.content).toBe("");
        expect(result.output.totalLines).toBe(1); // Empty file has 1 "line"
        expect(result.output.startLine).toBe(1);
        expect(result.output.endLine).toBe(1);
      }
    });

    it("should handle file not found", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await readFileTool.execute({ path: "nonexistent.txt" }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("File not found");
      }
    });

    it("should handle cancelled operations", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await readFileTool.execute(
        { path: "test.txt" },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });

    it("should fail when path is a directory", async () => {
      const error = new Error("EISDIR") as NodeJS.ErrnoException;
      error.code = "EISDIR";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await readFileTool.execute({ path: "some-directory" }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("directory");
      }
    });

    it("should handle access denied error", async () => {
      const error = new Error("EACCES") as NodeJS.ErrnoException;
      error.code = "EACCES";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const result = await readFileTool.execute({ path: "restricted.txt" }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Access denied");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should not require confirmation for read operations", () => {
      expect(readFileTool.shouldConfirm?.({ path: "test.txt" }, mockContext)).toBe(false);
    });
  });
});
