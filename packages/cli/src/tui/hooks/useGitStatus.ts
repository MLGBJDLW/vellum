/**
 * useGitStatus Hook
 *
 * Provides git repository status information for the current workspace.
 * Returns branch name, dirty status, and changed file count.
 *
 * Uses native git commands via child_process for minimal dependencies.
 *
 * @module tui/hooks/useGitStatus
 */

import { execSync } from "node:child_process";
import { useEffect, useState } from "react";

// =============================================================================
// Types
// =============================================================================

/**
 * Git status information returned by the hook.
 */
export interface GitStatus {
  /** Current branch name, null if not in a git repo */
  readonly branch: string | null;
  /** Whether there are uncommitted changes */
  readonly isDirty: boolean;
  /** Number of changed files (staged + unstaged + untracked) */
  readonly changedFiles: number;
  /** Whether the status is still loading */
  readonly isLoading: boolean;
  /** Whether this is a valid git repository */
  readonly isGitRepo: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Refresh interval for git status (ms) - poll every 5 seconds */
const REFRESH_INTERVAL_MS = 5000;

// =============================================================================
// Utilities
// =============================================================================

/**
 * Check if a directory is inside a git repository.
 * Uses `git rev-parse --is-inside-work-tree` for accurate detection,
 * which handles both root and nested directories.
 */
function isGitRepository(cwd: string): boolean {
  try {
    const result = execSync("git rev-parse --is-inside-work-tree", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 3000,
    }).trim();
    return result === "true";
  } catch {
    return false;
  }
}

/**
 * Run a git command and return the output or null on failure.
 */
function runGitCommand(command: string, cwd: string): string | null {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Fetch git status using native git commands.
 */
function fetchGitStatus(cwd: string): {
  branch: string | null;
  isDirty: boolean;
  changedFiles: number;
} {
  // Get current branch
  const branch = runGitCommand("git rev-parse --abbrev-ref HEAD", cwd);

  // Get status (porcelain for easy parsing)
  const statusOutput = runGitCommand("git status --porcelain", cwd);

  if (statusOutput === null) {
    return { branch: null, isDirty: false, changedFiles: 0 };
  }

  const lines = statusOutput.split("\n").filter((line) => line.trim() !== "");
  const changedFiles = lines.length;
  const isDirty = changedFiles > 0;

  return {
    branch,
    isDirty,
    changedFiles,
  };
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook to get current git repository status.
 *
 * Polls for git status changes at a regular interval.
 * Returns null values if not in a git repository.
 *
 * @returns GitStatus with branch, dirty state, and changed file count
 *
 * @example
 * ```tsx
 * function GitBadge() {
 *   const { branch, isDirty, changedFiles } = useGitStatus();
 *   if (!branch) return null;
 *   return <Text> {branch}{isDirty ? '*' : ''}</Text>;
 * }
 * ```
 */
export function useGitStatus(): GitStatus {
  const [status, setStatus] = useState<GitStatus>({
    branch: null,
    isDirty: false,
    changedFiles: 0,
    isLoading: true,
    isGitRepo: false,
  });

  useEffect(() => {
    const cwd = process.cwd();

    // Early exit if not a git repo
    if (!isGitRepository(cwd)) {
      setStatus({
        branch: null,
        isDirty: false,
        changedFiles: 0,
        isLoading: false,
        isGitRepo: false,
      });
      return;
    }

    // Initial fetch
    function updateStatus() {
      const result = fetchGitStatus(cwd);
      setStatus({
        ...result,
        isLoading: false,
        isGitRepo: true,
      });
    }

    updateStatus();

    // Poll for updates
    const intervalId = setInterval(updateStatus, REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return status;
}
