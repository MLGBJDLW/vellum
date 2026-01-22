// ============================================
// Git Commit Tool - T009
// ============================================

import { z } from "zod";

import { ErrorCode, VellumError } from "../../errors/types.js";
import { defineTool, fail, ok } from "../../types/tool.js";
import { gitNoStagedChangesError } from "./errors.js";
import { createGitOps } from "./utils.js";

// =============================================================================
// Schema
// =============================================================================

/**
 * Input schema for git_commit tool.
 */
export const GitCommitInputSchema = z.object({
  message: z.string().optional().describe("Commit message, auto-generated if omitted"),
  all: z.boolean().optional().describe("Stage all changes before commit (default: false)"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitCommitInput = z.infer<typeof GitCommitInputSchema>;

// =============================================================================
// Result Type
// =============================================================================

/**
 * Result of git commit operation.
 */
export interface GitCommitResult {
  /** Commit hash (short format) */
  hash: string;
  /** Commit message used */
  message: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate an auto-commit message based on staged changes.
 *
 * @param git - Git operations executor
 * @param signal - Abort signal for cancellation
 * @returns Generated commit message
 */
async function generateCommitMessage(
  git: ReturnType<typeof createGitOps>,
  signal?: AbortSignal
): Promise<string> {
  // Get a summary of staged changes
  const diffStat = await git.exec(["diff", "--cached", "--stat"], { signal });

  if (diffStat.exitCode === 0 && diffStat.stdout.trim()) {
    // Extract file count and basic stats
    const lines = diffStat.stdout.trim().split("\n");
    const summaryLine = lines[lines.length - 1] || "";
    const match = summaryLine.match(/(\d+) files? changed/);
    const fileCount = match?.[1] || "multiple";

    // Get list of changed files (first few)
    const changedFiles = lines
      .slice(0, -1)
      .map((line) => line.split("|")[0]?.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (changedFiles.length > 0) {
      const prefix = changedFiles.length === 1 ? "Update" : "Update";
      const fileList = changedFiles.join(", ");
      const suffix = Number(fileCount) > 3 ? ` and ${Number(fileCount) - 3} more` : "";
      return `${prefix} ${fileList}${suffix}`;
    }
  }

  // Fallback to generic message with timestamp
  return `Auto-commit ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
}

/**
 * Parse commit output to extract hash.
 *
 * @param output - Raw output from git commit command
 * @returns Commit hash or undefined if not found
 */
function parseCommitHash(output: string): string | undefined {
  // Git commit output format: [branch hash] message
  // Example: [main abc1234] Initial commit
  const match = output.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
  return match?.[1];
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * Git commit tool.
 *
 * Creates commits with provided message or auto-generates one.
 * Optionally stages all changes before committing.
 */
export const gitCommitTool = defineTool({
  name: "git_commit",
  description:
    "Create a git commit with the staged changes. Optionally auto-generate commit message and stage all changes.",
  parameters: GitCommitInputSchema,
  kind: "write",
  category: "git",

  async execute(
    input,
    ctx
  ): Promise<ReturnType<typeof ok<GitCommitResult>> | ReturnType<typeof fail>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);

    try {
      // Snapshot integration point - track before write operation
      // This is a no-op if snapshotService is not available
      const snapshotContext = ctx as unknown as {
        snapshotService?: { track: () => Promise<void> };
      };
      try {
        await snapshotContext.snapshotService?.track();
      } catch (snapshotError) {
        // Log but don't block the operation
        console.warn("Snapshot tracking failed:", snapshotError);
      }

      // Stage all changes if requested
      if (input.all) {
        const addResult = await git.exec(["add", "-A"], { signal: ctx.abortSignal });
        if (addResult.exitCode !== 0) {
          return fail(`Failed to stage changes: ${addResult.stderr}`);
        }
      }

      // Check if there are staged changes
      const statusResult = await git.exec(["diff", "--cached", "--quiet"], {
        signal: ctx.abortSignal,
      });
      if (statusResult.exitCode === 0) {
        // Exit code 0 means no differences (nothing staged)
        throw gitNoStagedChangesError();
      }

      // Generate or use provided message
      const message = input.message ?? (await generateCommitMessage(git, ctx.abortSignal));

      // Perform the commit
      const commitResult = await git.exec(["commit", "-m", message], { signal: ctx.abortSignal });

      if (commitResult.exitCode !== 0) {
        // Check for common errors
        if (commitResult.stderr.includes("nothing to commit")) {
          throw gitNoStagedChangesError();
        }
        return fail(`Commit failed: ${commitResult.stderr}`);
      }

      // Extract commit hash from output
      const hash = parseCommitHash(commitResult.stdout) ?? "unknown";

      return ok({
        hash,
        message,
      });
    } catch (error) {
      if (error instanceof VellumError) {
        if (error.code === ErrorCode.GIT_NO_STAGED_CHANGES) {
          return fail(error.message);
        }
        if (error.code === ErrorCode.GIT_TIMEOUT) {
          return fail("Git commit operation timed out");
        }
      }
      throw error;
    }
  },
});

// =============================================================================
// Factory Export (for testing with custom git ops)
// =============================================================================

/**
 * Create a git commit tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git commit tool
 */
export function createGitCommitTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_commit",
    description:
      "Create a git commit with the staged changes. Optionally auto-generate commit message and stage all changes.",
    parameters: GitCommitInputSchema,
    kind: "write",
    category: "git",

    async execute(
      input,
      ctx
    ): Promise<ReturnType<typeof ok<GitCommitResult>> | ReturnType<typeof fail>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);

      try {
        // Snapshot integration point - track before write operation
        const snapshotContext = ctx as unknown as {
          snapshotService?: { track: () => Promise<void> };
        };
        try {
          await snapshotContext.snapshotService?.track();
        } catch (snapshotError) {
          console.warn("Snapshot tracking failed:", snapshotError);
        }

        // Stage all changes if requested
        if (input.all) {
          const addResult = await git.exec(["add", "-A"], { signal: ctx.abortSignal });
          if (addResult.exitCode !== 0) {
            return fail(`Failed to stage changes: ${addResult.stderr}`);
          }
        }

        // Check if there are staged changes
        const statusResult = await git.exec(["diff", "--cached", "--quiet"], {
          signal: ctx.abortSignal,
        });
        if (statusResult.exitCode === 0) {
          throw gitNoStagedChangesError();
        }

        // Generate or use provided message
        let message = input.message;
        if (!message) {
          const diffStat = await git.exec(["diff", "--cached", "--stat"], {
            signal: ctx.abortSignal,
          });
          if (diffStat.exitCode === 0 && diffStat.stdout.trim()) {
            const lines = diffStat.stdout.trim().split("\n");
            const changedFiles = lines
              .slice(0, -1)
              .map((line) => line.split("|")[0]?.trim())
              .filter(Boolean)
              .slice(0, 3);
            if (changedFiles.length > 0) {
              const summaryLine = lines[lines.length - 1] || "";
              const match = summaryLine.match(/(\d+) files? changed/);
              const fileCount = match?.[1] ? parseInt(match[1], 10) : changedFiles.length;
              const suffix = fileCount > 3 ? ` and ${fileCount - 3} more` : "";
              message = `Update ${changedFiles.join(", ")}${suffix}`;
            }
          }
          message =
            message ?? `Auto-commit ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
        }

        // Perform the commit
        const commitResult = await git.exec(["commit", "-m", message], { signal: ctx.abortSignal });

        if (commitResult.exitCode !== 0) {
          if (commitResult.stderr.includes("nothing to commit")) {
            throw gitNoStagedChangesError();
          }
          return fail(`Commit failed: ${commitResult.stderr}`);
        }

        const hash = parseCommitHash(commitResult.stdout) ?? "unknown";

        return ok({
          hash,
          message,
        });
      } catch (error) {
        if (error instanceof VellumError) {
          if (error.code === ErrorCode.GIT_NO_STAGED_CHANGES) {
            return fail(error.message);
          }
          if (error.code === ErrorCode.GIT_TIMEOUT) {
            return fail("Git commit operation timed out");
          }
        }
        throw error;
      }
    },
  });
}
