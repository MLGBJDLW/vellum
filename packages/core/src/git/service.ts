/**
 * Git Snapshot Service
 *
 * High-level service for managing git-based snapshots.
 * Provides methods for tracking, diffing, and restoring working directory states.
 *
 * @module git/service
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { VellumError } from "../errors/types.js";
import type { Logger } from "../logger/logger.js";
import type { Result } from "../types/result.js";
import { Err, Ok } from "../types/result.js";
import { gitSnapshotDisabledError } from "./errors.js";
import type { GitSnapshotLock } from "./lock.js";
import type { DiffNameEntry, GitOperations } from "./operations.js";
import type {
  FileChangeType,
  GitFileDiff,
  GitPatch,
  GitSnapshotConfig,
  IGitSnapshotService,
} from "./types.js";

// =============================================================================
// T016-T022: GitSnapshotService Implementation
// =============================================================================

/**
 * Event payloads for git snapshot events.
 */
export interface GitSnapshotCreatedEvent {
  /** The tree SHA hash of the snapshot */
  hash: string;
  /** Working directory path */
  workDir: string;
  /** Timestamp when snapshot was created */
  timestamp: number;
}

export interface GitSnapshotRestoredEvent {
  /** The tree SHA hash that was restored */
  hash: string;
  /** Working directory path */
  workDir: string;
  /** Timestamp when restore completed */
  timestamp: number;
}

export interface GitSnapshotRevertedEvent {
  /** The tree SHA hash used for reverting */
  hash: string;
  /** List of files that were reverted */
  files: string[];
  /** Working directory path */
  workDir: string;
  /** Timestamp when revert completed */
  timestamp: number;
}

/**
 * Event bus interface for git snapshot events.
 * Compatible with any event emitter that supports these methods.
 */
export interface GitSnapshotEventBus {
  emit(event: "gitSnapshotCreated", payload: GitSnapshotCreatedEvent): void;
  emit(event: "gitSnapshotRestored", payload: GitSnapshotRestoredEvent): void;
  emit(event: "gitSnapshotReverted", payload: GitSnapshotRevertedEvent): void;
}

/**
 * High-level service for managing git-based snapshots.
 *
 * Provides a clean API for:
 * - Creating snapshots (tracking working directory state)
 * - Generating diffs and patches
 * - Restoring and reverting to previous states
 *
 * @example
 * ```typescript
 * const service = new GitSnapshotService(
 *   config,
 *   logger,
 *   eventBus,
 *   operations,
 *   lock
 * );
 *
 * // Track current state
 * const trackResult = await service.track();
 * if (trackResult.ok && trackResult.value) {
 *   console.log("Snapshot created:", trackResult.value);
 * }
 *
 * // Get changes since snapshot
 * const patchResult = await service.patch(hash);
 * if (patchResult.ok) {
 *   console.log("Changed files:", patchResult.value.files);
 * }
 * ```
 */
export class GitSnapshotService implements IGitSnapshotService {
  private readonly config: GitSnapshotConfig;
  private readonly logger?: Logger;
  private readonly eventBus?: GitSnapshotEventBus;
  private readonly operations: GitOperations;
  private readonly lock: GitSnapshotLock;
  private readonly workDir: string;

  /**
   * Creates a new GitSnapshotService instance.
   *
   * @param config - Configuration for snapshot behavior
   * @param logger - Optional logger for debug output
   * @param eventBus - Optional event bus for emitting snapshot events
   * @param operations - Low-level git operations instance
   * @param lock - Mutex lock for serializing operations
   *
   * @throws {Error} If config.enabled is true but workDir is not provided
   */
  constructor(
    config: GitSnapshotConfig,
    logger: Logger | undefined,
    eventBus: GitSnapshotEventBus | undefined,
    operations: GitOperations,
    lock: GitSnapshotLock
  ) {
    this.config = config;
    this.logger = logger;
    this.eventBus = eventBus;
    this.operations = operations;
    this.lock = lock;

    // Use workDir from config or fallback to operations' workDir
    this.workDir = config.workDir ?? operations.getWorkDir();

    // Validate configuration
    if (config.enabled && !this.workDir) {
      throw new Error("GitSnapshotService: workDir is required when snapshots are enabled");
    }

    // T029: Check for nested git repositories and warn
    if (config.enabled && this.workDir) {
      this.checkNestedGitRepos().catch(() => {
        // Ignore errors during nested repo check - it's non-blocking
      });
    }

    this.logger?.debug("GitSnapshotService initialized", {
      enabled: config.enabled,
      workDir: this.workDir,
    });
  }

