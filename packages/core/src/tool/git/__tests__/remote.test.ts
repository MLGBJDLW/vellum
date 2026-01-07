// ============================================
// Git Network Tools Tests - T018
// ============================================
// biome-ignore-all lint/suspicious/noExplicitAny: Test file - mock and partial type assertions

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ToolContext } from "../../../types/tool.js";
import {
  createGitFetchTool,
  createGitPullTool,
  createGitPushTool,
  createGitRemoteTool,
  type GitFetchResult,
  type GitPullResult,
  type GitPushResult,
  type GitRemoteListResult,
  type GitRemoteMutateResult,
  parseConflictFilesFromOutput,
  parseFilesUpdated,
  parseRemoteVerboseOutput,
} from "../remote.js";
import type { GitExecResult } from "../types.js";
import { GIT_TIMEOUTS } from "../types.js";

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
// Parse Helper Tests
// =============================================================================

describe("parseRemoteVerboseOutput", () => {
  it("should return empty array for empty output", () => {
    const result = parseRemoteVerboseOutput("");
    expect(result).toEqual([]);
  });

  it("should parse single remote with fetch and push URLs", () => {
    const output = `origin\thttps://github.com/user/repo.git (fetch)
origin\thttps://github.com/user/repo.git (push)`;
    const result = parseRemoteVerboseOutput(output);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "origin",
      fetchUrl: "https://github.com/user/repo.git",
      pushUrl: "https://github.com/user/repo.git",
    });
  });

  it("should parse multiple remotes", () => {
    const output = `origin\thttps://github.com/user/repo.git (fetch)
origin\thttps://github.com/user/repo.git (push)
upstream\thttps://github.com/original/repo.git (fetch)
upstream\thttps://github.com/original/repo.git (push)`;
    const result = parseRemoteVerboseOutput(output);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("origin");
    expect(result[1]?.name).toBe("upstream");
  });

  it("should handle different fetch and push URLs", () => {
    const output = `origin\thttps://github.com/user/repo.git (fetch)
origin\tgit@github.com:user/repo.git (push)`;
    const result = parseRemoteVerboseOutput(output);
    expect(result).toHaveLength(1);
    expect(result[0]?.fetchUrl).toBe("https://github.com/user/repo.git");
    expect(result[0]?.pushUrl).toBe("git@github.com:user/repo.git");
  });
});

describe("parseConflictFilesFromOutput", () => {
  it("should return empty array for no conflicts", () => {
    const result = parseConflictFilesFromOutput("Already up to date.");
    expect(result).toEqual([]);
  });

  it("should parse content conflicts", () => {
    const output = `Auto-merging file.ts
CONFLICT (content): Merge conflict in file.ts
Automatic merge failed; fix conflicts and then commit the result.`;
    const result = parseConflictFilesFromOutput(output);
    expect(result).toContain("file.ts");
  });

  it("should parse add/add conflicts", () => {
    const output = `CONFLICT (add/add): Merge conflict in new-file.ts`;
    const result = parseConflictFilesFromOutput(output);
    expect(result).toContain("new-file.ts");
  });

  it("should parse multiple conflicts", () => {
    const output = `CONFLICT (content): Merge conflict in file1.ts
CONFLICT (content): Merge conflict in file2.ts
CONFLICT (add/add): Merge conflict in file3.ts`;
    const result = parseConflictFilesFromOutput(output);
    expect(result).toHaveLength(3);
    expect(result).toContain("file1.ts");
    expect(result).toContain("file2.ts");
    expect(result).toContain("file3.ts");
  });
});

describe("parseFilesUpdated", () => {
  it("should return undefined for non-matching output", () => {
    const result = parseFilesUpdated("Already up to date.");
    expect(result).toBeUndefined();
  });

  it("should parse single file changed", () => {
    const result = parseFilesUpdated(" 1 file changed, 10 insertions(+)");
    expect(result).toBe(1);
  });

  it("should parse multiple files changed", () => {
    const result = parseFilesUpdated(" 5 files changed, 100 insertions(+), 50 deletions(-)");
    expect(result).toBe(5);
  });
});

// =============================================================================
// git_fetch Tests
// =============================================================================

