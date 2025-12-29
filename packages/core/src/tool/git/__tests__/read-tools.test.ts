// ============================================
// Git Read Tools Tests - T008
// ============================================

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ToolContext } from "../../../types/tool.js";
import {
  countFilesChanged,
  createGitDiffTool,
  type GitDiffResult,
  parseDiffOutput,
} from "../diff.js";
import { createGitLogTool, type GitLogResult, parseLogOutput } from "../log.js";

// Import factories and parsers for testing
import {
  createGitStatusTool,
  type GitStatusResult,
  parseBranchOutput,
  parseStatusOutput,
} from "../status.js";
import type { GitExecResult } from "../types.js";
import { validatePath } from "../utils.js";

// Mock validatePath to always return true for non-traversal tests
vi.mock("../utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils.js")>();
  return {
    ...actual,
    validatePath: vi.fn((path: string, _repoRoot: string) => {
      // Only reject obvious traversal attempts
      return !path.includes("..");
    }),
  };
});

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock tool context for testing.
 */
function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    workingDir: "/test/repo",
    sessionId: "test-session",
    messageId: "test-message",
    callId: "test-call",
    abortSignal: new AbortController().signal,
    checkPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

/**
 * Create a mock git operations factory.
 */
function createMockGitOps(execMock: Mock) {
  return (_cwd: string) => ({
    exec: execMock,
  });
}

/**
 * Create a successful git exec result.
 */
function successResult(stdout: string, stderr = ""): GitExecResult {
  return { stdout, stderr, exitCode: 0 };
}

/**
 * Create a failed git exec result.
 */
function failResult(stderr: string, exitCode = 1): GitExecResult {
  return { stdout: "", stderr, exitCode };
}

// =============================================================================
// git_status Tests
// =============================================================================

