/**
 * JavaScript Search Backend
 *
 * Pure JavaScript/TypeScript search implementation as a fallback
 * when no native search tools (ripgrep, git-grep) are available.
 *
 * @module builtin/search/backends/javascript
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type {
  BackendType,
  MatchContext,
  SearchBackend,
  SearchMatch,
  SearchOptions,
  SearchResult,
  SearchStats,
} from "../types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Default patterns to exclude from search.
 */
const DEFAULT_EXCLUDES = new Set([
  ".git",
  "node_modules",
  ".pnpm",
  ".pnpm-store",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  ".svelte-kit",
  "target",
  "vendor",
]);

/**
 * Binary file extensions to skip.
 */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".svg",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mkv",
  ".mov",
  ".webm",
  ".flv",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".o",
  ".obj",
  ".class",
  ".pyc",
  ".pyo",
  ".wasm",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".eot",
  ".sqlite",
  ".db",
  ".sqlite3",
]);

/**
 * Maximum file size to search (10MB).
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Lock file patterns to skip.
 */
const LOCK_FILE_PATTERNS = [
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^composer\.lock$/,
  /^Gemfile\.lock$/,
  /^Cargo\.lock$/,
  /^poetry\.lock$/,
];

// =============================================================================
// JavaScript Backend
// =============================================================================

/**
 * Pure JavaScript search backend.
 *
 * Features:
 * - Always available (no external dependencies)
 * - Recursive file walking
 * - Binary file detection
 * - Context lines support
 * - Glob pattern filtering (basic)
 *
 * Limitations:
 * - Slower than ripgrep for large codebases
 * - Basic glob support (no full glob syntax)
 * - Single-threaded
 *
 * @example
 * ```typescript
 * const backend = new JavaScriptBackend();
 * const result = await backend.search({
 *   query: "TODO",
 *   mode: "literal",
 *   paths: ["./src"],
 *   maxResults: 100,
 * });
 * console.log(result.matches);
 * ```
 */
export class JavaScriptBackend implements SearchBackend {
  readonly name = "javascript";

  /**
   * JavaScript backend is always available.
   *
   * @returns Always true
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Execute a search using pure JavaScript.
   *
   * @param options - Search options
   * @returns Search results
   */
  async search(options: SearchOptions): Promise<SearchResult> {
    const startTime = performance.now();

    // Determine search paths
    const searchPaths = options.paths?.length ? options.paths : ["."];

    // Build search pattern
    const pattern = this.buildPattern(options);

    // Build exclusion set
    const excludeSet = this.buildExcludeSet(options.excludes ?? []);

    // Build glob matchers
    const globMatchers = options.globs?.length
      ? options.globs.map((g) => this.createGlobMatcher(g))
      : null;

    const matches: SearchMatch[] = [];
    let filesSearched = 0;
    let truncated = false;

    // Search each path
    for (const searchPath of searchPaths) {
      if (truncated) break;

      const result = await this.searchDirectory(
        searchPath,
        searchPath,
        pattern,
        excludeSet,
        globMatchers,
        options.contextLines ?? 0,
        options.maxResults ?? 0,
        matches.length
      );

      matches.push(...result.matches);
      filesSearched += result.filesSearched;

      if (result.truncated) {
        truncated = true;
      }
    }

    const duration = performance.now() - startTime;

    const stats: SearchStats = {
      filesSearched,
      matchCount: matches.length,
      duration,
      backend: "javascript" as BackendType,
    };

    return {
      matches,
      truncated,
      stats,
    };
  }

