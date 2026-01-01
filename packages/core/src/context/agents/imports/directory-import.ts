// ============================================
// Directory Import Resolver
// ============================================
// Resolves @dir: import directives in AGENTS.md.
// Implements REQ-006: Directory import with .md file filtering.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AgentsWarning } from "../types.js";
import { ImportSecurityValidator } from "./security.js";

/**
 * Single file resolved from a directory import.
 */
export interface DirectoryFileEntry {
  /** The resolved file content */
  content: string;
  /** Absolute path to the resolved file */
  path: string;
  /** Relative path from the imported directory */
  relativePath: string;
}

/**
 * Result of resolving a @dir: import directive.
 */
export interface DirectoryImportResult {
  /** Array of resolved .md files from the directory */
  contents: DirectoryFileEntry[];
  /** Absolute path to the resolved directory */
  path: string;
}

/**
 * Options for the directory import resolver.
 */
export interface DirectoryImportResolverOptions {
  /** Custom security validator instance */
  securityValidator?: ImportSecurityValidator;
  /** Maximum file size per file (in bytes). Default: 1MB */
  maxFileSize?: number;
  /** Maximum number of files to read from a directory. Default: 100 */
  maxFiles?: number;
  /** File encoding. Default: 'utf-8' */
  encoding?: BufferEncoding;
  /** Whether to recurse into subdirectories. Default: false */
  recursive?: boolean;
  /** File extensions to include. Default: ['.md'] */
  extensions?: string[];
}

/**
 * Default options for directory import resolver.
 */
const DEFAULT_OPTIONS: Required<Omit<DirectoryImportResolverOptions, "securityValidator">> = {
  maxFileSize: 1024 * 1024, // 1MB
  maxFiles: 100,
  encoding: "utf-8",
  recursive: false,
  extensions: [".md"],
};

/**
 * Resolves @dir: import directives to directory contents.
 *
 * Loads all .md files from the specified directory and returns
 * their contents in sorted order (alphabetically by filename).
 *
 * Security:
 * - Validates paths to prevent directory traversal
 * - Restricts access to within the base directory
 * - Limits number of files to prevent DoS
 *
 * @example
 * ```typescript
 * const resolver = new DirectoryImportResolver();
 *
 * // Resolve a directory import
 * const result = await resolver.resolveDirectoryImport(
 *   '/project/.vellum',
 *   './rules/'
 * );
 *
 * if (result) {
 *   for (const file of result.contents) {
 *     console.log('File:', file.relativePath);
 *     console.log('Content:', file.content);
 *   }
 * }
 * ```
 */
export class DirectoryImportResolver {
  private readonly securityValidator: ImportSecurityValidator;
  private readonly maxFileSize: number;
  private readonly maxFiles: number;
  private readonly encoding: BufferEncoding;
  private readonly recursive: boolean;
  private readonly extensions: string[];

  constructor(options: DirectoryImportResolverOptions = {}) {
    this.securityValidator = options.securityValidator ?? new ImportSecurityValidator();
    this.maxFileSize = options.maxFileSize ?? DEFAULT_OPTIONS.maxFileSize;
    this.maxFiles = options.maxFiles ?? DEFAULT_OPTIONS.maxFiles;
    this.encoding = options.encoding ?? DEFAULT_OPTIONS.encoding;
    this.recursive = options.recursive ?? DEFAULT_OPTIONS.recursive;
    this.extensions = options.extensions ?? DEFAULT_OPTIONS.extensions;
  }

