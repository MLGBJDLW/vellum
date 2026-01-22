// ============================================
// Git Diff Tool - T006
// ============================================

import { z } from "zod";

import { ErrorCode, VellumError } from "../../errors/types.js";
import { defineTool, fail, ok } from "../../types/tool.js";
import { createGitOps, truncateOutput, validatePath } from "./utils.js";

// =============================================================================
// Schema
// =============================================================================

/**
 * Input schema for git_diff tool.
 */
export const GitDiffInputSchema = z.object({
  staged: z.boolean().optional().default(false).describe("Show staged changes instead of unstaged"),
  paths: z.array(z.string()).optional().describe("Filter to specific file paths"),
  ref: z.string().optional().describe("Commit ref or range (e.g., HEAD~1, main..feature, abc123)"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;

// =============================================================================
// Result Type
// =============================================================================

/**
 * A parsed diff hunk representing a change in a file.
 */
export interface DiffHunk {
  /** Original file path (a-side) */
  oldPath: string;
  /** New file path (b-side, differs for renames) */
  newPath: string;
  /** Hunk header (e.g., @@ -1,5 +1,6 @@) */
  header: string;
  /** Lines in this hunk */
  lines: string[];
}

/**
 * Result of git diff operation.
 */
export interface GitDiffResult {
  /** Raw unified diff output */
  diff: string;
  /** Whether output was truncated */
  truncated: boolean;
  /** Number of files changed */
  filesChanged: number;
  /** Parsed diff hunks (if not truncated) */
  hunks?: DiffHunk[];
}

// =============================================================================
// Parser Helpers
// =============================================================================

/**
 * Parse unified diff output into structured hunks.
 *
 * @param diff - Raw unified diff output
 * @returns Array of parsed diff hunks
 */
export function parseDiffOutput(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diff.split("\n");

  let currentOldPath = "";
  let currentNewPath = "";
  let currentHeader = "";
  let currentLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    // File header: diff --git a/path b/path
    if (line.startsWith("diff --git")) {
      // Save previous hunk if exists
      if (inHunk && currentHeader) {
        hunks.push({
          oldPath: currentOldPath,
          newPath: currentNewPath,
          header: currentHeader,
          lines: currentLines,
        });
      }

      // Parse file paths from diff header
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (match?.[1] && match[2]) {
        currentOldPath = match[1];
        currentNewPath = match[2];
      }
      currentHeader = "";
      currentLines = [];
      inHunk = false;
      continue;
    }

    // Old file path: --- a/path or --- /dev/null
    if (line.startsWith("--- ")) {
      const path = line.slice(4);
      if (path !== "/dev/null") {
        currentOldPath = path.replace(/^a\//, "");
      }
      continue;
    }

    // New file path: +++ b/path or +++ /dev/null
    if (line.startsWith("+++ ")) {
      const path = line.slice(4);
      if (path !== "/dev/null") {
        currentNewPath = path.replace(/^b\//, "");
      }
      continue;
    }

    // Hunk header: @@ -start,count +start,count @@ optional context
    if (line.startsWith("@@")) {
      // Save previous hunk if exists
      if (inHunk && currentHeader) {
        hunks.push({
          oldPath: currentOldPath,
          newPath: currentNewPath,
          header: currentHeader,
          lines: currentLines,
        });
      }

      currentHeader = line;
      currentLines = [];
      inHunk = true;
      continue;
    }

    // Hunk content lines (context, additions, deletions)
    if (
      inHunk &&
      (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-") || line === "")
    ) {
      currentLines.push(line);
    }
  }

  // Save final hunk if exists
  if (inHunk && currentHeader) {
    hunks.push({
      oldPath: currentOldPath,
      newPath: currentNewPath,
      header: currentHeader,
      lines: currentLines,
    });
  }

  return hunks;
}

/**
 * Count number of files changed in diff output.
 *
 * @param diff - Raw unified diff output
 * @returns Number of files changed
 */
export function countFilesChanged(diff: string): number {
  const matches = diff.match(/^diff --git/gm);
  return matches ? matches.length : 0;
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * Git diff tool.
 *
 * Shows differences between commits, working tree, and index.
 * Supports staged/unstaged diffs, file path filtering, and commit ranges.
 */
export const gitDiffTool = defineTool({
  name: "git_diff",
  description:
    "Show differences between commits, working tree, and index. " +
    "By default shows unstaged changes. Use staged=true for staged changes, " +
    "or provide ref for commit comparisons (e.g., HEAD~1, main..feature).",
  parameters: GitDiffInputSchema,
  kind: "read",
  category: "git",

  async execute(
    input,
    ctx
  ): Promise<ReturnType<typeof ok<GitDiffResult>> | ReturnType<typeof fail>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);

    // Validate paths if provided
    if (input.paths && input.paths.length > 0) {
      for (const path of input.paths) {
        if (!validatePath(path, cwd)) {
          return fail(`Invalid path: ${path} is outside repository`);
        }
      }
    }

    try {
      // Build git diff command arguments
      const args: string[] = ["diff"];

      // Add --staged flag for staged changes
      if (input.staged && !input.ref) {
        args.push("--staged");
      }

      // Add commit ref or range
      if (input.ref) {
        args.push(input.ref);
      }

      // Add path separator and paths
      if (input.paths && input.paths.length > 0) {
        args.push("--");
        args.push(...input.paths);
      }

      const result = await git.exec(args, {
        signal: ctx.abortSignal,
      });

      if (result.exitCode !== 0) {
        // Check for common errors
        if (result.stderr.includes("not a git repository")) {
          return fail(`Not a git repository: ${cwd}`);
        }
        if (result.stderr.includes("unknown revision")) {
          return fail(`Unknown revision: ${input.ref}`);
        }
        return fail(`Git diff failed: ${result.stderr}`);
      }

      const { text: diff, truncated } = truncateOutput(result.stdout);
      const filesChanged = countFilesChanged(result.stdout);

      // Only parse hunks if not truncated (parsing truncated output may be incomplete)
      const hunks = truncated ? undefined : parseDiffOutput(result.stdout);

      return ok({
        diff,
        truncated,
        filesChanged,
        hunks,
      });
    } catch (error) {
      if (error instanceof VellumError && error.code === ErrorCode.GIT_TIMEOUT) {
        return fail("Git diff operation timed out");
      }
      throw error;
    }
  },
});

// =============================================================================
// Factory Export (for testing with custom git ops)
// =============================================================================

/**
 * Create a git diff tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git diff tool
 */
export function createGitDiffTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_diff",
    description:
      "Show differences between commits, working tree, and index. " +
      "By default shows unstaged changes. Use staged=true for staged changes, " +
      "or provide ref for commit comparisons (e.g., HEAD~1, main..feature).",
    parameters: GitDiffInputSchema,
    kind: "read",
    category: "git",

    async execute(
      input,
      ctx
    ): Promise<ReturnType<typeof ok<GitDiffResult>> | ReturnType<typeof fail>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);

      // Validate paths if provided
      if (input.paths && input.paths.length > 0) {
        for (const path of input.paths) {
          if (!validatePath(path, cwd)) {
            return fail(`Invalid path: ${path} is outside repository`);
          }
        }
      }

      try {
        // Build git diff command arguments
        const args: string[] = ["diff"];

        // Add --staged flag for staged changes
        if (input.staged && !input.ref) {
          args.push("--staged");
        }

        // Add commit ref or range
        if (input.ref) {
          args.push(input.ref);
        }

        // Add path separator and paths
        if (input.paths && input.paths.length > 0) {
          args.push("--");
          args.push(...input.paths);
        }

        const result = await git.exec(args, {
          signal: ctx.abortSignal,
        });

        if (result.exitCode !== 0) {
          // Check for common errors
          if (result.stderr.includes("not a git repository")) {
            return fail(`Not a git repository: ${cwd}`);
          }
          if (result.stderr.includes("unknown revision")) {
            return fail(`Unknown revision: ${input.ref}`);
          }
          return fail(`Git diff failed: ${result.stderr}`);
        }

        const { text: diff, truncated } = truncateOutput(result.stdout);
        const filesChanged = countFilesChanged(result.stdout);

        // Only parse hunks if not truncated (parsing truncated output may be incomplete)
        const hunks = truncated ? undefined : parseDiffOutput(result.stdout);

        return ok({
          diff,
          truncated,
          filesChanged,
          hunks,
        });
      } catch (error) {
        if (error instanceof VellumError && error.code === ErrorCode.GIT_TIMEOUT) {
          return fail("Git diff operation timed out");
        }
        throw error;
      }
    },
  });
}
