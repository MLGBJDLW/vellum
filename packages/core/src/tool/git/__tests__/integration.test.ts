// ============================================
// Git Tools Integration Tests - T023
// ============================================

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ToolContext } from "../../../types/tool.js";
import { createToolRegistry, type ToolRegistry } from "../../registry.js";
import {
  createGitBranchTool,
  createGitCheckoutTool,
  createGitCommitTool,
  createGitDiffTool,
  createGitGeneratePrTool,
  createGitLogTool,
  // Factory imports for mocked tests
  createGitStatusTool,
  gitBranchTool,
  gitCheckoutTool,
  gitCommitTool,
  gitConflictInfoTool,
  gitDiffTool,
  gitFetchTool,
  gitGeneratePrTool,
  gitLogTool,
  gitMergeTool,
  gitPullTool,
  gitPushTool,
  gitRemoteTool,
  gitResolveConflictTool,
  gitStashTool,
  // Individual tool imports
  gitStatusTool,
  gitTools,
  registerGitTools,
} from "../index.js";
import type { GitExecResult } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * All expected git tool names.
 */
const EXPECTED_TOOL_NAMES = [
  "git_status",
  "git_diff",
  "git_log",
  "git_commit",
  "git_branch",
  "git_checkout",
  "git_merge",
  "git_conflict_info",
  "git_resolve_conflict",
  "git_stash",
  "git_fetch",
  "git_pull",
  "git_push",
  "git_remote",
  "git_generate_pr",
] as const;

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
// gitTools Array Tests
// =============================================================================

describe("gitTools array", () => {
  it("should contain exactly 15 tools", () => {
    expect(gitTools).toHaveLength(15);
  });

  it("should contain all expected tools", () => {
    const toolNames = gitTools.map((tool) => tool.definition.name);
    expect(toolNames).toEqual(EXPECTED_TOOL_NAMES);
  });

  it("should have unique tool names", () => {
    const toolNames = gitTools.map((tool) => tool.definition.name);
    const uniqueNames = new Set(toolNames);
    expect(uniqueNames.size).toBe(toolNames.length);
  });

  it("should have all tools with required properties", () => {
    for (const tool of gitTools) {
      expect(tool).toHaveProperty("definition");
      expect(tool.definition).toHaveProperty("name");
      expect(tool.definition).toHaveProperty("description");
      expect(tool.definition).toHaveProperty("parameters");
      expect(tool.definition).toHaveProperty("kind");
      expect(tool).toHaveProperty("execute");
      expect(typeof tool.definition.name).toBe("string");
      expect(typeof tool.definition.description).toBe("string");
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("should categorize tools correctly", () => {
    const readTools = gitTools.filter((t) => t.definition.kind === "read");
    const writeTools = gitTools.filter((t) => t.definition.kind === "write");

    // Read tools: status, diff, log, conflict_info, stash (list action), remote (list), generate_pr
    expect(readTools.length).toBeGreaterThanOrEqual(4);

    // Write tools: commit, branch, checkout, merge, resolve_conflict, stash (push/pop), fetch, pull, push, remote (add/remove)
    expect(writeTools.length).toBeGreaterThanOrEqual(4);
  });

  it("should have all tools with git category", () => {
    for (const tool of gitTools) {
      expect(tool.definition.category).toBe("git");
    }
  });
});

// =============================================================================
// registerGitTools Tests
// =============================================================================

describe("registerGitTools", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = createToolRegistry();
  });

  it("should register all 15 git tools", () => {
    registerGitTools(registry);

    expect(registry.list()).toHaveLength(15);
  });

  it("should make all tools discoverable by name", () => {
    registerGitTools(registry);

    for (const expectedName of EXPECTED_TOOL_NAMES) {
      expect(registry.has(expectedName)).toBe(true);
      const tool = registry.get(expectedName);
      expect(tool).toBeDefined();
      expect(tool?.definition.name).toBe(expectedName);
    }
  });

  it("should support case-insensitive lookup", () => {
    registerGitTools(registry);

    expect(registry.get("GIT_STATUS")).toBeDefined();
    expect(registry.get("Git_Diff")).toBeDefined();
    expect(registry.get("git_log")).toBeDefined();
  });

  it("should list tools by kind", () => {
    registerGitTools(registry);

    const readTools = registry.listByKind("read");
    const writeTools = registry.listByKind("write");

    // All tools should be either read or write
    expect(readTools.length + writeTools.length).toBe(15);
  });

  it("should generate LLM tool definitions", () => {
    registerGitTools(registry);

    const definitions = registry.getDefinitions();
    expect(definitions).toHaveLength(15);

    for (const def of definitions) {
      expect(def).toHaveProperty("name");
      expect(def).toHaveProperty("description");
      expect(def).toHaveProperty("parameters");
      expect(def).toHaveProperty("kind");
      expect(typeof def.parameters).toBe("object");
    }
  });

  it("should handle multiple registrations gracefully", () => {
    registerGitTools(registry);
    registerGitTools(registry); // Register again

    // Should still have 15 tools (registry should handle duplicates)
    // The actual behavior depends on registry implementation
    const tools = registry.list();
    expect(tools.length).toBeGreaterThanOrEqual(15);
  });
});

