/**
 * Git Snapshot Types
 *
 * Zod schemas and TypeScript types for git snapshot operations.
 * Provides type-safe validation for git-related data structures.
 *
 * @module git/types
 */

import { z } from "zod";

// =============================================================================
// T005: Zod Schemas for Git Types
// =============================================================================

/**
 * Enum representing the type of change to a file.
 *
 * - added: File was created
 * - modified: File was changed
 * - deleted: File was removed
 * - renamed: File was moved/renamed
 */
export const FileChangeTypeSchema = z.enum(["added", "modified", "deleted", "renamed"]);

/** Inferred type for file change types */
export type FileChangeType = z.infer<typeof FileChangeTypeSchema>;

/**
 * Schema representing a single file change in a git patch.
 *
 * Contains the path, change type, and optional rename information.
 */
export const GitFileChangeSchema = z.object({
  /** Path to the file (relative to repo root) */
  path: z.string(),
  /** Type of change */
  type: FileChangeTypeSchema,
  /** Original path if renamed */
  oldPath: z.string().optional(),
});

/** Inferred type for a git file change */
export type GitFileChange = z.infer<typeof GitFileChangeSchema>;

/**
 * Schema representing a git patch (a list of file changes).
 *
 * Used to describe the set of changes in a commit or working directory.
 */
export const GitPatchSchema = z.object({
  /** List of file changes in the patch */
  files: z.array(GitFileChangeSchema),
  /** Commit hash if this patch represents a commit */
  commitHash: z.string().optional(),
  /** Timestamp when the patch was created */
  timestamp: z.number().optional(),
});

/** Inferred type for a git patch */
export type GitPatch = z.infer<typeof GitPatchSchema>;

/**
 * Schema representing a diff with before/after content for a single file.
 *
 * Contains the full content before and after the change, plus the unified diff.
 */
export const GitFileDiffSchema = z.object({
  /** Path to the file */
  path: z.string(),
  /** Type of change */
  type: FileChangeTypeSchema,
  /** Content before the change (undefined for added files) */
  beforeContent: z.string().optional(),
  /** Content after the change (undefined for deleted files) */
  afterContent: z.string().optional(),
  /** Unified diff text */
  diff: z.string().optional(),
  /** Original path if renamed */
  oldPath: z.string().optional(),
});

/** Inferred type for a git file diff */
export type GitFileDiff = z.infer<typeof GitFileDiffSchema>;

/**
 * Schema for git snapshot configuration options.
 *
 * Controls snapshot behavior including auto-snapshot intervals,
 * exclusion patterns, and storage limits.
 */
export const GitSnapshotConfigSchema = z.object({
  /** Whether snapshots are enabled */
  enabled: z.boolean().default(true),
  /** Interval in milliseconds between auto-snapshots (0 = disabled) */
  autoSnapshotIntervalMs: z.number().min(0).default(0),
  /** Maximum number of snapshots to retain (0 = unlimited) */
  maxSnapshots: z.number().min(0).default(100),
  /** Custom exclusion patterns (merged with defaults) */
  customExclusions: z.array(z.string()).default([]),
  /** Working directory for git operations */
  workDir: z.string().optional(),
  /** Whether to include untracked files in snapshots */
  includeUntracked: z.boolean().default(true),
  /** Prefix for snapshot commit messages */
  commitMessagePrefix: z.string().default("[vellum-snapshot]"),
  /** Lock acquisition timeout in milliseconds */
  lockTimeoutMs: z.number().min(0).default(30000),
});

/** Inferred type for git snapshot configuration */
export type GitSnapshotConfig = z.infer<typeof GitSnapshotConfigSchema>;

/**
 * Schema for a snapshot record stored in history.
 */
export const GitSnapshotRecordSchema = z.object({
  /** Unique commit hash for the snapshot */
  hash: z.string(),
  /** ISO timestamp when snapshot was created */
  createdAt: z.string(),
  /** Working directory path */
  workDir: z.string(),
  /** Number of files changed in this snapshot */
  fileCount: z.number(),
  /** Optional description of what triggered the snapshot */
  trigger: z.string().optional(),
});

