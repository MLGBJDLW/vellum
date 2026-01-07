/**
 * Git Operations Module
 *
 * Provides low-level git operations for snapshot management using simple-git.
 * All operations use sanitized environments and return Result types for
 * type-safe error handling.
 *
 * @module git/operations
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { type SimpleGit, type SimpleGitOptions, simpleGit } from "simple-git";
import type { VellumError } from "../errors/types.js";
import type { Result } from "../types/result.js";
import { Err, Ok } from "../types/result.js";
import { gitNotInitializedError, gitOperationFailedError } from "./errors.js";
import { getNoGpgFlags, getSanitizedEnv } from "./safety.js";

// =============================================================================
// T011-T015: GitOperations Class
// =============================================================================

/**
 * Entry from git diff-tree --name-status output.
 *
 * Represents a single file change with its status code and path.
 */
export interface DiffNameEntry {
  /** Git status code: A=Added, M=Modified, D=Deleted, R=Renamed, etc. */
  status: "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X" | "B";
  /** Path to the file (relative to repo root) */
  path: string;
  /** Original path for renamed files */
  oldPath?: string;
}

/**
 * Low-level git operations for snapshot management.
 *
 * Wraps simple-git with sanitized environment and consistent error handling.
 * All methods return Result<T, VellumError> for type-safe error handling.
 *
 * @example
 * ```typescript
 * const ops = new GitOperations("/path/to/repo");
 * const treeHash = await ops.writeTree();
 * if (treeHash.ok) {
 *   console.log("Tree SHA:", treeHash.value);
 * }
 * ```
 */
export class GitOperations {
  /** The simple-git instance configured for this working directory */
  private readonly git: SimpleGit;

  /** The working directory path */
  private readonly workDir: string;

  /**
   * Creates a new GitOperations instance.
   *
   * @param workDir - Path to the git working directory
   * @throws {VellumError} GIT_NOT_INITIALIZED (7000) if the directory doesn't contain a .git folder
   *
   * @example
   * ```typescript
   * const ops = new GitOperations("/path/to/repo");
   * ```
   */
  constructor(workDir: string) {
    this.workDir = path.resolve(workDir);

    // Validate that .git directory exists
    const gitDir = path.join(this.workDir, ".git");
    if (!fs.existsSync(gitDir)) {
      throw gitNotInitializedError(this.workDir);
    }

    // Get sanitized environment
    const env = getSanitizedEnv();

    // Set GIT_DIR and GIT_WORK_TREE explicitly
    env.GIT_DIR = gitDir;
    env.GIT_WORK_TREE = this.workDir;

    // Get no-GPG flags for config
    const gpgFlags = getNoGpgFlags();

    // Build config object from flags
    // Flags are in format: ["-c", "key=value", "-c", "key=value", ...]
    const config: Record<string, string> = {};
    for (let i = 0; i < gpgFlags.length; i += 2) {
      const flag = gpgFlags[i];
      const value = gpgFlags[i + 1];
      if (flag === "-c" && value) {
        const [key, val] = value.split("=");
        if (key && val !== undefined) {
          config[key] = val;
        }
      }
    }

    // Configure simple-git options
    const options: Partial<SimpleGitOptions> = {
      baseDir: this.workDir,
      binary: "git",
      maxConcurrentProcesses: 1,
      trimmed: true,
      config: Object.entries(config).map(([k, v]) => `${k}=${v}`),
    };

    // Initialize simple-git with sanitized environment
    this.git = simpleGit(options).env(env);
  }

  // ===========================================================================
  // T012: stageAll() and writeTree() methods
  // ===========================================================================

  /**
   * Stages all changes in the working directory.
   *
   * Runs `git add .` to stage all modified, added, and deleted files.
   *
   * @returns Result<void, VellumError> - Ok on success, Err on failure
   *
   * @example
   * ```typescript
   * const result = await ops.stageAll();
   * if (!result.ok) {
   *   console.error("Failed to stage:", result.error.message);
   * }
   * ```
   */
  async stageAll(): Promise<Result<void, VellumError>> {
    try {
      await this.git.add(".");
      return Ok(undefined);
    } catch (error) {
      return Err(gitOperationFailedError("git add .", error as Error));
    }
  }

