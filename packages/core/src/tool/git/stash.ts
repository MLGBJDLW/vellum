// ============================================
// Git Stash Tool - T014
// ============================================

import { z } from "zod";

import { ErrorCode, VellumError } from "../../errors/types.js";
import { defineTool, fail, ok, type ToolResult } from "../../types/tool.js";
import { gitStashEmptyError } from "./errors.js";
import { createGitOps } from "./utils.js";

// =============================================================================
// Stash Schemas and Types
// =============================================================================

/**
 * Input schema for git_stash tool.
 */
export const GitStashInputSchema = z.object({
  action: z
    .enum(["push", "pop", "apply", "list", "drop", "clear"])
    .describe("Stash operation to perform"),
  message: z.string().optional().describe("Message for push operation"),
  index: z.number().optional().describe("Stash index for apply/drop operations"),
  includeUntracked: z
    .boolean()
    .optional()
    .describe("Include untracked files for push (default: false)"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitStashInput = z.infer<typeof GitStashInputSchema>;

/**
 * Stash entry information.
 */
export interface GitStashEntry {
  /** Stash index */
  index: number;
  /** Stash message/description */
  message: string;
}

/**
 * Result of git stash push operation.
 */
export interface GitStashPushResult {
  /** Whether changes were stashed */
  stashed: boolean;
  /** Stash message */
  message: string;
}

/**
 * Result of git stash pop/apply operation.
 */
export interface GitStashApplyResult {
  /** Whether stash was applied */
  applied: boolean;
  /** Result message */
  message: string;
}

/**
 * Result of git stash list operation.
 */
export interface GitStashListResult {
  /** List of stash entries */
  stashes: GitStashEntry[];
}

/**
 * Result of git stash drop operation.
 */
export interface GitStashDropResult {
  /** Whether stash was dropped */
  dropped: boolean;
  /** Index of dropped stash */
  index?: number;
}

/**
 * Result of git stash clear operation.
 */
export interface GitStashClearResult {
  /** Number of stashes cleared */
  count: number;
}

/**
 * Unified result type for git_stash tool.
 */
export type GitStashResult =
  | GitStashPushResult
  | GitStashApplyResult
  | GitStashListResult
  | GitStashDropResult
  | GitStashClearResult;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse git stash list output into structured entries.
 *
 * @param output - Raw output from git stash list
 * @returns Array of stash entries
 */
export function parseStashListOutput(output: string): GitStashEntry[] {
  const entries: GitStashEntry[] = [];
  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    // Format: stash@{0}: WIP on branch: message
    // Or: stash@{0}: On branch: message
    const match = line.match(/^stash@\{(\d+)\}:\s*(.+)$/);
    if (match && match[1] !== undefined && match[2] !== undefined) {
      entries.push({
        index: parseInt(match[1], 10),
        message: match[2],
      });
    }
  }

  return entries;
}

// =============================================================================
// Git Stash Tool Definition
// =============================================================================

/**
 * Git stash tool.
 *
 * Manages stashed changes: push, pop, apply, list, drop, clear.
 */
export const gitStashTool = defineTool({
  name: "git_stash",
  description:
    "Manage stashed changes: push (save), pop (apply and remove), apply (apply without remove), list, drop (remove specific), clear (remove all).",
  parameters: GitStashInputSchema,
  kind: "write",
  category: "git",

  shouldConfirm(input): boolean {
    // Confirm for destructive operations
    return input.action === "drop" || input.action === "clear";
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Git stash requires handling push/pop/apply/drop/list/clear/show operations
  async execute(input, ctx): Promise<ToolResult<GitStashResult>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);

    try {
      switch (input.action) {
        case "push": {
          const args = ["stash", "push"];

          if (input.includeUntracked) {
            args.push("--include-untracked");
          }

          if (input.message) {
            args.push("-m", input.message);
          }

          const result = await git.exec(args, { signal: ctx.abortSignal });

          if (result.exitCode !== 0) {
            if (result.stderr.includes("not a git repository")) {
              return fail(`Not a git repository: ${cwd}`);
            }
            return fail(`Failed to stash: ${result.stderr}`);
          }

          // Check if anything was actually stashed
          const noChanges =
            result.stdout.includes("No local changes to save") ||
            result.stderr.includes("No local changes to save");

          if (noChanges) {
            return ok({
              stashed: false,
              message: "No local changes to save",
            });
          }

          return ok({
            stashed: true,
            message: input.message ?? "Changes stashed",
          });
        }

        case "pop": {
          // First check if stash is empty
          const listResult = await git.exec(["stash", "list"], { signal: ctx.abortSignal });
          if (listResult.exitCode === 0 && listResult.stdout.trim() === "") {
            throw gitStashEmptyError();
          }

          const result = await git.exec(["stash", "pop"], { signal: ctx.abortSignal });

          if (result.exitCode !== 0) {
            if (result.stderr.includes("No stash entries found")) {
              throw gitStashEmptyError();
            }
            return fail(`Failed to pop stash: ${result.stderr}`);
          }

          return ok({
            applied: true,
            message: "Stash popped and applied",
          });
        }

        case "apply": {
          // First check if stash is empty
          const listResult = await git.exec(["stash", "list"], { signal: ctx.abortSignal });
          if (listResult.exitCode === 0 && listResult.stdout.trim() === "") {
            throw gitStashEmptyError();
          }

          const args = ["stash", "apply"];
          if (input.index !== undefined) {
            args.push(`stash@{${input.index}}`);
          }

          const result = await git.exec(args, { signal: ctx.abortSignal });

          if (result.exitCode !== 0) {
            if (
              result.stderr.includes("No stash entries found") ||
              result.stderr.includes("does not exist")
            ) {
              throw gitStashEmptyError();
            }
            return fail(`Failed to apply stash: ${result.stderr}`);
          }

          return ok({
            applied: true,
            message: input.index !== undefined ? `Stash@{${input.index}} applied` : "Stash applied",
          });
        }

        case "list": {
          const result = await git.exec(["stash", "list"], { signal: ctx.abortSignal });

          if (result.exitCode !== 0) {
            return fail(`Failed to list stashes: ${result.stderr}`);
          }

          const stashes = parseStashListOutput(result.stdout);

          return ok({
            stashes,
          });
        }

        case "drop": {
          // First check if stash is empty
          const listResult = await git.exec(["stash", "list"], { signal: ctx.abortSignal });
          if (listResult.exitCode === 0 && listResult.stdout.trim() === "") {
            throw gitStashEmptyError();
          }

          const args = ["stash", "drop"];
          if (input.index !== undefined) {
            args.push(`stash@{${input.index}}`);
          }

          const result = await git.exec(args, { signal: ctx.abortSignal });

          if (result.exitCode !== 0) {
            if (
              result.stderr.includes("No stash entries found") ||
              result.stderr.includes("does not exist")
            ) {
              throw gitStashEmptyError();
            }
            return fail(`Failed to drop stash: ${result.stderr}`);
          }

          return ok({
            dropped: true,
            index: input.index,
          });
        }

        case "clear": {
          // First get count for reporting
          const listResult = await git.exec(["stash", "list"], { signal: ctx.abortSignal });
          const stashes = parseStashListOutput(listResult.stdout);
          const count = stashes.length;

          const result = await git.exec(["stash", "clear"], { signal: ctx.abortSignal });

          if (result.exitCode !== 0) {
            return fail(`Failed to clear stashes: ${result.stderr}`);
          }

          return ok({
            count,
          });
        }

        default:
          return fail(`Unknown action: ${input.action}`);
      }
    } catch (error) {
      if (error instanceof VellumError) {
        if (error.code === ErrorCode.GIT_STASH_EMPTY) {
          return fail(error.message);
        }
      }
      if (error instanceof Error && error.message.includes("No stash entries found")) {
        return fail("No stash entries found");
      }
      throw error;
    }
  },
});

// =============================================================================
// Factory Export (for testing with custom git ops)
// =============================================================================

/**
 * Create a git stash tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git stash tool
 */
export function createGitStashTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_stash",
    description:
      "Manage stashed changes: push (save), pop (apply and remove), apply (apply without remove), list, drop (remove specific), clear (remove all).",
    parameters: GitStashInputSchema,
    kind: "write",
    category: "git",

    shouldConfirm(input): boolean {
      return input.action === "drop" || input.action === "clear";
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Git stash requires handling push/pop/apply/drop/list/clear/show operations
    async execute(input, ctx): Promise<ToolResult<GitStashResult>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);

      try {
        switch (input.action) {
          case "push": {
            const args = ["stash", "push"];

            if (input.includeUntracked) {
              args.push("--include-untracked");
            }

            if (input.message) {
              args.push("-m", input.message);
            }

            const result = await git.exec(args, { signal: ctx.abortSignal });

            if (result.exitCode !== 0) {
              if (result.stderr.includes("not a git repository")) {
                return fail(`Not a git repository: ${cwd}`);
              }
              return fail(`Failed to stash: ${result.stderr}`);
            }

            const noChanges =
              result.stdout.includes("No local changes to save") ||
              result.stderr.includes("No local changes to save");

            if (noChanges) {
              return ok({
                stashed: false,
                message: "No local changes to save",
              });
            }

            return ok({
              stashed: true,
              message: input.message ?? "Changes stashed",
            });
          }

          case "pop": {
            const listResult = await git.exec(["stash", "list"], { signal: ctx.abortSignal });
            if (listResult.exitCode === 0 && listResult.stdout.trim() === "") {
              throw gitStashEmptyError();
            }

            const result = await git.exec(["stash", "pop"], { signal: ctx.abortSignal });

            if (result.exitCode !== 0) {
              if (result.stderr.includes("No stash entries found")) {
                throw gitStashEmptyError();
              }
              return fail(`Failed to pop stash: ${result.stderr}`);
            }

            return ok({
              applied: true,
              message: "Stash popped and applied",
            });
          }

          case "apply": {
            const listResult = await git.exec(["stash", "list"], { signal: ctx.abortSignal });
            if (listResult.exitCode === 0 && listResult.stdout.trim() === "") {
              throw gitStashEmptyError();
            }

            const args = ["stash", "apply"];
            if (input.index !== undefined) {
              args.push(`stash@{${input.index}}`);
            }

            const result = await git.exec(args, { signal: ctx.abortSignal });

            if (result.exitCode !== 0) {
              if (
                result.stderr.includes("No stash entries found") ||
                result.stderr.includes("does not exist")
              ) {
                throw gitStashEmptyError();
              }
              return fail(`Failed to apply stash: ${result.stderr}`);
            }

            return ok({
              applied: true,
              message:
                input.index !== undefined ? `Stash@{${input.index}} applied` : "Stash applied",
            });
          }

          case "list": {
            const result = await git.exec(["stash", "list"], { signal: ctx.abortSignal });

            if (result.exitCode !== 0) {
              return fail(`Failed to list stashes: ${result.stderr}`);
            }

            const stashes = parseStashListOutput(result.stdout);

            return ok({
              stashes,
            });
          }

          case "drop": {
            const listResult = await git.exec(["stash", "list"], { signal: ctx.abortSignal });
            if (listResult.exitCode === 0 && listResult.stdout.trim() === "") {
              throw gitStashEmptyError();
            }

            const args = ["stash", "drop"];
            if (input.index !== undefined) {
              args.push(`stash@{${input.index}}`);
            }

            const result = await git.exec(args, { signal: ctx.abortSignal });

            if (result.exitCode !== 0) {
              if (
                result.stderr.includes("No stash entries found") ||
                result.stderr.includes("does not exist")
              ) {
                throw gitStashEmptyError();
              }
              return fail(`Failed to drop stash: ${result.stderr}`);
            }

            return ok({
              dropped: true,
              index: input.index,
            });
          }

          case "clear": {
            const listResult = await git.exec(["stash", "list"], { signal: ctx.abortSignal });
            const stashes = parseStashListOutput(listResult.stdout);
            const count = stashes.length;

            const result = await git.exec(["stash", "clear"], { signal: ctx.abortSignal });

            if (result.exitCode !== 0) {
              return fail(`Failed to clear stashes: ${result.stderr}`);
            }

            return ok({
              count,
            });
          }

          default:
            return fail(`Unknown action: ${input.action}`);
        }
      } catch (error) {
        if (error instanceof VellumError) {
          if (error.code === ErrorCode.GIT_STASH_EMPTY) {
            return fail(error.message);
          }
        }
        if (error instanceof Error && error.message.includes("No stash entries found")) {
          return fail("No stash entries found");
        }
        throw error;
      }
    },
  });
}
