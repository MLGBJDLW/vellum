// ============================================
// Git Write Tools Tests - T012
// ============================================

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ToolContext } from "../../../types/tool.js";
// Import branch tools and types
import {
  createGitBranchTool,
  createGitCheckoutTool,
  createGitMergeTool,
  type GitBranchListResult,
  type GitBranchMutateResult,
  type GitCheckoutResult,
  type GitMergeResult,
  parseBranchListOutput,
  parseConflictFiles,
} from "../branch.js";

// Import commit tool and types
import { createGitCommitTool, type GitCommitResult } from "../commit.js";
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

// =============================================================================
// git_commit Tests
// =============================================================================

describe("git_commit", () => {
  describe("tool execution", () => {
    let execMock: Mock;
    let ctx: ToolContext;

    beforeEach(() => {
      execMock = vi.fn();
      ctx = createMockContext();
    });

    it("should commit with provided message", async () => {
      execMock
        .mockResolvedValueOnce(failResult("", 1)) // diff --cached --quiet (has changes)
        .mockResolvedValueOnce(successResult("[main abc1234] Test commit message"));

      const tool = createGitCommitTool(createMockGitOps(execMock));
      const result = await tool.execute({ message: "Test commit message" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitCommitResult }).output;
      expect(output.hash).toBe("abc1234");
      expect(output.message).toBe("Test commit message");
    });

    it("should auto-generate message when omitted", async () => {
      execMock
        .mockResolvedValueOnce(failResult("", 1)) // diff --cached --quiet (has changes)
        .mockResolvedValueOnce(
          successResult(" src/file.ts | 10 ++++\n 1 file changed, 10 insertions(+)")
        ) // diff --cached --stat
        .mockResolvedValueOnce(successResult("[main def5678] Update src/file.ts"));

      const tool = createGitCommitTool(createMockGitOps(execMock));
      const result = await tool.execute({}, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitCommitResult }).output;
      expect(output.hash).toBe("def5678");
      expect(output.message).toContain("src/file.ts");
    });

    it("should stage all with --all flag", async () => {
      execMock
        .mockResolvedValueOnce(successResult("")) // add -A
        .mockResolvedValueOnce(failResult("", 1)) // diff --cached --quiet (has changes)
        .mockResolvedValueOnce(successResult("[main 1234567] Staged all"));

      const tool = createGitCommitTool(createMockGitOps(execMock));
      const result = await tool.execute({ message: "Staged all", all: true }, ctx);

      expect(result.success).toBe(true);
      expect(execMock).toHaveBeenCalledWith(["add", "-A"], expect.any(Object));
    });

    it("should return error when nothing staged", async () => {
      execMock.mockResolvedValueOnce(successResult("")); // diff --cached --quiet (no changes)

      const tool = createGitCommitTool(createMockGitOps(execMock));
      const result = await tool.execute({ message: "Test" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("No staged changes");
    });

    it("should call snapshot service before commit", async () => {
      const trackMock = vi.fn().mockResolvedValue(undefined);
      const ctxWithSnapshot = createMockContextWithSnapshot(trackMock);

      execMock
        .mockResolvedValueOnce(failResult("", 1)) // diff --cached --quiet (has changes)
        .mockResolvedValueOnce(successResult("[main abc1234] Test"));

      const tool = createGitCommitTool(createMockGitOps(execMock));
      await tool.execute({ message: "Test" }, ctxWithSnapshot);

      expect(trackMock).toHaveBeenCalled();
    });

    it("should not fail if snapshot service throws", async () => {
      const trackMock = vi.fn().mockRejectedValue(new Error("Snapshot failed"));
      const ctxWithSnapshot = createMockContextWithSnapshot(trackMock);

      execMock
        .mockResolvedValueOnce(failResult("", 1)) // diff --cached --quiet (has changes)
        .mockResolvedValueOnce(successResult("[main abc1234] Test"));

      const tool = createGitCommitTool(createMockGitOps(execMock));
      const result = await tool.execute({ message: "Test" }, ctxWithSnapshot);

      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// git_branch Tests
// =============================================================================

describe("git_branch", () => {
  describe("parseBranchListOutput", () => {
    it("should parse local branches", () => {
      const output = "* main\n  feature/test\n  develop";
      const result = parseBranchListOutput(output);

      expect(result.branches).toHaveLength(3);
      expect(result.current).toBe("main");
      expect(result.branches.find((b) => b.name === "main")?.current).toBe(true);
      expect(result.branches.find((b) => b.name === "feature/test")?.current).toBe(false);
    });

    it("should parse remote branches", () => {
      const output = "* main\n  remotes/origin/main\n  remotes/origin/feature";
      const result = parseBranchListOutput(output);

      expect(result.branches).toHaveLength(3);
      const remoteBranch = result.branches.find((b) => b.name === "origin/main");
      expect(remoteBranch?.remote).toBe(true);
    });

    it("should skip HEAD -> refs", () => {
      const output = "* main\n  remotes/origin/HEAD -> origin/main\n  remotes/origin/main";
      const result = parseBranchListOutput(output);

      expect(result.branches.every((b) => !b.name.includes("->"))).toBe(true);
    });
  });

  describe("tool execution", () => {
    let execMock: Mock;
    let ctx: ToolContext;

    beforeEach(() => {
      execMock = vi.fn();
      ctx = createMockContext();
    });

    it("should list branches", async () => {
      execMock.mockResolvedValueOnce(successResult("* main\n  develop\n  feature/test"));

      const tool = createGitBranchTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "list" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitBranchListResult }).output;
      expect(output.branches).toHaveLength(3);
      expect(output.current).toBe("main");
    });

    it("should list remote branches with remote flag", async () => {
      execMock.mockResolvedValueOnce(
        successResult("* main\n  remotes/origin/main\n  remotes/origin/develop")
      );

      const tool = createGitBranchTool(createMockGitOps(execMock));
      await tool.execute({ action: "list", remote: true }, ctx);

      expect(execMock).toHaveBeenCalledWith(["branch", "-a"], expect.any(Object));
    });

    it("should create branch", async () => {
      execMock
        .mockResolvedValueOnce(failResult("", 128)) // rev-parse (branch doesn't exist)
        .mockResolvedValueOnce(successResult(""));

      const tool = createGitBranchTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "create", name: "new-branch" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitBranchMutateResult }).output;
      expect(output.branch).toBe("new-branch");
    });

    it("should error when branch already exists", async () => {
      execMock.mockResolvedValueOnce(successResult("abc123")); // rev-parse (branch exists)

      const tool = createGitBranchTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "create", name: "existing-branch" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("already exists");
    });

    it("should delete branch with confirm flag", async () => {
      execMock.mockResolvedValueOnce(successResult("Deleted branch feature-to-delete"));

      const tool = createGitBranchTool(createMockGitOps(execMock));

      // Check shouldConfirm
      expect(tool.shouldConfirm?.({ action: "delete", name: "feature-to-delete" }, ctx)).toBe(true);

      const result = await tool.execute({ action: "delete", name: "feature-to-delete" }, ctx);

      expect(result.success).toBe(true);
      expect(execMock).toHaveBeenCalledWith(
        ["branch", "-d", "feature-to-delete"],
        expect.any(Object)
      );
    });

    it("should force delete branch", async () => {
      execMock.mockResolvedValueOnce(successResult("Deleted branch unmerged"));

      const tool = createGitBranchTool(createMockGitOps(execMock));
      await tool.execute({ action: "delete", name: "unmerged", force: true }, ctx);

      expect(execMock).toHaveBeenCalledWith(["branch", "-D", "unmerged"], expect.any(Object));
    });

    it("should rename branch", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitBranchTool(createMockGitOps(execMock));
      const result = await tool.execute(
        { action: "rename", name: "old-name", newName: "new-name" },
        ctx
      );

      expect(result.success).toBe(true);
      expect(execMock).toHaveBeenCalledWith(
        ["branch", "-m", "old-name", "new-name"],
        expect.any(Object)
      );
    });

    it("should call snapshot service for write operations", async () => {
      const trackMock = vi.fn().mockResolvedValue(undefined);
      const ctxWithSnapshot = createMockContextWithSnapshot(trackMock);

      execMock
        .mockResolvedValueOnce(failResult("", 128)) // rev-parse
        .mockResolvedValueOnce(successResult(""));

      const tool = createGitBranchTool(createMockGitOps(execMock));
      await tool.execute({ action: "create", name: "test" }, ctxWithSnapshot);

      expect(trackMock).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// git_checkout Tests
// =============================================================================

describe("git_checkout", () => {
  describe("tool execution", () => {
    let execMock: Mock;
    let ctx: ToolContext;

    beforeEach(() => {
      execMock = vi.fn();
      ctx = createMockContext();
    });

    it("should switch to existing branch", async () => {
      execMock
        .mockResolvedValueOnce(successResult("")) // status --porcelain (clean)
        .mockResolvedValueOnce(successResult("Switched to branch 'develop'"));

      const tool = createGitCheckoutTool(createMockGitOps(execMock));
      const result = await tool.execute({ target: "develop" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitCheckoutResult }).output;
      expect(output.ref).toBe("develop");
      expect(output.created).toBe(false);
    });

    it("should create and switch with create flag", async () => {
      execMock
        .mockResolvedValueOnce(successResult("")) // status --porcelain (clean)
        .mockResolvedValueOnce(successResult("Switched to a new branch 'feature/new'"));

      const tool = createGitCheckoutTool(createMockGitOps(execMock));
      const result = await tool.execute({ target: "feature/new", create: true }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitCheckoutResult }).output;
      expect(output.ref).toBe("feature/new");
      expect(output.created).toBe(true);
    });

    it("should restore specific files", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitCheckoutTool(createMockGitOps(execMock));
      const result = await tool.execute(
        { target: "HEAD", paths: ["src/file.ts", "src/other.ts"] },
        ctx
      );

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitCheckoutResult }).output;
      expect(output.restoredFiles).toEqual(["src/file.ts", "src/other.ts"]);
      expect(execMock).toHaveBeenCalledWith(
        ["checkout", "HEAD", "--", "src/file.ts", "src/other.ts"],
        expect.any(Object)
      );
    });

    it("should error on dirty workdir", async () => {
      execMock.mockResolvedValueOnce(successResult(" M modified.ts\n")); // status shows modified

      const tool = createGitCheckoutTool(createMockGitOps(execMock));
      const result = await tool.execute({ target: "main" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("uncommitted changes");
    });

    it("should allow dirty workdir with force", async () => {
      execMock.mockResolvedValueOnce(successResult("Switched to branch 'main'"));

      const tool = createGitCheckoutTool(createMockGitOps(execMock));

      // Check shouldConfirm
      expect(tool.shouldConfirm?.({ target: "main", force: true }, ctx)).toBe(true);

      const result = await tool.execute({ target: "main", force: true }, ctx);

      expect(result.success).toBe(true);
      expect(execMock).toHaveBeenCalledWith(["checkout", "-f", "main"], expect.any(Object));
    });

    it("should call snapshot service", async () => {
      const trackMock = vi.fn().mockResolvedValue(undefined);
      const ctxWithSnapshot = createMockContextWithSnapshot(trackMock);

      execMock
        .mockResolvedValueOnce(successResult("")) // status clean
        .mockResolvedValueOnce(successResult("Switched"));

      const tool = createGitCheckoutTool(createMockGitOps(execMock));
      await tool.execute({ target: "main" }, ctxWithSnapshot);

      expect(trackMock).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// git_merge Tests
// =============================================================================

describe("git_merge", () => {
  describe("parseConflictFiles", () => {
    it("should parse UU conflict status", () => {
      const output = "UU conflicted.ts\nM  staged.ts\n?? untracked.ts";
      const conflicts = parseConflictFiles(output);

      expect(conflicts).toEqual(["conflicted.ts"]);
    });

    it("should parse various conflict markers", () => {
      const output = "UU both-modified.ts\nAA both-added.ts\nDU deleted-ours.ts";
      const conflicts = parseConflictFiles(output);

      expect(conflicts).toHaveLength(3);
      expect(conflicts).toContain("both-modified.ts");
      expect(conflicts).toContain("both-added.ts");
      expect(conflicts).toContain("deleted-ours.ts");
    });
  });

  describe("tool execution", () => {
    let execMock: Mock;
    let ctx: ToolContext;

    beforeEach(() => {
      execMock = vi.fn();
      ctx = createMockContext();
    });

    it("should merge branch successfully", async () => {
      execMock.mockResolvedValueOnce(successResult("Merge made by the 'recursive' strategy."));

      const tool = createGitMergeTool(createMockGitOps(execMock));

      // Check shouldConfirm is always true for merge
      expect(tool.shouldConfirm?.({ branch: "feature" }, ctx)).toBe(true);

      const result = await tool.execute({ branch: "feature" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitMergeResult }).output;
      expect(output.success).toBe(true);
      expect(output.fastForward).toBe(false);
    });

    it("should handle fast-forward merge", async () => {
      execMock.mockResolvedValueOnce(successResult("Fast-forward\n abc123..def456"));

      const tool = createGitMergeTool(createMockGitOps(execMock));
      const result = await tool.execute({ branch: "feature" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitMergeResult }).output;
      expect(output.fastForward).toBe(true);
    });

    it("should use --no-ff flag", async () => {
      execMock.mockResolvedValueOnce(successResult("Merge made by the 'recursive' strategy."));

      const tool = createGitMergeTool(createMockGitOps(execMock));
      await tool.execute({ branch: "feature", noFf: true }, ctx);

      expect(execMock).toHaveBeenCalledWith(["merge", "--no-ff", "feature"], expect.any(Object));
    });

    it("should abort in-progress merge", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitMergeTool(createMockGitOps(execMock));
      const result = await tool.execute({ branch: "unused", abort: true }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitMergeResult }).output;
      expect(output.message).toContain("aborted");
      expect(execMock).toHaveBeenCalledWith(["merge", "--abort"], expect.any(Object));
    });

    it("should detect conflicts", async () => {
      execMock
        .mockResolvedValueOnce({
          stdout:
            "Auto-merging file.ts\nCONFLICT (content): Merge conflict in file.ts\nAutomatic merge failed",
          stderr: "",
          exitCode: 1,
        })
        .mockResolvedValueOnce(successResult("UU file.ts\nUU other.ts")); // status for conflicts

      const tool = createGitMergeTool(createMockGitOps(execMock));
      const result = await tool.execute({ branch: "conflicting" }, ctx);

      expect(result.success).toBe(true); // Returns success with conflict info
      const output = (result as { success: true; output: GitMergeResult }).output;
      expect(output.success).toBe(false);
      expect(output.conflicts).toContain("file.ts");
      expect(output.conflicts).toContain("other.ts");
    });

    it("should use custom merge message", async () => {
      execMock.mockResolvedValueOnce(successResult("Merge made"));

      const tool = createGitMergeTool(createMockGitOps(execMock));
      await tool.execute({ branch: "feature", message: "Merge feature branch" }, ctx);

      expect(execMock).toHaveBeenCalledWith(
        ["merge", "-m", "Merge feature branch", "feature"],
        expect.any(Object)
      );
    });

    it("should call snapshot service", async () => {
      const trackMock = vi.fn().mockResolvedValue(undefined);
      const ctxWithSnapshot = createMockContextWithSnapshot(trackMock);

      execMock.mockResolvedValueOnce(successResult("Merge made"));

      const tool = createGitMergeTool(createMockGitOps(execMock));
      await tool.execute({ branch: "feature" }, ctxWithSnapshot);

      expect(trackMock).toHaveBeenCalled();
    });

    it("should error when abort with no merge in progress", async () => {
      execMock.mockResolvedValueOnce(
        failResult("fatal: There is no merge to abort (MERGE_HEAD missing).")
      );

      const tool = createGitMergeTool(createMockGitOps(execMock));
      const result = await tool.execute({ branch: "unused", abort: true }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("No merge in progress");
    });
  });
});

// =============================================================================
// Snapshot Integration Tests (T011)
// =============================================================================

describe("snapshot integration", () => {
  it("should call snapshotService.track() before git_commit", async () => {
    const trackMock = vi.fn().mockResolvedValue(undefined);
    const ctx = createMockContextWithSnapshot(trackMock);
    const execMock = vi
      .fn()
      .mockResolvedValueOnce(failResult("", 1)) // has staged changes
      .mockResolvedValueOnce(successResult("[main abc123] Test"));

    const tool = createGitCommitTool(createMockGitOps(execMock));
    await tool.execute({ message: "Test" }, ctx);

    expect(trackMock).toHaveBeenCalledTimes(1);
    // Ensure snapshot was called before commit
    const trackOrder = trackMock.mock.invocationCallOrder[0];
    const execOrder = execMock.mock.invocationCallOrder[1];
    expect(trackOrder).toBeDefined();
    expect(execOrder).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: values verified as defined above
    expect(trackOrder!).toBeLessThan(execOrder!);
  });

  it("should call snapshotService.track() before git_checkout", async () => {
    const trackMock = vi.fn().mockResolvedValue(undefined);
    const ctx = createMockContextWithSnapshot(trackMock);
    const execMock = vi
      .fn()
      .mockResolvedValueOnce(successResult("")) // clean status
      .mockResolvedValueOnce(successResult("Switched"));

    const tool = createGitCheckoutTool(createMockGitOps(execMock));
    await tool.execute({ target: "main" }, ctx);

    expect(trackMock).toHaveBeenCalled();
  });

  it("should call snapshotService.track() before git_merge", async () => {
    const trackMock = vi.fn().mockResolvedValue(undefined);
    const ctx = createMockContextWithSnapshot(trackMock);
    const execMock = vi.fn().mockResolvedValueOnce(successResult("Merge made"));

    const tool = createGitMergeTool(createMockGitOps(execMock));
    await tool.execute({ branch: "feature" }, ctx);

    expect(trackMock).toHaveBeenCalled();
  });

  it("should call snapshotService.track() before git_branch create", async () => {
    const trackMock = vi.fn().mockResolvedValue(undefined);
    const ctx = createMockContextWithSnapshot(trackMock);
    const execMock = vi
      .fn()
      .mockResolvedValueOnce(failResult("", 128)) // branch doesn't exist
      .mockResolvedValueOnce(successResult(""));

    const tool = createGitBranchTool(createMockGitOps(execMock));
    await tool.execute({ action: "create", name: "new-branch" }, ctx);

    expect(trackMock).toHaveBeenCalled();
  });

  it("should not fail operations if snapshot service throws", async () => {
    const trackMock = vi.fn().mockRejectedValue(new Error("Snapshot service unavailable"));
    const ctx = createMockContextWithSnapshot(trackMock);
    const execMock = vi
      .fn()
      .mockResolvedValueOnce(failResult("", 1))
      .mockResolvedValueOnce(successResult("[main abc123] Test"));

    // Suppress console.warn for this test
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const tool = createGitCommitTool(createMockGitOps(execMock));
    const result = await tool.execute({ message: "Test" }, ctx);

    expect(result.success).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("should work when snapshotService is not available", async () => {
    const ctx = createMockContext(); // No snapshot service
    const execMock = vi
      .fn()
      .mockResolvedValueOnce(failResult("", 1))
      .mockResolvedValueOnce(successResult("[main abc123] Test"));

    const tool = createGitCommitTool(createMockGitOps(execMock));
    const result = await tool.execute({ message: "Test" }, ctx);

    expect(result.success).toBe(true);
  });
});

// =============================================================================
// shouldConfirm Flag Tests
// =============================================================================

describe("shouldConfirm flag", () => {
  let ctx: ToolContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it("git_branch delete should require confirmation", () => {
    const execMock = vi.fn();
    const tool = createGitBranchTool(createMockGitOps(execMock));

    expect(tool.shouldConfirm?.({ action: "delete", name: "branch" }, ctx)).toBe(true);
    expect(tool.shouldConfirm?.({ action: "list" }, ctx)).toBe(false);
    expect(tool.shouldConfirm?.({ action: "create", name: "branch" }, ctx)).toBe(false);
  });

  it("git_checkout force should require confirmation", () => {
    const execMock = vi.fn();
    const tool = createGitCheckoutTool(createMockGitOps(execMock));

    expect(tool.shouldConfirm?.({ target: "main", force: true }, ctx)).toBe(true);
    expect(tool.shouldConfirm?.({ target: "main" }, ctx)).toBe(false);
  });

  it("git_merge should always require confirmation", () => {
    const execMock = vi.fn();
    const tool = createGitMergeTool(createMockGitOps(execMock));

    expect(tool.shouldConfirm?.({ branch: "feature" }, ctx)).toBe(true);
    expect(tool.shouldConfirm?.({ branch: "feature", noFf: true }, ctx)).toBe(true);
    expect(tool.shouldConfirm?.({ branch: "feature", abort: true }, ctx)).toBe(true);
  });
});