  /**
   * Writes the current index to a tree object.
   *
   * Runs `git write-tree` to create a tree object from the current index.
   * Returns the 40-character SHA hash of the created tree.
   *
   * @returns Result<string, VellumError> - Ok with tree SHA, Err on failure
   *
   * @example
   * ```typescript
   * const result = await ops.writeTree();
   * if (result.ok) {
   *   console.log("Tree SHA:", result.value); // e.g., "a1b2c3d4..."
   * }
   * ```
   */
  async writeTree(): Promise<Result<string, VellumError>> {
    try {
      const result = await this.git.raw(["write-tree"]);
      const treeSha = result.trim();

      // Validate SHA format (40 hex characters)
      if (!/^[0-9a-f]{40}$/i.test(treeSha)) {
        return Err(
          gitOperationFailedError("git write-tree", new Error(`Invalid tree SHA: ${treeSha}`))
        );
      }

      return Ok(treeSha);
    } catch (error) {
      return Err(gitOperationFailedError("git write-tree", error as Error));
    }
  }

  // ===========================================================================
  // T013: readTree() and checkoutIndex() methods
  // ===========================================================================

  /**
   * Reads a tree object into the index.
   *
   * Runs `git read-tree <hash>` to populate the index with the contents
   * of the specified tree object.
   *
   * @param hash - The tree SHA hash to read
   * @returns Result<void, VellumError> - Ok on success, Err on failure
   *
   * @example
   * ```typescript
   * const result = await ops.readTree("a1b2c3d4...");
   * if (!result.ok) {
   *   console.error("Failed to read tree:", result.error.message);
   * }
   * ```
   */
  async readTree(hash: string): Promise<Result<void, VellumError>> {
    try {
      await this.git.raw(["read-tree", hash]);
      return Ok(undefined);
    } catch (error) {
      return Err(gitOperationFailedError(`git read-tree ${hash}`, error as Error));
    }
  }

  /**
   * Checks out all files from the index to the working directory.
   *
   * Runs `git checkout-index -a -f` to restore all files from the index,
   * overwriting any existing files in the working directory.
   *
   * @returns Result<void, VellumError> - Ok on success, Err on failure
   *
   * @example
   * ```typescript
   * // Restore files from a snapshot
   * await ops.readTree(snapshotHash);
   * await ops.checkoutIndex();
   * ```
   */
  async checkoutIndex(): Promise<Result<void, VellumError>> {
    try {
      await this.git.raw(["checkout-index", "-a", "-f"]);
      return Ok(undefined);
    } catch (error) {
      return Err(gitOperationFailedError("git checkout-index -a -f", error as Error));
    }
  }

  // ===========================================================================
  // T014: diffNames() and diffUnified() methods
  // ===========================================================================

