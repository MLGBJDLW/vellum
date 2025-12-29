// ============================================
// Git Error Factories
// ============================================

import { ErrorCode, VellumError } from "../../errors/types.js";

/**
 * Creates an error for merge/rebase conflicts.
 *
 * @param files - List of conflicting file paths
 * @returns VellumError with GIT_CONFLICT code
 */
export function gitConflictError(files: string[]): VellumError {
  const fileList =
    files.length > 5
      ? `${files.slice(0, 5).join(", ")} and ${files.length - 5} more`
      : files.join(", ");

  return new VellumError(`Git conflict detected in files: ${fileList}`, ErrorCode.GIT_CONFLICT, {
    context: { files },
    isRetryable: false,
  });
}

/**
 * Creates an error for dirty working directory.
 *
 * @returns VellumError with GIT_DIRTY_WORKDIR code
 */
export function gitDirtyWorkdirError(): VellumError {
  return new VellumError(
    "Working directory has uncommitted changes. Please commit or stash changes first.",
    ErrorCode.GIT_DIRTY_WORKDIR,
    { isRetryable: false }
  );
}

/**
 * Creates an error when a branch already exists.
 *
 * @param branch - Name of the existing branch
 * @returns VellumError with GIT_BRANCH_EXISTS code
 */
export function gitBranchExistsError(branch: string): VellumError {
  return new VellumError(`Branch '${branch}' already exists`, ErrorCode.GIT_BRANCH_EXISTS, {
    context: { branch },
    isRetryable: false,
  });
}

/**
 * Creates an error when a branch is not found.
 *
 * @param branch - Name of the missing branch
 * @returns VellumError with GIT_BRANCH_NOT_FOUND code
 */
export function gitBranchNotFoundError(branch: string): VellumError {
  return new VellumError(`Branch '${branch}' not found`, ErrorCode.GIT_BRANCH_NOT_FOUND, {
    context: { branch },
    isRetryable: false,
  });
}

/**
 * Creates an error for remote operation failures.
 *
 * @param message - Descriptive error message from git
 * @returns VellumError with GIT_REMOTE_ERROR code
 */
export function gitRemoteError(message: string): VellumError {
  return new VellumError(`Git remote error: ${message}`, ErrorCode.GIT_REMOTE_ERROR, {
    isRetryable: true,
    retryDelay: 5000,
  });
}

/**
 * Creates an error for git operation timeout.
 *
 * @param operation - Name of the operation that timed out
 * @returns VellumError with GIT_TIMEOUT code
 */
export function gitTimeoutError(operation: string): VellumError {
  return new VellumError(`Git operation '${operation}' timed out`, ErrorCode.GIT_TIMEOUT, {
    context: { operation },
    isRetryable: true,
    retryDelay: 1000,
  });
}

/**
 * Creates an error when there are no staged changes to commit.
 *
 * @returns VellumError with GIT_NO_STAGED_CHANGES code
 */
export function gitNoStagedChangesError(): VellumError {
  return new VellumError(
    "No staged changes to commit. Use 'git add' to stage changes.",
    ErrorCode.GIT_NO_STAGED_CHANGES,
    {
      isRetryable: false,
    }
  );
}

/**
 * Creates an error when stash is empty.
 *
 * @returns VellumError with GIT_STASH_EMPTY code
 */
export function gitStashEmptyError(): VellumError {
  return new VellumError("No stash entries found", ErrorCode.GIT_STASH_EMPTY, {
    isRetryable: false,
  });
}
