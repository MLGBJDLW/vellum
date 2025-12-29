/**
 * Tests for apply_patch tool
 */

import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { applyPatchBlock, applyPatchTool, parseCodexPatch } from "../apply-patch.js";

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

describe("parseCodexPatch", () => {
  it("should parse single patch block", () => {
    const patch = `<<<<<<< SEARCH
old content
=======
new content
>>>>>>> REPLACE`;

    const blocks = parseCodexPatch(patch);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.search).toBe("old content");
    expect(blocks[0]?.replace).toBe("new content");
  });

  it("should parse multiple patch blocks", () => {
    const patch = `<<<<<<< SEARCH
first old
=======
first new
>>>>>>> REPLACE

<<<<<<< SEARCH
second old
=======
second new
>>>>>>> REPLACE`;

    const blocks = parseCodexPatch(patch);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.search).toBe("first old");
    expect(blocks[1]?.search).toBe("second old");
  });

  it("should handle multiline content", () => {
    const patch = `<<<<<<< SEARCH
line 1
line 2
line 3
=======
new line 1
new line 2
>>>>>>> REPLACE`;

    const blocks = parseCodexPatch(patch);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.search).toBe("line 1\nline 2\nline 3");
    expect(blocks[0]?.replace).toBe("new line 1\nnew line 2");
  });

  it("should handle empty replace (deletion)", () => {
    const patch = `<<<<<<< SEARCH
to delete
=======
>>>>>>> REPLACE`;

    const blocks = parseCodexPatch(patch);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.search).toBe("to delete");
    expect(blocks[0]?.replace).toBe("");
  });

  it("should return empty array for patch missing SEARCH marker", () => {
    const patch = `=======
replacement
>>>>>>> REPLACE`;

    const blocks = parseCodexPatch(patch);
    expect(blocks).toHaveLength(0);
  });

  it("should return empty array for patch missing REPLACE marker", () => {
    const patch = `<<<<<<< SEARCH
search content
=======
replacement`;

    const blocks = parseCodexPatch(patch);
    expect(blocks).toHaveLength(0);
  });

  it("should return empty array for patch missing separator", () => {
    const patch = `<<<<<<< SEARCH
search content
>>>>>>> REPLACE`;

    const blocks = parseCodexPatch(patch);
    expect(blocks).toHaveLength(0);
  });

  it("should return empty array for empty patch", () => {
    const blocks = parseCodexPatch("");
    expect(blocks).toHaveLength(0);
  });

  it("should return empty array for invalid patch format", () => {
    const patch = "just some random text without markers";
    const blocks = parseCodexPatch(patch);
    expect(blocks).toHaveLength(0);
  });
});

describe("applyPatchBlock", () => {
  it("should apply simple replacement", () => {
    const content = "Hello old world!";
    const block = { search: "old", replace: "new" };

    const result = applyPatchBlock(content, block);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toBe("Hello new world!");
    }
  });

  it("should handle multiline content", () => {
    const content = "line1\nold line\nline3";
    const block = { search: "old line", replace: "new line" };

    const result = applyPatchBlock(content, block);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toBe("line1\nnew line\nline3");
    }
  });

  it("should fail when search not found", () => {
    const content = "Hello world!";
    const block = { search: "nonexistent", replace: "new" };

    const result = applyPatchBlock(content, block);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not found");
    }
  });

  it("should fail on ambiguous matches", () => {
    const content = "foo bar foo baz foo";
    const block = { search: "foo", replace: "qux" };

    const result = applyPatchBlock(content, block);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Multiple matches");
    }
  });

  it("should handle empty search (prepend)", () => {
    const content = "existing content";
    const block = { search: "", replace: "prefix " };

    const result = applyPatchBlock(content, block);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toBe("prefix existing content");
    }
  });
});

describe("applyPatchTool", () => {
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
      expect(applyPatchTool.definition.name).toBe("apply_patch");
    });

    it("should have correct kind", () => {
      expect(applyPatchTool.definition.kind).toBe("write");
    });
  });

  describe("execute", () => {
    it("should apply valid patch", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("const oldValue = 1;");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const patch = `<<<<<<< SEARCH
const oldValue = 1;
=======
const newValue = 2;
>>>>>>> REPLACE`;

      const result = await applyPatchTool.execute({ path: "file.ts", patch }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.appliedCount).toBe(1);
        expect(result.output.totalCount).toBe(1);
        expect(result.output.failures).toHaveLength(0);
      }
    });

    it("should apply multiple patches", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("const a = 1;\nconst b = 2;");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const patch = `<<<<<<< SEARCH
const a = 1;
=======
const a = 10;
>>>>>>> REPLACE

<<<<<<< SEARCH
const b = 2;
=======
const b = 20;
>>>>>>> REPLACE`;

      const result = await applyPatchTool.execute({ path: "file.ts", patch }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.appliedCount).toBe(2);
        expect(result.output.totalCount).toBe(2);
      }
    });

    it("should report partial failures", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("const a = 1;");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const patch = `<<<<<<< SEARCH
const a = 1;
=======
const a = 10;
>>>>>>> REPLACE

<<<<<<< SEARCH
nonexistent content
=======
replacement
>>>>>>> REPLACE`;

      const result = await applyPatchTool.execute({ path: "file.ts", patch }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.appliedCount).toBe(1);
        expect(result.output.totalCount).toBe(2);
        expect(result.output.failures).toHaveLength(1);
      }
    });

    it("should fail when no valid blocks found", async () => {
      const result = await applyPatchTool.execute(
        { path: "file.ts", patch: "invalid patch format" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("No valid patch blocks");
      }
    });

    it("should fail on path traversal", async () => {
      const patch = `<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE`;

      const result = await applyPatchTool.execute(
        { path: "../../../etc/passwd", patch },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Path traversal not allowed");
      }
    });

    it("should check permissions", async () => {
      vi.mocked(mockContext.checkPermission).mockResolvedValueOnce(false);

      const patch = `<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE`;

      const result = await applyPatchTool.execute({ path: "file.ts", patch }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });

    it("should apply empty replacement (deletion)", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("prefix\nto delete\nsuffix");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const patch = `<<<<<<< SEARCH
to delete
=======
>>>>>>> REPLACE`;

      const result = await applyPatchTool.execute({ path: "file.ts", patch }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.appliedCount).toBe(1);
      }
      expect(fs.writeFile).toHaveBeenCalledWith(expect.any(String), "prefix\n\nsuffix", {
        encoding: "utf-8",
      });
    });

    it("should handle cancelled operations", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const patch = `<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE`;

      const result = await applyPatchTool.execute(
        { path: "file.ts", patch },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });

    it("should handle file read error", async () => {
      const error = new Error("Read error") as NodeJS.ErrnoException;
      error.code = "EACCES";
      vi.mocked(fs.readFile).mockRejectedValue(error);

      const patch = `<<<<<<< SEARCH
old
=======
new
>>>>>>> REPLACE`;

      const result = await applyPatchTool.execute({ path: "file.ts", patch }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Access denied");
      }
    });
  });
});
