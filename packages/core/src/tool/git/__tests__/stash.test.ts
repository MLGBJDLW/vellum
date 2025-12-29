// ============================================
// Git Stash Tool Tests - T016
// ============================================

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ToolContext } from "../../../types/tool.js";
import {
  createGitStashTool,
  type GitStashApplyResult,
  type GitStashClearResult,
  type GitStashDropResult,
  type GitStashListResult,
  type GitStashPushResult,
  parseStashListOutput,
} from "../stash.js";
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
// parseStashListOutput Tests
// =============================================================================

describe("parseStashListOutput", () => {
  it("should return empty array for empty output", () => {
    const result = parseStashListOutput("");
    expect(result).toEqual([]);
  });

  it("should parse single stash entry", () => {
    const output = "stash@{0}: WIP on main: abc1234 commit message";
    const result = parseStashListOutput(output);
    expect(result).toHaveLength(1);
    expect(result[0]?.index).toBe(0);
    expect(result[0]?.message).toBe("WIP on main: abc1234 commit message");
  });

  it("should parse multiple stash entries", () => {
    const output = `stash@{0}: WIP on main: latest changes
stash@{1}: On feature: work in progress
stash@{2}: WIP on develop: save point`;
    const result = parseStashListOutput(output);
    expect(result).toHaveLength(3);
    expect(result[0]?.index).toBe(0);
    expect(result[1]?.index).toBe(1);
    expect(result[2]?.index).toBe(2);
  });

  it("should handle custom stash messages", () => {
    const output = "stash@{0}: On main: my custom message";
    const result = parseStashListOutput(output);
    expect(result[0]?.message).toBe("On main: my custom message");
  });
});

// =============================================================================
// git_stash push Tests
// =============================================================================

describe("git_stash push", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  it("should stash changes successfully", async () => {
    execMock.mockResolvedValueOnce(successResult("Saved working directory and index state"));

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "push" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashPushResult }).output;
    expect(output.stashed).toBe(true);
    expect(execMock).toHaveBeenCalledWith(["stash", "push"], expect.any(Object));
  });

  it("should include message when provided", async () => {
    execMock.mockResolvedValueOnce(successResult("Saved working directory"));

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "push", message: "my changes" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashPushResult }).output;
    expect(output.message).toBe("my changes");
    expect(execMock).toHaveBeenCalledWith(
      ["stash", "push", "-m", "my changes"],
      expect.any(Object)
    );
  });

  it("should include untracked files when flag is set", async () => {
    execMock.mockResolvedValueOnce(successResult("Saved working directory"));

    const tool = createGitStashTool(createMockGitOps(execMock));
    await tool.execute({ action: "push", includeUntracked: true }, ctx);

    expect(execMock).toHaveBeenCalledWith(
      ["stash", "push", "--include-untracked"],
      expect.any(Object)
    );
  });

  it("should handle no changes to save", async () => {
    execMock.mockResolvedValueOnce(successResult("No local changes to save"));

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "push" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashPushResult }).output;
    expect(output.stashed).toBe(false);
    expect(output.message).toBe("No local changes to save");
  });

  it("should fail when not a git repository", async () => {
    execMock.mockResolvedValueOnce(failResult("fatal: not a git repository"));

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "push" }, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("Not a git repository");
  });
});

// =============================================================================
// git_stash pop Tests
// =============================================================================

describe("git_stash pop", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  it("should pop stash successfully", async () => {
    execMock
      .mockResolvedValueOnce(successResult("stash@{0}: WIP on main: ...")) // list
      .mockResolvedValueOnce(successResult("Dropped refs/stash")); // pop

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "pop" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashApplyResult }).output;
    expect(output.applied).toBe(true);
    expect(output.message).toBe("Stash popped and applied");
  });

  it("should return error when stash is empty", async () => {
    execMock.mockResolvedValueOnce(successResult("")); // empty list

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "pop" }, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("No stash entries found");
  });
});

// =============================================================================
// git_stash apply Tests
// =============================================================================

describe("git_stash apply", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  it("should apply top stash without removing", async () => {
    execMock
      .mockResolvedValueOnce(successResult("stash@{0}: WIP")) // list
      .mockResolvedValueOnce(successResult("Applied")); // apply

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "apply" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashApplyResult }).output;
    expect(output.applied).toBe(true);
    expect(execMock).toHaveBeenCalledWith(["stash", "apply"], expect.any(Object));
  });

  it("should apply specific stash by index", async () => {
    execMock
      .mockResolvedValueOnce(successResult("stash@{0}: WIP\nstash@{1}: Work")) // list
      .mockResolvedValueOnce(successResult("Applied")); // apply

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "apply", index: 1 }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashApplyResult }).output;
    expect(output.message).toBe("Stash@{1} applied");
    expect(execMock).toHaveBeenCalledWith(["stash", "apply", "stash@{1}"], expect.any(Object));
  });

  it("should return error when stash is empty", async () => {
    execMock.mockResolvedValueOnce(successResult("")); // empty list

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "apply" }, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("No stash entries found");
  });
});