describe("git_fetch", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  it("should fetch from origin by default", async () => {
    execMock.mockResolvedValueOnce(
      successResult("", "From github.com:user/repo\n * branch main -> FETCH_HEAD")
    );

    const tool = createGitFetchTool(createMockGitOps(execMock));
    const result = await tool.execute({ remote: "origin" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitFetchResult }).output;
    expect(output.remote).toBe("origin");
    expect(execMock).toHaveBeenCalledWith(
      ["fetch", "origin"],
      expect.objectContaining({ timeout: GIT_TIMEOUTS.NETWORK })
    );
  });

  it("should use 30s timeout (GIT_TIMEOUTS.NETWORK)", async () => {
    execMock.mockResolvedValueOnce(successResult(""));

    const tool = createGitFetchTool(createMockGitOps(execMock));
    await tool.execute({ remote: "origin" }, ctx);

    expect(execMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ timeout: 30000 })
    );
  });

  it("should fetch specific branch", async () => {
    execMock.mockResolvedValueOnce(successResult(""));

    const tool = createGitFetchTool(createMockGitOps(execMock));
    await tool.execute({ remote: "origin", branch: "feature" }, ctx);

    expect(execMock).toHaveBeenCalledWith(["fetch", "origin", "feature"], expect.any(Object));
  });

  it("should fetch all remotes when all flag is set", async () => {
    execMock.mockResolvedValueOnce(successResult(""));

    const tool = createGitFetchTool(createMockGitOps(execMock));
    const result = await tool.execute({ remote: "origin", all: true }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitFetchResult }).output;
    expect(output.remote).toBe("all");
    expect(execMock).toHaveBeenCalledWith(["fetch", "--all"], expect.any(Object));
  });

  it("should prune deleted branches when prune flag is set", async () => {
    execMock.mockResolvedValueOnce(successResult(""));

    const tool = createGitFetchTool(createMockGitOps(execMock));
    const result = await tool.execute({ remote: "origin", prune: true }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitFetchResult }).output;
    expect(output.pruned).toBe(true);
    expect(execMock).toHaveBeenCalledWith(["fetch", "origin", "--prune"], expect.any(Object));
  });

  it("should return error for not a git repository", async () => {
    execMock.mockResolvedValueOnce(failResult("fatal: not a git repository"));

    const tool = createGitFetchTool(createMockGitOps(execMock));
    const result = await tool.execute({ remote: "origin" }, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("Not a git repository");
  });

  it("should return error on remote connection failure (ErrorCode 7034)", async () => {
    execMock.mockResolvedValueOnce(failResult("fatal: Could not resolve host: github.com"));

    const tool = createGitFetchTool(createMockGitOps(execMock));
    const result = await tool.execute({ remote: "origin" }, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("Git remote error");
  });
});

// =============================================================================
// git_pull Tests
// =============================================================================

describe("git_pull", () => {
  let execMock: Mock;
  let ctx: ToolContext;
  let snapshotMock: Mock;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
    snapshotMock = vi.fn().mockResolvedValue(undefined);
  });

  it("should pull from origin by default", async () => {
    execMock.mockResolvedValueOnce(successResult("Already up to date."));

    const tool = createGitPullTool(createMockGitOps(execMock), snapshotMock);
    const result = await tool.execute({ remote: "origin" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitPullResult }).output;
    expect(output.remote).toBe("origin");
    expect(execMock).toHaveBeenCalledWith(
      ["pull", "origin"],
      expect.objectContaining({ timeout: GIT_TIMEOUTS.NETWORK })
    );
  });

  it("should use 30s timeout (GIT_TIMEOUTS.NETWORK)", async () => {
    execMock.mockResolvedValueOnce(successResult("Already up to date."));

    const tool = createGitPullTool(createMockGitOps(execMock), snapshotMock);
    await tool.execute({ remote: "origin" }, ctx);

    expect(execMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ timeout: 30000 })
    );
  });

  it("should call snapshot before pull", async () => {
    execMock.mockResolvedValueOnce(successResult("Already up to date."));

    const tool = createGitPullTool(createMockGitOps(execMock), snapshotMock);
    await tool.execute({ remote: "origin" }, ctx);

    expect(snapshotMock).toHaveBeenCalledTimes(1);
    // Verify snapshot was called before exec
    expect(snapshotMock.mock.invocationCallOrder[0]).toBeLessThan(
      execMock.mock.invocationCallOrder[0] ?? Infinity
    );
  });

  it("should use rebase when flag is set", async () => {
    execMock.mockResolvedValueOnce(successResult("Successfully rebased"));

    const tool = createGitPullTool(createMockGitOps(execMock), snapshotMock);
    const result = await tool.execute({ remote: "origin", rebase: true }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitPullResult }).output;
    expect(output.rebased).toBe(true);
    expect(execMock).toHaveBeenCalledWith(["pull", "--rebase", "origin"], expect.any(Object));
  });

  it("should pull specific branch", async () => {
    execMock.mockResolvedValueOnce(successResult("Already up to date."));

    const tool = createGitPullTool(createMockGitOps(execMock), snapshotMock);
    await tool.execute({ remote: "upstream", branch: "main" }, ctx);

    expect(execMock).toHaveBeenCalledWith(["pull", "upstream", "main"], expect.any(Object));
  });

  it("should return error on conflict (ErrorCode 7030)", async () => {
    execMock.mockResolvedValueOnce({
      stdout: "CONFLICT (content): Merge conflict in file.ts\nAutomatic merge failed",
      stderr: "",
      exitCode: 1,
    });

    const tool = createGitPullTool(createMockGitOps(execMock), snapshotMock);
    const result = await tool.execute({ remote: "origin" }, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("Conflict");
  });

  it("should return files updated count", async () => {
    execMock.mockResolvedValueOnce(
      successResult("Fast-forward\n 3 files changed, 50 insertions(+), 10 deletions(-)")
    );

    const tool = createGitPullTool(createMockGitOps(execMock), snapshotMock);
    const result = await tool.execute({ remote: "origin" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitPullResult }).output;
    expect(output.filesUpdated).toBe(3);
  });

  it("should return error on remote connection failure (ErrorCode 7034)", async () => {
    execMock.mockResolvedValueOnce(failResult("fatal: Could not read from remote repository"));

    const tool = createGitPullTool(createMockGitOps(execMock), snapshotMock);
    const result = await tool.execute({ remote: "origin" }, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("Git remote error");
  });
});

