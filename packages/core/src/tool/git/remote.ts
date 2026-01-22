// ============================================
// Git Network Tools - T017
// git_fetch, git_pull, git_push, git_remote
// ============================================

import { z } from "zod";

import { ErrorCode, VellumError } from "../../errors/types.js";
import { defineTool, fail, ok, type ToolContext, type ToolResult } from "../../types/tool.js";
import { gitConflictError, gitRemoteError } from "./errors.js";
import { GIT_TIMEOUTS } from "./types.js";
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
// Git Fetch Schemas and Types
// =============================================================================

/**
 * Input schema for git_fetch tool.
 */
export const GitFetchInputSchema = z.object({
  remote: z.string().optional().default("origin").describe("Remote name (default: origin)"),
  branch: z.string().optional().describe("Specific branch to fetch"),
  all: z.boolean().optional().describe("Fetch all remotes"),
  prune: z.boolean().optional().describe("Prune deleted remote branches"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitFetchInput = z.infer<typeof GitFetchInputSchema>;

/**
 * Result of git fetch operation.
 */
export interface GitFetchResult {
  /** Whether fetch was successful */
  success: boolean;
  /** Remote fetched from */
  remote: string;
  /** Summary message */
  message: string;
  /** Branch fetched (if specific) */
  branch?: string;
  /** Whether branches were pruned */
  pruned?: boolean;
}

// =============================================================================
// Git Pull Schemas and Types
// =============================================================================

/**
 * Input schema for git_pull tool.
 */
export const GitPullInputSchema = z.object({
  remote: z.string().optional().default("origin").describe("Remote name (default: origin)"),
  branch: z.string().optional().describe("Branch to pull"),
  rebase: z.boolean().optional().describe("Use rebase instead of merge"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitPullInput = z.infer<typeof GitPullInputSchema>;

/**
 * Result of git pull operation.
 */
export interface GitPullResult {
  /** Whether pull was successful */
  success: boolean;
  /** Remote pulled from */
  remote: string;
  /** Summary message */
  message: string;
  /** Whether rebase was used */
  rebased?: boolean;
  /** Files updated */
  filesUpdated?: number;
  /** Conflicting files (if any) */
  conflicts?: string[];
}

// =============================================================================
// Git Push Schemas and Types
// =============================================================================

/**
 * Input schema for git_push tool.
 */
export const GitPushInputSchema = z.object({
  remote: z.string().optional().default("origin").describe("Remote name (default: origin)"),
  branch: z.string().optional().describe("Branch to push"),
  force: z.boolean().optional().describe("Force push (dangerous)"),
  setUpstream: z.boolean().optional().describe("Set upstream tracking reference"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitPushInput = z.infer<typeof GitPushInputSchema>;

/**
 * Result of git push operation.
 */
export interface GitPushResult {
  /** Whether push was successful */
  success: boolean;
  /** Remote pushed to */
  remote: string;
  /** Summary message */
  message: string;
  /** Branch pushed */
  branch?: string;
  /** Whether force was used */
  forced?: boolean;
  /** Whether user confirmation should be requested */
  shouldConfirm?: boolean;
  /** Message to show for confirmation */
  confirmMessage?: string;
}

// =============================================================================
// Git Remote Schemas and Types
// =============================================================================

/**
 * Input schema for git_remote tool.
 */
export const GitRemoteInputSchema = z.object({
  action: z.enum(["list", "add", "remove", "rename"]).describe("Remote operation to perform"),
  name: z.string().optional().describe("Remote name (for add/remove/rename)"),
  url: z.string().optional().describe("Remote URL (for add)"),
  newName: z.string().optional().describe("New remote name (for rename)"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitRemoteInput = z.infer<typeof GitRemoteInputSchema>;

/**
 * Remote entry with URL information.
 */
export interface GitRemoteEntry {
  /** Remote name */
  name: string;
  /** Fetch URL */
  fetchUrl: string;
  /** Push URL */
  pushUrl: string;
}

/**
 * Result of git remote list operation.
 */
export interface GitRemoteListResult {
  /** List of remotes */
  remotes: GitRemoteEntry[];
}

/**
 * Result of git remote add/remove/rename operations.
 */
export interface GitRemoteMutateResult {
  /** Success message */
  message: string;
  /** Remote name affected */
  name: string;
  /** Whether user confirmation should be requested */
  shouldConfirm?: boolean;
  /** Message to show for confirmation */
  confirmMessage?: string;
}

/**
 * Unified result type for git_remote tool.
 */
export type GitRemoteResult = GitRemoteListResult | GitRemoteMutateResult;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse git remote -v output into structured result.
 *
 * @param output - Raw output from git remote -v
 * @returns List of remote entries
 */
export function parseRemoteVerboseOutput(output: string): GitRemoteEntry[] {
  const remotes = new Map<string, GitRemoteEntry>();
  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    // Format: origin	https://github.com/user/repo.git (fetch)
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (match?.[1] && match[2] && match[3]) {
      const name = match[1];
      const url = match[2];
      const type = match[3];

      if (!remotes.has(name)) {
        remotes.set(name, { name, fetchUrl: "", pushUrl: "" });
      }

      const entry = remotes.get(name);
      if (entry) {
        if (type === "fetch") {
          entry.fetchUrl = url;
        } else {
          entry.pushUrl = url;
        }
      }
    }
  }

  return Array.from(remotes.values());
}

/**
 * Parse conflict files from git output.
 *
 * @param output - Raw output from git pull/merge
 * @returns List of conflicting file paths
 */
export function parseConflictFilesFromOutput(output: string): string[] {
  const conflicts: string[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // Format: CONFLICT (content): Merge conflict in path/to/file.ts
    const contentMatch = line.match(/^CONFLICT \(content\): Merge conflict in (.+)$/);
    if (contentMatch?.[1]) {
      conflicts.push(contentMatch[1]);
      continue;
    }

    // Format: CONFLICT (add/add): Merge conflict in path/to/file.ts
    const addMatch = line.match(/^CONFLICT \(add\/add\): Merge conflict in (.+)$/);
    if (addMatch?.[1]) {
      conflicts.push(addMatch[1]);
      continue;
    }

    // Format: CONFLICT (modify/delete): path/to/file.ts
    const modifyMatch = line.match(/^CONFLICT \(modify\/delete\): (.+?) deleted/);
    if (modifyMatch?.[1]) {
      conflicts.push(modifyMatch[1]);
    }
  }

  return conflicts;
}

/**
 * Count files updated from git pull output.
 *
 * @param output - Raw output from git pull
 * @returns Number of files updated, or undefined if not parseable
 */
export function parseFilesUpdated(output: string): number | undefined {
  // Format: " 5 files changed, 100 insertions(+), 50 deletions(-)"
  const match = output.match(/(\d+) files? changed/);
  if (match?.[1]) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

// =============================================================================
// Git Fetch Tool Definition
// =============================================================================

/**
 * Git fetch tool.
 *
 * Fetches updates from a remote repository.
 */
export const gitFetchTool = defineTool({
  name: "git_fetch",
  description:
    "Fetch updates from a remote repository without modifying the working directory. Supports fetching all remotes and pruning deleted branches.",
  parameters: GitFetchInputSchema,
  kind: "read",
  category: "git",

  async execute(input, ctx): Promise<ToolResult<GitFetchResult>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);
    const remote = input.remote ?? "origin";

    try {
      const args = ["fetch"];

      if (input.all) {
        args.push("--all");
      } else {
        args.push(remote);
        if (input.branch) {
          args.push(input.branch);
        }
      }

      if (input.prune) {
        args.push("--prune");
      }

      const result = await git.exec(args, {
        timeout: GIT_TIMEOUTS.NETWORK,
        signal: ctx.abortSignal,
      });

      if (result.exitCode !== 0) {
        if (result.stderr.includes("not a git repository")) {
          return fail(`Not a git repository: ${cwd}`);
        }
        if (
          result.stderr.includes("Could not resolve host") ||
          result.stderr.includes("Could not read from remote") ||
          result.stderr.includes("fatal: unable to access")
        ) {
          throw gitRemoteError(result.stderr.trim());
        }
        return fail(`Fetch failed: ${result.stderr}`);
      }

      // Build message from output
      let message = "Fetch completed successfully";
      if (result.stderr.trim()) {
        // Git fetch output goes to stderr
        const fetchOutput = result.stderr.trim();
        if (fetchOutput.includes("->")) {
          message = fetchOutput;
        }
      }

      return ok({
        success: true,
        remote: input.all ? "all" : remote,
        message,
        branch: input.branch,
        pruned: input.prune,
      });
    } catch (error) {
      if (error instanceof VellumError) {
        if (error.code === ErrorCode.GIT_REMOTE_ERROR) {
          return fail(error.message);
        }
        if (error.code === ErrorCode.GIT_TIMEOUT) {
          return fail(error.message);
        }
      }
      throw error;
    }
  },
});

// =============================================================================
// Git Pull Tool Definition
// =============================================================================

/**
 * Git pull tool.
 *
 * Fetches and integrates changes from a remote repository.
 */
export const gitPullTool = defineTool({
  name: "git_pull",
  description:
    "Pull changes from a remote repository (fetch + merge/rebase). Creates a snapshot before pulling for safety.",
  parameters: GitPullInputSchema,
  kind: "write",
  category: "git",

  async execute(input, ctx): Promise<ToolResult<GitPullResult>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);
    const remote = input.remote ?? "origin";

    try {
      // Take snapshot before potentially destructive operation
      await trackSnapshot(ctx);

      const args = ["pull"];

      if (input.rebase) {
        args.push("--rebase");
      }

      args.push(remote);
      if (input.branch) {
        args.push(input.branch);
      }

      const result = await git.exec(args, {
        timeout: GIT_TIMEOUTS.NETWORK,
        signal: ctx.abortSignal,
      });

      if (result.exitCode !== 0) {
        if (result.stderr.includes("not a git repository")) {
          return fail(`Not a git repository: ${cwd}`);
        }

        // Check for conflicts
        const combinedOutput = `${result.stdout}\n${result.stderr}`;
        if (
          combinedOutput.includes("CONFLICT") ||
          combinedOutput.includes("Automatic merge failed")
        ) {
          const conflicts = parseConflictFilesFromOutput(combinedOutput);
          if (conflicts.length > 0) {
            throw gitConflictError(conflicts);
          }
          return fail("Merge conflict detected. Use git_conflict_info to see conflicting files.");
        }

        if (
          result.stderr.includes("Could not resolve host") ||
          result.stderr.includes("Could not read from remote") ||
          result.stderr.includes("fatal: unable to access")
        ) {
          throw gitRemoteError(result.stderr.trim());
        }

        return fail(`Pull failed: ${result.stderr}`);
      }

      // Parse output for summary
      const combinedOutput = `${result.stdout}\n${result.stderr}`;
      const filesUpdated = parseFilesUpdated(combinedOutput);

      let message = "Pull completed successfully";
      if (combinedOutput.includes("Already up to date")) {
        message = "Already up to date";
      } else if (combinedOutput.includes("Fast-forward")) {
        message = "Fast-forward merge completed";
      } else if (input.rebase && combinedOutput.includes("Successfully rebased")) {
        message = "Rebase completed successfully";
      }

      return ok({
        success: true,
        remote,
        message,
        rebased: input.rebase,
        filesUpdated,
      });
    } catch (error) {
      if (error instanceof VellumError) {
        if (error.code === ErrorCode.GIT_CONFLICT) {
          const conflictErr = error as VellumError & { context?: { files?: string[] } };
          return fail(
            `Conflict detected in files: ${conflictErr.context?.files?.join(", ") ?? "unknown"}`
          );
        }
        if (error.code === ErrorCode.GIT_REMOTE_ERROR) {
          return fail(error.message);
        }
        if (error.code === ErrorCode.GIT_TIMEOUT) {
          return fail(error.message);
        }
      }
      throw error;
    }
  },
});

// =============================================================================
// Git Push Tool Definition
// =============================================================================

/**
 * Git push tool.
 *
 * Pushes local commits to a remote repository.
 */
export const gitPushTool = defineTool({
  name: "git_push",
  description:
    "Push local commits to a remote repository. Supports force push (with confirmation) and setting upstream tracking.",
  parameters: GitPushInputSchema,
  kind: "write",
  category: "git",

  shouldConfirm(input): boolean {
    // Force push requires confirmation
    return input.force === true;
  },

  async execute(input, ctx): Promise<ToolResult<GitPushResult>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);
    const remote = input.remote ?? "origin";

    try {
      const args = ["push"];

      if (input.force) {
        args.push("--force");
      }

      if (input.setUpstream) {
        args.push("--set-upstream");
      }

      args.push(remote);
      if (input.branch) {
        args.push(input.branch);
      }

      const result = await git.exec(args, {
        timeout: GIT_TIMEOUTS.NETWORK,
        signal: ctx.abortSignal,
      });

      if (result.exitCode !== 0) {
        if (result.stderr.includes("not a git repository")) {
          return fail(`Not a git repository: ${cwd}`);
        }
        if (
          result.stderr.includes("Could not resolve host") ||
          result.stderr.includes("Could not read from remote") ||
          result.stderr.includes("fatal: unable to access") ||
          result.stderr.includes("Permission denied") ||
          result.stderr.includes("rejected")
        ) {
          throw gitRemoteError(result.stderr.trim());
        }
        return fail(`Push failed: ${result.stderr}`);
      }

      // Build message from output
      let message = "Push completed successfully";
      const output = result.stderr.trim() || result.stdout.trim();
      if (output.includes("->")) {
        // Extract the branch reference
        const match = output.match(/([^\s]+)\s*->\s*([^\s]+)/);
        if (match) {
          message = `Pushed ${match[1]} to ${match[2]}`;
        }
      } else if (output.includes("Everything up-to-date")) {
        message = "Everything up-to-date";
      }

      return ok({
        success: true,
        remote,
        message,
        branch: input.branch,
        forced: input.force,
      });
    } catch (error) {
      if (error instanceof VellumError) {
        if (error.code === ErrorCode.GIT_REMOTE_ERROR) {
          return fail(error.message);
        }
        if (error.code === ErrorCode.GIT_TIMEOUT) {
          return fail(error.message);
        }
      }
      throw error;
    }
  },
});

// =============================================================================
// Git Remote Tool Definition
// =============================================================================

/**
 * Git remote tool.
 *
 * Manages remote repository references.
 */
export const gitRemoteTool = defineTool({
  name: "git_remote",
  description:
    "Manage remote repository references: list all remotes, add new remote, remove remote (with confirmation), or rename remote.",
  parameters: GitRemoteInputSchema,
  kind: "write",
  category: "git",

  shouldConfirm(input): boolean {
    // Remove requires confirmation
    return input.action === "remove";
  },

  async execute(input, ctx): Promise<ToolResult<GitRemoteResult>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);

    try {
      switch (input.action) {
        case "list": {
          const result = await git.exec(["remote", "-v"], { signal: ctx.abortSignal });

          if (result.exitCode !== 0) {
            if (result.stderr.includes("not a git repository")) {
              return fail(`Not a git repository: ${cwd}`);
            }
            return fail(`Failed to list remotes: ${result.stderr}`);
          }

          const remotes = parseRemoteVerboseOutput(result.stdout);
          return ok({ remotes });
        }

        case "add": {
          if (!input.name) {
            return fail("Remote name is required for add action");
          }
          if (!input.url) {
            return fail("Remote URL is required for add action");
          }

          const result = await git.exec(["remote", "add", input.name, input.url], {
            signal: ctx.abortSignal,
          });

          if (result.exitCode !== 0) {
            if (result.stderr.includes("not a git repository")) {
              return fail(`Not a git repository: ${cwd}`);
            }
            if (result.stderr.includes("already exists")) {
              return fail(`Remote '${input.name}' already exists`);
            }
            return fail(`Failed to add remote: ${result.stderr}`);
          }

          return ok({
            message: `Added remote '${input.name}' with URL '${input.url}'`,
            name: input.name,
          });
        }

        case "remove": {
          if (!input.name) {
            return fail("Remote name is required for remove action");
          }

          const result = await git.exec(["remote", "remove", input.name], {
            signal: ctx.abortSignal,
          });

          if (result.exitCode !== 0) {
            if (result.stderr.includes("not a git repository")) {
              return fail(`Not a git repository: ${cwd}`);
            }
            if (
              result.stderr.includes("No such remote") ||
              result.stderr.includes("does not exist")
            ) {
              return fail(`Remote '${input.name}' does not exist`);
            }
            return fail(`Failed to remove remote: ${result.stderr}`);
          }

          return ok({
            message: `Removed remote '${input.name}'`,
            name: input.name,
          });
        }

        case "rename": {
          if (!input.name) {
            return fail("Remote name is required for rename action");
          }
          if (!input.newName) {
            return fail("New remote name is required for rename action");
          }

          const result = await git.exec(["remote", "rename", input.name, input.newName], {
            signal: ctx.abortSignal,
          });

          if (result.exitCode !== 0) {
            if (result.stderr.includes("not a git repository")) {
              return fail(`Not a git repository: ${cwd}`);
            }
            if (
              result.stderr.includes("No such remote") ||
              result.stderr.includes("does not exist")
            ) {
              return fail(`Remote '${input.name}' does not exist`);
            }
            if (result.stderr.includes("already exists")) {
              return fail(`Remote '${input.newName}' already exists`);
            }
            return fail(`Failed to rename remote: ${result.stderr}`);
          }

          return ok({
            message: `Renamed remote '${input.name}' to '${input.newName}'`,
            name: input.newName,
          });
        }

        default: {
          return fail(`Unknown action: ${input.action}`);
        }
      }
    } catch (error) {
      if (error instanceof VellumError) {
        if (error.code === ErrorCode.GIT_TIMEOUT) {
          return fail(error.message);
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
 * Create a git fetch tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git fetch tool
 */
export function createGitFetchTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_fetch",
    description:
      "Fetch updates from a remote repository without modifying the working directory. Supports fetching all remotes and pruning deleted branches.",
    parameters: GitFetchInputSchema,
    kind: "read",
    category: "git",

    async execute(input, ctx): Promise<ToolResult<GitFetchResult>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);
      const remote = input.remote ?? "origin";

      try {
        const args = ["fetch"];

        if (input.all) {
          args.push("--all");
        } else {
          args.push(remote);
          if (input.branch) {
            args.push(input.branch);
          }
        }

        if (input.prune) {
          args.push("--prune");
        }

        const result = await git.exec(args, {
          timeout: GIT_TIMEOUTS.NETWORK,
          signal: ctx.abortSignal,
        });

        if (result.exitCode !== 0) {
          if (result.stderr.includes("not a git repository")) {
            return fail(`Not a git repository: ${cwd}`);
          }
          if (
            result.stderr.includes("Could not resolve host") ||
            result.stderr.includes("Could not read from remote") ||
            result.stderr.includes("fatal: unable to access")
          ) {
            throw gitRemoteError(result.stderr.trim());
          }
          return fail(`Fetch failed: ${result.stderr}`);
        }

        let message = "Fetch completed successfully";
        if (result.stderr.trim()) {
          const fetchOutput = result.stderr.trim();
          if (fetchOutput.includes("->")) {
            message = fetchOutput;
          }
        }

        return ok({
          success: true,
          remote: input.all ? "all" : remote,
          message,
          branch: input.branch,
          pruned: input.prune,
        });
      } catch (error) {
        if (error instanceof VellumError) {
          if (error.code === ErrorCode.GIT_REMOTE_ERROR) {
            return fail(error.message);
          }
          if (error.code === ErrorCode.GIT_TIMEOUT) {
            return fail(error.message);
          }
        }
        throw error;
      }
    },
  });
}

/**
 * Create a git pull tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @param snapshotFn - Optional snapshot function for testing
 * @returns Configured git pull tool
 */
export function createGitPullTool(
  gitOpsFactory: typeof createGitOps = createGitOps,
  snapshotFn?: () => Promise<void>
) {
  return defineTool({
    name: "git_pull",
    description:
      "Pull changes from a remote repository (fetch + merge/rebase). Creates a snapshot before pulling for safety.",
    parameters: GitPullInputSchema,
    kind: "write",
    category: "git",

    async execute(input, ctx): Promise<ToolResult<GitPullResult>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);
      const remote = input.remote ?? "origin";

      try {
        // Take snapshot before potentially destructive operation
        if (snapshotFn) {
          await snapshotFn();
        } else {
          await trackSnapshot(ctx);
        }

        const args = ["pull"];

        if (input.rebase) {
          args.push("--rebase");
        }

        args.push(remote);
        if (input.branch) {
          args.push(input.branch);
        }

        const result = await git.exec(args, {
          timeout: GIT_TIMEOUTS.NETWORK,
          signal: ctx.abortSignal,
        });

        if (result.exitCode !== 0) {
          if (result.stderr.includes("not a git repository")) {
            return fail(`Not a git repository: ${cwd}`);
          }

          const combinedOutput = `${result.stdout}\n${result.stderr}`;
          if (
            combinedOutput.includes("CONFLICT") ||
            combinedOutput.includes("Automatic merge failed")
          ) {
            const conflicts = parseConflictFilesFromOutput(combinedOutput);
            if (conflicts.length > 0) {
              throw gitConflictError(conflicts);
            }
            return fail("Merge conflict detected. Use git_conflict_info to see conflicting files.");
          }

          if (
            result.stderr.includes("Could not resolve host") ||
            result.stderr.includes("Could not read from remote") ||
            result.stderr.includes("fatal: unable to access")
          ) {
            throw gitRemoteError(result.stderr.trim());
          }

          return fail(`Pull failed: ${result.stderr}`);
        }

        const combinedOutput = `${result.stdout}\n${result.stderr}`;
        const filesUpdated = parseFilesUpdated(combinedOutput);

        let message = "Pull completed successfully";
        if (combinedOutput.includes("Already up to date")) {
          message = "Already up to date";
        } else if (combinedOutput.includes("Fast-forward")) {
          message = "Fast-forward merge completed";
        } else if (input.rebase && combinedOutput.includes("Successfully rebased")) {
          message = "Rebase completed successfully";
        }

        return ok({
          success: true,
          remote,
          message,
          rebased: input.rebase,
          filesUpdated,
        });
      } catch (error) {
        if (error instanceof VellumError) {
          if (error.code === ErrorCode.GIT_CONFLICT) {
            const conflictErr = error as VellumError & { context?: { files?: string[] } };
            return fail(
              `Conflict detected in files: ${conflictErr.context?.files?.join(", ") ?? "unknown"}`
            );
          }
          if (error.code === ErrorCode.GIT_REMOTE_ERROR) {
            return fail(error.message);
          }
          if (error.code === ErrorCode.GIT_TIMEOUT) {
            return fail(error.message);
          }
        }
        throw error;
      }
    },
  });
}

/**
 * Create a git push tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git push tool
 */
export function createGitPushTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_push",
    description:
      "Push local commits to a remote repository. Supports force push (with confirmation) and setting upstream tracking.",
    parameters: GitPushInputSchema,
    kind: "write",
    category: "git",

    shouldConfirm(input): boolean {
      return input.force === true;
    },

    async execute(input, ctx): Promise<ToolResult<GitPushResult>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);
      const remote = input.remote ?? "origin";

      try {
        const args = ["push"];

        if (input.force) {
          args.push("--force");
        }

        if (input.setUpstream) {
          args.push("--set-upstream");
        }

        args.push(remote);
        if (input.branch) {
          args.push(input.branch);
        }

        const result = await git.exec(args, {
          timeout: GIT_TIMEOUTS.NETWORK,
          signal: ctx.abortSignal,
        });

        if (result.exitCode !== 0) {
          if (result.stderr.includes("not a git repository")) {
            return fail(`Not a git repository: ${cwd}`);
          }
          if (
            result.stderr.includes("Could not resolve host") ||
            result.stderr.includes("Could not read from remote") ||
            result.stderr.includes("fatal: unable to access") ||
            result.stderr.includes("Permission denied") ||
            result.stderr.includes("rejected")
          ) {
            throw gitRemoteError(result.stderr.trim());
          }
          return fail(`Push failed: ${result.stderr}`);
        }

        let message = "Push completed successfully";
        const output = result.stderr.trim() || result.stdout.trim();
        if (output.includes("->")) {
          const match = output.match(/([^\s]+)\s*->\s*([^\s]+)/);
          if (match) {
            message = `Pushed ${match[1]} to ${match[2]}`;
          }
        } else if (output.includes("Everything up-to-date")) {
          message = "Everything up-to-date";
        }

        return ok({
          success: true,
          remote,
          message,
          branch: input.branch,
          forced: input.force,
        });
      } catch (error) {
        if (error instanceof VellumError) {
          if (error.code === ErrorCode.GIT_REMOTE_ERROR) {
            return fail(error.message);
          }
          if (error.code === ErrorCode.GIT_TIMEOUT) {
            return fail(error.message);
          }
        }
        throw error;
      }
    },
  });
}

