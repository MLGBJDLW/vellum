// ============================================
// Git Status Tool - T005
// ============================================

import { z } from "zod";

import { ErrorCode, VellumError } from "../../errors/types.js";
import { defineTool, fail, ok } from "../../types/tool.js";
import { createGitOps } from "./utils.js";

// =============================================================================
// Schema
// =============================================================================

/**
 * Input schema for git_status tool.
 */
export const GitStatusInputSchema = z.object({
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;

// =============================================================================
// Result Type
// =============================================================================

/**
 * Result of git status operation.
 */
export interface GitStatusResult {
  /** Current branch name */
  branch: string;
  /** List of staged file paths */
  staged: string[];
  /** List of modified (unstaged) file paths */
  modified: string[];
  /** List of untracked file paths */
  untracked: string[];
  /** Whether working directory is clean */
  clean: boolean;
}

// =============================================================================
// Parser Helpers
// =============================================================================

/**
 * Parse git status --porcelain=v1 output into structured result.
 *
 * Porcelain format:
 * - XY PATH where X is staged status, Y is unstaged status
 * - M = modified, A = added, D = deleted, R = renamed, C = copied
 * - ? = untracked, ! = ignored
 *
 * @param output - Raw porcelain output from git status
 * @returns Parsed status with staged, modified, and untracked files
 */
export function parseStatusOutput(output: string): {
  staged: string[];
  modified: string[];
  untracked: string[];
} {
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];

  const lines = output.split("\n").filter((line) => line.length > 0);

  for (const line of lines) {
    // Format: XY filename (or XY "filename" for special chars)
    const x = line[0]; // Staged status
    const y = line[1]; // Unstaged status
    const filepath = line.slice(3).trim();

    // Untracked files
    if (x === "?" && y === "?") {
      untracked.push(filepath);
      continue;
    }

    // Staged changes (index modified relative to HEAD)
    if (x !== " " && x !== "?") {
      staged.push(filepath);
    }

    // Unstaged changes (work tree modified relative to index)
    if (y !== " " && y !== "?") {
      modified.push(filepath);
    }
  }

  return { staged, modified, untracked };
}

/**
 * Parse branch name from git branch --show-current or git status output.
 *
 * @param output - Raw output from git branch --show-current
 * @returns Branch name or "HEAD" if detached
 */
export function parseBranchOutput(output: string): string {
  const branch = output.trim();
  return branch.length > 0 ? branch : "HEAD";
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * Git status tool.
 *
 * Returns the current repository status including branch name,
 * staged files, modified files, and untracked files.
 */
export const gitStatusTool = defineTool({
  name: "git_status",
  description:
    "Get the current git repository status including branch name, staged files, modified files, and untracked files.",
  parameters: GitStatusInputSchema,
  kind: "read",
  category: "git",

  async execute(
    input,
    ctx
  ): Promise<ReturnType<typeof ok<GitStatusResult>> | ReturnType<typeof fail>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);

    try {
      // Get branch name
      const branchResult = await git.exec(["branch", "--show-current"], {
        signal: ctx.abortSignal,
      });

      if (branchResult.exitCode !== 0) {
        // Check if this is a "not a git repository" error
        if (branchResult.stderr.includes("not a git repository")) {
          return fail(`Not a git repository: ${cwd}`);
        }
        return fail(`Failed to get branch: ${branchResult.stderr}`);
      }

      const branch = parseBranchOutput(branchResult.stdout);

      // Get status using porcelain format for machine parsing
      const statusResult = await git.exec(["status", "--porcelain=v1"], {
        signal: ctx.abortSignal,
      });

      if (statusResult.exitCode !== 0) {
        return fail(`Failed to get status: ${statusResult.stderr}`);
      }

      const { staged, modified, untracked } = parseStatusOutput(statusResult.stdout);
      const clean = staged.length === 0 && modified.length === 0 && untracked.length === 0;

      return ok({
        branch,
        staged,
        modified,
        untracked,
        clean,
      });
    } catch (error) {
      if (error instanceof VellumError && error.code === ErrorCode.GIT_TIMEOUT) {
        return fail("Git status operation timed out");
      }
      throw error;
    }
  },
});

// =============================================================================
// Factory Export (for testing with custom git ops)
// =============================================================================

/**
 * Create a git status tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git status tool
 */
export function createGitStatusTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_status",
    description:
      "Get the current git repository status including branch name, staged files, modified files, and untracked files.",
    parameters: GitStatusInputSchema,
    kind: "read",
    category: "git",

    async execute(
      input,
      ctx
    ): Promise<ReturnType<typeof ok<GitStatusResult>> | ReturnType<typeof fail>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);

      try {
        // Get branch name
        const branchResult = await git.exec(["branch", "--show-current"], {
          signal: ctx.abortSignal,
        });

        if (branchResult.exitCode !== 0) {
          // Check if this is a "not a git repository" error
          if (branchResult.stderr.includes("not a git repository")) {
            return fail(`Not a git repository: ${cwd}`);
          }
          return fail(`Failed to get branch: ${branchResult.stderr}`);
        }

        const branch = parseBranchOutput(branchResult.stdout);

        // Get status using porcelain format for machine parsing
        const statusResult = await git.exec(["status", "--porcelain=v1"], {
          signal: ctx.abortSignal,
        });

        if (statusResult.exitCode !== 0) {
          return fail(`Failed to get status: ${statusResult.stderr}`);
        }

        const { staged, modified, untracked } = parseStatusOutput(statusResult.stdout);
        const clean = staged.length === 0 && modified.length === 0 && untracked.length === 0;

        return ok({
          branch,
          staged,
          modified,
          untracked,
          clean,
        });
      } catch (error) {
        if (error instanceof VellumError && error.code === ErrorCode.GIT_TIMEOUT) {
          return fail("Git status operation timed out");
        }
        throw error;
      }
    },
  });
}
