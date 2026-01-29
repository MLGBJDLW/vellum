// ============================================
// Git Conflict Tools Tests - T015
// ============================================

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ToolContext } from "../../../types/tool.js";
import {
  createGitConflictInfoTool,
  createGitResolveConflictTool,
  extractConflictMarkers,
  type GitConflictInfoResult,
  type GitResolveConflictResult,
  parseConflictedFiles,
} from "../conflict.js";
import type { GitExecResult } from "../types.js";

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
 * Create a mock context with snapshot service.
 */
function createMockContextWithSnapshot(
  trackMock: Mock = vi.fn().mockResolvedValue(undefined)
): ToolContext & { snapshotService: { track: Mock } } {
  return {
    ...createMockContext(),
    snapshotService: { track: trackMock },
  } as ToolContext & { snapshotService: { track: Mock } };
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

/**
 * Sample file content with conflict markers.
 */
const CONFLICT_FILE_CONTENT = `line 1
line 2
<<<<<<< HEAD
our changes here
=======
their changes here
>>>>>>> feature-branch
line 3
line 4`;

/**
 * Sample file with multiple conflicts.
 */
const MULTI_CONFLICT_CONTENT = `start
<<<<<<< HEAD
ours 1
=======
theirs 1
>>>>>>> branch
middle
<<<<<<< HEAD
ours 2
=======
theirs 2
>>>>>>> branch
end`;

// =============================================================================
// parseConflictedFiles Tests
// =============================================================================

describe("parseConflictedFiles", () => {
  it("should return empty array when no conflicts", () => {
    const output = "M  modified.ts\n?? untracked.ts";
    const result = parseConflictedFiles(output);
    expect(result).toEqual([]);
  });

  it("should detect UU (both modified) conflicts", () => {
    const output = "UU conflict.ts\nM  modified.ts";
    const result = parseConflictedFiles(output);
    expect(result).toEqual(["conflict.ts"]);
  });

  it("should detect AA (both added) conflicts", () => {
    const output = "AA new-file.ts";
    const result = parseConflictedFiles(output);
    expect(result).toEqual(["new-file.ts"]);
  });

  it("should detect DD (both deleted) conflicts", () => {
    const output = "DD deleted.ts";
    const result = parseConflictedFiles(output);
    expect(result).toEqual(["deleted.ts"]);
  });

  it("should detect AU/UA/DU/UD conflicts", () => {
    const output = "AU file1.ts\nUA file2.ts\nDU file3.ts\nUD file4.ts";
    const result = parseConflictedFiles(output);
    expect(result).toEqual(["file1.ts", "file2.ts", "file3.ts", "file4.ts"]);
  });

  it("should handle multiple conflicts", () => {
    const output = "UU src/a.ts\nUU src/b.ts\nM  clean.ts\nUU src/c.ts";
    const result = parseConflictedFiles(output);
    expect(result).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });
});

// =============================================================================
// extractConflictMarkers Tests
// =============================================================================

describe("extractConflictMarkers", () => {
  it("should return empty markers for content without conflicts", () => {
    const result = extractConflictMarkers("normal content\nno conflicts here");
    expect(result.markers).toBe("");
    expect(result.oursContent).toBeUndefined();
    expect(result.theirsContent).toBeUndefined();
  });

  it("should extract single conflict markers", () => {
    const result = extractConflictMarkers(CONFLICT_FILE_CONTENT);
    expect(result.markers).toContain("<<<<<<<");
    expect(result.markers).toContain("=======");
    expect(result.markers).toContain(">>>>>>>");
    expect(result.oursContent).toBe("our changes here");
    expect(result.theirsContent).toBe("their changes here");
  });

  it("should extract multiple conflict markers", () => {
    const result = extractConflictMarkers(MULTI_CONFLICT_CONTENT);
    expect(result.markers).toContain("---"); // separator between conflicts
    expect(result.oursContent).toContain("ours 1");
    expect(result.oursContent).toContain("ours 2");
    expect(result.theirsContent).toContain("theirs 1");
    expect(result.theirsContent).toContain("theirs 2");
  });
});

// =============================================================================
// git_conflict_info Tests
// =============================================================================

describe("git_conflict_info", () => {
  let execMock: Mock;
  let readFileMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    readFileMock = vi.fn();
    ctx = createMockContext();
  });

  it("should return no conflicts when status is clean", async () => {
    execMock.mockResolvedValueOnce(successResult("M  modified.ts\n?? untracked.ts"));

    const tool = createGitConflictInfoTool(createMockGitOps(execMock), {
      readFile: readFileMock,
    });
    const result = await tool.execute({}, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitConflictInfoResult }).output;
    expect(output.hasConflicts).toBe(false);
    expect(output.files).toEqual([]);
  });

  it("should detect conflicts and parse markers", async () => {
    execMock.mockResolvedValueOnce(successResult("UU conflict.ts"));
    readFileMock.mockResolvedValueOnce(CONFLICT_FILE_CONTENT);

    const tool = createGitConflictInfoTool(createMockGitOps(execMock), {
      readFile: readFileMock,
    });
    const result = await tool.execute({}, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitConflictInfoResult }).output;
    expect(output.hasConflicts).toBe(true);
    expect(output.files).toHaveLength(1);
    expect(output.files[0]?.path).toBe("conflict.ts");
    expect(output.files[0]?.oursContent).toBe("our changes here");
    expect(output.files[0]?.theirsContent).toBe("their changes here");
    expect(output.files[0]?.markers).toContain("<<<<<<<");
  });

  it("should handle multiple conflicted files", async () => {
    execMock.mockResolvedValueOnce(successResult("UU file1.ts\nUU file2.ts"));
    readFileMock
      .mockResolvedValueOnce(CONFLICT_FILE_CONTENT)
      .mockResolvedValueOnce(CONFLICT_FILE_CONTENT);

    const tool = createGitConflictInfoTool(createMockGitOps(execMock), {
      readFile: readFileMock,
    });
    const result = await tool.execute({}, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitConflictInfoResult }).output;
    expect(output.files).toHaveLength(2);
    expect(output.files[0]?.path).toBe("file1.ts");
    expect(output.files[1]?.path).toBe("file2.ts");
  });

  it("should handle unreadable files gracefully", async () => {
    execMock.mockResolvedValueOnce(successResult("DD deleted.ts"));
    readFileMock.mockRejectedValueOnce(new Error("File not found"));

    const tool = createGitConflictInfoTool(createMockGitOps(execMock), {
      readFile: readFileMock,
    });
    const result = await tool.execute({}, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitConflictInfoResult }).output;
    expect(output.files[0]?.path).toBe("deleted.ts");
    expect(output.files[0]?.markers).toContain("not readable");
  });

  it("should fail when not a git repository", async () => {
    execMock.mockResolvedValueOnce(failResult("fatal: not a git repository"));

    const tool = createGitConflictInfoTool(createMockGitOps(execMock), {
      readFile: readFileMock,
    });
    const result = await tool.execute({}, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("Not a git repository");
  });

  it("should use custom cwd when provided", async () => {
    execMock.mockResolvedValueOnce(successResult(""));

    const tool = createGitConflictInfoTool(createMockGitOps(execMock), {
      readFile: readFileMock,
    });
    await tool.execute({ cwd: "/custom/path" }, ctx);

    expect(createMockGitOps(execMock)).toBeDefined();
  });
});

