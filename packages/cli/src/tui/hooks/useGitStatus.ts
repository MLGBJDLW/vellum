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

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { useCallback, useEffect, useRef, useState } from "react";

const execAsync = promisify(exec);

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
async function isGitRepositoryAsync(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync("git rev-parse --is-inside-work-tree", {
      cwd,
      timeout: 3000,
    });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Run a git command asynchronously and return the output or null on failure.
 */
async function runGitCommandAsync(command: string, cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(command, { cwd, timeout: 3000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Fetch git status using native git commands asynchronously.
 */
async function fetchGitStatusAsync(cwd: string): Promise<{
  branch: string | null;
  isDirty: boolean;
  changedFiles: number;
}> {
  // Run both commands in parallel for better performance
  const [branch, statusOutput] = await Promise.all([
    runGitCommandAsync("git rev-parse --abbrev-ref HEAD", cwd),
    runGitCommandAsync("git status --porcelain", cwd),
  ]);

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

  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true);

  // Async status update function
  const updateStatusAsync = useCallback(async (cwd: string) => {
    if (!mountedRef.current) return;

    const result = await fetchGitStatusAsync(cwd);

    if (mountedRef.current) {
      setStatus({
        ...result,
        isLoading: false,
        isGitRepo: true,
      });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const cwd = process.cwd();
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Async initialization
    const init = async () => {
      // Early exit if not a git repo
      const isRepo = await isGitRepositoryAsync(cwd);

      if (!mountedRef.current) return;

      if (!isRepo) {
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
      await updateStatusAsync(cwd);

      // Poll for updates (only if still mounted)
      if (mountedRef.current) {
        intervalId = setInterval(() => {
          void updateStatusAsync(cwd);
        }, REFRESH_INTERVAL_MS);
      }
    };

    void init();

    return () => {
      mountedRef.current = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [updateStatusAsync]);

  return status;
}
