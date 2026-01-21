/**
 * Commit Command
 *
 * Quick Git commit command with optional auto-generated message.
 * Inspired by Aider's /commit command pattern.
 *
 * Usage:
 * - /commit - Stage all changes and commit with auto-generated message
 * - /commit "message" - Stage all changes and commit with specified message
 * - /commit --amend - Amend the last commit
 *
 * @module cli/commands/commit
 */

import { execSync } from "node:child_process";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Git Utilities
// =============================================================================

/**
 * Execute a git command and return the result.
 */
function runGitCommand(command: string, cwd?: string): { success: boolean; output: string } {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      cwd: cwd ?? process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: output.trim() };
  } catch (err) {
    const error = err as { stderr?: string; message?: string };
    return { success: false, output: error.stderr?.trim() ?? error.message ?? "Unknown error" };
  }
}

/**
 * Check if we're in a git repository.
 */
function isGitRepo(): boolean {
  const result = runGitCommand("git rev-parse --is-inside-work-tree");
  return result.success && result.output === "true";
}

/**
 * Get list of staged files.
 */
function getStagedFiles(): string[] {
  const result = runGitCommand("git diff --cached --name-only");
  if (!result.success || !result.output) return [];
  return result.output.split("\n").filter((f) => f.trim().length > 0);
}

/**
 * Get list of unstaged/untracked changes.
 */
function getUnstagedChanges(): { modified: string[]; untracked: string[] } {
  const statusResult = runGitCommand("git status --porcelain");
  if (!statusResult.success) return { modified: [], untracked: [] };

  const modified: string[] = [];
  const untracked: string[] = [];

  for (const line of statusResult.output.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    const file = line.slice(3);

    if (status.includes("?")) {
      untracked.push(file);
    } else if (status[1] !== " " && status[1] !== "?") {
      modified.push(file);
    }
  }

  return { modified, untracked };
}

/**
 * Generate a simple commit message from staged changes.
 */
function generateCommitMessage(stagedFiles: string[]): string {
  if (stagedFiles.length === 0) return "Update files";
  if (stagedFiles.length === 1) {
    const file = stagedFiles[0];
    return `Update ${file}`;
  }
  // Group by directory or type
  const extensions = new Set(stagedFiles.map((f) => f.split(".").pop() ?? "file"));
  if (extensions.size === 1) {
    const ext = [...extensions][0];
    return `Update ${stagedFiles.length} ${ext} files`;
  }
  return `Update ${stagedFiles.length} files`;
}

// =============================================================================
// Command Definition
// =============================================================================

/**
 * /commit command - Quick git commit with optional message.
 *
 * Stages all changes and commits. If no message is provided,
 * generates a simple descriptive message based on changed files.
 */
export const commitCommand: SlashCommand = {
  name: "commit",
  description: "Stage and commit all changes with optional message",
  kind: "builtin",
  category: "tools",
  aliases: ["ci"],
  positionalArgs: [
    {
      name: "message",
      type: "string",
      description: "Commit message (auto-generated if omitted)",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "amend",
      shorthand: "a",
      type: "boolean",
      description: "Amend the last commit",
      required: false,
      default: false,
    },
    {
      name: "no-stage",
      shorthand: "n",
      type: "boolean",
      description: "Skip staging (commit only already staged files)",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/commit                    - Auto-generate message and commit all",
    '/commit "Fix login bug"    - Commit with specific message',
    "/commit --amend            - Amend last commit",
    '/commit --amend "New msg"  - Amend with new message',
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    // Check if we're in a git repository
    if (!isGitRepo()) {
      return error("OPERATION_NOT_ALLOWED", "Not in a git repository", [
        "Navigate to a git repository first",
        "Use `git init` to initialize a new repository",
      ]);
    }

    const message = ctx.parsedArgs.positional[0] as string | undefined;
    const amend = ctx.parsedArgs.named["amend"] as boolean | undefined;
    const noStage = ctx.parsedArgs.named["no-stage"] as boolean | undefined;

    // Stage all changes unless --no-stage is specified
    if (!noStage) {
      const stageResult = runGitCommand("git add -A");
      if (!stageResult.success) {
        return error("INTERNAL_ERROR", `Failed to stage changes: ${stageResult.output}`);
      }
    }

    // Check for staged changes
    const stagedFiles = getStagedFiles();
    if (stagedFiles.length === 0 && !amend) {
      const unstaged = getUnstagedChanges();
      if (unstaged.modified.length === 0 && unstaged.untracked.length === 0) {
        return error("OPERATION_NOT_ALLOWED", "Nothing to commit - working tree is clean");
      }
      return error("OPERATION_NOT_ALLOWED", "No staged changes to commit", [
        "Use /commit without --no-stage to auto-stage all changes",
        "Stage files manually with `git add <file>`",
      ]);
    }

    // Generate or use provided message
    const commitMessage = message ?? generateCommitMessage(stagedFiles);

    // Build commit command
    let gitCmd = `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`;
    if (amend) {
      gitCmd = message
        ? `git commit --amend -m "${commitMessage.replace(/"/g, '\\"')}"`
        : "git commit --amend --no-edit";
    }

    // Execute commit
    const commitResult = runGitCommand(gitCmd);
    if (!commitResult.success) {
      return error("INTERNAL_ERROR", `Commit failed: ${commitResult.output}`);
    }

    // Get the commit hash
    const hashResult = runGitCommand("git rev-parse --short HEAD");
    const commitHash = hashResult.success ? hashResult.output : "unknown";

    // Build success message
    const lines = [
      amend ? "📝 Amended commit" : "✅ Committed successfully",
      "",
      `  Commit: ${commitHash}`,
      `  Message: ${commitMessage}`,
    ];

    if (!amend && stagedFiles.length > 0) {
      lines.push(`  Files: ${stagedFiles.length} changed`);
      if (stagedFiles.length <= 5) {
        for (const file of stagedFiles) {
          lines.push(`    • ${file}`);
        }
      } else {
        for (const file of stagedFiles.slice(0, 3)) {
          lines.push(`    • ${file}`);
        }
        lines.push(`    • ... and ${stagedFiles.length - 3} more`);
      }
    }

    return success(lines.join("\n"), {
      hash: commitHash,
      message: commitMessage,
      files: stagedFiles,
      amended: amend ?? false,
    });
  },
};

export default commitCommand;