/** Inferred type for a snapshot record */
export type GitSnapshotRecord = z.infer<typeof GitSnapshotRecordSchema>;

/**
 * Schema for diff line types in formatted output.
 */
export const DiffLineTypeSchema = z.enum(["context", "add", "remove", "header"]);

/** Inferred type for diff line types */
export type DiffLineType = z.infer<typeof DiffLineTypeSchema>;

/**
 * Schema for a single line in a formatted diff.
 */
export const DiffLineSchema = z.object({
  /** Type of diff line */
  type: DiffLineTypeSchema,
  /** Content of the line (without prefix) */
  content: z.string(),
  /** Line number in old file (undefined for added lines) */
  oldLineNumber: z.number().optional(),
  /** Line number in new file (undefined for removed lines) */
  newLineNumber: z.number().optional(),
});

/** Inferred type for a diff line */
export type DiffLine = z.infer<typeof DiffLineSchema>;

/**
 * Schema for a diff hunk (a contiguous block of changes).
 */
export const DiffHunkSchema = z.object({
  /** Starting line in old file */
  oldStart: z.number(),
  /** Number of lines from old file */
  oldLines: z.number(),
  /** Starting line in new file */
  newStart: z.number(),
  /** Number of lines from new file */
  newLines: z.number(),
  /** Lines in this hunk */
  lines: z.array(DiffLineSchema),
});

/** Inferred type for a diff hunk */
export type DiffHunk = z.infer<typeof DiffHunkSchema>;

/**
 * Schema for a formatted diff output.
 */
export const FormattedDiffSchema = z.object({
  /** Path to the file */
  path: z.string(),
  /** Old path if renamed */
  oldPath: z.string().optional(),
  /** Type of change */
  type: FileChangeTypeSchema,
  /** Hunks in the diff */
  hunks: z.array(DiffHunkSchema),
  /** Whether the file is binary */
  isBinary: z.boolean().default(false),
});

/** Inferred type for a formatted diff */
export type FormattedDiff = z.infer<typeof FormattedDiffSchema>;

// =============================================================================
// T016: Service Interface
// =============================================================================

import type { VellumError } from "../errors/types.js";
import type { Result } from "../types/result.js";

/**
 * Interface for the GitSnapshotService.
 *
 * Defines the contract for git snapshot management operations.
 * Implementations must handle disabled state gracefully.
 */
export interface IGitSnapshotService {
  /**
   * Creates a snapshot of the current working directory state.
   *
   * @returns Ok(hash) with 40-char SHA, Ok(undefined) if disabled, Err on failure
   */
  track(): Promise<Result<string | undefined, VellumError>>;

  /**
   * Gets the patch (list of changed files) since a snapshot.
   *
   * @param hash - The tree SHA hash to compare against
   * @returns Ok(GitPatch) with files array, Err on failure
   */
  patch(hash: string): Promise<Result<GitPatch, VellumError>>;

  /**
   * Gets a unified diff since a snapshot.
   *
   * @param hash - The tree SHA hash to compare against
   * @returns Ok(string) with unified diff output, Err on failure
   */
  diff(hash: string): Promise<Result<string, VellumError>>;

  /**
   * Gets full file diffs with before/after content between snapshots.
   *
   * @param from - The starting tree SHA hash
   * @param to - The ending tree SHA hash (optional, defaults to working directory)
   * @returns Ok(GitFileDiff[]) with file contents, Err on failure
   */
  diffFull(from: string, to?: string): Promise<Result<GitFileDiff[], VellumError>>;

  /**
   * Restores the working directory to a snapshot state.
   *
   * @param hash - The tree SHA hash to restore
   * @returns Ok(void) on success, Err on failure
   */
  restore(hash: string): Promise<Result<void, VellumError>>;

  /**
   * Reverts specific files from a patch to their snapshot state.
   *
   * @param hash - The tree SHA hash to revert to
   * @param patches - The patch containing files to revert
   * @returns Ok(void) on success, Err on failure
   */
  revert(hash: string, patches: GitPatch): Promise<Result<void, VellumError>>;
}
