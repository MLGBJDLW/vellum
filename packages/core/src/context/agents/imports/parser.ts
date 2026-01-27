// ============================================
// Import Parser
// ============================================
// Parses and resolves import directives in AGENTS.md content.
// Implements REQ-006: @file:, @dir:, @url: import resolution.

import { fetchWithPool } from "@vellum/shared";
import type { AgentsWarning } from "../types.js";
import {
  DirectoryImportResolver,
  type DirectoryImportResolverOptions,
} from "./directory-import.js";
import { FileImportResolver, type FileImportResolverOptions } from "./file-import.js";
import { type ImportSecurityConfig, ImportSecurityValidator } from "./security.js";

/**
 * Types of imports supported.
 */
export type ImportType = "file" | "directory" | "url";

/**
 * A resolved import with its content and metadata.
 */
export interface ResolvedImport {
  /** Type of import (file, directory, url) */
  type: ImportType;
  /** Original import directive (e.g., "@file:./rules.md") */
  source: string;
  /** Resolved absolute path or URL */
  resolvedPath: string;
  /** Resolved content (concatenated for directories) */
  content: string;
}

/**
 * Result of parsing imports from content.
 */
export interface ImportParseResult {
  /** Content with import directives replaced by resolved content */
  processedContent: string;
  /** List of successfully resolved imports */
  imports: ResolvedImport[];
  /** Warnings for failed or skipped imports */
  warnings: AgentsWarning[];
}

/**
 * Options for the import parser.
 */
export interface ImportParserOptions {
  /** Custom security configuration */
  securityConfig?: Partial<ImportSecurityConfig>;
  /** Options for file import resolution */
  fileImportOptions?: Omit<FileImportResolverOptions, "securityValidator">;
  /** Options for directory import resolution */
  directoryImportOptions?: Omit<DirectoryImportResolverOptions, "securityValidator">;
  /** Whether to allow URL imports. Default: false */
  allowUrlImports?: boolean;
  /** URL allowlist (only used if allowUrlImports is true) */
  urlAllowlist?: string[];
}

/**
 * Default parser options.
 */
const DEFAULT_OPTIONS: Required<
  Omit<ImportParserOptions, "securityConfig" | "fileImportOptions" | "directoryImportOptions">
> = {
  allowUrlImports: false,
  urlAllowlist: [],
};

/**
 * Regex pattern to match import directives.
 *
 * Matches:
 * - @file:./path/to/file.md
 * - @dir:./path/to/directory/
 * - @url:https://example.com/rules.md
 *
 * Must be at the start of a line (after optional whitespace).
 * Captures:
 * - Group 1: Import type (file, dir, url)
 * - Group 2: Import path/URL
 */
const IMPORT_REGEX = /^[ \t]*@(file|dir|url):(.+)$/gm;

/**
 * Parses and resolves import directives in AGENTS.md content.
 *
 * Supports three import types:
 * - @file: - Import a single file's content
 * - @dir: - Import all .md files from a directory
 * - @url: - Import content from a URL (disabled by default)
 *
 * Import directives are replaced inline with the resolved content.
 * Failed imports generate warnings but don't fail the parse.
 *
 * @example
 * ```typescript
 * const parser = new ImportParser();
 *
 * const content = `
 * # Instructions
 *
 * @file:./coding-standards.md
 * @dir:./rules/
 *
 * ## Additional Rules
 * `;
 *
 * const result = await parser.parseImports(content, '/project');
 * console.log(result.processedContent);
 * console.log('Resolved imports:', result.imports.length);
 * ```
 */
export class ImportParser {
  private readonly securityValidator: ImportSecurityValidator;
  private readonly fileResolver: FileImportResolver;
  private readonly directoryResolver: DirectoryImportResolver;
  private readonly allowUrlImports: boolean;
  private readonly urlAllowlist: string[];

  constructor(options: ImportParserOptions = {}) {
    // Create shared security validator
    this.securityValidator = new ImportSecurityValidator({
      ...options.securityConfig,
      urlAllowlist: options.urlAllowlist ?? DEFAULT_OPTIONS.urlAllowlist,
    });

    // Create resolvers with shared security validator
    this.fileResolver = new FileImportResolver({
      ...options.fileImportOptions,
      securityValidator: this.securityValidator,
    });

    this.directoryResolver = new DirectoryImportResolver({
      ...options.directoryImportOptions,
      securityValidator: this.securityValidator,
    });

    this.allowUrlImports = options.allowUrlImports ?? DEFAULT_OPTIONS.allowUrlImports;
    this.urlAllowlist = options.urlAllowlist ?? DEFAULT_OPTIONS.urlAllowlist;
  }

  /**
   * Parses and resolves all import directives in the content.
   *
   * @param content - The AGENTS.md body content (without frontmatter)
   * @param basePath - Base directory for relative path resolution
   * @returns Processed content with imports resolved, plus metadata
   */
  async parseImports(content: string, basePath: string): Promise<ImportParseResult> {
    const imports: ResolvedImport[] = [];
    const warnings: AgentsWarning[] = [];

    // Find all import directives
    const matches = this.findImportMatches(content);

    if (matches.length === 0) {
      return {
        processedContent: content,
        imports: [],
        warnings: [],
      };
    }

    // Process matches in reverse order to maintain correct positions when replacing
    // This ensures that earlier replacements don't affect the indices of later matches
    let processedContent = content;
    const sortedMatches = [...matches].sort((a, b) => b.index - a.index);

    for (const match of sortedMatches) {
      const resolved = await this.resolveImport(match, basePath, warnings);

      if (resolved) {
        imports.unshift(resolved); // Add to front since we're processing in reverse
        processedContent = this.replaceMatch(processedContent, match, resolved.content);
      } else {
        // Remove the import directive line if it couldn't be resolved
        processedContent = this.replaceMatch(processedContent, match, "");
      }
    }

    return {
      processedContent,
      imports,
      warnings,
    };
  }

