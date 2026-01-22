// ============================================
// Git Branch, Checkout, and Merge Tools - T010
// ============================================

import { z } from "zod";

import { ErrorCode, VellumError } from "../../errors/types.js";
import { defineTool, fail, ok, type ToolContext, type ToolResult } from "../../types/tool.js";
import {
  gitBranchExistsError,
  gitBranchNotFoundError,
  gitConflictError,
  gitDirtyWorkdirError,
} from "./errors.js";
import { BranchNameSchema } from "./types.js";
import { createGitOps } from "./utils.js";

// =============================================================================
// Common Types
// =============================================================================

/**
 * Extended tool context with optional snapshot service.
 */
interface ExtendedToolContext extends ToolContext {
  snapshotService?: { track: () => Promise<void> };
}

/**
 * Call snapshot service if available (for write operations).
 * Failures are logged but don't block the operation.
 */
async function trackSnapshot(ctx: ToolContext): Promise<void> {
  const extCtx = ctx as unknown as ExtendedToolContext;
  try {
    await extCtx.snapshotService?.track();
  } catch (snapshotError) {
    console.warn("Snapshot tracking failed:", snapshotError);
  }
}

// =============================================================================
// Git Branch Schemas and Types
// =============================================================================

/**
 * Input schema for git_branch tool.
 */