  // ===========================================================================
  // T017: track() method
  // ===========================================================================

  /**
   * Creates a snapshot of the current working directory state.
   *
   * Stages all changes and writes a tree object to git's object store.
   * Returns the 40-character SHA hash of the tree.
   *
   * @returns Ok(hash) with 40-char SHA, Ok(undefined) if disabled, Err on failure
   * @throws Never throws - all errors are returned as Err results
   *
   * @example
   * ```typescript
   * const result = await service.track();
   * if (result.ok && result.value) {
   *   console.log("Snapshot hash:", result.value);
   * }
   * ```
   */
  async track(): Promise<Result<string | undefined, VellumError>> {
    // If snapshots are disabled, return undefined (not an error)
    if (!this.config.enabled) {
      this.logger?.debug("Git snapshots disabled, skipping track");
      return Ok(undefined);
    }

    // Use lock to prevent concurrent operations
    const lockResult = await this.lock.acquire();
    if (!lockResult.ok) {
      return Err(lockResult.error);
    }

    try {
      this.logger?.debug("Creating git snapshot");

      // Stage all changes
      const stageResult = await this.operations.stageAll();
      if (!stageResult.ok) {
        return Err(stageResult.error);
      }

      // Write tree to get snapshot hash
      const treeResult = await this.operations.writeTree();
      if (!treeResult.ok) {
        return Err(treeResult.error);
      }

      const hash = treeResult.value;

      // Emit event
      this.eventBus?.emit("gitSnapshotCreated", {
        hash,
        workDir: this.workDir,
        timestamp: Date.now(),
      });

      this.logger?.info("Git snapshot created", { hash });
      return Ok(hash);
    } finally {
      this.lock.release();
    }
  }

  // ===========================================================================
  // T018: patch() method with change type detection
  // ===========================================================================

  /**
   * Gets the patch (list of changed files) since a snapshot.
   *
   * @param hash - The tree SHA hash to compare against
   * @returns Ok(GitPatch) with files array, Err on failure
   * @throws Never throws - all errors returned as Err (GIT_SNAPSHOT_DISABLED 7001, GIT_OPERATION_FAILED 7010)
   *
   * @example
   * ```typescript
   * const result = await service.patch(snapshotHash);
   * if (result.ok) {
   *   for (const file of result.value.files) {
   *     console.log(`${file.type}: ${file.path}`);
   *   }
   * }
   * ```
   */
  async patch(hash: string): Promise<Result<GitPatch, VellumError>> {
    if (!this.config.enabled) {
      return Err(gitSnapshotDisabledError());
    }

    this.logger?.debug("Getting patch since snapshot", { hash });

    // Get list of changed files
    const diffResult = await this.operations.diffNames(hash);
    if (!diffResult.ok) {
      return Err(diffResult.error);
    }

    // Map git status codes to FileChangeType
    const files = diffResult.value.map((entry) => ({
      path: entry.path,
      type: this.mapStatusToChangeType(entry.status),
      oldPath: entry.oldPath,
    }));

    const patch: GitPatch = {
      files,
      commitHash: hash,
      timestamp: Date.now(),
    };

    this.logger?.debug("Patch generated", {
      hash,
      fileCount: files.length,
    });

    return Ok(patch);
  }