  /**
   * Gets the list of changed files between a tree and the current index.
   *
   * Runs `git diff-tree --no-commit-id --name-status -r <hash>` to get
   * a list of files with their change status.
   *
   * @param hash - The tree SHA hash to compare against
   * @returns Result<DiffNameEntry[], VellumError> - Ok with entries, Err on failure
   *
   * @example
   * ```typescript
   * const result = await ops.diffNames("a1b2c3d4...");
   * if (result.ok) {
   *   for (const entry of result.value) {
   *     console.log(`${entry.status}: ${entry.path}`);
   *   }
   * }
   * ```
   */
  async diffNames(hash: string): Promise<Result<DiffNameEntry[], VellumError>> {
    try {
      const result = await this.git.raw([
        "diff-tree",
        "--no-commit-id",
        "--name-status",
        "-r",
        hash,
      ]);

      const entries: DiffNameEntry[] = [];
      const lines = result.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        // Format: "M\tpath" or "R100\told\tnew" for renames
        const parts = line.split("\t");
        if (parts.length < 2) continue;

        const statusCode = parts[0];
        if (!statusCode) continue;

        // Extract base status (first char, e.g., "R100" -> "R")
        const status = statusCode.charAt(0) as DiffNameEntry["status"];

        // Handle renames (R) and copies (C) which have old and new paths
        if ((status === "R" || status === "C") && parts.length >= 3) {
          const newPath = parts[2];
          if (newPath) {
            entries.push({
              status,
              path: newPath,
              oldPath: parts[1],
            });
          }
        } else {
          const filePath = parts[1];
          if (filePath) {
            entries.push({
              status,
              path: filePath,
            });
          }
        }
      }

      return Ok(entries);
    } catch (error) {
      return Err(gitOperationFailedError(`git diff-tree ${hash}`, error as Error));
    }
  }

  /**
   * Gets a unified diff between a tree and the working directory.
   *
   * Runs `git diff <hash>` to generate a unified diff showing
   * line-by-line changes between the tree and current working state.
   *
   * @param hash - The tree SHA hash to compare against
   * @returns Result<string, VellumError> - Ok with diff text, Err on failure
   *
   * @example
   * ```typescript
   * const result = await ops.diffUnified("a1b2c3d4...");
   * if (result.ok) {
   *   console.log(result.value); // Unified diff output
   * }
   * ```
   */
  async diffUnified(hash: string): Promise<Result<string, VellumError>> {
    try {
      const result = await this.git.diff([hash]);
      return Ok(result);
    } catch (error) {
      return Err(gitOperationFailedError(`git diff ${hash}`, error as Error));
    }
  }

  // ===========================================================================
  // T015: showFile() and checkoutFile() methods
  // ===========================================================================

  /**
   * Retrieves the content of a file at a specific tree/commit.
   *
   * Runs `git show <hash>:<path>` to get the content of a file
   * as it existed in the specified tree or commit.
   *
   * @param hash - The tree or commit SHA hash
   * @param filePath - Path to the file relative to repo root
   * @returns Result<string, VellumError> - Ok with file content, Err on failure
   *
   * @example
   * ```typescript
   * const result = await ops.showFile("a1b2c3d4...", "src/index.ts");
   * if (result.ok) {
   *   console.log("File content:", result.value);
   * }
   * ```
   */
  async showFile(hash: string, filePath: string): Promise<Result<string, VellumError>> {
    try {
      // Normalize path separators for git (use forward slashes)
      const normalizedPath = filePath.split(path.sep).join("/");
      const result = await this.git.show([`${hash}:${normalizedPath}`]);
      return Ok(result);
    } catch (error) {
      return Err(gitOperationFailedError(`git show ${hash}:${filePath}`, error as Error));
    }
  }

  /**
   * Restores a single file from a specific tree/commit.
   *
   * Runs `git checkout <hash> -- <path>` to restore a specific file
   * to its state in the specified tree or commit.
   *
   * @param hash - The tree or commit SHA hash
   * @param filePath - Path to the file relative to repo root
   * @returns Result<void, VellumError> - Ok on success, Err on failure
   *
   * @example
   * ```typescript
   * const result = await ops.checkoutFile("a1b2c3d4...", "src/index.ts");
   * if (!result.ok) {
   *   console.error("Failed to restore file:", result.error.message);
   * }
   * ```
   */
  async checkoutFile(hash: string, filePath: string): Promise<Result<void, VellumError>> {
    try {
      // Normalize path separators for git (use forward slashes)
      const normalizedPath = filePath.split(path.sep).join("/");
      await this.git.checkout([hash, "--", normalizedPath]);
      return Ok(undefined);
    } catch (error) {
      return Err(gitOperationFailedError(`git checkout ${hash} -- ${filePath}`, error as Error));
    }
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Gets the working directory path.
   *
   * @returns The absolute path to the working directory
   */
  getWorkDir(): string {
    return this.workDir;
  }
}