export const GitBranchInputSchema = z.object({
  action: z.enum(["list", "create", "delete", "rename"]).describe("Branch operation to perform"),
  name: BranchNameSchema.optional().describe("Branch name (required for create/delete/rename)"),
  newName: BranchNameSchema.optional().describe("New branch name (for rename)"),
  remote: z.boolean().optional().describe("Include remote branches (for list, default: false)"),
  force: z.boolean().optional().describe("Force deletion (for delete, default: false)"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitBranchInput = z.infer<typeof GitBranchInputSchema>;

/**
 * A single branch entry.
 */
export interface GitBranchInfo {
  /** Branch name */
  name: string;
  /** Whether this is the current branch */
  current: boolean;
  /** Whether this is a remote branch */
  remote: boolean;
}

/**
 * Result of git branch list operation.
 */
export interface GitBranchListResult {
  /** List of branches */
  branches: GitBranchInfo[];
  /** Current branch name */
  current: string;
}

/**
 * Result of git branch create/delete/rename operations.
 */
export interface GitBranchMutateResult {
  /** Success message */
  message: string;
  /** Branch name affected */
  branch: string;
  /** Whether user confirmation should be requested */
  shouldConfirm?: boolean;
  /** Message to show for confirmation */
  confirmMessage?: string;
}

/**
 * Unified result type for git_branch tool.
 */
export type GitBranchResult = GitBranchListResult | GitBranchMutateResult;

// =============================================================================
// Git Checkout Schemas and Types
// =============================================================================

/**
 * Input schema for git_checkout tool.
 */
export const GitCheckoutInputSchema = z.object({
  target: z.string().describe("Branch name or commit ref to checkout"),
  create: z.boolean().optional().describe("Create branch if not exists (default: false)"),
  paths: z.array(z.string()).optional().describe("Restore specific files from ref"),
  force: z
    .boolean()
    .optional()
    .describe("Force checkout, discarding local changes (default: false)"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitCheckoutInput = z.infer<typeof GitCheckoutInputSchema>;

/**
 * Result of git checkout operation.
 */
export interface GitCheckoutResult {
  /** New current branch or ref */
  ref: string;
  /** Whether a new branch was created */
  created: boolean;
  /** Files restored (if paths were specified) */
  restoredFiles?: string[];
  /** Whether user confirmation should be requested */
  shouldConfirm?: boolean;
  /** Message to show for confirmation */
  confirmMessage?: string;
}

// =============================================================================
// Git Merge Schemas and Types
// =============================================================================

/**
 * Input schema for git_merge tool.
 */
export const GitMergeInputSchema = z.object({
  branch: BranchNameSchema.describe("Branch to merge into current"),
  noFf: z
    .boolean()
    .optional()
    .describe("Create merge commit even if fast-forward (default: false)"),
  abort: z.boolean().optional().describe("Abort in-progress merge (default: false)"),
  message: z.string().optional().describe("Merge commit message"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitMergeInput = z.infer<typeof GitMergeInputSchema>;

/**
 * Result of git merge operation.
 */
export interface GitMergeResult {
  /** Whether merge was successful */
  success: boolean;
  /** Merge summary message */
  message: string;
  /** Conflicting files (if any) */
  conflicts?: string[];
  /** Whether it was a fast-forward merge */
  fastForward?: boolean;
  /** Whether user confirmation should be requested */
  shouldConfirm?: boolean;
  /** Message to show for confirmation */
  confirmMessage?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse git branch output into structured result.
 *
 * @param output - Raw output from git branch command
 * @returns Parsed branch list and current branch
 */
export function parseBranchListOutput(output: string): GitBranchListResult {
  const branches: GitBranchInfo[] = [];
  let current = "";

  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    const isCurrent = line.startsWith("*");
    const name = line.replace(/^\*?\s+/, "").trim();

    // Skip HEAD entries for remotes
    if (name.includes("->")) continue;

    const isRemote = name.startsWith("remotes/") || name.startsWith("origin/");

    branches.push({
      name: isRemote ? name.replace(/^remotes\//, "") : name,
      current: isCurrent,
      remote: isRemote,
    });

    if (isCurrent) {
      current = name;
    }
  }

  return { branches, current };
}

/**
 * Parse merge conflict files from git status.
 *
 * @param output - Raw output from git status --porcelain
 * @returns List of conflicting file paths
 */
export function parseConflictFiles(output: string): string[] {
  const conflicts: string[] = [];
  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    // Conflict markers: UU (both modified), AA (both added), DD (both deleted)
    // Also AU, UA, DU, UD for various conflict states
    const status = line.slice(0, 2);
    if (status.includes("U") || status === "AA" || status === "DD") {
      conflicts.push(line.slice(3).trim());
    }
  }

  return conflicts;
}

// =============================================================================
// Git Branch Tool Definition
// =============================================================================

/**
 * Git branch tool.
 *
 * Manages branches: list, create, delete, rename.
 */
export const gitBranchTool = defineTool({
  name: "git_branch",
  description:
    "Manage git branches: list all branches, create new branches, delete or rename existing branches.",
  parameters: GitBranchInputSchema,
  kind: "write",
  category: "git",

  shouldConfirm(input): boolean {
    // Confirm for delete operations
    return input.action === "delete";
  },

  async execute(input, ctx): Promise<ToolResult<GitBranchResult>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);

    try {
      switch (input.action) {
        case "list": {
          const args = ["branch"];
          if (input.remote) {
            args.push("-a");
          }

          const result = await git.exec(args, { signal: ctx.abortSignal });

          if (result.exitCode !== 0) {
            if (result.stderr.includes("not a git repository")) {
              return fail(`Not a git repository: ${cwd}`);
            }
            return fail(`Failed to list branches: ${result.stderr}`);
          }

          const parsed = parseBranchListOutput(result.stdout);
          return ok(parsed);
        }

        case "create": {
          if (!input.name) {
            return fail("Branch name is required for create action");
          }

          // Check if branch already exists
          const checkResult = await git.exec(["rev-parse", "--verify", input.name], {
            signal: ctx.abortSignal,
          });

          if (checkResult.exitCode === 0) {
            throw gitBranchExistsError(input.name);
          }

          // Track snapshot before write
          await trackSnapshot(ctx);

          const createResult = await git.exec(["branch", input.name], { signal: ctx.abortSignal });

          if (createResult.exitCode !== 0) {
            return fail(`Failed to create branch: ${createResult.stderr}`);
          }

          return ok({
            message: `Branch '${input.name}' created`,
            branch: input.name,
          });
        }

        case "delete": {
          if (!input.name) {
            return fail("Branch name is required for delete action");
          }

          // Track snapshot before write
          await trackSnapshot(ctx);

          const args = ["branch", input.force ? "-D" : "-d", input.name];
          const deleteResult = await git.exec(args, { signal: ctx.abortSignal });

          if (deleteResult.exitCode !== 0) {
            if (deleteResult.stderr.includes("not found")) {
              throw gitBranchNotFoundError(input.name);
            }
            if (deleteResult.stderr.includes("not fully merged")) {
              return fail(
                `Branch '${input.name}' is not fully merged. Use force=true to delete anyway.`
              );
            }
            return fail(`Failed to delete branch: ${deleteResult.stderr}`);
          }

          return ok({
            message: `Branch '${input.name}' deleted`,
            branch: input.name,
            shouldConfirm: true,
            confirmMessage: `Are you sure you want to delete branch '${input.name}'?`,
          });
        }

        case "rename": {
          if (!input.name) {
            return fail("Branch name is required for rename action");
          }
          if (!input.newName) {
            return fail("New branch name is required for rename action");
          }

          // Track snapshot before write
          await trackSnapshot(ctx);

          const renameResult = await git.exec(["branch", "-m", input.name, input.newName], {
            signal: ctx.abortSignal,
          });

          if (renameResult.exitCode !== 0) {
            if (renameResult.stderr.includes("not found")) {
              throw gitBranchNotFoundError(input.name);
            }
            return fail(`Failed to rename branch: ${renameResult.stderr}`);
          }

          return ok({
            message: `Branch '${input.name}' renamed to '${input.newName}'`,
            branch: input.newName,
          });
        }

        default:
          return fail(`Unknown action: ${input.action}`);
      }
    } catch (error) {
      if (error instanceof VellumError) {
        if (error.code === ErrorCode.GIT_BRANCH_EXISTS) {
          return fail(error.message);
        }
        if (error.code === ErrorCode.GIT_BRANCH_NOT_FOUND) {
          return fail(error.message);
        }
        if (error.code === ErrorCode.GIT_TIMEOUT) {
          return fail("Git branch operation timed out");
        }
      }
      throw error;
    }
  },
});

// =============================================================================
// Git Checkout Tool Definition
// =============================================================================

/**
 * Git checkout tool.
 *
 * Switch branches or restore working tree files.
 */
export const gitCheckoutTool = defineTool({
  name: "git_checkout",
  description:
    "Switch branches, create new branches, or restore specific files from a commit reference.",
  parameters: GitCheckoutInputSchema,
  kind: "write",
  category: "git",

  shouldConfirm(input): boolean {
    // Confirm for force checkout (discards local changes)
    return input.force === true;
  },

  async execute(input, ctx): Promise<ToolResult<GitCheckoutResult>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);

    try {
      // Track snapshot before write
      await trackSnapshot(ctx);

      // Case 1: Restore specific files
      if (input.paths && input.paths.length > 0) {
        const args = ["checkout", input.target, "--", ...input.paths];
        const result = await git.exec(args, { signal: ctx.abortSignal });

        if (result.exitCode !== 0) {
          return fail(`Failed to restore files: ${result.stderr}`);
        }

        return ok({
          ref: input.target,
          created: false,
          restoredFiles: input.paths,
        });
      }

      // Check for dirty workdir (unless force is set)
      if (!input.force) {
        const statusResult = await git.exec(["status", "--porcelain"], { signal: ctx.abortSignal });
        if (statusResult.exitCode === 0 && statusResult.stdout.trim().length > 0) {
          // Check if there are actual modifications (not just untracked files)
          const hasChanges = statusResult.stdout
            .split("\n")
            .some((line) => line.length >= 2 && !line.startsWith("??"));

          if (hasChanges) {
            throw gitDirtyWorkdirError();
          }
        }
      }

      // Case 2: Create and switch to new branch
      if (input.create) {
        const args = ["checkout", "-b", input.target];
        if (input.force) {
          args.splice(1, 0, "-f");
        }

        const result = await git.exec(args, { signal: ctx.abortSignal });

        if (result.exitCode !== 0) {
          if (result.stderr.includes("already exists")) {
            throw gitBranchExistsError(input.target);
          }
          return fail(`Failed to create and checkout branch: ${result.stderr}`);
        }

        return ok({
          ref: input.target,
          created: true,
        });
      }

      // Case 3: Switch to existing branch/ref
      const args = ["checkout"];
      if (input.force) {
        args.push("-f");
      }
      args.push(input.target);

      const result = await git.exec(args, { signal: ctx.abortSignal });

      if (result.exitCode !== 0) {
        if (
          result.stderr.includes("did not match any file") ||
          result.stderr.includes("not found")
        ) {
          throw gitBranchNotFoundError(input.target);
        }
        if (result.stderr.includes("local changes") || result.stderr.includes("overwritten")) {
          throw gitDirtyWorkdirError();
        }
        return fail(`Failed to checkout: ${result.stderr}`);
      }

      return ok({
        ref: input.target,
        created: false,
        shouldConfirm: input.force,
        confirmMessage: input.force
          ? `Force checkout to '${input.target}'? Local changes will be discarded.`
          : undefined,
      });
    } catch (error) {
      if (error instanceof VellumError) {
        if (error.code === ErrorCode.GIT_DIRTY_WORKDIR) {
          return fail(error.message);
        }
        if (error.code === ErrorCode.GIT_BRANCH_EXISTS) {
          return fail(error.message);
        }
        if (error.code === ErrorCode.GIT_BRANCH_NOT_FOUND) {
          return fail(error.message);
        }
        if (error.code === ErrorCode.GIT_TIMEOUT) {
          return fail("Git checkout operation timed out");
        }
      }
      throw error;
    }
  },
});

// =============================================================================
// Git Merge Tool Definition
// =============================================================================

/**
 * Git merge tool.
 *
 * Merge branches together.
 */
export const gitMergeTool = defineTool({
  name: "git_merge",
  description: "Merge a branch into the current branch. Supports --no-ff and merge abort.",
  parameters: GitMergeInputSchema,
  kind: "write",
  category: "git",

  shouldConfirm(_input): boolean {
    // Always confirm merge operations
    return true;
  },

  async execute(input, ctx): Promise<ToolResult<GitMergeResult>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);

    try {
      // Track snapshot before write
      await trackSnapshot(ctx);

      // Case 1: Abort in-progress merge
      if (input.abort) {
        const abortResult = await git.exec(["merge", "--abort"], { signal: ctx.abortSignal });

        if (abortResult.exitCode !== 0) {
          if (abortResult.stderr.includes("no merge to abort")) {
            return fail("No merge in progress to abort");
          }
          return fail(`Failed to abort merge: ${abortResult.stderr}`);
        }

        return ok({
          success: true,
          message: "Merge aborted",
        });
      }

      // Case 2: Perform merge
      const args = ["merge"];

      if (input.noFf) {
        args.push("--no-ff");
      }

      if (input.message) {
        args.push("-m", input.message);
      }

      args.push(input.branch);

      const mergeResult = await git.exec(args, { signal: ctx.abortSignal });

      // Check for conflicts
      if (mergeResult.exitCode !== 0) {
        if (
          mergeResult.stdout.includes("CONFLICT") ||
          mergeResult.stderr.includes("CONFLICT") ||
          mergeResult.stdout.includes("Automatic merge failed")
        ) {
          // Get list of conflicting files
          const statusResult = await git.exec(["status", "--porcelain"], {
            signal: ctx.abortSignal,
          });
          const conflicts = parseConflictFiles(statusResult.stdout);

          throw gitConflictError(conflicts);
        }

        if (mergeResult.stderr.includes("not something we can merge")) {
          throw gitBranchNotFoundError(input.branch);
        }

        return fail(`Merge failed: ${mergeResult.stderr}`);
      }

      // Determine if it was a fast-forward merge
      const fastForward =
        mergeResult.stdout.includes("Fast-forward") || mergeResult.stdout.includes("fast-forward");

      return ok({
        success: true,
        message: fastForward
          ? `Fast-forward merge of '${input.branch}'`
          : `Merged '${input.branch}' into current branch`,
        fastForward,
        shouldConfirm: true,
        confirmMessage: `Merge branch '${input.branch}' into current branch?`,
      });
    } catch (error) {
      if (error instanceof VellumError) {
        if (error.code === ErrorCode.GIT_CONFLICT) {
          const files = (error.context as { files?: string[] })?.files ?? [];
          return ok({
            success: false,
            message: error.message,
            conflicts: files,
          });
        }
        if (error.code === ErrorCode.GIT_BRANCH_NOT_FOUND) {
          return fail(error.message);
        }
        if (error.code === ErrorCode.GIT_TIMEOUT) {
          return fail("Git merge operation timed out");
        }
      }
      throw error;
    }
  },
});

// =============================================================================
// Factory Exports (for testing with custom git ops)
// =============================================================================

/**
 * Create a git branch tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git branch tool
 */
export function createGitBranchTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_branch",
    description:
      "Manage git branches: list all branches, create new branches, delete or rename existing branches.",
    parameters: GitBranchInputSchema,
    kind: "write",
    category: "git",

    shouldConfirm(input): boolean {
      return input.action === "delete";
    },

    async execute(input, ctx): Promise<ToolResult<GitBranchResult>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);

      try {
        switch (input.action) {
          case "list": {
            const args = ["branch"];
            if (input.remote) {
              args.push("-a");
            }

            const result = await git.exec(args, { signal: ctx.abortSignal });

            if (result.exitCode !== 0) {
              if (result.stderr.includes("not a git repository")) {
                return fail(`Not a git repository: ${cwd}`);
              }
              return fail(`Failed to list branches: ${result.stderr}`);
            }

            const parsed = parseBranchListOutput(result.stdout);
            return ok(parsed);
          }

          case "create": {
            if (!input.name) {
              return fail("Branch name is required for create action");
            }

            const checkResult = await git.exec(["rev-parse", "--verify", input.name], {
              signal: ctx.abortSignal,
            });

            if (checkResult.exitCode === 0) {
              throw gitBranchExistsError(input.name);
            }

            await trackSnapshot(ctx);

            const createResult = await git.exec(["branch", input.name], {
              signal: ctx.abortSignal,
            });

            if (createResult.exitCode !== 0) {
              return fail(`Failed to create branch: ${createResult.stderr}`);
            }

            return ok({
              message: `Branch '${input.name}' created`,
              branch: input.name,
            });
          }

          case "delete": {
            if (!input.name) {
              return fail("Branch name is required for delete action");
            }

            await trackSnapshot(ctx);

            const args = ["branch", input.force ? "-D" : "-d", input.name];
            const deleteResult = await git.exec(args, { signal: ctx.abortSignal });

            if (deleteResult.exitCode !== 0) {
              if (deleteResult.stderr.includes("not found")) {
                throw gitBranchNotFoundError(input.name);
              }
              if (deleteResult.stderr.includes("not fully merged")) {
                return fail(
                  `Branch '${input.name}' is not fully merged. Use force=true to delete anyway.`
                );
              }
              return fail(`Failed to delete branch: ${deleteResult.stderr}`);
            }

            return ok({
              message: `Branch '${input.name}' deleted`,
              branch: input.name,
              shouldConfirm: true,
              confirmMessage: `Are you sure you want to delete branch '${input.name}'?`,
            });
          }

          case "rename": {
            if (!input.name) {
              return fail("Branch name is required for rename action");
            }
            if (!input.newName) {
              return fail("New branch name is required for rename action");
            }

            await trackSnapshot(ctx);

            const renameResult = await git.exec(["branch", "-m", input.name, input.newName], {
              signal: ctx.abortSignal,
            });

            if (renameResult.exitCode !== 0) {
              if (renameResult.stderr.includes("not found")) {
                throw gitBranchNotFoundError(input.name);
              }
              return fail(`Failed to rename branch: ${renameResult.stderr}`);
            }

            return ok({
              message: `Branch '${input.name}' renamed to '${input.newName}'`,
              branch: input.newName,
            });
          }

          default:
            return fail(`Unknown action: ${input.action}`);
        }
      } catch (error) {
        if (error instanceof VellumError) {
          if (error.code === ErrorCode.GIT_BRANCH_EXISTS) {
            return fail(error.message);
          }
          if (error.code === ErrorCode.GIT_BRANCH_NOT_FOUND) {
            return fail(error.message);
          }
          if (error.code === ErrorCode.GIT_TIMEOUT) {
            return fail("Git branch operation timed out");
          }
        }
        throw error;
      }
    },
  });
}

