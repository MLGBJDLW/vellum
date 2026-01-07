// ============================================
// Git Log Tool - T007
// ============================================

import { z } from "zod";

import { ErrorCode, VellumError } from "../../errors/types.js";
import { defineTool, fail, ok } from "../../types/tool.js";
import { createGitOps, truncateOutput, validatePath } from "./utils.js";

// =============================================================================
// Constants
// =============================================================================

/** Default number of commits to return */
const DEFAULT_LIMIT = 10;

/** Maximum number of commits allowed */
const MAX_LIMIT = 100;

/** Separator used in git log --format for parsing */
const FIELD_SEPARATOR = "\x1f"; // ASCII Unit Separator

/** Separator between commits */
const COMMIT_SEPARATOR = "\x1e"; // ASCII Record Separator

// =============================================================================
// Schema
// =============================================================================

/**
 * Input schema for git_log tool.
 */
export const GitLogInputSchema = z.object({
  limit: z
    .number()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .default(DEFAULT_LIMIT)
    .describe("Maximum number of commits to return"),
  author: z.string().optional().describe("Filter by author name or email"),
  since: z.string().optional().describe("Show commits after date (e.g., 2024-01-01, 1.week.ago)"),
  until: z.string().optional().describe("Show commits before date"),
  path: z.string().optional().describe("Show commits affecting this file or directory"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitLogInput = z.infer<typeof GitLogInputSchema>;

// =============================================================================
// Result Type
// =============================================================================

/**
 * A single commit entry from git log.
 */
export interface GitLogCommit {
  /** Full commit hash (40 characters) */
  hash: string;
  /** Short commit hash (7 characters) */
  shortHash: string;
  /** Author name and email */
  author: string;
  /** Commit date in ISO 8601 format */
  date: string;
  /** Commit subject line (first line of message) */
  message: string;
}

/**
 * Result of git log operation.
 */
export interface GitLogResult {
  /** List of commits */
  commits: GitLogCommit[];
  /** Total number of commits returned */
  count: number;
  /** Whether output was truncated */
  truncated: boolean;
}

// =============================================================================
// Parser Helpers
// =============================================================================

/**
 * Parse git log output into structured commits.
 *
 * Format used: %H|%h|%an <%ae>|%aI|%s
 * - %H: Full hash
 * - %h: Short hash
 * - %an <%ae>: Author name <email>
 * - %aI: Author date (ISO 8601)
 * - %s: Subject (first line of commit message)
 *
 * @param output - Raw git log output
 * @returns Array of parsed commits
 */
export function parseLogOutput(output: string): GitLogCommit[] {
  const commits: GitLogCommit[] = [];

  if (!output.trim()) {
    return commits;
  }

  // Split by commit separator and filter empty entries
  const entries = output.split(COMMIT_SEPARATOR).filter((entry) => entry.trim().length > 0);

  for (const entry of entries) {
    const fields = entry.trim().split(FIELD_SEPARATOR);

    if (fields.length >= 5) {
      const hash = fields[0];
      const shortHash = fields[1];
      const author = fields[2];
      const date = fields[3];
      const message = fields[4];

      if (hash && shortHash && author && date && message) {
        commits.push({
          hash,
          shortHash,
          author,
          date,
          message,
        });
      }
    }
  }

  return commits;
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * Git log tool.
 *
 * Returns commit history with filtering options for author, date range,
 * and file path. Supports pagination via limit parameter.
 */
export const gitLogTool = defineTool({
  name: "git_log",
  description:
    "Get commit history with hash, author, date, and message. " +
    "Supports filtering by author, date range (since/until), and file path.",
  parameters: GitLogInputSchema,
  kind: "read",
  category: "git",

  async execute(
    input,
    ctx
  ): Promise<ReturnType<typeof ok<GitLogResult>> | ReturnType<typeof fail>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);

    // Validate path if provided
    if (input.path && !validatePath(input.path, cwd)) {
      return fail(`Invalid path: ${input.path} is outside repository`);
    }

    try {
      // Build git log command arguments
      // Format: hash|shortHash|author|date|subject separated by record separator
      const format = `%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%an <%ae>${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${COMMIT_SEPARATOR}`;
      const limit = input.limit ?? DEFAULT_LIMIT;
      const args: string[] = ["log", `--format=${format}`, `-n${limit}`];

      // Add author filter
      if (input.author) {
        args.push(`--author=${input.author}`);
      }

      // Add date range filters
      if (input.since) {
        args.push(`--since=${input.since}`);
      }

      if (input.until) {
        args.push(`--until=${input.until}`);
      }

      // Add path filter (must come after --)
      if (input.path) {
        args.push("--");
        args.push(input.path);
      }

      const result = await git.exec(args, {
        signal: ctx.abortSignal,
      });

      if (result.exitCode !== 0) {
        // Check for common errors
        if (result.stderr.includes("not a git repository")) {
          return fail(`Not a git repository: ${cwd}`);
        }
        if (result.stderr.includes("does not have any commits")) {
          return ok({
            commits: [],
            count: 0,
            truncated: false,
          });
        }
        return fail(`Git log failed: ${result.stderr}`);
      }

      const { text: output, truncated } = truncateOutput(result.stdout);
      const commits = parseLogOutput(truncated ? result.stdout : output);

      return ok({
        commits,
        count: commits.length,
        truncated,
      });
    } catch (error) {
      if (error instanceof VellumError && error.code === ErrorCode.GIT_TIMEOUT) {
        return fail("Git log operation timed out");
      }
      throw error;
    }
  },
});

// =============================================================================
// Factory Export (for testing with custom git ops)
// =============================================================================

/**
 * Create a git log tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git log tool
 */
export function createGitLogTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_log",
    description:
      "Get commit history with hash, author, date, and message. " +
      "Supports filtering by author, date range (since/until), and file path.",
    parameters: GitLogInputSchema,
    kind: "read",
    category: "git",

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Git log requires handling multiple filtering options and output parsing
    async execute(
      input,
      ctx
    ): Promise<ReturnType<typeof ok<GitLogResult>> | ReturnType<typeof fail>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);

      // Validate path if provided
      if (input.path && !validatePath(input.path, cwd)) {
        return fail(`Invalid path: ${input.path} is outside repository`);
      }

      try {
        // Build git log command arguments
        // Format: hash|shortHash|author|date|subject separated by record separator
        const format = `%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%an <%ae>${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${COMMIT_SEPARATOR}`;
        const limit = input.limit ?? DEFAULT_LIMIT;
        const args: string[] = ["log", `--format=${format}`, `-n${limit}`];

        // Add author filter
        if (input.author) {
          args.push(`--author=${input.author}`);
        }

        // Add date range filters
        if (input.since) {
          args.push(`--since=${input.since}`);
        }

        if (input.until) {
          args.push(`--until=${input.until}`);
        }

        // Add path filter (must come after --)
        if (input.path) {
          args.push("--");
          args.push(input.path);
        }

        const result = await git.exec(args, {
          signal: ctx.abortSignal,
        });

        if (result.exitCode !== 0) {
          // Check for common errors
          if (result.stderr.includes("not a git repository")) {
            return fail(`Not a git repository: ${cwd}`);
          }
          if (result.stderr.includes("does not have any commits")) {
            return ok({
              commits: [],
              count: 0,
              truncated: false,
            });
          }
          return fail(`Git log failed: ${result.stderr}`);
        }

        const { text: output, truncated } = truncateOutput(result.stdout);
        const commits = parseLogOutput(truncated ? result.stdout : output);

        return ok({
          commits,
          count: commits.length,
          truncated,
        });
      } catch (error) {
        if (error instanceof VellumError && error.code === ErrorCode.GIT_TIMEOUT) {
          return fail("Git log operation timed out");
        }
        throw error;
      }
    },
  });
}
