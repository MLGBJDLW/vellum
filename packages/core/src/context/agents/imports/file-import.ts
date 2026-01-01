// ============================================
// File Import Resolver
// ============================================
// Resolves @file: import directives in AGENTS.md.
// Implements REQ-006: File import with path validation.

import * as fs from "node:fs/promises";
import type { AgentsWarning } from "../types.js";
import { ImportSecurityValidator } from "./security.js";

/**
 * Result of resolving a @file: import directive.
 */
export interface FileImportResult {
  /** The resolved file content */
  content: string;
  /** Absolute path to the resolved file */
  path: string;
}

/**
 * Options for the file import resolver.
 */
export interface FileImportResolverOptions {
  /** Custom security validator instance */
  securityValidator?: ImportSecurityValidator;
  /** Maximum file size to read (in bytes). Default: 1MB */
  maxFileSize?: number;
  /** File encoding. Default: 'utf-8' */
  encoding?: BufferEncoding;
}

/**
 * Default options for file import resolver.
 */
const DEFAULT_OPTIONS: Required<Omit<FileImportResolverOptions, "securityValidator">> = {
  maxFileSize: 1024 * 1024, // 1MB
  encoding: "utf-8",
};

/**
 * Resolves @file: import directives to file contents.
 *
 * Security:
 * - Validates paths to prevent directory traversal
 * - Restricts access to within the base directory
 *
 * @example
 * ```typescript
 * const resolver = new FileImportResolver();
 *
 * // Resolve a relative import
 * const result = await resolver.resolveFileImport(
 *   '/project/.vellum',
 *   './rules/coding.md'
 * );
 *
 * if (result) {
 *   console.log('Resolved:', result.path);
 *   console.log('Content:', result.content);
 * }
 * ```
 */
export class FileImportResolver {
  private readonly securityValidator: ImportSecurityValidator;
  private readonly maxFileSize: number;
  private readonly encoding: BufferEncoding;

  constructor(options: FileImportResolverOptions = {}) {
    this.securityValidator = options.securityValidator ?? new ImportSecurityValidator();
    this.maxFileSize = options.maxFileSize ?? DEFAULT_OPTIONS.maxFileSize;
    this.encoding = options.encoding ?? DEFAULT_OPTIONS.encoding;
  }

  /**
   * Resolves a @file: import directive.
   *
   * @param basePath - Base directory for relative path resolution (typically AGENTS.md location)
   * @param importPath - The path from the @file: directive
   * @returns Resolved file content and path, or null with warnings if resolution fails
   */
  async resolveFileImport(
    basePath: string,
    importPath: string
  ): Promise<{ result: FileImportResult | null; warnings: AgentsWarning[] }> {
    const warnings: AgentsWarning[] = [];

    // Validate the path
    const validation = this.securityValidator.validatePath(basePath, importPath);

    if (!validation.valid || validation.resolvedPath === undefined) {
      warnings.push({
        file: importPath,
        message: `Failed to resolve @file: import: ${validation.error}`,
        severity: "warn",
      });
      return { result: null, warnings };
    }

    const resolvedPath = validation.resolvedPath;

    // Check if file exists
    try {
      const stats = await fs.stat(resolvedPath);

      if (!stats.isFile()) {
        warnings.push({
          file: importPath,
          message: `@file: import target is not a file: ${importPath}`,
          severity: "warn",
        });
        return { result: null, warnings };
      }

      // Check file size
      if (stats.size > this.maxFileSize) {
        warnings.push({
          file: importPath,
          message: `@file: import exceeds size limit (${stats.size} > ${this.maxFileSize} bytes): ${importPath}`,
          severity: "warn",
        });
        return { result: null, warnings };
      }

      // Read file content
      const content = await fs.readFile(resolvedPath, this.encoding);

      return {
        result: {
          content,
          path: resolvedPath,
        },
        warnings,
      };
    } catch (error) {
      // Handle file not found gracefully
      if (isNodeError(error) && error.code === "ENOENT") {
        warnings.push({
          file: importPath,
          message: `@file: import not found: ${importPath}`,
          severity: "warn",
        });
        return { result: null, warnings };
      }

      // Handle permission errors
      if (isNodeError(error) && error.code === "EACCES") {
        warnings.push({
          file: importPath,
          message: `@file: import permission denied: ${importPath}`,
          severity: "warn",
        });
        return { result: null, warnings };
      }

      // Re-throw unexpected errors
      throw error;
    }
  }
}

/**
 * Standalone function to resolve a file import.
 * Convenience wrapper around FileImportResolver.
 *
 * @param basePath - Base directory for relative path resolution
 * @param importPath - The path from the @file: directive
 * @param options - Optional resolver options
 * @returns Resolved file content and path, or null with warnings
 */
export async function resolveFileImport(
  basePath: string,
  importPath: string,
  options?: FileImportResolverOptions
): Promise<{ result: FileImportResult | null; warnings: AgentsWarning[] }> {
  const resolver = new FileImportResolver(options);
  return resolver.resolveFileImport(basePath, importPath);
}

/**
 * Type guard for Node.js system errors.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
