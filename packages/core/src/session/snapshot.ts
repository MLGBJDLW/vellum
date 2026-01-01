// ============================================
// Session Snapshot Module (T024)
// ============================================

/**
 * Snapshot namespace for managing shadow Git repository.
 *
 * Provides methods for tracking file states independently of the user's
 * main Git repository by maintaining a separate shadow repository in
 * `.vellum/.git-shadow/`.
 *
 * @module @vellum/core/session/snapshot
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { type SimpleGit, type SimpleGitOptions, simpleGit } from "simple-git";
import { getNoGpgFlags, getSanitizedEnv } from "../git/safety.js";
import type { Result } from "../types/result.js";
import { Err, Ok } from "../types/result.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Information about a snapshot.
 */
export interface SnapshotInfo {
  /** 40-character SHA hash of the snapshot commit */
  hash: string;
  /** Timestamp when snapshot was created */
  timestamp: Date;
  /** List of files tracked in this snapshot */
  files: string[];
  /** Optional commit message */
  message?: string;
}

/**
 * Result of a diff operation between current state and a snapshot.
 */
export interface DiffResult {
  /** Files that exist in current state but not in snapshot */
  added: string[];
  /** Files that exist in both but have different content */
  modified: string[];
  /** Files that exist in snapshot but not in current state */
  deleted: string[];
  /** Unified diff patch output */
  patch: string;
}

/**
 * Error codes specific to snapshot operations.
 */
export enum SnapshotErrorCode {
  /** Shadow repository already exists */
  ALREADY_INITIALIZED = "SNAPSHOT_ALREADY_INITIALIZED",
  /** Shadow repository not found */
  NOT_INITIALIZED = "SNAPSHOT_NOT_INITIALIZED",
  /** Git operation failed */
  OPERATION_FAILED = "SNAPSHOT_OPERATION_FAILED",
  /** Invalid hash format */
  INVALID_HASH = "SNAPSHOT_INVALID_HASH",
  /** Snapshot not found */
  NOT_FOUND = "SNAPSHOT_NOT_FOUND",
}

/**
 * Error class for snapshot operations.
 */
export class SnapshotError extends Error {
  readonly code: SnapshotErrorCode;
  readonly cause?: Error;

  constructor(message: string, code: SnapshotErrorCode, cause?: Error) {
    super(message);
    this.name = "SnapshotError";
    this.code = code;
    this.cause = cause;
  }
}

// =============================================================================
// Constants
// =============================================================================

/** Directory name for shadow repository */
const SHADOW_DIR_NAME = ".git-shadow";

/** Base directory for vellum data */
const VELLUM_DIR = ".vellum";

/** Default commit message for tracking */
const DEFAULT_COMMIT_MESSAGE = "snapshot";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Gets the path to the shadow repository directory.
 */
function getShadowPath(workingDir: string): string {
  return path.join(workingDir, VELLUM_DIR, SHADOW_DIR_NAME);
}

/**
 * Creates a configured SimpleGit instance for the shadow repository.
 */
function createShadowGit(workingDir: string, shadowPath: string): SimpleGit {
  // Get sanitized environment
  const env = getSanitizedEnv();

  // Set GIT_DIR to shadow repo and GIT_WORK_TREE to actual working directory
  env.GIT_DIR = shadowPath;
  env.GIT_WORK_TREE = workingDir;

  // Get no-GPG flags for config
  const gpgFlags = getNoGpgFlags();

  // Build config object from flags
  const config: string[] = [];
  for (let i = 0; i < gpgFlags.length; i += 2) {
    const flag = gpgFlags[i];
    const value = gpgFlags[i + 1];
    if (flag === "-c" && value) {
      config.push(value);
    }
  }

  // Configure simple-git options
  const options: Partial<SimpleGitOptions> = {
    baseDir: workingDir,
    binary: "git",
    maxConcurrentProcesses: 1,
    trimmed: true,
    config,
  };

  return simpleGit(options).env(env);
}

/**
 * Validates that a hash is a valid 40-character SHA.
 */
function isValidHash(hash: string): boolean {
  return /^[0-9a-f]{40}$/i.test(hash);
}

// =============================================================================
// Snapshot Namespace
// =============================================================================

