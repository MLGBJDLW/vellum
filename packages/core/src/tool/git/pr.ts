// ============================================
// Git Generate PR Tool - T020
// ============================================

import { z } from "zod";

import { ErrorCode, VellumError } from "../../errors/types.js";
import { defineTool, fail, ok } from "../../types/tool.js";
import { createGitOps } from "./utils.js";

// =============================================================================
// Constants
// =============================================================================

/** Default target branch for PR comparison */
const DEFAULT_TARGET_BRANCH = "main";

/** Maximum number of commits to include in PR body */
const MAX_COMMITS_IN_BODY = 50;

/** Separator used in git log --format for parsing */
const FIELD_SEPARATOR = "\x1f"; // ASCII Unit Separator

/** Separator between commits */
const COMMIT_SEPARATOR = "\x1e"; // ASCII Record Separator

// =============================================================================
// Schema
// =============================================================================

/**
 * Input schema for git_generate_pr tool.
 */
export const GitGeneratePrInputSchema = z.object({
  target: z
    .string()
    .optional()
    .default(DEFAULT_TARGET_BRANCH)
    .describe("Target branch to compare against"),
  template: z.string().optional().describe("PR description template"),
  cwd: z.string().optional().describe("Working directory, defaults to current"),
});

export type GitGeneratePrInput = z.infer<typeof GitGeneratePrInputSchema>;

// =============================================================================
// Result Type
// =============================================================================

/**
 * A single commit entry for PR generation.
 */
export interface PrCommit {
  /** Short commit hash (7 characters) */
  shortHash: string;
  /** Commit subject line */
  message: string;
}

/**
 * Generated PR data.
 */
export interface GeneratedPR {
  /** PR title (first commit message or summary) */
  title: string;
  /** Formatted PR description body */
  body: string;
  /** Number of commits included */
  commits: number;
  /** List of changed files */
  filesChanged: string[];
}

// =============================================================================
// Parser Helpers
// =============================================================================

/**
 * Parse git log output into PR commits.
 *
 * @param output - Raw git log output
 * @returns Array of parsed commits
 */
export function parsePrLogOutput(output: string): PrCommit[] {
  const commits: PrCommit[] = [];

  if (!output.trim()) {
    return commits;
  }

  const entries = output.split(COMMIT_SEPARATOR).filter((entry) => entry.trim().length > 0);

  for (const entry of entries) {
    const fields = entry.trim().split(FIELD_SEPARATOR);

    if (fields.length >= 2) {
      const shortHash = fields[0];
      const message = fields[1];

      if (shortHash && message) {
        commits.push({
          shortHash,
          message,
        });
      }
    }
  }

  return commits;
}

/**
 * Parse git diff --name-only output into file list.
 *
 * @param output - Raw git diff output
 * @returns Array of file paths
 */