  /**
   * Finds all import directive matches in content.
   */
  private findImportMatches(content: string): ImportMatch[] {
    const matches: ImportMatch[] = [];

    // Reset regex state
    IMPORT_REGEX.lastIndex = 0;

    for (
      let match = IMPORT_REGEX.exec(content);
      match !== null;
      match = IMPORT_REGEX.exec(content)
    ) {
      const importPath = match[2];
      if (importPath === undefined) {
        continue;
      }
      matches.push({
        fullMatch: match[0],
        type: match[1] as "file" | "dir" | "url",
        path: importPath.trim(),
        index: match.index,
        length: match[0].length,
      });
    }

    return matches;
  }

  /**
   * Resolves a single import directive.
   */
  private async resolveImport(
    match: ImportMatch,
    basePath: string,
    warnings: AgentsWarning[]
  ): Promise<ResolvedImport | null> {
    const source = `@${match.type}:${match.path}`;

    switch (match.type) {
      case "file":
        return this.resolveFileImport(match.path, basePath, source, warnings);

      case "dir":
        return this.resolveDirectoryImport(match.path, basePath, source, warnings);

      case "url":
        return this.resolveUrlImport(match.path, source, warnings);

      default:
        warnings.push({
          file: source,
          message: `Unknown import type: ${match.type}`,
          severity: "warn",
        });
        return null;
    }
  }

  /**
   * Resolves a @file: import.
   */
  private async resolveFileImport(
    importPath: string,
    basePath: string,
    source: string,
    warnings: AgentsWarning[]
  ): Promise<ResolvedImport | null> {
    const { result, warnings: fileWarnings } = await this.fileResolver.resolveFileImport(
      basePath,
      importPath
    );

    warnings.push(...fileWarnings);

    if (!result) {
      return null;
    }

    return {
      type: "file",
      source,
      resolvedPath: result.path,
      content: result.content,
    };
  }

  /**
   * Resolves a @dir: import.
   */
  private async resolveDirectoryImport(
    dirPath: string,
    basePath: string,
    source: string,
    warnings: AgentsWarning[]
  ): Promise<ResolvedImport | null> {
    const { result, warnings: dirWarnings } = await this.directoryResolver.resolveDirectoryImport(
      basePath,
      dirPath
    );

    warnings.push(...dirWarnings);

    if (!result || result.contents.length === 0) {
      if (result?.contents.length === 0) {
        warnings.push({
          file: dirPath,
          message: `@dir: import found no .md files in: ${dirPath}`,
          severity: "info",
        });
      }
      return null;
    }

    // Concatenate all file contents with separators
    const content = result.contents
      .map((file) => {
        // Add a comment header for each file
        return `<!-- Imported from: ${file.relativePath} -->\n${file.content}`;
      })
      .join("\n\n");

    return {
      type: "directory",
      source,
      resolvedPath: result.path,
      content,
    };
  }

  /**
   * Resolves a @url: import.
   */
  private async resolveUrlImport(
    url: string,
    source: string,
    warnings: AgentsWarning[]
  ): Promise<ResolvedImport | null> {
    // Check if URL imports are allowed
    if (!this.allowUrlImports) {
      warnings.push({
        file: url,
        message: "@url: imports are disabled for security. Enable with allowUrlImports option.",
        severity: "warn",
      });
      return null;
    }

    // Validate URL
    const validation = this.securityValidator.validateUrl(url, this.urlAllowlist);

    if (!validation.valid || validation.normalizedUrl === undefined) {
      warnings.push({
        file: url,
        message: `@url: import blocked: ${validation.error}`,
        severity: "warn",
      });
      return null;
    }

    const normalizedUrl = validation.normalizedUrl;

    // Fetch URL content
    try {
      const response = await fetchWithPool(normalizedUrl);

      if (!response.ok) {
        warnings.push({
          file: url,
          message: `@url: import failed with status ${response.status}: ${url}`,
          severity: "warn",
        });
        return null;
      }

      const content = await response.text();

      return {
        type: "url",
        source,
        resolvedPath: normalizedUrl,
        content,
      };
    } catch (error) {
      warnings.push({
        file: url,
        message: `@url: import failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        severity: "warn",
      });
      return null;
    }
  }

  /**
   * Replaces an import match with resolved content.
   */
  private replaceMatch(content: string, match: ImportMatch, replacement: string): string {
    const before = content.slice(0, match.index);
    const after = content.slice(match.index + match.length);

    // If replacement is empty, also remove the newline after the directive
    if (replacement === "") {
      // Remove trailing newline if present
      const trimmedAfter = after.startsWith("\n") ? after.slice(1) : after;
      return before + trimmedAfter;
    }

    return before + replacement + after;
  }
}

/**
 * Internal type for import matches.
 */
interface ImportMatch {
  /** Full matched string including leading whitespace */
  fullMatch: string;
  /** Import type (file, dir, url) */
  type: "file" | "dir" | "url";
  /** Import path (after the colon) */
  path: string;
  /** Start index in content */
  index: number;
  /** Length of matched string */
  length: number;
}

/**
 * Standalone function to parse imports from content.
 * Convenience wrapper around ImportParser.
 *
 * @param content - The AGENTS.md body content
 * @param basePath - Base directory for relative path resolution
 * @param options - Optional parser options
 * @returns Processed content with imports resolved
 */
export async function parseImports(
  content: string,
  basePath: string,
  options?: ImportParserOptions
): Promise<ImportParseResult> {
  const parser = new ImportParser(options);
  return parser.parseImports(content, basePath);
}