/**
 * Namespace for shadow Git repository operations.
 *
 * Manages a separate Git repository in `.vellum/.git-shadow/` to track
 * file states independently of the user's main repository.
 *
 * @example
 * ```typescript
 * // Initialize shadow repository
 * const initResult = await Snapshot.init("/path/to/project");
 * if (initResult.ok) {
 *   console.log("Shadow repo at:", initResult.value);
 * }
 *
 * // Track files
 * const trackResult = await Snapshot.track("/path/to/project", ["src/index.ts"]);
 * if (trackResult.ok) {
 *   console.log("Snapshot hash:", trackResult.value);
 * }
 *
 * // Get snapshot info
 * const infoResult = await Snapshot.getInfo("/path/to/project", trackResult.value);
 * if (infoResult.ok) {
 *   console.log("Files:", infoResult.value.files);
 * }
 * ```
 */
export namespace Snapshot {
  /**
   * Initializes a shadow Git repository in `.vellum/.git-shadow/`.
   *
   * Creates a bare Git repository for tracking file states without
   * affecting the user's main Git repository.
   *
   * @param workingDir - The working directory path
   * @returns Ok with the shadow repository path, or Err on failure
   *
   * @example
   * ```typescript
   * const result = await Snapshot.init("/path/to/project");
   * if (result.ok) {
   *   console.log("Shadow repo initialized at:", result.value);
   * }
   * ```
   */
  export async function init(workingDir: string): Promise<Result<string, SnapshotError>> {
    const resolvedDir = path.resolve(workingDir);
    const shadowPath = getShadowPath(resolvedDir);

    try {
      // Check if already initialized
      const shadowExists = await fs
        .access(shadowPath)
        .then(() => true)
        .catch(() => false);

      if (shadowExists) {
        // Already initialized, return the path
        return Ok(shadowPath);
      }

      // Ensure .vellum directory exists
      const vellumDir = path.join(resolvedDir, VELLUM_DIR);
      await fs.mkdir(vellumDir, { recursive: true });

      // Get sanitized environment
      const env = getSanitizedEnv();

      // Initialize bare repository
      const git = simpleGit({ baseDir: resolvedDir }).env(env);
      await git.raw(["init", "--bare", shadowPath]);

      // Configure the shadow repository
      const shadowGit = createShadowGit(resolvedDir, shadowPath);

      // Set user config for commits (required for git commit)
      await shadowGit.addConfig("user.email", "vellum@local", false, "local");
      await shadowGit.addConfig("user.name", "Vellum Snapshot", false, "local");

      return Ok(shadowPath);
    } catch (error) {
      return Err(
        new SnapshotError(
          `Failed to initialize shadow repository: ${(error as Error).message}`,
          SnapshotErrorCode.OPERATION_FAILED,
          error as Error
        )
      );
    }
  }

  /**
   * Tracks specified files by staging and committing them to the shadow repository.
   *
   * Uses GIT_DIR and GIT_WORK_TREE environment variables to operate on the
   * working directory while storing data in the shadow repository.
   *
   * @param workingDir - The working directory path
   * @param files - Files to track (empty array = track all changed files)
   * @param message - Optional commit message
   * @returns Ok with 40-character commit hash, or Err on failure
   *
   * @example
   * ```typescript
   * // Track specific files
   * const result = await Snapshot.track("/path/to/project", ["src/index.ts"]);
   *
   * // Track all changed files
   * const result = await Snapshot.track("/path/to/project", []);
   * ```
   */
  export async function track(
    workingDir: string,
    files: string[] = [],
    message?: string
  ): Promise<Result<string, SnapshotError>> {
    const resolvedDir = path.resolve(workingDir);
    const shadowPath = getShadowPath(resolvedDir);

    try {
      // Check if shadow repo exists
      const shadowExists = await fs
        .access(shadowPath)
        .then(() => true)
        .catch(() => false);

      if (!shadowExists) {
        return Err(
          new SnapshotError(
            `Shadow repository not initialized in: ${resolvedDir}. Call Snapshot.init() first.`,
            SnapshotErrorCode.NOT_INITIALIZED
          )
        );
      }

      // Create configured git instance
      const git = createShadowGit(resolvedDir, shadowPath);

      // Stage files
      if (files.length === 0) {
        // Track all changed files
        await git.add(".");
      } else {
        // Track specific files
        for (const file of files) {
          // Normalize path separators for git
          const normalizedFile = file.split(path.sep).join("/");
          await git.add(normalizedFile);
        }
      }

      // Check if there are staged changes
      const status = await git.status();
      const hasChanges =
        status.staged.length > 0 ||
        status.created.length > 0 ||
        status.deleted.length > 0 ||
        status.modified.length > 0;

      if (!hasChanges) {
        // Check if this is the first commit (empty repo)
        const logResult = await git.log({ maxCount: 1 }).catch(() => null);

        if (!logResult || logResult.total === 0) {
          // First commit - create an empty tree commit
          // This allows repos with no initial commit to work
          await git.raw(["commit", "--allow-empty", "-m", message ?? DEFAULT_COMMIT_MESSAGE]);
        } else if (logResult.latest?.hash) {
          // Return the latest commit hash if no changes
          return Ok(logResult.latest.hash);
        }
      } else {
        // Commit the changes
        await git.commit(message ?? DEFAULT_COMMIT_MESSAGE);
      }

      // Get the commit hash
      const log = await git.log({ maxCount: 1 });
      const hash = log.latest?.hash;

      if (!hash || !isValidHash(hash)) {
        return Err(
          new SnapshotError(`Invalid commit hash returned: ${hash}`, SnapshotErrorCode.INVALID_HASH)
        );
      }

      return Ok(hash);
    } catch (error) {
      return Err(
        new SnapshotError(
          `Failed to track files: ${(error as Error).message}`,
          SnapshotErrorCode.OPERATION_FAILED,
          error as Error
        )
      );
    }
  }

