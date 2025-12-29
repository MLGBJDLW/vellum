/**
 * Trusted Folders Manager for Vellum
 *
 * Manages trusted folder paths where file operations are allowed.
 * Trust automatically inherits to subdirectories.
 *
 * @module @vellum/core/permission
 */

import { normalize, resolve, sep } from "node:path";

// ============================================
// TrustedFoldersManager
// ============================================

/**
 * Manages trusted folder paths for permission checking.
 *
 * Features:
 * - Add/remove trusted folder paths
 * - Subdirectory inheritance (a child of a trusted folder is trusted)
 * - Cross-platform path normalization
 * - Automatic deduplication
 *
 * @example
 * ```typescript
 * const manager = new TrustedFoldersManager();
 *
 * manager.addTrusted('/home/user/projects');
 * manager.isTrusted('/home/user/projects/my-app');  // true (subdirectory)
 * manager.isTrusted('/home/user/documents');        // false
 *
 * manager.removeTrusted('/home/user/projects');
 * manager.isTrusted('/home/user/projects/my-app');  // false
 * ```
 */
export class TrustedFoldersManager {
  #trustedFolders: Set<string>;

  /**
   * Creates a new TrustedFoldersManager.
   *
   * @param initialFolders - Optional array of initially trusted folder paths
   */
  constructor(initialFolders: string[] = []) {
    this.#trustedFolders = new Set(initialFolders.map((folder) => this.#normalizePath(folder)));
  }

  /**
   * Add a folder to the trusted list.
   *
   * The path is normalized for cross-platform compatibility.
   * Adding a parent folder automatically trusts all subdirectories.
   *
   * @param folderPath - Absolute path to trust
   */
  addTrusted(folderPath: string): void {
    const normalized = this.#normalizePath(folderPath);
    this.#trustedFolders.add(normalized);
  }

  /**
   * Remove a folder from the trusted list.
   *
   * Note: Removing a folder does NOT automatically remove its subdirectories
   * if they were added separately. However, they would lose inherited trust.
   *
   * @param folderPath - Absolute path to remove from trust
   * @returns true if the folder was removed, false if it wasn't trusted
   */
  removeTrusted(folderPath: string): boolean {
    const normalized = this.#normalizePath(folderPath);
    return this.#trustedFolders.delete(normalized);
  }

  /**
   * Check if a path is trusted.
   *
   * A path is trusted if:
   * 1. It exactly matches a trusted folder, OR
   * 2. It is a subdirectory of a trusted folder (inheritance)
   *
   * @param targetPath - Absolute path to check
   * @returns true if the path is within a trusted folder
   */
  isTrusted(targetPath: string): boolean {
    const normalized = this.#normalizePath(targetPath);

    for (const trusted of this.#trustedFolders) {
      // Exact match
      if (normalized === trusted) {
        return true;
      }

      // Subdirectory check - ensure proper boundary matching
      // Add separator to avoid false positives like:
      // trusted: /home/user/project
      // target:  /home/user/projects (should NOT match)
      const trustedWithSep = trusted.endsWith(sep) ? trusted : trusted + sep;
      if (normalized.startsWith(trustedWithSep)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all currently trusted folder paths.
   *
   * @returns Array of normalized trusted folder paths
   */
  getTrustedFolders(): string[] {
    return Array.from(this.#trustedFolders);
  }

  /**
   * Clear all trusted folders.
   */
  clear(): void {
    this.#trustedFolders.clear();
  }

  /**
   * Get the count of trusted folders.
   */
  get size(): number {
    return this.#trustedFolders.size;
  }

  /**
   * Normalize a path for consistent comparison.
   *
   * @param inputPath - Path to normalize
   * @returns Normalized absolute path
   */
  #normalizePath(inputPath: string): string {
    // Resolve to absolute path and normalize
    return normalize(resolve(inputPath));
  }
}