  /**
   * Maps git status codes to FileChangeType.
   */
  private mapStatusToChangeType(status: DiffNameEntry["status"]): FileChangeType {
    switch (status) {
      case "A":
        return "added";
      case "M":
        return "modified";
      case "D":
        return "deleted";
      case "R":
        return "renamed";
      case "C":
        // Copy is treated as added for simplicity
        return "added";
      default:
        // T, U, X, B all treated as modified
        return "modified";
    }
  }

  // ===========================================================================
  // T019: diff() method
  // ===========================================================================

  /**
   * Gets a unified diff since a snapshot.
   *
   * @param hash - The tree SHA hash to compare against
   * @returns Ok(string) with unified diff output, Err on failure
   * @throws Never throws - all errors returned as Err (GIT_SNAPSHOT_DISABLED 7001, GIT_OPERATION_FAILED 7010)
   *
   * @example
   * ```typescript
   * const result = await service.diff(snapshotHash);
   * if (result.ok) {
   *   console.log(result.value); // Unified diff output
   * }
   * ```
   */
  async diff(hash: string): Promise<Result<string, VellumError>> {
    if (!this.config.enabled) {
      return Err(gitSnapshotDisabledError());
    }

    this.logger?.debug("Getting unified diff since snapshot", { hash });

    const diffResult = await this.operations.diffUnified(hash);
    if (!diffResult.ok) {
      return Err(diffResult.error);
    }

    return Ok(diffResult.value);
  }

  // ===========================================================================
  // T020: diffFull() method
  // ===========================================================================

  /**
   * Gets full file diffs with before/after content between snapshots.
   *
   * @param from - The starting tree SHA hash
   * @param to - The ending tree SHA hash (optional, defaults to working directory)
   * @returns Ok(GitFileDiff[]) with file contents, Err on failure
   *
   * @example
   * ```typescript
   * const result = await service.diffFull(startHash, endHash);
   * if (result.ok) {
   *   for (const fileDiff of result.value) {
   *     console.log(`File: ${fileDiff.path}`);
   *     console.log(`Before: ${fileDiff.beforeContent?.slice(0, 100)}...`);
   *     console.log(`After: ${fileDiff.afterContent?.slice(0, 100)}...`);
   *   }
   * }
   * ```
   */
  async diffFull(from: string, to?: string): Promise<Result<GitFileDiff[], VellumError>> {
    if (!this.config.enabled) {
      return Err(gitSnapshotDisabledError());
    }

    this.logger?.debug("Getting full diff", { from, to });

    // Get list of changed files
    const diffNamesResult = await this.operations.diffNames(from);
    if (!diffNamesResult.ok) {
      return Err(diffNamesResult.error);
    }

    const entries = diffNamesResult.value;
    const fileDiffs: GitFileDiff[] = [];

    for (const entry of entries) {
      const changeType = this.mapStatusToChangeType(entry.status);
      const fileDiff: GitFileDiff = {
        path: entry.path,
        type: changeType,
        oldPath: entry.oldPath,
      };

      // Get before content (from the 'from' snapshot)
      if (changeType !== "added") {
        const pathToShow = entry.oldPath ?? entry.path;
        const beforeResult = await this.operations.showFile(from, pathToShow);
        if (beforeResult.ok) {
          fileDiff.beforeContent = beforeResult.value;
        }
        // If showFile fails for deleted/modified, we skip beforeContent
      }

      // Get after content
      if (changeType !== "deleted") {
        if (to) {
          // Get content from the 'to' snapshot
          const afterResult = await this.operations.showFile(to, entry.path);
          if (afterResult.ok) {
            fileDiff.afterContent = afterResult.value;
          }
        } else {
          // Get content from working directory
          const filePath = path.join(this.workDir, entry.path);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            fileDiff.afterContent = content;
          } catch {
            // File might not exist or be unreadable, skip afterContent
          }
        }
      }

      fileDiffs.push(fileDiff);
    }