/**
 * Create a git checkout tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git checkout tool
 */
export function createGitCheckoutTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_checkout",
    description:
      "Switch branches, create new branches, or restore specific files from a commit reference.",
    parameters: GitCheckoutInputSchema,
    kind: "write",
    category: "git",

    shouldConfirm(input): boolean {
      return input.force === true;
    },

    async execute(input, ctx): Promise<ToolResult<GitCheckoutResult>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);

      try {
        await trackSnapshot(ctx);

        if (input.paths && input.paths.length > 0) {
          const args = ["checkout", input.target, "--", ...input.paths];
          const result = await git.exec(args, { signal: ctx.abortSignal });

          if (result.exitCode !== 0) {
            return fail(`Failed to restore files: ${result.stderr}`);
          }

          return ok({
            ref: input.target,
            created: false,
            restoredFiles: input.paths,
          });
        }

        if (!input.force) {
          const statusResult = await git.exec(["status", "--porcelain"], {
            signal: ctx.abortSignal,
          });
          if (statusResult.exitCode === 0 && statusResult.stdout.trim().length > 0) {
            const hasChanges = statusResult.stdout
              .split("\n")
              .some((line) => line.length >= 2 && !line.startsWith("??"));

            if (hasChanges) {
              throw gitDirtyWorkdirError();
            }
          }
        }

        if (input.create) {
          const args = ["checkout", "-b", input.target];
          if (input.force) {
            args.splice(1, 0, "-f");
          }

          const result = await git.exec(args, { signal: ctx.abortSignal });

          if (result.exitCode !== 0) {
            if (result.stderr.includes("already exists")) {
              throw gitBranchExistsError(input.target);
            }
            return fail(`Failed to create and checkout branch: ${result.stderr}`);
          }

          return ok({
            ref: input.target,
            created: true,
          });
        }

        const args = ["checkout"];
        if (input.force) {
          args.push("-f");
        }
        args.push(input.target);

        const result = await git.exec(args, { signal: ctx.abortSignal });

        if (result.exitCode !== 0) {
          if (
            result.stderr.includes("did not match any file") ||
            result.stderr.includes("not found")
          ) {
            throw gitBranchNotFoundError(input.target);
          }
          if (result.stderr.includes("local changes") || result.stderr.includes("overwritten")) {
            throw gitDirtyWorkdirError();
          }
          return fail(`Failed to checkout: ${result.stderr}`);
        }

        return ok({
          ref: input.target,
          created: false,
          shouldConfirm: input.force,
          confirmMessage: input.force
            ? `Force checkout to '${input.target}'? Local changes will be discarded.`
            : undefined,
        });
      } catch (error) {
        if (error instanceof VellumError) {
          if (error.code === ErrorCode.GIT_DIRTY_WORKDIR) {
            return fail(error.message);
          }
          if (error.code === ErrorCode.GIT_BRANCH_EXISTS) {
            return fail(error.message);
          }
          if (error.code === ErrorCode.GIT_BRANCH_NOT_FOUND) {
            return fail(error.message);
          }
          if (error.code === ErrorCode.GIT_TIMEOUT) {
            return fail("Git checkout operation timed out");
          }
        }
        throw error;
      }
    },
  });
}