  /**
   * Gets information about a snapshot by its commit hash.
   *
   * @param workingDir - The working directory path
   * @param hash - The 40-character commit hash
   * @returns Ok with snapshot info, or Err on failure
   *
   * @example
   * ```typescript
   * const result = await Snapshot.getInfo("/path/to/project", "abc123...");
   * if (result.ok) {
   *   console.log("Files:", result.value.files);
   *   console.log("Timestamp:", result.value.timestamp);
   * }
   * ```
   */
  export async function getInfo(
    workingDir: string,
    hash: string
  ): Promise<Result<SnapshotInfo, SnapshotError>> {
    const resolvedDir = path.resolve(workingDir);
    const shadowPath = getShadowPath(resolvedDir);

    // Validate hash format
    if (!isValidHash(hash)) {
      return Err(new SnapshotError(`Invalid hash format: ${hash}`, SnapshotErrorCode.INVALID_HASH));
    }

    try {
      // Check if shadow repo exists
      const shadowExists = await fs
        .access(shadowPath)
        .then(() => true)
        .catch(() => false);

      if (!shadowExists) {
        return Err(
          new SnapshotError(
            `Shadow repository not initialized in: ${resolvedDir}. Call Snapshot.init() first.`,
            SnapshotErrorCode.NOT_INITIALIZED
          )
        );
      }

      // Create configured git instance
      const git = createShadowGit(resolvedDir, shadowPath);

      // Get commit info
      const showResult = await git
        .show([hash, "--format=%aI%n%s", "--name-only"])
        .catch(() => null);

      if (!showResult) {
        return Err(new SnapshotError(`Snapshot not found: ${hash}`, SnapshotErrorCode.NOT_FOUND));
      }

      // Parse the output
      // Format: timestamp\nmessage\n\nfile1\nfile2\n...
      const lines = showResult.trim().split("\n");
      const timestampStr = lines[0];
      const message = lines[1];

      // Files start after the empty line
      const emptyLineIndex = lines.indexOf("");
      const files =
        emptyLineIndex >= 0
          ? lines.slice(emptyLineIndex + 1).filter((line) => line.trim() !== "")
          : [];

      // Parse timestamp
      const timestamp = timestampStr ? new Date(timestampStr) : new Date();

      return Ok({
        hash,
        timestamp,
        files,
        message: message || undefined,
      });
    } catch (error) {
      return Err(
        new SnapshotError(
          `Failed to get snapshot info: ${(error as Error).message}`,
          SnapshotErrorCode.OPERATION_FAILED,
          error as Error
        )
      );
    }
  }