// =============================================================================
// git_stash list Tests
// =============================================================================

describe("git_stash list", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  it("should list stashes", async () => {
    execMock.mockResolvedValueOnce(
      successResult("stash@{0}: WIP on main: abc\nstash@{1}: On feature: def")
    );

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "list" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashListResult }).output;
    expect(output.stashes).toHaveLength(2);
    expect(output.stashes[0]?.index).toBe(0);
    expect(output.stashes[1]?.index).toBe(1);
  });

  it("should return empty list when no stashes", async () => {
    execMock.mockResolvedValueOnce(successResult(""));

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "list" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashListResult }).output;
    expect(output.stashes).toEqual([]);
  });
});

// =============================================================================
// git_stash drop Tests
// =============================================================================

describe("git_stash drop", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  it("should drop top stash", async () => {
    execMock
      .mockResolvedValueOnce(successResult("stash@{0}: WIP")) // list
      .mockResolvedValueOnce(successResult("Dropped refs/stash")); // drop

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "drop" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashDropResult }).output;
    expect(output.dropped).toBe(true);
  });

  it("should drop specific stash by index", async () => {
    execMock
      .mockResolvedValueOnce(successResult("stash@{0}: A\nstash@{1}: B")) // list
      .mockResolvedValueOnce(successResult("Dropped")); // drop

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "drop", index: 1 }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashDropResult }).output;
    expect(output.dropped).toBe(true);
    expect(output.index).toBe(1);
    expect(execMock).toHaveBeenCalledWith(["stash", "drop", "stash@{1}"], expect.any(Object));
  });

  it("should return error when stash is empty", async () => {
    execMock.mockResolvedValueOnce(successResult("")); // empty list

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "drop" }, ctx);

    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toContain("No stash entries found");
  });

  it("should require confirmation", () => {
    const tool = createGitStashTool(createMockGitOps(vi.fn()));
    expect(tool.shouldConfirm?.({ action: "drop" }, ctx)).toBe(true);
    expect(tool.shouldConfirm?.({ action: "drop", index: 0 }, ctx)).toBe(true);
  });
});

// =============================================================================
// git_stash clear Tests
// =============================================================================

describe("git_stash clear", () => {
  let execMock: Mock;
  let ctx: ToolContext;

  beforeEach(() => {
    execMock = vi.fn();
    ctx = createMockContext();
  });

  it("should clear all stashes", async () => {
    execMock
      .mockResolvedValueOnce(successResult("stash@{0}: A\nstash@{1}: B\nstash@{2}: C")) // list
      .mockResolvedValueOnce(successResult("")); // clear

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "clear" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashClearResult }).output;
    expect(output.count).toBe(3);
  });

  it("should return 0 count when no stashes to clear", async () => {
    execMock
      .mockResolvedValueOnce(successResult("")) // empty list
      .mockResolvedValueOnce(successResult("")); // clear

    const tool = createGitStashTool(createMockGitOps(execMock));
    const result = await tool.execute({ action: "clear" }, ctx);

    expect(result.success).toBe(true);
    const output = (result as { success: true; output: GitStashClearResult }).output;
    expect(output.count).toBe(0);
  });

  it("should require confirmation", () => {
    const tool = createGitStashTool(createMockGitOps(vi.fn()));
    expect(tool.shouldConfirm?.({ action: "clear" }, ctx)).toBe(true);
  });
});

// =============================================================================
// shouldConfirm Tests
// =============================================================================

describe("git_stash shouldConfirm", () => {
  let ctx: ToolContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it("should NOT require confirmation for push", () => {
    const tool = createGitStashTool(createMockGitOps(vi.fn()));
    expect(tool.shouldConfirm?.({ action: "push" }, ctx)).toBe(false);
  });

  it("should NOT require confirmation for pop", () => {
    const tool = createGitStashTool(createMockGitOps(vi.fn()));
    expect(tool.shouldConfirm?.({ action: "pop" }, ctx)).toBe(false);
  });

  it("should NOT require confirmation for apply", () => {
    const tool = createGitStashTool(createMockGitOps(vi.fn()));
    expect(tool.shouldConfirm?.({ action: "apply" }, ctx)).toBe(false);
  });

  it("should NOT require confirmation for list", () => {
    const tool = createGitStashTool(createMockGitOps(vi.fn()));
    expect(tool.shouldConfirm?.({ action: "list" }, ctx)).toBe(false);
  });

  it("should require confirmation for drop", () => {
    const tool = createGitStashTool(createMockGitOps(vi.fn()));
    expect(tool.shouldConfirm?.({ action: "drop" }, ctx)).toBe(true);
  });

  it("should require confirmation for clear", () => {
    const tool = createGitStashTool(createMockGitOps(vi.fn()));
    expect(tool.shouldConfirm?.({ action: "clear" }, ctx)).toBe(true);
  });
});
