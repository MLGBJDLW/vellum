// ============================================
// Git Utility Functions
// ============================================

import { spawn } from "node:child_process";
import { normalize, resolve } from "node:path";

import { gitTimeoutError } from "./errors.js";
import {
  GIT_TIMEOUTS,
  type GitExecOptions,
  type GitExecResult,
  MAX_OUTPUT_LINES,
  TRUNCATION_MARKER,
} from "./types.js";

/**
 * Truncates output if it exceeds MAX_OUTPUT_LINES.
 *
 * @param output - Raw output string
 * @returns Object with truncated text and whether truncation occurred
 */
export function truncateOutput(output: string): { text: string; truncated: boolean } {
  const lines = output.split("\n");

  if (lines.length <= MAX_OUTPUT_LINES) {
    return { text: output, truncated: false };
  }

  const truncatedLines = lines.slice(0, MAX_OUTPUT_LINES);
  return {
    text: truncatedLines.join("\n") + TRUNCATION_MARKER,
    truncated: true,
  };
}

/**
 * Wraps an operation with timeout handling.
 * Throws gitTimeoutError if the operation exceeds the specified timeout.
 *
 * @param operation - Promise to wrap with timeout
 * @param timeoutMs - Timeout duration in milliseconds
 * @param operationName - Name of the operation (for error messages)
 * @param signal - Optional abort signal for cancellation
 * @returns Promise resolving to the operation result
 * @throws VellumError with GIT_TIMEOUT code on timeout
 */
export function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      reject(gitTimeoutError(operationName));
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    // Handle abort signal
    const abortHandler = () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(gitTimeoutError(operationName));
      }
    };

    signal?.addEventListener("abort", abortHandler, { once: true });

    // Set up timeout
    timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        signal?.removeEventListener("abort", abortHandler);
        reject(gitTimeoutError(operationName));
      }
    }, timeoutMs);

    // Execute operation
    operation
      .then((result) => {
        if (!settled) {
          settled = true;
          cleanup();
          signal?.removeEventListener("abort", abortHandler);
          resolvePromise(result);
        }
      })
      .catch((error) => {
        if (!settled) {
          settled = true;
          cleanup();
          signal?.removeEventListener("abort", abortHandler);
          reject(error);
        }
      });
  });
}

/**
 * Creates a git operations executor for a specific working directory.
 *
 * @param cwd - Working directory for git commands
 * @returns Object with exec method for running git commands
 */
export function createGitOps(cwd: string): {
  exec: (args: string[], options?: GitExecOptions) => Promise<GitExecResult>;
} {
  return {
    /**
     * Execute a git command with the given arguments.
     *
     * @param args - Command arguments (e.g., ['status', '--short'])
     * @param options - Optional timeout and signal settings
     * @returns Promise resolving to stdout, stderr, and exit code
     */
    exec: (args: string[], options?: GitExecOptions): Promise<GitExecResult> => {
      const timeout = options?.timeout ?? GIT_TIMEOUTS.LOCAL;
      const signal = options?.signal;

      const executeGit = (): Promise<GitExecResult> => {
        return new Promise<GitExecResult>((resolveExec, rejectExec) => {
          const child = spawn("git", args, {
            cwd,
            stdio: ["pipe", "pipe", "pipe"],
            // Windows-specific: use shell to find git in PATH
            shell: process.platform === "win32",
          });

          let stdout = "";
          let stderr = "";

          child.stdout?.on("data", (data: Buffer) => {
            stdout += data.toString();
          });

          child.stderr?.on("data", (data: Buffer) => {
            stderr += data.toString();
          });

          child.on("error", (error: Error) => {
            rejectExec(error);
          });

          child.on("close", (code: number | null) => {
            resolveExec({
              stdout,
              stderr,
              exitCode: code ?? 1,
            });
          });

          // Handle abort signal
          if (signal) {
            const abortHandler = () => {
              child.kill("SIGTERM");
            };
            signal.addEventListener("abort", abortHandler, { once: true });
            child.on("close", () => {
              signal.removeEventListener("abort", abortHandler);
            });
          }
        });
      };

      return withTimeout(executeGit(), timeout, `git ${args[0]}`, signal);
    },
  };
}

/**
 * Validates that a path is within the repository root.
 * Prevents directory traversal attacks (e.g., ../../../etc/passwd).
 *
 * @param path - Path to validate (can be relative or absolute)
 * @param repoRoot - Repository root directory (absolute path)
 * @returns true if path is within repo root, false otherwise
 */
export function validatePath(path: string, repoRoot: string): boolean {
  // Normalize both paths to handle different separators and resolve ..
  const normalizedRoot = normalize(resolve(repoRoot));
  const normalizedPath = normalize(resolve(repoRoot, path));

  // Check if the resolved path starts with the repo root
  // Add trailing separator to prevent partial matches (e.g., /repo vs /repository)
  const rootWithSep =
    normalizedRoot.endsWith("/") || normalizedRoot.endsWith("\\")
      ? normalizedRoot
      : `${normalizedRoot}/`;

  // Path is valid if it equals root or starts with root + separator
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(rootWithSep);
}