  /**
   * Resolves a @dir: import directive.
   *
   * @param basePath - Base directory for relative path resolution (typically AGENTS.md location)
   * @param dirPath - The path from the @dir: directive
   * @returns Resolved directory contents, or null with warnings if resolution fails
   */
  async resolveDirectoryImport(
    basePath: string,
    dirPath: string
  ): Promise<{ result: DirectoryImportResult | null; warnings: AgentsWarning[] }> {
    const warnings: AgentsWarning[] = [];

    // Validate the path
    const validation = this.securityValidator.validatePath(basePath, dirPath);

    if (!validation.valid || validation.resolvedPath === undefined) {
      warnings.push({
        file: dirPath,
        message: `Failed to resolve @dir: import: ${validation.error}`,
        severity: "warn",
      });
      return { result: null, warnings };
    }

    const resolvedPath = validation.resolvedPath;

    // Check if directory exists
    try {
      const stats = await fs.stat(resolvedPath);

      if (!stats.isDirectory()) {
        warnings.push({
          file: dirPath,
          message: `@dir: import target is not a directory: ${dirPath}`,
          severity: "warn",
        });
        return { result: null, warnings };
      }

      // Read directory contents
      const files = await this.readDirectoryFiles(resolvedPath, resolvedPath, warnings);

      // Sort files alphabetically by relative path for consistent ordering
      files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

      return {
        result: {
          contents: files,
          path: resolvedPath,
        },
        warnings,
      };
    } catch (error) {
      // Handle directory not found gracefully
      if (isNodeError(error) && error.code === "ENOENT") {
        warnings.push({
          file: dirPath,
          message: `@dir: import directory not found: ${dirPath}`,
          severity: "warn",
        });
        return { result: null, warnings };
      }

      // Handle permission errors
      if (isNodeError(error) && error.code === "EACCES") {
        warnings.push({
          file: dirPath,
          message: `@dir: import permission denied: ${dirPath}`,
          severity: "warn",
        });
        return { result: null, warnings };
      }

      // Re-throw unexpected errors
      throw error;
    }
  }

  /**
   * Reads all matching files from a directory.
   */
  private async readDirectoryFiles(
    dirPath: string,
    baseDir: string,
    warnings: AgentsWarning[]
  ): Promise<DirectoryFileEntry[]> {
    const entries: DirectoryFileEntry[] = [];
    const state = { fileCount: 0 };

    await this.scanDirectory(dirPath, baseDir, entries, warnings, state);
    return entries;
  }

  /**
   * Recursively scans a directory for matching files.
   */
  private async scanDirectory(
    currentPath: string,
    baseDir: string,
    entries: DirectoryFileEntry[],
    warnings: AgentsWarning[],
    state: { fileCount: number }
  ): Promise<void> {
    // Check file limit
    if (state.fileCount >= this.maxFiles) {
      warnings.push({
        file: currentPath,
        message: `@dir: import reached file limit (${this.maxFiles}), some files may be skipped`,
        severity: "warn",
      });
      return;
    }

    const dirEntries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of dirEntries) {
      if (state.fileCount >= this.maxFiles) {
        break;
      }

      const entryPath = path.join(currentPath, entry.name);

      if (entry.isDirectory() && this.recursive) {
        await this.scanDirectory(entryPath, baseDir, entries, warnings, state);
      } else if (entry.isFile()) {
        await this.processFile(entry, entryPath, baseDir, entries, warnings, state);
      }
    }
  }

  /**
   * Processes a single file entry.
   */
  private async processFile(
    entry: import("node:fs").Dirent,
    entryPath: string,
    baseDir: string,
    entries: DirectoryFileEntry[],
    warnings: AgentsWarning[],
    state: { fileCount: number }
  ): Promise<void> {
    // Check file extension
    const ext = path.extname(entry.name).toLowerCase();
    if (!this.extensions.includes(ext)) {
      return;
    }

    try {
      const stats = await fs.stat(entryPath);

      // Check file size
      if (stats.size > this.maxFileSize) {
        warnings.push({
          file: entryPath,
          message: `@dir: import file exceeds size limit (${stats.size} > ${this.maxFileSize} bytes): ${entry.name}`,
          severity: "warn",
        });
        return;
      }

      const content = await fs.readFile(entryPath, this.encoding);
      const relativePath = path.relative(baseDir, entryPath);

      entries.push({
        content,
        path: entryPath,
        relativePath,
      });

      state.fileCount++;
    } catch (error) {
      if (isNodeError(error) && (error.code === "EACCES" || error.code === "ENOENT")) {
        warnings.push({
          file: entryPath,
          message: `@dir: import could not read file: ${entry.name} (${error.code})`,
          severity: "warn",
        });
      } else {
        throw error;
      }
    }
  }
}

/**
 * Standalone function to resolve a directory import.
 * Convenience wrapper around DirectoryImportResolver.
 *
 * @param basePath - Base directory for relative path resolution
 * @param dirPath - The path from the @dir: directive
 * @param options - Optional resolver options
 * @returns Resolved directory contents, or null with warnings
 */
export async function resolveDirectoryImport(
  basePath: string,
  dirPath: string,
  options?: DirectoryImportResolverOptions
): Promise<{ result: DirectoryImportResult | null; warnings: AgentsWarning[] }> {
  const resolver = new DirectoryImportResolver(options);
  return resolver.resolveDirectoryImport(basePath, dirPath);
}

/**
 * Type guard for Node.js system errors.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