describe("git_status", () => {
  describe("parseStatusOutput", () => {
    it("should parse clean repo output", () => {
      const result = parseStatusOutput("");
      expect(result).toEqual({
        staged: [],
        modified: [],
        untracked: [],
      });
    });

    it("should parse staged files", () => {
      const output = "M  staged.ts\nA  new.ts\nD  deleted.ts";
      const result = parseStatusOutput(output);
      expect(result.staged).toEqual(["staged.ts", "new.ts", "deleted.ts"]);
      expect(result.modified).toEqual([]);
      expect(result.untracked).toEqual([]);
    });

    it("should parse modified (unstaged) files", () => {
      const output = " M modified.ts\n D removed.ts";
      const result = parseStatusOutput(output);
      expect(result.staged).toEqual([]);
      expect(result.modified).toEqual(["modified.ts", "removed.ts"]);
      expect(result.untracked).toEqual([]);
    });

    it("should parse untracked files", () => {
      const output = "?? untracked.ts\n?? new-folder/";
      const result = parseStatusOutput(output);
      expect(result.staged).toEqual([]);
      expect(result.modified).toEqual([]);
      expect(result.untracked).toEqual(["untracked.ts", "new-folder/"]);
    });

    it("should parse mixed status", () => {
      const output = "M  staged.ts\n M modified.ts\n?? untracked.ts\nMM both.ts";
      const result = parseStatusOutput(output);
      expect(result.staged).toContain("staged.ts");
      expect(result.staged).toContain("both.ts");
      expect(result.modified).toContain("modified.ts");
      expect(result.modified).toContain("both.ts");
      expect(result.untracked).toContain("untracked.ts");
    });
  });

  describe("parseBranchOutput", () => {
    it("should parse normal branch name", () => {
      expect(parseBranchOutput("main\n")).toBe("main");
      expect(parseBranchOutput("feature/test-branch")).toBe("feature/test-branch");
    });

    it("should return HEAD for detached state", () => {
      expect(parseBranchOutput("")).toBe("HEAD");
      expect(parseBranchOutput("\n")).toBe("HEAD");
    });
  });

  describe("tool execution", () => {
    let execMock: Mock;
    let ctx: ToolContext;

    beforeEach(() => {
      execMock = vi.fn();
      ctx = createMockContext();
    });

    it("should return status for clean repo", async () => {
      execMock
        .mockResolvedValueOnce(successResult("main\n")) // branch
        .mockResolvedValueOnce(successResult("")); // status

      const tool = createGitStatusTool(createMockGitOps(execMock));
      const result = await tool.execute({}, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitStatusResult }).output;
      expect(output.branch).toBe("main");
      expect(output.staged).toEqual([]);
      expect(output.modified).toEqual([]);
      expect(output.untracked).toEqual([]);
      expect(output.clean).toBe(true);
    });

    it("should return status for dirty repo", async () => {
      execMock
        .mockResolvedValueOnce(successResult("feature/test\n")) // branch
        .mockResolvedValueOnce(successResult("M  staged.ts\n M modified.ts\n?? untracked.ts")); // status

      const tool = createGitStatusTool(createMockGitOps(execMock));
      const result = await tool.execute({}, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitStatusResult }).output;
      expect(output.branch).toBe("feature/test");
      expect(output.staged).toContain("staged.ts");
      expect(output.modified).toContain("modified.ts");
      expect(output.untracked).toContain("untracked.ts");
      expect(output.clean).toBe(false);
    });

    it("should handle not-in-repo error gracefully", async () => {
      execMock.mockResolvedValueOnce(
        failResult("fatal: not a git repository (or any of the parent directories): .git")
      );

      const tool = createGitStatusTool(createMockGitOps(execMock));
      const result = await tool.execute({}, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("Not a git repository");
    });

    it("should use custom cwd when provided", async () => {
      execMock
        .mockResolvedValueOnce(successResult("main\n"))
        .mockResolvedValueOnce(successResult(""));

      const tool = createGitStatusTool(createMockGitOps(execMock));
      await tool.execute({ cwd: "/custom/path" }, ctx);

      // The mock factory is called with the cwd
      expect(execMock).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// git_diff Tests
// =============================================================================

describe("git_diff", () => {
  describe("parseDiffOutput", () => {
    it("should parse empty diff", () => {
      const result = parseDiffOutput("");
      expect(result).toEqual([]);
    });

    it("should parse simple diff with one hunk", () => {
      const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line 1
+new line
 line 2
 line 3`;

      const hunks = parseDiffOutput(diff);
      expect(hunks).toHaveLength(1);
      expect(hunks[0]?.oldPath).toBe("file.ts");
      expect(hunks[0]?.newPath).toBe("file.ts");
      expect(hunks[0]?.header).toBe("@@ -1,3 +1,4 @@");
      expect(hunks[0]?.lines).toContain("+new line");
    });

    it("should parse diff with multiple hunks", () => {
      const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line 1
+new line
 line 2
@@ -10,3 +11,4 @@
 line 10
+another new line
 line 11`;

      const hunks = parseDiffOutput(diff);
      expect(hunks).toHaveLength(2);
      expect(hunks[0]?.header).toBe("@@ -1,3 +1,4 @@");
      expect(hunks[1]?.header).toBe("@@ -10,3 +11,4 @@");
    });

    it("should parse diff with multiple files", () => {
      const diff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,1 +1,2 @@
 line 1
+new line
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -1,1 +1,2 @@
 other line
+other new line`;

      const hunks = parseDiffOutput(diff);
      expect(hunks).toHaveLength(2);
      expect(hunks[0]?.oldPath).toBe("file1.ts");
      expect(hunks[1]?.oldPath).toBe("file2.ts");
    });
  });

  describe("countFilesChanged", () => {
    it("should count zero files for empty diff", () => {
      expect(countFilesChanged("")).toBe(0);
    });

    it("should count single file", () => {
      const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,2 @@
 line`;
      expect(countFilesChanged(diff)).toBe(1);
    });

    it("should count multiple files", () => {
      const diff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,1 +1,1 @@
-old
+new
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -1,1 +1,1 @@
-old
+new
diff --git a/file3.ts b/file3.ts
--- a/file3.ts
+++ b/file3.ts
@@ -1,1 +1,1 @@
-old
+new`;
      expect(countFilesChanged(diff)).toBe(3);
    });
  });

  describe("tool execution", () => {
    let execMock: Mock;
    let ctx: ToolContext;

    beforeEach(() => {
      execMock = vi.fn();
      ctx = createMockContext();
    });

    it("should return unstaged diff by default", async () => {
      const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,2 @@
 line
+new`;

      execMock.mockResolvedValueOnce(successResult(diff));

      const tool = createGitDiffTool(createMockGitOps(execMock));
      const result = await tool.execute({ staged: false }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitDiffResult }).output;
      expect(output.filesChanged).toBe(1);
      expect(output.truncated).toBe(false);
      expect(output.hunks).toHaveLength(1);

      // Verify --staged was NOT passed
      expect(execMock).toHaveBeenCalledWith(["diff"], expect.any(Object));
    });

    it("should return staged diff when staged=true", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitDiffTool(createMockGitOps(execMock));
      await tool.execute({ staged: true }, ctx);

      expect(execMock).toHaveBeenCalledWith(["diff", "--staged"], expect.any(Object));
    });

    it("should filter by paths", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitDiffTool(createMockGitOps(execMock));
      await tool.execute({ staged: false, paths: ["src/file.ts", "lib/other.ts"] }, ctx);

      expect(execMock).toHaveBeenCalledWith(
        ["diff", "--", "src/file.ts", "lib/other.ts"],
        expect.any(Object)
      );
    });

    it("should compare with ref", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitDiffTool(createMockGitOps(execMock));
      await tool.execute({ staged: false, ref: "HEAD~1" }, ctx);

      expect(execMock).toHaveBeenCalledWith(["diff", "HEAD~1"], expect.any(Object));
    });

    it("should compare ref range", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitDiffTool(createMockGitOps(execMock));
      await tool.execute({ staged: false, ref: "main..feature" }, ctx);

      expect(execMock).toHaveBeenCalledWith(["diff", "main..feature"], expect.any(Object));
    });

    it("should handle not-in-repo error", async () => {
      execMock.mockResolvedValueOnce(failResult("fatal: not a git repository"));

      const tool = createGitDiffTool(createMockGitOps(execMock));
      const result = await tool.execute({ staged: false }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("Not a git repository");
    });

    it("should handle unknown revision error", async () => {
      execMock.mockResolvedValueOnce(
        failResult("fatal: unknown revision or path not in the working tree")
      );

      const tool = createGitDiffTool(createMockGitOps(execMock));
      const result = await tool.execute({ staged: false, ref: "nonexistent" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("Unknown revision");
    });

    it("should reject path traversal attempts", async () => {
      // Reset the mock to actually reject traversal for this test
      vi.mocked(validatePath).mockImplementationOnce((path) => !path.includes(".."));

      const tool = createGitDiffTool(createMockGitOps(execMock));
      const result = await tool.execute({ staged: false, paths: ["../../../etc/passwd"] }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("outside repository");
    });

    it("should truncate large output", async () => {
      // Generate output larger than MAX_OUTPUT_LINES (500)
      const lines = Array.from({ length: 600 }, (_, i) => `line ${i}`).join("\n");
      const largeDiff = `diff --git a/large.ts b/large.ts
--- a/large.ts
+++ b/large.ts
@@ -1,600 +1,600 @@
${lines}`;

      execMock.mockResolvedValueOnce(successResult(largeDiff));

      const tool = createGitDiffTool(createMockGitOps(execMock));
      const result = await tool.execute({ staged: false }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitDiffResult }).output;
      expect(output.truncated).toBe(true);
      expect(output.diff).toContain("truncated");
      // Hunks should not be parsed for truncated output
      expect(output.hunks).toBeUndefined();
    });
  });
});

// =============================================================================
// git_log Tests
// =============================================================================

describe("git_log", () => {
  // Field and commit separators used in parsing
  const FS = "\x1f";
  const RS = "\x1e";

  describe("parseLogOutput", () => {
    it("should parse empty log output", () => {
      const result = parseLogOutput("");
      expect(result).toEqual([]);
    });

    it("should parse single commit", () => {
      const output = `abc123${FS}abc1234${FS}John Doe <john@example.com>${FS}2024-01-15T10:30:00Z${FS}Initial commit${RS}`;

      const commits = parseLogOutput(output);
      expect(commits).toHaveLength(1);
      expect(commits[0]).toEqual({
        hash: "abc123",
        shortHash: "abc1234",
        author: "John Doe <john@example.com>",
        date: "2024-01-15T10:30:00Z",
        message: "Initial commit",
      });
    });

    it("should parse multiple commits", () => {
      const output = `hash1${FS}h1${FS}Author 1 <a1@test.com>${FS}2024-01-15${FS}Commit 1${RS}hash2${FS}h2${FS}Author 2 <a2@test.com>${FS}2024-01-14${FS}Commit 2${RS}`;

      const commits = parseLogOutput(output);
      expect(commits).toHaveLength(2);
      expect(commits[0]?.message).toBe("Commit 1");
      expect(commits[1]?.message).toBe("Commit 2");
    });
  });

  describe("tool execution", () => {
    let execMock: Mock;
    let ctx: ToolContext;

    beforeEach(() => {
      execMock = vi.fn();
      ctx = createMockContext();
    });

    it("should return commits with default limit", async () => {
      const output = `hash1${FS}h1${FS}Author <a@test.com>${FS}2024-01-15${FS}Message${RS}`;
      execMock.mockResolvedValueOnce(successResult(output));

      const tool = createGitLogTool(createMockGitOps(execMock));
      const result = await tool.execute({ limit: 10 }, ctx);

      expect(result.success).toBe(true);
      const logResult = (result as { success: true; output: GitLogResult }).output;
      expect(logResult.commits).toHaveLength(1);
      expect(logResult.count).toBe(1);
      expect(logResult.truncated).toBe(false);

      // Check default limit of 10 was used
      expect(execMock).toHaveBeenCalledWith(expect.arrayContaining(["-n10"]), expect.any(Object));
    });

    it("should respect custom limit", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitLogTool(createMockGitOps(execMock));
      await tool.execute({ limit: 50 }, ctx);

      expect(execMock).toHaveBeenCalledWith(expect.arrayContaining(["-n50"]), expect.any(Object));
    });

    it("should filter by author", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitLogTool(createMockGitOps(execMock));
      await tool.execute({ limit: 10, author: "john@example.com" }, ctx);

      expect(execMock).toHaveBeenCalledWith(
        expect.arrayContaining(["--author=john@example.com"]),
        expect.any(Object)
      );
    });

    it("should filter by date range", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitLogTool(createMockGitOps(execMock));
      await tool.execute({ limit: 10, since: "2024-01-01", until: "2024-01-31" }, ctx);

      expect(execMock).toHaveBeenCalledWith(
        expect.arrayContaining(["--since=2024-01-01", "--until=2024-01-31"]),
        expect.any(Object)
      );
    });

    it("should filter by relative date", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitLogTool(createMockGitOps(execMock));
      await tool.execute({ limit: 10, since: "1.week.ago" }, ctx);

      expect(execMock).toHaveBeenCalledWith(
        expect.arrayContaining(["--since=1.week.ago"]),
        expect.any(Object)
      );
    });

    it("should filter by path", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitLogTool(createMockGitOps(execMock));
      await tool.execute({ limit: 10, path: "src/index.ts" }, ctx);

      expect(execMock).toHaveBeenCalledWith(
        expect.arrayContaining(["--", "src/index.ts"]),
        expect.any(Object)
      );
    });

    it("should handle not-in-repo error", async () => {
      execMock.mockResolvedValueOnce(failResult("fatal: not a git repository"));

      const tool = createGitLogTool(createMockGitOps(execMock));
      const result = await tool.execute({ limit: 10 }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("Not a git repository");
    });

    it("should handle empty repo (no commits)", async () => {
      execMock.mockResolvedValueOnce(
        failResult("fatal: your current branch 'main' does not have any commits yet")
      );

      const tool = createGitLogTool(createMockGitOps(execMock));
      const result = await tool.execute({ limit: 10 }, ctx);

      expect(result.success).toBe(true);
      const logResult = (result as { success: true; output: GitLogResult }).output;
      expect(logResult.commits).toEqual([]);
      expect(logResult.count).toBe(0);
    });

    it("should reject path traversal attempts", async () => {
      // Reset the mock to actually reject traversal for this test
      vi.mocked(validatePath).mockImplementationOnce((path) => !path.includes(".."));

      const tool = createGitLogTool(createMockGitOps(execMock));
      const result = await tool.execute({ limit: 10, path: "../../../etc/passwd" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("outside repository");
    });

    it("should truncate large output", async () => {
      // Generate output larger than MAX_OUTPUT_LINES
      const commits = Array.from(
        { length: 200 },
        (_, i) =>
          `hash${i}${FS}h${i}${FS}Author <a@test.com>${FS}2024-01-${String((i % 28) + 1).padStart(2, "0")}${FS}Commit message ${i} with some additional text to make it longer${RS}`
      ).join("");

      execMock.mockResolvedValueOnce(successResult(commits));

      const tool = createGitLogTool(createMockGitOps(execMock));
      const result = await tool.execute({ limit: 100 }, ctx);

      expect(result.success).toBe(true);
      // Note: truncation is based on lines, so we still parse all commits from the original output
      const logResult = (result as { success: true; output: GitLogResult }).output;
      expect(logResult.commits.length).toBeGreaterThan(0);
    });
  });
});
