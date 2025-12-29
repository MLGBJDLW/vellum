// ============================================
// Git Tool Types and Constants
// ============================================

import { z } from "zod";

// =============================================================================
// Timeout Constants
// =============================================================================

/**
 * Timeout durations for git operations in milliseconds.
 */
export const GIT_TIMEOUTS = {
  /** 5 seconds for local operations (status, add, commit, etc.) */
  LOCAL: 5_000,
  /** 30 seconds for network operations (fetch, push, pull, clone) */
  NETWORK: 30_000,
} as const;

// =============================================================================
// Output Limits
// =============================================================================

/**
 * Maximum number of output lines before truncation.
 */
export const MAX_OUTPUT_LINES = 500;

/**
 * Marker appended when output is truncated.
 */
export const TRUNCATION_MARKER = "\n... (output truncated)";

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for file paths relative to repository root.
 * Must be non-empty string.
 */
export const FilePathSchema = z.string().min(1).describe("File path relative to repo root");

/**
 * Schema for valid Git branch names.
 * Allows alphanumeric, underscores, hyphens, dots, and forward slashes.
 */
export const BranchNameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_\-/.]+$/, "Invalid branch name")
  .describe("Valid Git branch name");

// =============================================================================
// Context Types
// =============================================================================

/**
 * Execution context for git operations.
 */
export interface GitToolContext {
  /** Working directory (repository root) */
  cwd: string;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Result of a git command execution.
 */
export interface GitExecResult {
  /** Standard output from the command */
  stdout: string;
  /** Standard error from the command */
  stderr: string;
  /** Exit code of the process */
  exitCode: number;
}

/**
 * Options for git command execution.
 */
export interface GitExecOptions {
  /** Timeout in milliseconds (default: GIT_TIMEOUTS.LOCAL) */
  timeout?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}