/**
 * Create a git merge tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git merge tool
 */
export function createGitMergeTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_merge",
    description: "Merge a branch into the current branch. Supports --no-ff and merge abort.",
    parameters: GitMergeInputSchema,
    kind: "write",
    category: "git",

    shouldConfirm(_input): boolean {
      return true;
    },

    async execute(input, ctx): Promise<ToolResult<GitMergeResult>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);

      try {
        await trackSnapshot(ctx);

        if (input.abort) {
          const abortResult = await git.exec(["merge", "--abort"], { signal: ctx.abortSignal });

          if (abortResult.exitCode !== 0) {
            if (abortResult.stderr.includes("no merge to abort")) {
              return fail("No merge in progress to abort");
            }
            return fail(`Failed to abort merge: ${abortResult.stderr}`);
          }

          return ok({
            success: true,
            message: "Merge aborted",
          });
        }

        const args = ["merge"];

        if (input.noFf) {
          args.push("--no-ff");
        }

        if (input.message) {
          args.push("-m", input.message);
        }

        args.push(input.branch);

        const mergeResult = await git.exec(args, { signal: ctx.abortSignal });

        if (mergeResult.exitCode !== 0) {
          if (
            mergeResult.stdout.includes("CONFLICT") ||
            mergeResult.stderr.includes("CONFLICT") ||
            mergeResult.stdout.includes("Automatic merge failed")
          ) {
            const statusResult = await git.exec(["status", "--porcelain"], {
              signal: ctx.abortSignal,
            });
            const conflicts = parseConflictFiles(statusResult.stdout);

            throw gitConflictError(conflicts);
          }

          if (mergeResult.stderr.includes("not something we can merge")) {
            throw gitBranchNotFoundError(input.branch);
          }

          return fail(`Merge failed: ${mergeResult.stderr}`);
        }

        const fastForward =
          mergeResult.stdout.includes("Fast-forward") ||
          mergeResult.stdout.includes("fast-forward");

        return ok({
          success: true,
          message: fastForward
            ? `Fast-forward merge of '${input.branch}'`
            : `Merged '${input.branch}' into current branch`,
          fastForward,
          shouldConfirm: true,
          confirmMessage: `Merge branch '${input.branch}' into current branch?`,
        });
      } catch (error) {
        if (error instanceof VellumError) {
          if (error.code === ErrorCode.GIT_CONFLICT) {
            const files = (error.context as { files?: string[] })?.files ?? [];
            return ok({
              success: false,
              message: error.message,
              conflicts: files,
            });
          }
          if (error.code === ErrorCode.GIT_BRANCH_NOT_FOUND) {
            return fail(error.message);
          }
          if (error.code === ErrorCode.GIT_TIMEOUT) {
            return fail("Git merge operation timed out");
          }
        }
        throw error;
      }
    },
  });
}