// =============================================================================
// git_push Tests
// =============================================================================

describe("git_push", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  it("should push to origin by default", async () => {
    execMock.mockResolvedValueOnce(successResult("", "Everything up-to-date"));

    const tool = createGitPushTool(createMockGitOps(execMock));
    const result = await tool.execute({ remote: "origin" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitPushResult }).output;
    expect(output.remote).toBe("origin");
    expect(execMock).toHaveBeenCalledWith(
      ["push", "origin"],
      expect.objectContaining({ timeout: GIT_TIMEOUTS.NETWORK })
    );
  });

  it("should use 30s timeout (GIT_TIMEOUTS.NETWORK)", async () => {
    execMock.mockResolvedValueOnce(successResult(""));

    const tool = createGitPushTool(createMockGitOps(execMock));
    await tool.execute({ remote: "origin" }, ctx);

    expect(execMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ timeout: 30000 })
    );
  });

  it("should require confirmation for force push (shouldConfirm: true)", async () => {
    const tool = createGitPushTool(createMockGitOps(execMock));

    // Check the shouldConfirm function - use type assertion for partial inputs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shouldConfirm = tool.shouldConfirm as (input: any) => boolean;
    expect(shouldConfirm({ remote: "origin", force: true })).toBe(true);
    expect(shouldConfirm({ remote: "origin", force: false })).toBe(false);
    expect(shouldConfirm({ remote: "origin" })).toBe(false);
  });

  it("should use force flag when set", async () => {
    execMock.mockResolvedValueOnce(successResult(""));

    const tool = createGitPushTool(createMockGitOps(execMock));
    const result = await tool.execute({ remote: "origin", force: true }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitPushResult }).output;
    expect(output.forced).toBe(true);
    expect(execMock).toHaveBeenCalledWith(["push", "--force", "origin"], expect.any(Object));
  });

  it("should set upstream when flag is set", async () => {
    execMock.mockResolvedValueOnce(successResult(""));

    const tool = createGitPushTool(createMockGitOps(execMock));
    await tool.execute({ remote: "origin", setUpstream: true, branch: "feature" }, ctx);

    expect(execMock).toHaveBeenCalledWith(
      ["push", "--set-upstream", "origin", "feature"],
      expect.any(Object)
    );
  });

  it("should push specific branch", async () => {
    execMock.mockResolvedValueOnce(successResult(""));

    const tool = createGitPushTool(createMockGitOps(execMock));
    const result = await tool.execute({ remote: "upstream", branch: "main" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitPushResult }).output;
    expect(output.branch).toBe("main");
    expect(execMock).toHaveBeenCalledWith(["push", "upstream", "main"], expect.any(Object));
  });

  it("should return error on remote failure (ErrorCode 7034)", async () => {
    execMock.mockResolvedValueOnce(failResult("fatal: Permission denied (publickey)"));

    const tool = createGitPushTool(createMockGitOps(execMock));
    const result = await tool.execute({ remote: "origin" }, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("Git remote error");
  });

  it("should return error on rejected push", async () => {
    execMock.mockResolvedValueOnce(failResult("! [rejected] main -> main (non-fast-forward)"));

    const tool = createGitPushTool(createMockGitOps(execMock));
    const result = await tool.execute({ remote: "origin" }, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("Git remote error");
  });
});