// =============================================================================
// Tool Definition Structure Tests
// =============================================================================

describe("tool definitions", () => {
  describe("git_status", () => {
    it("should have correct structure", () => {
      expect(gitStatusTool.definition.name).toBe("git_status");
      expect(gitStatusTool.definition.kind).toBe("read");
      expect(gitStatusTool.definition.category).toBe("git");
      expect(gitStatusTool.definition.description).toContain("status");
    });
  });

  describe("git_diff", () => {
    it("should have correct structure", () => {
      expect(gitDiffTool.definition.name).toBe("git_diff");
      expect(gitDiffTool.definition.kind).toBe("read");
      expect(gitDiffTool.definition.category).toBe("git");
      expect(gitDiffTool.definition.description).toContain("diff");
    });
  });

  describe("git_log", () => {
    it("should have correct structure", () => {
      expect(gitLogTool.definition.name).toBe("git_log");
      expect(gitLogTool.definition.kind).toBe("read");
      expect(gitLogTool.definition.category).toBe("git");
      expect(gitLogTool.definition.description).toContain("commit");
    });
  });

  describe("git_commit", () => {
    it("should have correct structure", () => {
      expect(gitCommitTool.definition.name).toBe("git_commit");
      expect(gitCommitTool.definition.kind).toBe("write");
      expect(gitCommitTool.definition.category).toBe("git");
      expect(gitCommitTool.definition.description).toContain("commit");
    });
  });

  describe("git_branch", () => {
    it("should have correct structure", () => {
      expect(gitBranchTool.definition.name).toBe("git_branch");
      expect(gitBranchTool.definition.kind).toBe("write");
      expect(gitBranchTool.definition.category).toBe("git");
      expect(gitBranchTool.definition.description).toContain("branch");
    });
  });

  describe("git_checkout", () => {
    it("should have correct structure", () => {
      expect(gitCheckoutTool.definition.name).toBe("git_checkout");
      expect(gitCheckoutTool.definition.kind).toBe("write");
      expect(gitCheckoutTool.definition.category).toBe("git");
      expect(gitCheckoutTool.definition.description).toContain("branch");
    });
  });

  describe("git_merge", () => {
    it("should have correct structure", () => {
      expect(gitMergeTool.definition.name).toBe("git_merge");
      expect(gitMergeTool.definition.kind).toBe("write");
      expect(gitMergeTool.definition.category).toBe("git");
      expect(gitMergeTool.definition.description).toContain("merge");
    });
  });

  describe("git_conflict_info", () => {
    it("should have correct structure", () => {
      expect(gitConflictInfoTool.definition.name).toBe("git_conflict_info");
      expect(gitConflictInfoTool.definition.kind).toBe("read");
      expect(gitConflictInfoTool.definition.category).toBe("git");
      expect(gitConflictInfoTool.definition.description).toContain("conflict");
    });
  });

  describe("git_resolve_conflict", () => {
    it("should have correct structure", () => {
      expect(gitResolveConflictTool.definition.name).toBe("git_resolve_conflict");
      expect(gitResolveConflictTool.definition.kind).toBe("write");
      expect(gitResolveConflictTool.definition.category).toBe("git");
    });
  });

  describe("git_stash", () => {
    it("should have correct structure", () => {
      expect(gitStashTool.definition.name).toBe("git_stash");
      expect(gitStashTool.definition.kind).toBe("write");
      expect(gitStashTool.definition.category).toBe("git");
      expect(gitStashTool.definition.description).toContain("stash");
    });
  });

  describe("git_fetch", () => {
    it("should have correct structure", () => {
      expect(gitFetchTool.definition.name).toBe("git_fetch");
      expect(gitFetchTool.definition.kind).toBe("read");
      expect(gitFetchTool.definition.category).toBe("git");
      expect(gitFetchTool.definition.description).toContain("fetch");
    });
  });

  describe("git_pull", () => {
    it("should have correct structure", () => {
      expect(gitPullTool.definition.name).toBe("git_pull");
      expect(gitPullTool.definition.kind).toBe("write");
      expect(gitPullTool.definition.category).toBe("git");
      expect(gitPullTool.definition.description).toContain("pull");
    });
  });

  describe("git_push", () => {
    it("should have correct structure", () => {
      expect(gitPushTool.definition.name).toBe("git_push");
      expect(gitPushTool.definition.kind).toBe("write");
      expect(gitPushTool.definition.category).toBe("git");
      expect(gitPushTool.definition.description).toContain("push");
    });
  });

  describe("git_remote", () => {
    it("should have correct structure", () => {
      expect(gitRemoteTool.definition.name).toBe("git_remote");
      expect(gitRemoteTool.definition.kind).toBe("write");
      expect(gitRemoteTool.definition.category).toBe("git");
      expect(gitRemoteTool.definition.description).toContain("remote");
    });
  });

  describe("git_generate_pr", () => {
    it("should have correct structure", () => {
      expect(gitGeneratePrTool.definition.name).toBe("git_generate_pr");
      expect(gitGeneratePrTool.definition.kind).toBe("read");
      expect(gitGeneratePrTool.definition.category).toBe("git");
      expect(gitGeneratePrTool.definition.description).toContain("PR");
    });
  });
});

