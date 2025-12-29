/**
 * Tests for apply_diff tool
 */

import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { applyDiffTool, applyHunk, type DiffHunk, parseUnifiedDiff } from "../apply-diff.js";

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

describe("parseUnifiedDiff", () => {
  it("should parse simple unified diff", () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
 export { a, c };`;

    const hunks = parseUnifiedDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.oldStart).toBe(1);
    expect(hunks[0]?.oldCount).toBe(3);
    expect(hunks[0]?.newStart).toBe(1);
    expect(hunks[0]?.newCount).toBe(4);
    expect(hunks[0]?.lines).toContain(" const a = 1;");
    expect(hunks[0]?.lines).toContain("+const b = 2;");
  });

  it("should parse diff with multiple hunks", () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
-old line 1
+new line 1
 unchanged
@@ -10,2 +10,3 @@
 context
+added line
 more context`;

    const hunks = parseUnifiedDiff(diff);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]?.oldStart).toBe(1);
    expect(hunks[1]?.oldStart).toBe(10);
  });

  it("should handle single line hunks", () => {
    const diff = `@@ -5 +5 @@
-old
+new`;

    const hunks = parseUnifiedDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.oldCount).toBe(1);
    expect(hunks[0]?.newCount).toBe(1);
  });
});

describe("applyHunk", () => {
  it("should apply simple addition", () => {
    const lines = ["line1", "line2", "line3"];
    const hunk: DiffHunk = {
      oldStart: 2,
      oldCount: 1,
      newStart: 2,
      newCount: 2,
      lines: [" line2", "+inserted"],
    };

    const result = applyHunk(lines, hunk);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines).toEqual(["line1", "line2", "inserted", "line3"]);
    }
  });

  it("should apply simple deletion", () => {
    const lines = ["line1", "line2", "line3"];
    const hunk: DiffHunk = {
      oldStart: 2,
      oldCount: 1,
      newStart: 2,
      newCount: 0,
      lines: ["-line2"],
    };

    const result = applyHunk(lines, hunk);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines).toEqual(["line1", "line3"]);
    }
  });

  it("should apply replacement", () => {
    const lines = ["line1", "old", "line3"];
    const hunk: DiffHunk = {
      oldStart: 2,
      oldCount: 1,
      newStart: 2,
      newCount: 1,
      lines: ["-old", "+new"],
    };

    const result = applyHunk(lines, hunk);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines).toEqual(["line1", "new", "line3"]);
    }
  });

  it("should fail on context mismatch", () => {
    const lines = ["line1", "different", "line3"];
    const hunk: DiffHunk = {
      oldStart: 2,
      oldCount: 1,
      newStart: 2,
      newCount: 1,
      lines: ["-expected", "+new"],
    };

    const result = applyHunk(lines, hunk);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Context mismatch");
    }
  });

  it("should apply add-only diff (no deletions)", () => {
    const lines = ["line1", "line2", "line3"];
    const hunk: DiffHunk = {
      oldStart: 2,
      oldCount: 1,
      newStart: 2,
      newCount: 3,
      lines: [" line2", "+new line a", "+new line b"],
    };

    const result = applyHunk(lines, hunk);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines).toEqual(["line1", "line2", "new line a", "new line b", "line3"]);
    }
  });

  it("should apply delete-only diff (no additions)", () => {
    const lines = ["line1", "to delete 1", "to delete 2", "line4"];
    const hunk: DiffHunk = {
      oldStart: 2,
      oldCount: 2,
      newStart: 2,
      newCount: 0,
      lines: ["-to delete 1", "-to delete 2"],
    };

    const result = applyHunk(lines, hunk);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines).toEqual(["line1", "line4"]);
    }
  });

  it("should fail when hunk extends beyond file", () => {
    const lines = ["line1", "line2"];
    const hunk: DiffHunk = {
      oldStart: 3,
      oldCount: 1,
      newStart: 3,
      newCount: 1,
      lines: ["-old", "+new"],
    };

    const result = applyHunk(lines, hunk);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("extends beyond file");
    }
  });
});

describe("parseUnifiedDiff edge cases", () => {
  it("should return empty array for empty diff", () => {
    const hunks = parseUnifiedDiff("");
    expect(hunks).toHaveLength(0);
  });

  it("should return empty array for diff without hunks", () => {
    const diff = `--- a/file.ts
+++ b/file.ts
some random text without hunk headers`;
    const hunks = parseUnifiedDiff(diff);
    expect(hunks).toHaveLength(0);
  });

  it("should handle diff with only file headers", () => {
    const diff = `--- a/file.ts
+++ b/file.ts`;
    const hunks = parseUnifiedDiff(diff);
    expect(hunks).toHaveLength(0);
  });
});

describe("applyDiffTool", () => {
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
      expect(applyDiffTool.definition.name).toBe("apply_diff");
    });

    it("should have correct kind", () => {
      expect(applyDiffTool.definition.kind).toBe("write");
    });
  });

  describe("execute", () => {
    it("should apply valid diff", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("const a = 1;\nconst c = 3;\nexport { a, c };");
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const diff = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
 export { a, c };`;

      const result = await applyDiffTool.execute({ path: "file.ts", diff }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.hunksApplied).toBe(1);
        expect(result.output.linesAdded).toBe(1);
        expect(result.output.linesRemoved).toBe(0);
      }
    });

    it("should fail when no hunks found", async () => {
      const result = await applyDiffTool.execute(
        { path: "file.ts", diff: "invalid diff content" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("No valid hunks");
      }
    });

    it("should handle file not found for new file creation", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      vi.mocked(fs.readFile).mockRejectedValue(error);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const diff = `@@ -0,0 +1 @@
+new content`;

      const result = await applyDiffTool.execute({ path: "newfile.ts", diff }, mockContext);

      // Should work for new file creation
      expect(result.success).toBe(true);
    });

    it("should fail on path traversal", async () => {
      const result = await applyDiffTool.execute(
        { path: "../../../etc/passwd", diff: "@@ -1 +1 @@\n-old\n+new" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Path traversal not allowed");
      }
    });

    it("should check permissions", async () => {
      vi.mocked(mockContext.checkPermission).mockResolvedValueOnce(false);

      const result = await applyDiffTool.execute(
        { path: "file.ts", diff: "@@ -1 +1 @@\n-old\n+new" },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });
  });
});
