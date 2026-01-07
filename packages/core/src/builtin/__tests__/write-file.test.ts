/**
 * Tests for write_file tool
 */

import type { Stats } from "node:fs";
import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { writeFileTool } from "../write-file.js";

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(),
  mkdir: vi.fn(),
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

describe("writeFileTool", () => {
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
      expect(writeFileTool.definition.name).toBe("write_file");
    });

    it("should have correct kind", () => {
      expect(writeFileTool.definition.kind).toBe("write");
    });

    it("should have description", () => {
      expect(writeFileTool.definition.description).toBeTruthy();
    });
  });

  describe("execute", () => {
    it("should create new file", async () => {
      // File doesn't exist
      vi.mocked(fs.stat).mockRejectedValue({ code: "ENOENT" });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await writeFileTool.execute(
        { path: "new-file.txt", content: "hello world" },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.created).toBe(true);
        expect(result.output.bytesWritten).toBe(11); // "hello world" length
      }
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it("should overwrite existing file", async () => {
      // File exists
      vi.mocked(fs.stat).mockResolvedValue({} as Stats);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await writeFileTool.execute(
        { path: "existing.txt", content: "new content" },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.created).toBe(false);
      }
    });

    it("should create parent directories automatically", async () => {
      // File doesn't exist
      vi.mocked(fs.stat).mockRejectedValue({ code: "ENOENT" });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await writeFileTool.execute(
        { path: "deep/nested/dir/file.txt", content: "content" },
        mockContext
      );

      expect(result.success).toBe(true);
      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining("deep/nested/dir"), {
        recursive: true,
      });
    });

    it("should handle read-only filesystem error", async () => {
      vi.mocked(fs.stat).mockRejectedValue({ code: "ENOENT" });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const error = new Error("Read-only") as NodeJS.ErrnoException;
      error.code = "EROFS";
      vi.mocked(fs.writeFile).mockRejectedValue(error);

      const result = await writeFileTool.execute(
        { path: "test.txt", content: "hello" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Read-only");
      }
    });

    it("should handle filesystem access denied error", async () => {
      vi.mocked(fs.stat).mockRejectedValue({ code: "ENOENT" });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const error = new Error("Access denied") as NodeJS.ErrnoException;
      error.code = "EACCES";
      vi.mocked(fs.writeFile).mockRejectedValue(error);

      const result = await writeFileTool.execute(
        { path: "test.txt", content: "hello" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Access denied");
      }
    });

    it("should fail for path traversal attempts", async () => {
      const result = await writeFileTool.execute(
        { path: "../../../etc/passwd", content: "malicious" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Path traversal not allowed");
      }
    });

    it("should fail when permission denied", async () => {
      vi.mocked(mockContext.checkPermission).mockResolvedValueOnce(false);

      const result = await writeFileTool.execute(
        { path: "test.txt", content: "hello" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });

    it("should handle cancelled operations", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await writeFileTool.execute(
        { path: "test.txt", content: "hello" },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });

    it("should handle disk full error", async () => {
      vi.mocked(fs.stat).mockRejectedValue({ code: "ENOENT" });
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const error = new Error("No space") as NodeJS.ErrnoException;
      error.code = "ENOSPC";
      vi.mocked(fs.writeFile).mockRejectedValue(error);

      const result = await writeFileTool.execute(
        { path: "test.txt", content: "hello" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("No space");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should require confirmation for write operations", () => {
      expect(
        writeFileTool.shouldConfirm?.({ path: "test.txt", content: "hello" }, mockContext)
      ).toBe(true);
    });
  });
});