  /**
   * Build a RegExp pattern from search options.
   */
  private buildPattern(options: SearchOptions): RegExp {
    let pattern: string;

    if (options.mode === "literal") {
      // Escape special regex characters
      pattern = options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else {
      pattern = options.query;
    }

    const flags = options.caseSensitive ? "g" : "gi";
    return new RegExp(pattern, flags);
  }

  /**
   * Build exclusion set from user excludes plus defaults.
   */
  private buildExcludeSet(userExcludes: string[]): Set<string> {
    const excludes = new Set(DEFAULT_EXCLUDES);
    for (const exclude of userExcludes) {
      // Handle glob-style excludes by extracting the directory name
      // Example: "**/__tests__/**" -> "__tests__"
      const name = exclude
        .replace(/^!?/, "") // Strip leading negation (e.g., !pattern)
        .replace(/^\*\*\//, "") // Strip leading **/
        .replace(/\/?\*\*\/?$/, "") // Strip trailing /** or **
        .replace(/\/$/, ""); // Strip trailing slash
      if (name) {
        excludes.add(name);
      }
    }
    return excludes;
  }

  /**
   * Create a simple glob matcher function.
   * Supports: *, ?, ** (limited)
   */
  private createGlobMatcher(glob: string): (filename: string) => boolean {
    // Convert glob to regex
    let pattern = glob
      .replace(/\./g, "\\.") // Escape dots
      .replace(/\*\*/g, "{{GLOBSTAR}}") // Placeholder for **
      .replace(/\*/g, "[^/]*") // * = any chars except /
      .replace(/\?/g, "[^/]") // ? = single char
      .replace(/{{GLOBSTAR}}/g, ".*"); // ** = any chars including /

    // If pattern doesn't start with /, anchor to end of path
    if (!pattern.startsWith("/") && !pattern.startsWith(".*")) {
      pattern = `(^|/)${pattern}`;
    }

    // Anchor to end
    pattern = `${pattern}$`;

    const regex = new RegExp(pattern, "i");
    return (filename: string) => regex.test(filename);
  }

  /**
   * Recursively search a directory.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Recursive search with glob matching and context extraction
  private async searchDirectory(
    dirPath: string,
    basePath: string,
    pattern: RegExp,
    excludeSet: Set<string>,
    globMatchers: Array<(filename: string) => boolean> | null,
    contextLines: number,
    maxResults: number,
    currentMatchCount: number
  ): Promise<{ matches: SearchMatch[]; filesSearched: number; truncated: boolean }> {
    const matches: SearchMatch[] = [];
    let filesSearched = 0;
    let truncated = false;

    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch {
      // Directory not readable, skip
      return { matches: [], filesSearched: 0, truncated: false };
    }

    for (const entry of entries) {
      if (truncated) break;
      if (maxResults > 0 && currentMatchCount + matches.length >= maxResults) {
        truncated = true;
        break;
      }

      // Skip excluded directories/files
      if (excludeSet.has(entry)) {
        continue;
      }

      const fullPath = join(dirPath, entry);
      let entryStat: Awaited<ReturnType<typeof stat>> | undefined;

      try {
        entryStat = await stat(fullPath);
      } catch {
        // Can't stat, skip
        continue;
      }

      if (entryStat.isDirectory()) {
        // Recurse into subdirectory
        const subResult = await this.searchDirectory(
          fullPath,
          basePath,
          pattern,
          excludeSet,
          globMatchers,
          contextLines,
          maxResults,
          currentMatchCount + matches.length
        );

        matches.push(...subResult.matches);
        filesSearched += subResult.filesSearched;

        if (subResult.truncated) {
          truncated = true;
        }
      } else if (entryStat.isFile()) {
        // Check if file should be searched
        if (!this.shouldSearchFile(fullPath, entry, entryStat.size, globMatchers)) {
          continue;
        }

        // Search the file
        const fileResult = await this.searchFile(
          fullPath,
          basePath,
          pattern,
          contextLines,
          maxResults,
          currentMatchCount + matches.length
        );

        if (fileResult) {
          matches.push(...fileResult.matches);
          filesSearched++;

          if (fileResult.truncated) {
            truncated = true;
          }
        }
      }
    }

    return { matches, filesSearched, truncated };
  }

  /**
   * Check if a file should be searched.
   */
  private shouldSearchFile(
    fullPath: string,
    filename: string,
    size: number,
    globMatchers: Array<(filename: string) => boolean> | null
  ): boolean {
    // Skip files that are too large
    if (size > MAX_FILE_SIZE) {
      return false;
    }

    // Skip binary extensions
    const ext = this.getExtension(filename);
    if (BINARY_EXTENSIONS.has(ext)) {
      return false;
    }

    // Skip lock files
    for (const lockPattern of LOCK_FILE_PATTERNS) {
      if (lockPattern.test(filename)) {
        return false;
      }
    }

    // If glob matchers are specified, file must match at least one
    if (globMatchers && globMatchers.length > 0) {
      const matches = globMatchers.some((matcher) => matcher(fullPath) || matcher(filename));
      if (!matches) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get file extension (lowercase, with dot).
   */
  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot === -1 || lastDot === 0) {
      return "";
    }
    return filename.slice(lastDot).toLowerCase();
  }

  /**
   * Search a single file for matches.
   */
  private async searchFile(
    filePath: string,
    basePath: string,
    pattern: RegExp,
    contextLines: number,
    maxResults: number,
    currentMatchCount: number
  ): Promise<{ matches: SearchMatch[]; truncated: boolean } | null> {
    let content: string;

    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      // File not readable (binary, encoding issues, etc.)
      return null;
    }

    // Quick check for binary content (null bytes)
    if (this.isBinaryContent(content)) {
      return null;
    }

    const lines = content.split(/\r?\n/);
    const matches: SearchMatch[] = [];
    let truncated = false;
    const relativePath = relative(basePath, filePath) || filePath;

    for (let i = 0; i < lines.length; i++) {
      if (maxResults > 0 && currentMatchCount + matches.length >= maxResults) {
        truncated = true;
        break;
      }

      const line = lines[i] ?? "";

      // Reset pattern lastIndex for global regex
      pattern.lastIndex = 0;
      const matchResult = pattern.exec(line);

      if (matchResult) {
        const match: SearchMatch = {
          file: relativePath,
          line: i + 1, // 1-indexed
          column: matchResult.index + 1, // 1-indexed
          content: line,
        };

        // Add context if requested
        if (contextLines > 0) {
          match.context = this.getContext(lines, i, contextLines);
        }

        matches.push(match);
      }
    }

    return { matches, truncated };
  }

  /**
   * Check if content appears to be binary (contains null bytes).
   */
  private isBinaryContent(content: string): boolean {
    // Check first 8KB for null bytes
    const checkLength = Math.min(content.length, 8192);
    for (let i = 0; i < checkLength; i++) {
      if (content.charCodeAt(i) === 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get context lines around a match.
   */
  private getContext(lines: string[], matchIndex: number, contextLines: number): MatchContext {
    const before: string[] = [];
    const after: string[] = [];

    // Get lines before
    for (let i = Math.max(0, matchIndex - contextLines); i < matchIndex; i++) {
      before.push(lines[i] ?? "");
    }

    // Get lines after
    for (let i = matchIndex + 1; i <= Math.min(lines.length - 1, matchIndex + contextLines); i++) {
      after.push(lines[i] ?? "");
    }

    return { before, after };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a new JavaScript backend with default settings.
 *
 * @returns Configured JavaScriptBackend instance
 */
export function createJavaScriptBackend(): JavaScriptBackend {
  return new JavaScriptBackend();
}