  /**
   * Checks if the shadow repository is initialized.
   *
   * @param workingDir - The working directory path
   * @returns True if shadow repository exists
   *
   * @example
   * ```typescript
   * if (await Snapshot.isInitialized("/path/to/project")) {
   *   // Shadow repo exists
   * }
   * ```
   */
  export async function isInitialized(workingDir: string): Promise<boolean> {
    const resolvedDir = path.resolve(workingDir);
    const shadowPath = getShadowPath(resolvedDir);

    return fs
      .access(shadowPath)
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Gets the path to the shadow repository.
   *
   * @param workingDir - The working directory path
   * @returns The absolute path to the shadow repository directory
   *
   * @example
   * ```typescript
   * const shadowPath = Snapshot.getShadowPath("/path/to/project");
   * // Returns "/path/to/project/.vellum/.git-shadow"
   * ```
   */
  export function getShadowRepoPath(workingDir: string): string {
    return getShadowPath(path.resolve(workingDir));
  }

  /**
   * Restores file states from a snapshot to the working directory.
   *
   * Uses `git read-tree` and `git checkout-index` to restore files
   * tracked in the specified snapshot.
   *
   * @param workingDir - The working directory path
   * @param hash - The 40-character commit hash of the snapshot to restore
   * @returns Ok with list of restored files, or Err on failure
   *
   * @example
   * ```typescript
   * const result = await Snapshot.restore("/path/to/project", "abc123...");
   * if (result.ok) {
   *   console.log("Restored files:", result.value);
   * }
   * ```
   */
  export async function restore(
    workingDir: string,
    hash: string
  ): Promise<Result<string[], SnapshotError>> {
    const resolvedDir = path.resolve(workingDir);
    const shadowPath = getShadowPath(resolvedDir);

    // Validate hash format
    if (!isValidHash(hash)) {
      return Err(new SnapshotError(`Invalid hash format: ${hash}`, SnapshotErrorCode.INVALID_HASH));
    }

    try {
      // Check if shadow repo exists
      const shadowExists = await fs
        .access(shadowPath)
        .then(() => true)
        .catch(() => false);

      if (!shadowExists) {
        return Err(
          new SnapshotError(
            `Shadow repository not initialized in: ${resolvedDir}. Call Snapshot.init() first.`,
            SnapshotErrorCode.NOT_INITIALIZED
          )
        );
      }

      // Create configured git instance
      const git = createShadowGit(resolvedDir, shadowPath);

      // Verify the commit exists
      const verifyResult = await git.raw(["cat-file", "-t", hash]).catch(() => null);
      if (!verifyResult || verifyResult.trim() !== "commit") {
        return Err(new SnapshotError(`Snapshot not found: ${hash}`, SnapshotErrorCode.NOT_FOUND));
      }

      // Get list of files in the snapshot
      const filesOutput = await git.raw(["ls-tree", "-r", "--name-only", hash]);
      const files = filesOutput
        .trim()
        .split("\n")
        .filter((f) => f.trim() !== "");

      if (files.length === 0) {
        return Ok([]);
      }

      // Use read-tree to load the tree into index
      await git.raw(["read-tree", hash]);

      // Use checkout-index to restore files to working directory
      await git.raw(["checkout-index", "-f", "-a"]);

      return Ok(files);
    } catch (error) {
      return Err(
        new SnapshotError(
          `Failed to restore snapshot: ${(error as Error).message}`,
          SnapshotErrorCode.OPERATION_FAILED,
          error as Error
        )
      );
    }
  }

  /**
   * Gets the diff between current working directory state and a snapshot.
   *
   * @param workingDir - The working directory path
   * @param hash - The 40-character commit hash to diff against
   * @returns Ok with unified diff string, or Err on failure
   *
   * @example
   * ```typescript
   * const result = await Snapshot.diff("/path/to/project", "abc123...");
   * if (result.ok) {
   *   console.log("Diff:", result.value);
   * }
   * ```
   */
  export async function diff(
    workingDir: string,
    hash: string
  ): Promise<Result<string, SnapshotError>> {
    const resolvedDir = path.resolve(workingDir);
    const shadowPath = getShadowPath(resolvedDir);

    // Validate hash format
    if (!isValidHash(hash)) {
      return Err(new SnapshotError(`Invalid hash format: ${hash}`, SnapshotErrorCode.INVALID_HASH));
    }

    try {
      // Check if shadow repo exists
      const shadowExists = await fs
        .access(shadowPath)
        .then(() => true)
        .catch(() => false);

      if (!shadowExists) {
        return Err(
          new SnapshotError(
            `Shadow repository not initialized in: ${resolvedDir}. Call Snapshot.init() first.`,
            SnapshotErrorCode.NOT_INITIALIZED
          )
        );
      }

      // Create configured git instance
      const git = createShadowGit(resolvedDir, shadowPath);

      // Verify the commit exists
      const verifyResult = await git.raw(["cat-file", "-t", hash]).catch(() => null);
      if (!verifyResult || verifyResult.trim() !== "commit") {
        return Err(new SnapshotError(`Snapshot not found: ${hash}`, SnapshotErrorCode.NOT_FOUND));
      }

      // Get diff between commit and working directory
      // --no-color ensures no ANSI codes in output
      const diffOutput = await git.raw(["diff", "--no-color", hash, "--"]);

      return Ok(diffOutput);
    } catch (error) {
      return Err(
        new SnapshotError(
          `Failed to get diff: ${(error as Error).message}`,
          SnapshotErrorCode.OPERATION_FAILED,
          error as Error
        )
      );
    }
  }

  /**
   * Gets a structured diff summary between current state and a snapshot.
   *
   * @param workingDir - The working directory path
   * @param hash - The 40-character commit hash to diff against
   * @returns Ok with DiffResult containing categorized changes, or Err on failure
   *
   * @example
   * ```typescript
   * const result = await Snapshot.getDiffSummary("/path/to/project", "abc123...");
   * if (result.ok) {
   *   console.log("Added:", result.value.added);
   *   console.log("Modified:", result.value.modified);
   *   console.log("Deleted:", result.value.deleted);
   * }
   * ```
   */
  export async function getDiffSummary(
    workingDir: string,
    hash: string
  ): Promise<Result<DiffResult, SnapshotError>> {
    const resolvedDir = path.resolve(workingDir);
    const shadowPath = getShadowPath(resolvedDir);

    // Validate hash format
    if (!isValidHash(hash)) {
      return Err(new SnapshotError(`Invalid hash format: ${hash}`, SnapshotErrorCode.INVALID_HASH));
    }

    try {
      // Check if shadow repo exists
      const shadowExists = await fs
        .access(shadowPath)
        .then(() => true)
        .catch(() => false);

      if (!shadowExists) {
        return Err(
          new SnapshotError(
            `Shadow repository not initialized in: ${resolvedDir}. Call Snapshot.init() first.`,
            SnapshotErrorCode.NOT_INITIALIZED
          )
        );
      }

      // Create configured git instance
      const git = createShadowGit(resolvedDir, shadowPath);

      // Verify the commit exists
      const verifyResult = await git.raw(["cat-file", "-t", hash]).catch(() => null);
      if (!verifyResult || verifyResult.trim() !== "commit") {
        return Err(new SnapshotError(`Snapshot not found: ${hash}`, SnapshotErrorCode.NOT_FOUND));
      }

      // Get diff with name-status to categorize changes
      // Output format: A\tfile (added), M\tfile (modified), D\tfile (deleted)
      const nameStatusOutput = await git.raw(["diff", "--name-status", hash, "--"]);

      const added: string[] = [];
      const modified: string[] = [];
      const deleted: string[] = [];

      // Parse name-status output
      const lines = nameStatusOutput
        .trim()
        .split("\n")
        .filter((l) => l.trim() !== "");
      for (const line of lines) {
        const [status, ...fileParts] = line.split("\t");
        const file = fileParts.join("\t"); // Handle files with tabs in name
        if (!file) continue;

        switch (status) {
          case "A":
            added.push(file);
            break;
          case "M":
            modified.push(file);
            break;
          case "D":
            deleted.push(file);
            break;
          // Handle rename as delete + add
          case "R":
          case "R100":
            // For renames, fileParts contains [oldName, newName]
            if (fileParts.length >= 2 && fileParts[0] && fileParts[1]) {
              deleted.push(fileParts[0]);
              added.push(fileParts[1]);
            }
            break;
        }
      }

      // Get the full unified diff
      const patch = await git.raw(["diff", "--no-color", hash, "--"]);

      return Ok({
        added,
        modified,
        deleted,
        patch,
      });
    } catch (error) {
      return Err(
        new SnapshotError(
          `Failed to get diff summary: ${(error as Error).message}`,
          SnapshotErrorCode.OPERATION_FAILED,
          error as Error
        )
      );
    }
  }

  /**
   * Selectively reverts specific files to their state in the most recent snapshot.
   *
   * @param workingDir - The working directory path
   * @param patches - List of file paths to revert
   * @returns Ok with list of reverted files, or Err on failure
   *
   * @example
   * ```typescript
   * const result = await Snapshot.revert("/path/to/project", ["src/index.ts"]);
   * if (result.ok) {
   *   console.log("Reverted:", result.value);
   * }
   * ```
   */
  export async function revert(
    workingDir: string,
    patches: string[]
  ): Promise<Result<string[], SnapshotError>> {
    const resolvedDir = path.resolve(workingDir);
    const shadowPath = getShadowPath(resolvedDir);

    if (patches.length === 0) {
      return Ok([]);
    }

    try {
      // Check if shadow repo exists
      const shadowExists = await fs
        .access(shadowPath)
        .then(() => true)
        .catch(() => false);

      if (!shadowExists) {
        return Err(
          new SnapshotError(
            `Shadow repository not initialized in: ${resolvedDir}. Call Snapshot.init() first.`,
            SnapshotErrorCode.NOT_INITIALIZED
          )
        );
      }

      // Create configured git instance
      const git = createShadowGit(resolvedDir, shadowPath);

      // Get the most recent snapshot (HEAD)
      const logResult = await git.log({ maxCount: 1 }).catch(() => null);

      if (!logResult || !logResult.latest?.hash) {
        return Err(
          new SnapshotError("No snapshots found to revert from", SnapshotErrorCode.NOT_FOUND)
        );
      }

      const hash = logResult.latest.hash;

      // Get list of files in the snapshot
      const filesOutput = await git.raw(["ls-tree", "-r", "--name-only", hash]);
      const snapshotFiles = new Set(
        filesOutput
          .trim()
          .split("\n")
          .filter((f) => f.trim() !== "")
      );

      const revertedFiles: string[] = [];

      // Revert each specified file that exists in the snapshot
      for (const filePath of patches) {
        // Normalize path separators
        const normalizedPath = filePath.split(path.sep).join("/");

        if (snapshotFiles.has(normalizedPath)) {
          // Use checkout to restore the file from the snapshot
          await git.raw(["checkout", hash, "--", normalizedPath]);
          revertedFiles.push(normalizedPath);
        }
        // Skip files that don't exist in the snapshot (silently)
      }

      return Ok(revertedFiles);
    } catch (error) {
      return Err(
        new SnapshotError(
          `Failed to revert files: ${(error as Error).message}`,
          SnapshotErrorCode.OPERATION_FAILED,
          error as Error
        )
      );
    }
  }

  /**
   * Lists all snapshots in the shadow repository.
   *
   * @param workingDir - The working directory path
   * @returns Ok with array of SnapshotInfo sorted by date (newest first), or Err on failure
   *
   * @example
   * ```typescript
   * const result = await Snapshot.listSnapshots("/path/to/project");
   * if (result.ok) {
   *   for (const snapshot of result.value) {
   *     console.log(`${snapshot.hash}: ${snapshot.timestamp}`);
   *   }
   * }
   * ```
   */
  export async function listSnapshots(
    workingDir: string
  ): Promise<Result<SnapshotInfo[], SnapshotError>> {
    const resolvedDir = path.resolve(workingDir);
    const shadowPath = getShadowPath(resolvedDir);

    try {
      // Check if shadow repo exists
      const shadowExists = await fs
        .access(shadowPath)
        .then(() => true)
        .catch(() => false);

      if (!shadowExists) {
        return Err(
          new SnapshotError(
            `Shadow repository not initialized in: ${resolvedDir}. Call Snapshot.init() first.`,
            SnapshotErrorCode.NOT_INITIALIZED
          )
        );
      }

      // Create configured git instance
      const git = createShadowGit(resolvedDir, shadowPath);

      // Get all commits with format: hash|timestamp|message
      // Using %H for full hash, %aI for ISO timestamp, %s for subject
      const logOutput = await git.raw(["log", "--format=%H|%aI|%s", "--all"]).catch(() => "");

      if (!logOutput.trim()) {
        return Ok([]);
      }

      const snapshots: SnapshotInfo[] = [];
      const lines = logOutput
        .trim()
        .split("\n")
        .filter((l) => l.trim() !== "");

      for (const line of lines) {
        const [hash, timestamp, ...messageParts] = line.split("|");
        const message = messageParts.join("|"); // Handle messages with pipes

        if (!hash || !isValidHash(hash)) continue;

        // Get files for this commit
        const filesOutput = await git.raw(["ls-tree", "-r", "--name-only", hash]).catch(() => "");
        const files = filesOutput
          .trim()
          .split("\n")
          .filter((f) => f.trim() !== "");

        snapshots.push({
          hash,
          timestamp: timestamp ? new Date(timestamp) : new Date(),
          files,
          message: message || undefined,
        });
      }

      // Already sorted newest first by git log default
      return Ok(snapshots);
    } catch (error) {
      return Err(
        new SnapshotError(
          `Failed to list snapshots: ${(error as Error).message}`,
          SnapshotErrorCode.OPERATION_FAILED,
          error as Error
        )
      );
    }
  }
}
