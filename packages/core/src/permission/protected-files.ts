/**
 * Protected Files Manager for Vellum
 *
 * Manages patterns for files that should be protected from AI access.
 * Uses gitignore-style pattern matching via the `ignore` package.
 *
 * @module @vellum/core/permission
 */

import { basename, normalize } from "node:path";
import type { Ignore } from "ignore";
import ignoreFactory from "ignore";

// Type-safe wrapper for ignore factory
const createIgnore = ignoreFactory as unknown as () => Ignore;

// ============================================
// Default Protected Patterns
// ============================================

/**
 * Default patterns for protected files.
 * These patterns protect sensitive files from AI access.
 */
export const DEFAULT_PROTECTED_PATTERNS: readonly string[] = [
  // Environment files
  ".env",
  ".env.*",
  ".env.local",
  ".env.*.local",

  // Secret files
  "*secret*",
  "*secrets*",
  "*.secret",
  "*.secrets",

  // Key files
  "*.key",
  "*.pem",
  "*.p12",
  "*.pfx",
  "*.jks",

  // SSH keys
  "id_rsa",
  "id_rsa.*",
  "id_ed25519",
  "id_ed25519.*",
  "id_ecdsa",
  "id_ecdsa.*",
  "id_dsa",
  "id_dsa.*",

  // Credential files
  "credentials",
  "credentials.*",
  "*.credentials",

  // API key files
  "*apikey*",
  "*api_key*",
  "*api-key*",

  // Token files
  "*token*",
  "*.token",

  // Password files
  "*password*",
  "*.password",

  // Private files
  "*.private",
];

// ============================================
// ProtectedFilesManager
// ============================================

/**
 * Manages protected file patterns using gitignore-style matching.
 *
 * Protected files are files that should not be accessed, read, or modified
 * by the AI assistant due to security concerns (secrets, keys, credentials).
 *
 * Features:
 * - Gitignore-style pattern matching (via `ignore` package)
 * - Default patterns for common sensitive files
 * - Add/remove custom patterns
 * - Case-insensitive matching on filename
 *
 * @example
 * ```typescript
 * const manager = new ProtectedFilesManager();
 *
 * manager.isProtected('.env');           // true (default pattern)
 * manager.isProtected('config.json');    // false
 *
 * manager.addPattern('*.config');
 * manager.isProtected('db.config');      // true
 *
 * manager.removePattern('*.config');
 * manager.isProtected('db.config');      // false
 * ```
 */
export class ProtectedFilesManager {
  #patterns: Set<string>;
  #ignoreInstance: Ignore;

  /**
   * Creates a new ProtectedFilesManager.
   *
   * @param options - Configuration options
   */
  constructor(options: { useDefaults?: boolean; patterns?: string[] } = {}) {
    const useDefaults = options.useDefaults ?? true;
    const initialPatterns = options.patterns ?? [];

    // Initialize pattern set
    this.#patterns = new Set<string>();

    // Add default patterns if enabled
    if (useDefaults) {
      for (const pattern of DEFAULT_PROTECTED_PATTERNS) {
        this.#patterns.add(pattern);
      }
    }

    // Add custom initial patterns
    for (const pattern of initialPatterns) {
      this.#patterns.add(pattern);
    }

    // Build ignore instance
    this.#ignoreInstance = this.#buildIgnore();
  }

  /**
   * Check if a file path is protected.
   *
   * Matches against the filename to handle patterns like ".env"
   * which should match "/path/to/.env" or "C:\\project\\.env".
   * Also supports relative paths and full filenames.
   *
   * @param filePath - Path to check (relative or absolute)
   * @returns true if the file matches a protected pattern
   */
  isProtected(filePath: string): boolean {
    // Handle empty path
    if (!filePath || filePath.trim() === "") {
      return false;
    }

    // Normalize path separators to forward slashes
    const normalizedPath = normalize(filePath).replace(/\\/g, "/");

    // Extract the filename for matching
    const filename = basename(normalizedPath);

    // If it's already just a filename (no path separators), check directly
    if (!normalizedPath.includes("/") && !this.#isAbsolutePath(normalizedPath)) {
      return this.#ignoreInstance.ignores(normalizedPath);
    }

    // For paths with directories, check both the full relative path and just the filename
    // Convert to relative path if it's absolute
    let relativePath = normalizedPath;
    if (this.#isAbsolutePath(normalizedPath)) {
      // For absolute paths, just use the filename
      relativePath = filename;
    } else if (normalizedPath.startsWith("./")) {
      // Remove leading ./
      relativePath = normalizedPath.slice(2);
    } else if (normalizedPath.startsWith("../")) {
      // For parent-relative paths, use just the filename
      relativePath = filename;
    }

    // Check the relative path
    if (this.#ignoreInstance.ignores(relativePath)) {
      return true;
    }

    // Also check just the filename for patterns like ".env"
    if (filename !== relativePath && this.#ignoreInstance.ignores(filename)) {
      return true;
    }

    return false;
  }