    this.logger?.debug("Full diff generated", {
      from,
      to,
      fileCount: fileDiffs.length,
    });

    return Ok(fileDiffs);
  }

  // ===========================================================================
  // T021: restore() method
  // ===========================================================================

  /**
   * Restores the working directory to a snapshot state.
   *
   * Reads the tree into the index and checks out all files.
   * This fully reverts the working directory to the snapshot state.
   *
   * @param hash - The tree SHA hash to restore
   * @returns Ok(void) on success, Err on failure
   * @throws Never throws - all errors returned as Err (GIT_SNAPSHOT_DISABLED 7001, GIT_LOCK_TIMEOUT 7020, GIT_OPERATION_FAILED 7010)
   *
   * @example
   * ```typescript
   * const result = await service.restore(snapshotHash);
   * if (result.ok) {
   *   console.log("Working directory restored");
   * }
   * ```
   */
  async restore(hash: string): Promise<Result<void, VellumError>> {
    if (!this.config.enabled) {
      return Err(gitSnapshotDisabledError());
    }

    // Use lock to prevent concurrent operations
    const lockResult = await this.lock.acquire();
    if (!lockResult.ok) {
      return Err(lockResult.error);
    }

    try {
      this.logger?.debug("Restoring snapshot", { hash });

      // Read tree into index
      const readTreeResult = await this.operations.readTree(hash);
      if (!readTreeResult.ok) {
        return Err(readTreeResult.error);
      }

      // Checkout all files from index
      const checkoutResult = await this.operations.checkoutIndex();
      if (!checkoutResult.ok) {
        return Err(checkoutResult.error);
      }

      // Emit event
      this.eventBus?.emit("gitSnapshotRestored", {
        hash,
        workDir: this.workDir,
        timestamp: Date.now(),
      });

      this.logger?.info("Snapshot restored", { hash });
      return Ok(undefined);
    } finally {
      this.lock.release();
    }
  }

  // ===========================================================================
  // T022: revert() method
  // ===========================================================================

  /**
   * Reverts specific files from a patch to their snapshot state.
   *
   * Unlike restore(), this only reverts the files listed in the patch,
   * not the entire working directory.
   *
   * @param hash - The tree SHA hash to revert to
   * @param patches - The patch containing files to revert
   * @returns Ok(void) on success, Err on failure
   * @throws Never throws - all errors returned as Err (GIT_SNAPSHOT_DISABLED 7001, GIT_LOCK_TIMEOUT 7020)
   *
   * @example
   * ```typescript
   * const patchResult = await service.patch(snapshotHash);
   * if (patchResult.ok) {
   *   const revertResult = await service.revert(snapshotHash, patchResult.value);
   *   if (revertResult.ok) {
   *     console.log("Files reverted");
   *   }
   * }
   * ```
   */
  async revert(hash: string, patches: GitPatch): Promise<Result<void, VellumError>> {
    if (!this.config.enabled) {
      return Err(gitSnapshotDisabledError());
    }

    // Use lock to prevent concurrent operations
    const lockResult = await this.lock.acquire();
    if (!lockResult.ok) {
      return Err(lockResult.error);
    }

    try {
      this.logger?.debug("Reverting files from snapshot", {
        hash,
        fileCount: patches.files.length,
      });

      const revertedFiles: string[] = [];

      for (const file of patches.files) {
        const filePath = path.join(this.workDir, file.path);

        switch (file.type) {
          case "added": {
            // File was added since snapshot, delete it
            try {
              await fs.unlink(filePath);
              revertedFiles.push(file.path);
              this.logger?.debug("Deleted added file", { path: file.path });
            } catch (error) {
              // File might already be deleted, log but continue
              this.logger?.warn("Failed to delete file", {
                path: file.path,
                error: (error as Error).message,
              });
            }
            break;
          }

          case "modified":
          case "deleted":
          case "renamed": {
            // File was modified/deleted/renamed, restore from snapshot
            const pathToRestore =
              file.type === "renamed" && file.oldPath ? file.oldPath : file.path;

            const checkoutResult = await this.operations.checkoutFile(hash, pathToRestore);
            if (checkoutResult.ok) {
              revertedFiles.push(file.path);
              this.logger?.debug("Restored file from snapshot", {
                path: file.path,
              });
            } else {
              this.logger?.warn("Failed to restore file", {
                path: file.path,
                error: checkoutResult.error.message,
              });
            }
            break;
          }
        }
      }

      // Emit event
      this.eventBus?.emit("gitSnapshotReverted", {
        hash,
        files: revertedFiles,
        workDir: this.workDir,
        timestamp: Date.now(),
      });

      this.logger?.info("Files reverted", {
        hash,
        revertedCount: revertedFiles.length,
        totalCount: patches.files.length,
      });

      return Ok(undefined);
    } finally {
      this.lock.release();
    }
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Returns whether snapshots are enabled.
   *
   * @returns true if git snapshots are enabled in configuration, false otherwise
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Returns the working directory path.
   *
   * @returns Absolute path to the git working directory
   */
  getWorkDir(): string {
    return this.workDir;
  }

  // ===========================================================================
  // T029: Nested Git Repository Detection
  // ===========================================================================

  /**
   * Checks for nested .git directories within the working directory.
   * Logs a warning if found, as nested repos can cause issues with snapshots.
   *
   * This method runs asynchronously and does not block service initialization.
   */
  private async checkNestedGitRepos(): Promise<void> {
    const nestedGitDirs: string[] = [];

    try {
      const entries = await fs.readdir(this.workDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // Skip the root .git directory
        if (entry.name === ".git") continue;
        // Skip common non-source directories
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;

        const subPath = path.join(this.workDir, entry.name);
        const gitPath = path.join(subPath, ".git");

        try {
          const stat = await fs.stat(gitPath);
          if (stat.isDirectory()) {
            nestedGitDirs.push(entry.name);
          }
        } catch {
          // .git doesn't exist in this subdirectory, continue
        }
      }

      if (nestedGitDirs.length > 0) {
        this.logger?.warn(
          "Nested git repositories detected. Git snapshots may not track changes in these directories correctly.",
          {
            workDir: this.workDir,
            nestedRepos: nestedGitDirs,
            count: nestedGitDirs.length,
          }
        );
      }
    } catch (error) {
      // Log at debug level since this is non-critical
      this.logger?.debug("Failed to check for nested git repositories", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Options for creating a GitSnapshotService.
 */
export interface CreateGitSnapshotServiceOptions {
  /** Configuration for snapshot behavior */
  config: GitSnapshotConfig;
  /** Optional logger for debug output */
  logger?: Logger;
  /** Optional event bus for emitting snapshot events */
  eventBus?: GitSnapshotEventBus;
  /** Low-level git operations instance */
  operations: GitOperations;
  /** Mutex lock for serializing operations */
  lock: GitSnapshotLock;
}

/**
 * Creates a new GitSnapshotService instance.
 *
 * Factory function for convenient service instantiation.
 *
 * @param options - Service creation options
 * @returns GitSnapshotService instance
 *
 * @example
 * ```typescript
 * import { createGitSnapshotService, GitOperations, GitSnapshotLock } from "@vellum/core/git";
 *
 * const service = createGitSnapshotService({
 *   config: { enabled: true, workDir: "/path/to/repo" },
 *   operations: new GitOperations("/path/to/repo"),
 *   lock: new GitSnapshotLock(),
 * });
 * ```
 */
export function createGitSnapshotService(
  options: CreateGitSnapshotServiceOptions
): GitSnapshotService {
  return new GitSnapshotService(
    options.config,
    options.logger,
    options.eventBus,
    options.operations,
    options.lock
  );
}
