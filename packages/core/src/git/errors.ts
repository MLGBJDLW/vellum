/**
 * Git Error Factory Functions
 *
 * Provides factory functions for creating standardized git-related errors.
 * All errors follow the VellumError pattern with appropriate error codes.
 *
 * @module git/errors
 */

import { ErrorCode, VellumError } from "../errors/types.js";

// =============================================================================
// T006: Git Error Factory Functions
// =============================================================================

/**
 * Creates an error indicating git is not initialized in the working directory.
 *
 * @param workDir - The working directory path where git was expected
 * @returns VellumError with code GIT_NOT_INITIALIZED (7000)
 *
 * @example
 * ```typescript
 * const result = Err(gitNotInitializedError("/path/to/project"));
 * ```
 */
export function gitNotInitializedError(workDir: string): VellumError {
  return new VellumError(
    `Git repository not initialized in: ${workDir}. Run 'git init' to initialize a repository.`,
    ErrorCode.GIT_NOT_INITIALIZED,
    {
      context: { workDir },
    }
  );
}

/**
 * Creates an error indicating git snapshots are disabled.
 *
 * @returns VellumError with code GIT_SNAPSHOT_DISABLED (7001)
 *
 * @example
 * ```typescript
 * if (!config.enabled) {
 *   return Err(gitSnapshotDisabledError());
 * }
 * ```
 */
export function gitSnapshotDisabledError(): VellumError {
  return new VellumError(
    "Git snapshots are disabled in configuration. Enable snapshots to use this feature.",
    ErrorCode.GIT_SNAPSHOT_DISABLED
  );
}

/**
 * Creates an error indicating an operation was attempted on a protected path.
 *
 * Protected paths include home directory, Desktop, Documents, Downloads,
 * and other system locations that should not be modified by automated tools.
 *
 * @param path - The protected path that was accessed
 * @returns VellumError with code GIT_PROTECTED_PATH (7002)
 *
 * @example
 * ```typescript
 * const safetyResult = checkProtectedPath(targetPath);
 * if (!safetyResult.ok) {
 *   return Err(gitProtectedPathError(targetPath));
 * }
 * ```
 */
export function gitProtectedPathError(path: string): VellumError {
  return new VellumError(
    `Cannot perform git operations on protected path: ${path}. This location is protected to prevent accidental modifications.`,
    ErrorCode.GIT_PROTECTED_PATH,
    {
      context: { path },
    }
  );
}

/**
 * Creates an error indicating a lock acquisition timed out.
 *
 * This error is recoverable - callers may retry after a delay.
 *
 * @param timeoutMs - The timeout duration in milliseconds
 * @returns VellumError with code GIT_LOCK_TIMEOUT (7020)
 *
 * @example
 * ```typescript
 * const lockResult = await lock.acquire();
 * if (!lockResult.ok) {
 *   return Err(gitLockTimeoutError(30000));
 * }
 * ```
 */
export function gitLockTimeoutError(timeoutMs: number): VellumError {
  return new VellumError(
    `Failed to acquire git lock within ${timeoutMs}ms. Another operation may be in progress.`,
    ErrorCode.GIT_LOCK_TIMEOUT,
    {
      context: { timeoutMs },
      isRetryable: true,
      retryDelay: 1000,
    }
  );
}

/**
 * Creates an error indicating a general git operation failed.
 *
 * @param operation - Description of the operation that failed
 * @param cause - The underlying error that caused the failure
 * @returns VellumError with code GIT_OPERATION_FAILED (7010)
 *
 * @example
 * ```typescript
 * try {
 *   await git.commit(message);
 * } catch (error) {
 *   return Err(gitOperationFailedError("commit", error as Error));
 * }
 * ```
 */
export function gitOperationFailedError(operation: string, cause?: Error): VellumError {
  return new VellumError(
    `Git operation failed: ${operation}${cause ? ` - ${cause.message}` : ""}`,
    ErrorCode.GIT_OPERATION_FAILED,
    {
      context: { operation },
      cause,
    }
  );
}