// =============================================================================
// git_remote Tests
// =============================================================================

describe("git_remote", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  describe("list action", () => {
    it("should list all remotes with URLs", async () => {
      execMock.mockResolvedValueOnce(
        successResult(
          `origin\thttps://github.com/user/repo.git (fetch)
origin\thttps://github.com/user/repo.git (push)
upstream\thttps://github.com/original/repo.git (fetch)
upstream\thttps://github.com/original/repo.git (push)`
        )
      );

      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "list" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitRemoteListResult }).output;
      expect(output.remotes).toHaveLength(2);
      expect(output.remotes[0]?.name).toBe("origin");
      expect(output.remotes[1]?.name).toBe("upstream");
    });

    it("should return empty list when no remotes", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "list" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitRemoteListResult }).output;
      expect(output.remotes).toHaveLength(0);
    });
  });

  describe("add action", () => {
    it("should add new remote", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute(
        { action: "add", name: "upstream", url: "https://github.com/original/repo.git" },
        ctx
      );

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitRemoteMutateResult }).output;
      expect(output.name).toBe("upstream");
      expect(output.message).toContain("Added remote");
      expect(execMock).toHaveBeenCalledWith(
        ["remote", "add", "upstream", "https://github.com/original/repo.git"],
        expect.any(Object)
      );
    });

    it("should require name for add action", async () => {
      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "add", url: "https://github.com/repo.git" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain(
        "Remote name is required"
      );
    });

    it("should require url for add action", async () => {
      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "add", name: "upstream" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain(
        "Remote URL is required"
      );
    });

    it("should return error if remote already exists", async () => {
      execMock.mockResolvedValueOnce(failResult("fatal: remote origin already exists"));

      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute(
        { action: "add", name: "origin", url: "https://github.com/repo.git" },
        ctx
      );

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("already exists");
    });
  });

  describe("remove action", () => {
    it("should require confirmation for remove (shouldConfirm: true)", async () => {
      const tool = createGitRemoteTool(createMockGitOps(execMock));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shouldConfirm = tool.shouldConfirm as (input: any) => boolean;
      expect(shouldConfirm({ action: "remove", name: "origin" })).toBe(true);
      expect(shouldConfirm({ action: "list" })).toBe(false);
      expect(shouldConfirm({ action: "add", name: "x", url: "y" })).toBe(false);
    });

    it("should remove remote", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "remove", name: "upstream" }, ctx);

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitRemoteMutateResult }).output;
      expect(output.name).toBe("upstream");
      expect(output.message).toContain("Removed remote");
      expect(execMock).toHaveBeenCalledWith(["remote", "remove", "upstream"], expect.any(Object));
    });

    it("should require name for remove action", async () => {
      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "remove" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain(
        "Remote name is required"
      );
    });

    it("should return error if remote does not exist", async () => {
      execMock.mockResolvedValueOnce(failResult("fatal: No such remote: nonexistent"));

      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "remove", name: "nonexistent" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("does not exist");
    });
  });

  describe("rename action", () => {
    it("should rename remote", async () => {
      execMock.mockResolvedValueOnce(successResult(""));

      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute(
        { action: "rename", name: "origin", newName: "upstream" },
        ctx
      );

      expect(result.success).toBe(true);
      const output = (result as { success: true; output: GitRemoteMutateResult }).output;
      expect(output.name).toBe("upstream");
      expect(output.message).toContain("Renamed remote");
      expect(execMock).toHaveBeenCalledWith(
        ["remote", "rename", "origin", "upstream"],
        expect.any(Object)
      );
    });

    it("should require name for rename action", async () => {
      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "rename", newName: "upstream" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain(
        "Remote name is required"
      );
    });

    it("should require newName for rename action", async () => {
      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute({ action: "rename", name: "origin" }, ctx);

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain(
        "New remote name is required"
      );
    });

    it("should return error if remote does not exist", async () => {
      execMock.mockResolvedValueOnce(failResult("fatal: No such remote: nonexistent"));

      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute(
        { action: "rename", name: "nonexistent", newName: "new" },
        ctx
      );

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("does not exist");
    });

    it("should return error if new name already exists", async () => {
      execMock.mockResolvedValueOnce(failResult("fatal: remote upstream already exists"));

      const tool = createGitRemoteTool(createMockGitOps(execMock));
      const result = await tool.execute(
        { action: "rename", name: "origin", newName: "upstream" },
        ctx
      );

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toContain("already exists");
    });
  });
});