/**
 * Create a git remote tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git remote tool
 */
export function createGitRemoteTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_remote",
    description:
      "Manage remote repository references: list all remotes, add new remote, remove remote (with confirmation), or rename remote.",
    parameters: GitRemoteInputSchema,
    kind: "write",
    category: "git",

    shouldConfirm(input): boolean {
      return input.action === "remove";
    },

    async execute(input, ctx): Promise<ToolResult<GitRemoteResult>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);

      try {
        switch (input.action) {
          case "list": {
            const result = await git.exec(["remote", "-v"], { signal: ctx.abortSignal });

            if (result.exitCode !== 0) {
              if (result.stderr.includes("not a git repository")) {
                return fail(`Not a git repository: ${cwd}`);
              }
              return fail(`Failed to list remotes: ${result.stderr}`);
            }

            const remotes = parseRemoteVerboseOutput(result.stdout);
            return ok({ remotes });
          }

          case "add": {
            if (!input.name) {
              return fail("Remote name is required for add action");
            }
            if (!input.url) {
              return fail("Remote URL is required for add action");
            }

            const result = await git.exec(["remote", "add", input.name, input.url], {
              signal: ctx.abortSignal,
            });

            if (result.exitCode !== 0) {
              if (result.stderr.includes("not a git repository")) {
                return fail(`Not a git repository: ${cwd}`);
              }
              if (result.stderr.includes("already exists")) {
                return fail(`Remote '${input.name}' already exists`);
              }
              return fail(`Failed to add remote: ${result.stderr}`);
            }

            return ok({
              message: `Added remote '${input.name}' with URL '${input.url}'`,
              name: input.name,
            });
          }

          case "remove": {
            if (!input.name) {
              return fail("Remote name is required for remove action");
            }

            const result = await git.exec(["remote", "remove", input.name], {
              signal: ctx.abortSignal,
            });

            if (result.exitCode !== 0) {
              if (result.stderr.includes("not a git repository")) {
                return fail(`Not a git repository: ${cwd}`);
              }
              if (
                result.stderr.includes("No such remote") ||
                result.stderr.includes("does not exist")
              ) {
                return fail(`Remote '${input.name}' does not exist`);
              }
              return fail(`Failed to remove remote: ${result.stderr}`);
            }

            return ok({
              message: `Removed remote '${input.name}'`,
              name: input.name,
            });
          }

          case "rename": {
            if (!input.name) {
              return fail("Remote name is required for rename action");
            }
            if (!input.newName) {
              return fail("New remote name is required for rename action");
            }

            const result = await git.exec(["remote", "rename", input.name, input.newName], {
              signal: ctx.abortSignal,
            });

            if (result.exitCode !== 0) {
              if (result.stderr.includes("not a git repository")) {
                return fail(`Not a git repository: ${cwd}`);
              }
              if (
                result.stderr.includes("No such remote") ||
                result.stderr.includes("does not exist")
              ) {
                return fail(`Remote '${input.name}' does not exist`);
              }
              if (result.stderr.includes("already exists")) {
                return fail(`Remote '${input.newName}' already exists`);
              }
              return fail(`Failed to rename remote: ${result.stderr}`);
            }

            return ok({
              message: `Renamed remote '${input.name}' to '${input.newName}'`,
              name: input.newName,
            });
          }

          default: {
            return fail(`Unknown action: ${input.action}`);
          }
        }
      } catch (error) {
        if (error instanceof VellumError) {
          if (error.code === ErrorCode.GIT_TIMEOUT) {
            return fail(error.message);
          }
        }
        throw error;
      }
    },
  });
}