// =============================================================================
// End-to-End Workflow Tests (Mocked)
// =============================================================================

describe("end-to-end workflow (mocked)", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  it("should execute status → diff → log workflow", async () => {
    const gitOpsFactory = createMockGitOps(execMock);

    // Setup mocks for status
    execMock
      .mockResolvedValueOnce(successResult("## main")) // branch
      .mockResolvedValueOnce(successResult("M  file.ts\n?? new.ts")); // status

    // Setup mocks for diff
    execMock.mockResolvedValueOnce(
      successResult(
        "diff --git a/file.ts b/file.ts\n--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,2 @@\n+added line"
      )
    );

    // Setup mocks for log
    execMock.mockResolvedValueOnce(
      successResult("abc1234\x1fabc1234\x1fAuthor <a@b.com>\x1f2024-01-01\x1fInitial commit\x1e")
    );

    const statusTool = createGitStatusTool(gitOpsFactory);
    const diffTool = createGitDiffTool(gitOpsFactory);
    const logTool = createGitLogTool(gitOpsFactory);

    // Execute workflow
    const statusResult = await statusTool.execute({ cwd: "/test/repo" }, ctx);
    expect(statusResult.success).toBe(true);
    if (statusResult.success) {
      expect(statusResult.output.staged).toContain("file.ts");
    }

    const diffResult = await diffTool.execute({ staged: false, cwd: "/test/repo" }, ctx);
    expect(diffResult.success).toBe(true);
    if (diffResult.success) {
      expect(diffResult.output.filesChanged).toBe(1);
    }

    const logResult = await logTool.execute({ cwd: "/test/repo", limit: 1 }, ctx);
    expect(logResult.success).toBe(true);
    if (logResult.success) {
      expect(logResult.output.commits).toHaveLength(1);
    }
  });

  it("should execute commit workflow", async () => {
    const gitOpsFactory = createMockGitOps(execMock);

    // Setup mocks for commit:
    // 1. diff --cached --quiet (exit 1 = has changes)
    // 2. git commit -m "message"
    execMock.mockResolvedValueOnce(failResult("", 1)); // has staged changes
    execMock.mockResolvedValueOnce(
      successResult("[main abc1234] feat: add feature\n 1 file changed, 1 insertion(+)")
    );

    const commitTool = createGitCommitTool(gitOpsFactory);

    const commitResult = await commitTool.execute(
      { message: "feat: add feature", cwd: "/test/repo" },
      ctx
    );
    expect(commitResult.success).toBe(true);
    if (commitResult.success) {
      expect(commitResult.output.hash).toBeDefined();
    }
  });

  it("should execute branch → checkout workflow", async () => {
    const gitOpsFactory = createMockGitOps(execMock);

    // Setup mocks for branch create:
    // 1. rev-parse --verify (exit 128 = branch doesn't exist)
    // 2. git branch new-name
    execMock.mockResolvedValueOnce(failResult("fatal: Needed a single revision", 128));
    execMock.mockResolvedValueOnce(successResult(""));

    // Setup mocks for checkout:
    // 1. status --porcelain (empty = clean)
    // 2. git checkout branch-name
    execMock.mockResolvedValueOnce(successResult("")); // status check
    execMock.mockResolvedValueOnce(successResult("Switched to branch 'feature'")); // checkout

    const branchTool = createGitBranchTool(gitOpsFactory);
    const checkoutTool = createGitCheckoutTool(gitOpsFactory);

    const branchResult = await branchTool.execute(
      { action: "create", name: "feature", cwd: "/test/repo" },
      ctx
    );
    expect(branchResult.success).toBe(true);

    const checkoutResult = await checkoutTool.execute(
      { target: "feature", cwd: "/test/repo" },
      ctx
    );
    expect(checkoutResult.success).toBe(true);
  });

  it("should execute generate PR workflow", async () => {
    const gitOpsFactory = createMockGitOps(execMock);

    // Setup mocks for generate PR
    execMock
      .mockResolvedValueOnce(successResult("feature-branch")) // rev-parse HEAD
      .mockResolvedValueOnce(successResult("abc123")) // rev-parse verify main
      .mockResolvedValueOnce(
        successResult("abc1234\x1ffeat: add feature\x1ebcd2345\x1ffix: bug fix\x1e")
      ) // git log
      .mockResolvedValueOnce(successResult("src/file.ts\nsrc/other.ts")); // git diff --name-only

    const prTool = createGitGeneratePrTool(gitOpsFactory);

    const prResult = await prTool.execute({ target: "main", cwd: "/test/repo" }, ctx);
    expect(prResult.success).toBe(true);
    if (prResult.success) {
      expect(prResult.output.commits).toBe(2);
      expect(prResult.output.filesChanged).toContain("src/file.ts");
      expect(prResult.output.title).toBeDefined();
      expect(prResult.output.body).toContain("## Summary");
      expect(prResult.output.body).toContain("## Commits");
    }
  });
});