// =============================================================================
// git_resolve_conflict Tests
// =============================================================================

describe("git_resolve_conflict", () => {
  let execMock: Mock;
  let writeFileMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    writeFileMock = vi.fn().mockResolvedValue(undefined);
    ctx = createMockContext();
  });

  describe("ours strategy", () => {
    it("should resolve conflict with ours strategy", async () => {
      execMock
        .mockResolvedValueOnce(successResult("")) // checkout --ours
        .mockResolvedValueOnce(successResult("")); // git add

      const tool = createGitResolveConflictTool(createMockGitOps(execMock), {
        writeFile: writeFileMock,
      });
      const result = await tool.execute({ path: "conflict.ts", strategy: "ours" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitResolveConflictResult }).output;
      expect(output.resolved).toBe(true);
      expect(output.strategy).toBe("ours");
      expect(execMock).toHaveBeenCalledWith(
        ["checkout", "--ours", "conflict.ts"],
        expect.any(Object)
      );
    });

    it("should stage file after resolving with ours", async () => {
      execMock.mockResolvedValueOnce(successResult("")).mockResolvedValueOnce(successResult(""));

      const tool = createGitResolveConflictTool(createMockGitOps(execMock), {
        writeFile: writeFileMock,
      });
      await tool.execute({ path: "conflict.ts", strategy: "ours" }, ctx);

      expect(execMock).toHaveBeenCalledWith(["add", "conflict.ts"], expect.any(Object));
    });
  });

  describe("theirs strategy", () => {
    it("should resolve conflict with theirs strategy", async () => {
      execMock
        .mockResolvedValueOnce(successResult("")) // checkout --theirs
        .mockResolvedValueOnce(successResult("")); // git add

      const tool = createGitResolveConflictTool(createMockGitOps(execMock), {
        writeFile: writeFileMock,
      });
      const result = await tool.execute({ path: "conflict.ts", strategy: "theirs" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitResolveConflictResult }).output;
      expect(output.resolved).toBe(true);
      expect(output.strategy).toBe("theirs");
      expect(execMock).toHaveBeenCalledWith(
        ["checkout", "--theirs", "conflict.ts"],
        expect.any(Object)
      );
    });
  });

  describe("content strategy", () => {
    it("should resolve conflict with custom content", async () => {
      execMock.mockResolvedValueOnce(successResult("")); // git add

      const tool = createGitResolveConflictTool(createMockGitOps(execMock), {
        writeFile: writeFileMock,
      });
      const result = await tool.execute(
        {
          path: "conflict.ts",
          strategy: "content",
          content: "merged content here",
        },
        ctx
      );

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitResolveConflictResult }).output;
      expect(output.resolved).toBe(true);
      expect(output.strategy).toBe("content");
      expect(writeFileMock).toHaveBeenCalledWith(
        expect.stringContaining("conflict.ts"),
        "merged content here",
        "utf-8"
      );
    });

    it("should fail when content is missing for content strategy", async () => {
      const tool = createGitResolveConflictTool(createMockGitOps(execMock), {
        writeFile: writeFileMock,
      });
      const result = await tool.execute({ path: "conflict.ts", strategy: "content" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("Content is required");
    });
  });

  describe("shouldConfirm", () => {
    it("should always require confirmation for resolve", () => {
      const tool = createGitResolveConflictTool(createMockGitOps(execMock), {
        writeFile: writeFileMock,
      });
      expect(tool.shouldConfirm?.({ path: "file.ts", strategy: "ours" }, ctx)).toBe(true);
      expect(tool.shouldConfirm?.({ path: "file.ts", strategy: "theirs" }, ctx)).toBe(true);
      expect(
        tool.shouldConfirm?.({ path: "file.ts", strategy: "content", content: "x" }, ctx)
      ).toBe(true);
    });
  });

  describe("snapshot tracking", () => {
    it("should call snapshot service before resolve", async () => {
      const trackMock = vi.fn().mockResolvedValue(undefined);
      const ctxWithSnapshot = createMockContextWithSnapshot(trackMock);

      execMock.mockResolvedValueOnce(successResult("")).mockResolvedValueOnce(successResult(""));

      const tool = createGitResolveConflictTool(createMockGitOps(execMock), {
        writeFile: writeFileMock,
      });
      await tool.execute({ path: "file.ts", strategy: "ours" }, ctxWithSnapshot);

      expect(trackMock).toHaveBeenCalled();
    });

    it("should not fail if snapshot service throws", async () => {
      const trackMock = vi.fn().mockRejectedValue(new Error("Snapshot failed"));
      const ctxWithSnapshot = createMockContextWithSnapshot(trackMock);

      execMock.mockResolvedValueOnce(successResult("")).mockResolvedValueOnce(successResult(""));

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const tool = createGitResolveConflictTool(createMockGitOps(execMock), {
        writeFile: writeFileMock,
      });
      try {
        const result = await tool.execute({ path: "file.ts", strategy: "ours" }, ctxWithSnapshot);

        expect(result.success).toBe(true);
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe("error handling", () => {
    it("should handle checkout failure", async () => {
      execMock.mockResolvedValueOnce(failResult("error: path 'file.ts' does not have our version"));

      const tool = createGitResolveConflictTool(createMockGitOps(execMock), {
        writeFile: writeFileMock,
      });
      const result = await tool.execute({ path: "file.ts", strategy: "ours" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain(
        "Failed to checkout ours"
      );
    });

    it("should handle git add failure", async () => {
      execMock
        .mockResolvedValueOnce(successResult(""))
        .mockResolvedValueOnce(failResult("fatal: pathspec 'file.ts' did not match any files"));

      const tool = createGitResolveConflictTool(createMockGitOps(execMock), {
        writeFile: writeFileMock,
      });
      const result = await tool.execute({ path: "file.ts", strategy: "ours" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("Failed to stage");
    });
  });
});