export function parseChangedFiles(output: string): string[] {
  if (!output.trim()) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Generate PR title from commits.
 *
 * @param commits - Array of commits
 * @returns PR title
 */
export function generatePrTitle(commits: PrCommit[]): string {
  if (commits.length === 0) {
    return "No changes";
  }

  if (commits.length === 1 && commits[0]) {
    return commits[0].message;
  }

  // For multiple commits, use the most recent commit message
  // or create a summary
  const firstCommit = commits[0];
  if (firstCommit && firstCommit.message.length <= 72) {
    return firstCommit.message;
  }

  return `${commits.length} commits`;
}

/**
 * Generate PR body from commits and files.
 *
 * @param commits - Array of commits
 * @param filesChanged - Array of changed file paths
 * @param template - Optional PR template
 * @returns Formatted PR body
 */
export function generatePrBody(
  commits: PrCommit[],
  filesChanged: string[],
  template?: string
): string {
  const sections: string[] = [];

  // Summary section
  sections.push("## Summary\n");
  if (commits.length === 0) {
    sections.push("No commits found between branches.\n");
  } else if (commits.length === 1 && commits[0]) {
    sections.push(`This PR contains 1 commit.\n`);
  } else {
    sections.push(`This PR contains ${commits.length} commit(s).\n`);
  }

  // Template section (if provided)
  if (template) {
    sections.push("\n## Description\n");
    sections.push(template);
    sections.push("\n");
  }

  // Commits section
  if (commits.length > 0) {
    sections.push("\n## Commits\n");
    const displayCommits = commits.slice(0, MAX_COMMITS_IN_BODY);
    for (const commit of displayCommits) {
      sections.push(`- \`${commit.shortHash}\` ${commit.message}\n`);
    }
    if (commits.length > MAX_COMMITS_IN_BODY) {
      sections.push(`\n... and ${commits.length - MAX_COMMITS_IN_BODY} more commits\n`);
    }
  }

  // Files changed section
  if (filesChanged.length > 0) {
    sections.push("\n## Files Changed\n");
    const displayFiles = filesChanged.slice(0, 20);
    for (const file of displayFiles) {
      sections.push(`- \`${file}\`\n`);
    }
    if (filesChanged.length > 20) {
      sections.push(`\n... and ${filesChanged.length - 20} more files\n`);
    }
  }

  return sections.join("").trim();
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * Git generate PR tool.
 *
 * Generates PR title and body from commits between current branch and target.
 * Uses git log to get commits and git diff to get changed files.
 */
export const gitGeneratePrTool = defineTool({
  name: "git_generate_pr",
  description:
    "Generate PR title and body from commits between current branch and target branch. " +
    "Includes summary, commit list, and files changed.",
  parameters: GitGeneratePrInputSchema,
  kind: "read",
  category: "git",

  async execute(input, ctx): Promise<ReturnType<typeof ok<GeneratedPR>> | ReturnType<typeof fail>> {
    const cwd = input.cwd ?? ctx.workingDir;
    const git = createGitOps(cwd);
    const target = input.target ?? DEFAULT_TARGET_BRANCH;

    try {
      // Get current branch name
      const branchResult = await git.exec(["rev-parse", "--abbrev-ref", "HEAD"], {
        signal: ctx.abortSignal,
      });

      if (branchResult.exitCode !== 0) {
        if (branchResult.stderr.includes("not a git repository")) {
          return fail(`Not a git repository: ${cwd}`);
        }
        return fail(`Failed to get current branch: ${branchResult.stderr}`);
      }

      const currentBranch = branchResult.stdout.trim();

      // Check if target branch exists
      const targetCheckResult = await git.exec(["rev-parse", "--verify", target], {
        signal: ctx.abortSignal,
      });

      if (targetCheckResult.exitCode !== 0) {
        return fail(`Target branch '${target}' does not exist`);
      }

      // Get commits between target and current branch
      const logFormat = `%h${FIELD_SEPARATOR}%s${COMMIT_SEPARATOR}`;
      const logResult = await git.exec(
        ["log", `${target}..${currentBranch}`, `--format=${logFormat}`],
        { signal: ctx.abortSignal }
      );

      if (logResult.exitCode !== 0) {
        // Check for no commits case
        if (logResult.stderr.includes("unknown revision")) {
          return fail(`Cannot compare: ${logResult.stderr}`);
        }
        return fail(`Git log failed: ${logResult.stderr}`);
      }

      const commits = parsePrLogOutput(logResult.stdout);

      // Get changed files
      const diffResult = await git.exec(["diff", "--name-only", target, currentBranch], {
        signal: ctx.abortSignal,
      });

      let filesChanged: string[] = [];
      if (diffResult.exitCode === 0) {
        filesChanged = parseChangedFiles(diffResult.stdout);
      }

      // Generate PR content
      const title = generatePrTitle(commits);
      const body = generatePrBody(commits, filesChanged, input.template);

      return ok({
        title,
        body,
        commits: commits.length,
        filesChanged,
      });
    } catch (error) {
      if (error instanceof VellumError && error.code === ErrorCode.GIT_TIMEOUT) {
        return fail("Git generate PR operation timed out");
      }
      throw error;
    }
  },
});

// =============================================================================
// Factory Export (for testing with custom git ops)
// =============================================================================

/**
 * Create a git generate PR tool with custom git operations.
 * Useful for testing with mocked git commands.
 *
 * @param gitOpsFactory - Factory function to create git operations
 * @returns Configured git generate PR tool
 */
export function createGitGeneratePrTool(gitOpsFactory: typeof createGitOps = createGitOps) {
  return defineTool({
    name: "git_generate_pr",
    description:
      "Generate PR title and body from commits between current branch and target branch. " +
      "Includes summary, commit list, and files changed.",
    parameters: GitGeneratePrInputSchema,
    kind: "read",
    category: "git",

    async execute(
      input,
      ctx
    ): Promise<ReturnType<typeof ok<GeneratedPR>> | ReturnType<typeof fail>> {
      const cwd = input.cwd ?? ctx.workingDir;
      const git = gitOpsFactory(cwd);
      const target = input.target ?? DEFAULT_TARGET_BRANCH;

      try {
        // Get current branch name
        const branchResult = await git.exec(["rev-parse", "--abbrev-ref", "HEAD"], {
          signal: ctx.abortSignal,
        });

        if (branchResult.exitCode !== 0) {
          if (branchResult.stderr.includes("not a git repository")) {
            return fail(`Not a git repository: ${cwd}`);
          }
          return fail(`Failed to get current branch: ${branchResult.stderr}`);
        }

        const currentBranch = branchResult.stdout.trim();

        // Check if target branch exists
        const targetCheckResult = await git.exec(["rev-parse", "--verify", target], {
          signal: ctx.abortSignal,
        });

        if (targetCheckResult.exitCode !== 0) {
          return fail(`Target branch '${target}' does not exist`);
        }

        // Get commits between target and current branch
        const logFormat = `%h${FIELD_SEPARATOR}%s${COMMIT_SEPARATOR}`;
        const logResult = await git.exec(
          ["log", `${target}..${currentBranch}`, `--format=${logFormat}`],
          { signal: ctx.abortSignal }
        );

        if (logResult.exitCode !== 0) {
          if (logResult.stderr.includes("unknown revision")) {
            return fail(`Cannot compare: ${logResult.stderr}`);
          }
          return fail(`Git log failed: ${logResult.stderr}`);
        }

        const commits = parsePrLogOutput(logResult.stdout);

        // Get changed files
        const diffResult = await git.exec(["diff", "--name-only", target, currentBranch], {
          signal: ctx.abortSignal,
        });

        let filesChanged: string[] = [];
        if (diffResult.exitCode === 0) {
          filesChanged = parseChangedFiles(diffResult.stdout);
        }

        // Generate PR content
        const title = generatePrTitle(commits);
        const body = generatePrBody(commits, filesChanged, input.template);

        return ok({
          title,
          body,
          commits: commits.length,
          filesChanged,
        });
      } catch (error) {
        if (error instanceof VellumError && error.code === ErrorCode.GIT_TIMEOUT) {
          return fail("Git generate PR operation timed out");
        }
        throw error;
      }
    },
  });
}