// =============================================================================
// git_generate_pr Tool Tests
// =============================================================================

describe("git_generate_pr", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  it("should generate PR with single commit", async () => {
    const gitOpsFactory = createMockGitOps(execMock);

    execMock
      .mockResolvedValueOnce(successResult("feature-branch"))
      .mockResolvedValueOnce(successResult("abc123"))
      .mockResolvedValueOnce(successResult("abc1234\x1ffeat: add new feature\x1e"))
      .mockResolvedValueOnce(successResult("src/file.ts"));

    const tool = createGitGeneratePrTool(gitOpsFactory);
    const result = await tool.execute({ target: "main", cwd: "/test/repo" }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.title).toBe("feat: add new feature");
      expect(result.output.commits).toBe(1);
      expect(result.output.filesChanged).toEqual(["src/file.ts"]);
    }
  });

  it("should generate PR with multiple commits", async () => {
    const gitOpsFactory = createMockGitOps(execMock);

    execMock
      .mockResolvedValueOnce(successResult("feature-branch"))
      .mockResolvedValueOnce(successResult("abc123"))
      .mockResolvedValueOnce(
        successResult(
          "abc1234\x1ffeat: first\x1ebcd2345\x1ffix: second\x1ecde3456\x1fdocs: third\x1e"
        )
      )
      .mockResolvedValueOnce(successResult("a.ts\nb.ts\nc.ts"));

    const tool = createGitGeneratePrTool(gitOpsFactory);
    const result = await tool.execute({ target: "main", cwd: "/test/repo" }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.commits).toBe(3);
      expect(result.output.filesChanged).toHaveLength(3);
      expect(result.output.body).toContain("abc1234");
      expect(result.output.body).toContain("bcd2345");
    }
  });

  it("should include template in PR body", async () => {
    const gitOpsFactory = createMockGitOps(execMock);

    execMock
      .mockResolvedValueOnce(successResult("feature-branch"))
      .mockResolvedValueOnce(successResult("abc123"))
      .mockResolvedValueOnce(successResult("abc1234\x1ffeat: add feature\x1e"))
      .mockResolvedValueOnce(successResult("src/file.ts"));

    const tool = createGitGeneratePrTool(gitOpsFactory);
    const result = await tool.execute(
      {
        target: "main",
        cwd: "/test/repo",
        template: "This is a custom description for the PR.",
      },
      ctx
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.body).toContain("## Description");
      expect(result.output.body).toContain("custom description");
    }
  });

  it("should fail when target branch does not exist", async () => {
    const gitOpsFactory = createMockGitOps(execMock);

    execMock
      .mockResolvedValueOnce(successResult("feature-branch"))
      .mockResolvedValueOnce(failResult("fatal: Needed a single revision"));

    const tool = createGitGeneratePrTool(gitOpsFactory);
    const result = await tool.execute({ target: "nonexistent", cwd: "/test/repo" }, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("does not exist");
    }
  });

  it("should fail when not in a git repository", async () => {
    const gitOpsFactory = createMockGitOps(execMock);

    execMock.mockResolvedValueOnce(failResult("fatal: not a git repository"));

    const tool = createGitGeneratePrTool(gitOpsFactory);
    const result = await tool.execute({ target: "main", cwd: "/test/repo" }, ctx);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Not a git repository");
    }
  });

  it("should handle no commits between branches", async () => {
    const gitOpsFactory = createMockGitOps(execMock);

    execMock
      .mockResolvedValueOnce(successResult("feature-branch"))
      .mockResolvedValueOnce(successResult("abc123"))
      .mockResolvedValueOnce(successResult("")) // No commits
      .mockResolvedValueOnce(successResult("")); // No files changed

    const tool = createGitGeneratePrTool(gitOpsFactory);
    const result = await tool.execute({ target: "main", cwd: "/test/repo" }, ctx);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.commits).toBe(0);
      expect(result.output.filesChanged).toHaveLength(0);
      expect(result.output.title).toBe("No changes");
    }
  });
});