  /**
   * Check if a path appears to be absolute.
   */
  #isAbsolutePath(filePath: string): boolean {
    // Unix absolute path
    if (filePath.startsWith("/")) {
      return true;
    }
    // Windows absolute path (e.g., C:/ or D:/)
    if (/^[a-zA-Z]:[\\/]/.test(filePath)) {
      return true;
    }
    return false;
  }

  /**
   * Add a pattern to the protected list.
   *
   * @param pattern - Gitignore-style pattern to add
   */
  addPattern(pattern: string): void {
    if (!this.#patterns.has(pattern)) {
      this.#patterns.add(pattern);
      this.#rebuildIgnore();
    }
  }

  /**
   * Remove a pattern from the protected list.
   *
   * @param pattern - Pattern to remove
   * @returns true if the pattern was removed, false if it didn't exist
   */
  removePattern(pattern: string): boolean {
    const removed = this.#patterns.delete(pattern);
    if (removed) {
      this.#rebuildIgnore();
    }
    return removed;
  }

  /**
   * Get all current patterns.
   *
   * @returns Array of current protected patterns
   */
  getPatterns(): string[] {
    return Array.from(this.#patterns);
  }

  /**
   * Clear all patterns (including defaults).
   */
  clear(): void {
    this.#patterns.clear();
    this.#rebuildIgnore();
  }

  /**
   * Reset to default patterns only.
   */
  resetToDefaults(): void {
    this.#patterns.clear();
    for (const pattern of DEFAULT_PROTECTED_PATTERNS) {
      this.#patterns.add(pattern);
    }
    this.#rebuildIgnore();
  }

  /**
   * Get the count of patterns.
   */
  get size(): number {
    return this.#patterns.size;
  }

  /**
   * Build a new ignore instance from current patterns.
   */
  #buildIgnore(): Ignore {
    const ig = createIgnore();
    for (const pattern of this.#patterns) {
      ig.add(pattern);
    }
    return ig;
  }

  /**
   * Rebuild the ignore instance after pattern changes.
   */
  #rebuildIgnore(): void {
    this.#ignoreInstance = this.#buildIgnore();
  }
}

// ============================================
// Protected File Indicator
// ============================================

/**
 * Indicator prefix for protected files in directory listings.
 * Uses [#] to indicate protection status (no emoji for compatibility).
 */
export const PROTECTED_FILE_INDICATOR = "[#]" as const;

/**
 * Format a list of file names/paths with protection indicators.
 *
 * Files matching protected patterns will be prefixed with [#].
 *
 * @param files - Array of file names or paths to format
 * @param basePath - Base path for resolving relative paths
 * @param protectedFilesManager - Manager instance to check protection status
 * @returns Array of formatted file names with [#] prefix for protected files
 *
 * @example
 * ```typescript
 * const manager = new ProtectedFilesManager();
 * const files = ['.env', 'config.ts', 'secrets.json'];
 * const formatted = formatFileListWithProtection(files, '/project', manager);
 * // Returns: ['[#] .env', 'config.ts', '[#] secrets.json']
 * ```
 */
export function formatFileListWithProtection(
  files: readonly string[],
  basePath: string,
  protectedFilesManager: ProtectedFilesManager
): string[] {
  return files.map((file) => {
    // Construct full path for checking
    const fullPath = basePath ? `${basePath}/${file}` : file;
    const isProtected = protectedFilesManager.isProtected(fullPath);
    return isProtected ? `${PROTECTED_FILE_INDICATOR} ${file}` : file;
  });
}

/**
 * Check if a single file is protected and return formatted name.
 *
 * @param fileName - File name to check
 * @param basePath - Base path for resolving
 * @param protectedFilesManager - Manager instance
 * @returns Formatted file name with [#] prefix if protected
 */
export function formatFileWithProtection(
  fileName: string,
  basePath: string,
  protectedFilesManager: ProtectedFilesManager
): string {
  const fullPath = basePath ? `${basePath}/${fileName}` : fileName;
  const isProtected = protectedFilesManager.isProtected(fullPath);
  return isProtected ? `${PROTECTED_FILE_INDICATOR} ${fileName}` : fileName;
}
