/**
 * Ignore Manager for Context Management
 *
 * Manages file ignore patterns using gitignore-style syntax.
 * Supports loading patterns from multiple sources:
 * - Built-in defaults
 * - Custom patterns via options
 * - .vellumignore file
 * - .gitignore file (optional)
 *
 * @module @vellum/core/context
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_IGNORE_PATTERNS } from "./ignore-patterns.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for configuring the IgnoreManager.
 */
export interface IgnoreManagerOptions {
  /**
   * Custom patterns to add on top of defaults.
   * Uses gitignore syntax.
   */
  customPatterns?: string[];

  /**
   * Whether to load and respect .gitignore file.
   * @default true
   */
  respectGitignore?: boolean;

  /**
   * Path to .vellumignore file (absolute or relative to rootDir).
   * @default '.vellumignore'
   */
  ignoreFilePath?: string;

  /**
   * Whether to use default ignore patterns.
   * @default true
   */
  useDefaults?: boolean;

  /**
   * Path to user's global ignore config.
   * @default '~/.config/vellum/ignore'
   */
  globalConfigPath?: string;
}

/**
 * Result of pattern matching operations.
 */
export interface IgnoreResult {
  /** Whether the file is ignored */
  ignored: boolean;
  /** The pattern that matched (if any) */
  matchedPattern?: string;
}

// ============================================================================
// IgnoreManager
// ============================================================================

/**
 * Manages ignore patterns for filtering files from context.
 *
 * Uses gitignore-style pattern matching with support for:
 * - Glob patterns (`*`, `**`, `?`)
 * - Directory markers (trailing `/`)
 * - Negation patterns (`!`)
 * - Comments (`#`)
 *
 * @example
 * ```typescript
 * const manager = new IgnoreManager('/path/to/project', {
 *   customPatterns: ['*.test.ts', 'docs/'],
 * });
 * await manager.load();
 *
 * if (manager.isIgnored('node_modules/package/index.js')) {
 *   // File is ignored
 * }
 *
 * const relevantFiles = manager.filter(allFiles);
 * ```
 */
export class IgnoreManager {
  private patterns: string[] = [];
  private negations: string[] = [];
  private readonly rootDir: string;
  private readonly options: Required<IgnoreManagerOptions>;
  private loaded = false;

  /**
   * Creates a new IgnoreManager.
   *
   * @param rootDir - Root directory for resolving relative paths
   * @param options - Configuration options
   */
  constructor(rootDir: string, options: IgnoreManagerOptions = {}) {
    this.rootDir = rootDir;
    this.options = {
      customPatterns: options.customPatterns ?? [],
      respectGitignore: options.respectGitignore ?? true,
      ignoreFilePath: options.ignoreFilePath ?? ".vellumignore",
      useDefaults: options.useDefaults ?? true,
      globalConfigPath:
        options.globalConfigPath ??
        join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".config/vellum/ignore"),
    };
  }

  /**
   * Load patterns from all configured sources.
   *
   * Loading order (later sources can override earlier):
   * 1. Built-in defaults
   * 2. User global config
   * 3. Project .vellumignore
   * 4. Project .gitignore (if enabled)
   * 5. Custom patterns from options
   */
  async load(): Promise<void> {
    // 1. Built-in defaults
    if (this.options.useDefaults) {
      this.addPatterns([...DEFAULT_IGNORE_PATTERNS]);
    }

    // 2. User global config
    await this.loadFromFile(this.options.globalConfigPath);

    // 3. Project .vellumignore
    const vellumIgnorePath = this.options.ignoreFilePath.startsWith("/")
      ? this.options.ignoreFilePath
      : join(this.rootDir, this.options.ignoreFilePath);
    await this.loadFromFile(vellumIgnorePath);

    // 4. Project .gitignore
    if (this.options.respectGitignore) {
      await this.loadFromFile(join(this.rootDir, ".gitignore"));
    }

    // 5. Custom patterns from options
    this.addPatterns(this.options.customPatterns);

    this.loaded = true;
  }

  /**
   * Load patterns from an ignore file.
   *
   * File format follows gitignore syntax:
   * - Lines starting with `#` are comments
   * - Empty lines are skipped
   * - Lines starting with `!` are negation patterns
   * - Trailing `/` indicates directory-only match
   *
   * @param filePath - Absolute path to the ignore file
   */
  async loadFromFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, "utf8");
      this.parseIgnoreContent(content);
    } catch {
      // File doesn't exist or unreadable - silently skip
    }
  }

  /**
   * Parse ignore file content and add patterns.
   */
  private parseIgnoreContent(content: string): void {
    for (const line of content.split("\n")) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Handle negation patterns
      if (trimmed.startsWith("!")) {
        this.negations.push(trimmed.slice(1));
      } else {
        this.patterns.push(trimmed);
      }
    }
  }

  /**
   * Add custom patterns at runtime.
   *
   * @param patterns - Array of gitignore-style patterns
   */
  addPatterns(patterns: string[]): void {
    for (const pattern of patterns) {
      const trimmed = pattern.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      if (trimmed.startsWith("!")) {
        this.negations.push(trimmed.slice(1));
      } else {
        this.patterns.push(trimmed);
      }
    }
  }

  /**
   * Check if a file should be ignored.
   *
   * Uses gitignore-style matching with support for:
   * - Glob patterns: `*.js`, `**\/*.test.ts`
   * - Directory patterns: `node_modules/`
   * - Negation patterns: `!important.log`
   *
   * @param filePath - Relative path from rootDir (use forward slashes)
   * @returns true if the file should be ignored
   */
  isIgnored(filePath: string): boolean {
    return this.checkIgnored(filePath).ignored;
  }

  /**
   * Check if a file should be ignored with details.
   *
   * @param filePath - Relative path from rootDir
   * @returns IgnoreResult with ignored status and matched pattern
   */
  checkIgnored(filePath: string): IgnoreResult {
    // Normalize path separators (Windows -> Unix)
    const normalized = filePath.replace(/\\/g, "/");

    // Check negation patterns first (they override ignore)
    for (const negation of this.negations) {
      if (this.matchPattern(normalized, negation)) {
        return { ignored: false, matchedPattern: `!${negation}` };
      }
    }

    // Check ignore patterns
    for (const pattern of this.patterns) {
      if (this.matchPattern(normalized, pattern)) {
        return { ignored: true, matchedPattern: pattern };
      }
    }

    return { ignored: false };
  }

  /**
   * Match a path against a gitignore-style pattern.
   */
  private matchPattern(path: string, pattern: string): boolean {
    // Handle directory patterns (ending with /)
    if (pattern.endsWith("/")) {
      const dirPattern = pattern.slice(0, -1);
      // Match the directory itself or anything inside it
      if (path === dirPattern || path.startsWith(`${dirPattern}/`)) {
        return true;
      }
      // Also check if any path segment matches
      const segments = path.split("/");
      for (let i = 0; i < segments.length; i++) {
        const partialPath = segments.slice(0, i + 1).join("/");
        if (partialPath === dirPattern || this.globMatch(partialPath, dirPattern)) {
          return true;
        }
      }
      return false;
    }

    // Handle rooted patterns (starting with /)
    if (pattern.startsWith("/")) {
      return this.globMatch(path, pattern.slice(1));
    }

    // Standard pattern - match anywhere in path
    // First try exact match
    if (this.globMatch(path, pattern)) {
      return true;
    }

    // Then try matching against each path segment and suffix
    const segments = path.split("/");
    for (let i = 0; i < segments.length; i++) {
      const suffix = segments.slice(i).join("/");
      if (this.globMatch(suffix, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple glob pattern matching.
   *
   * Supports:
   * - `*` matches any characters except `/`
   * - `**` matches any characters including `/`
   * - `?` matches any single character
   * - `[abc]` matches any character in brackets
   */
  private globMatch(str: string, pattern: string): boolean {
    // Convert glob pattern to regex
    let regexStr = "";
    let i = 0;

    while (i < pattern.length) {
      const char = pattern.charAt(i);

      if (char === "*") {
        if (pattern.charAt(i + 1) === "*") {
          // ** matches anything including /
          if (pattern.charAt(i + 2) === "/") {
            regexStr += "(?:.*/)?";
            i += 3;
          } else {
            regexStr += ".*";
            i += 2;
          }
        } else {
          // * matches anything except /
          regexStr += "[^/]*";
          i++;
        }
      } else if (char === "?") {
        regexStr += "[^/]";
        i++;
      } else if (char === "[") {
        // Character class - find closing bracket
        const closeIdx = pattern.indexOf("]", i);
        if (closeIdx === -1) {
          regexStr += "\\[";
          i++;
        } else {
          regexStr += pattern.slice(i, closeIdx + 1);
          i = closeIdx + 1;
        }
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Intentional pattern for regex special chars
      } else if (".+^${}|()\\".includes(char)) {
        // Escape regex special characters
        regexStr += `\\${char}`;
        i++;
      } else {
        regexStr += char;
        i++;
      }
    }

    try {
      const regex = new RegExp(`^${regexStr}$`);
      return regex.test(str);
    } catch {
      // Invalid regex - fall back to literal match
      return str === pattern;
    }
  }

  /**
   * Filter a list of files, returning only non-ignored ones.
   *
   * @param files - Array of file paths (relative to rootDir)
   * @returns Files that are not ignored
   */
  filter(files: string[]): string[] {
    return files.filter((file) => !this.isIgnored(file));
  }

  /**
   * Filter files with detailed results.
   *
   * @param files - Array of file paths (relative to rootDir)
   * @returns Object with included and excluded files
   */
  filterWithDetails(files: string[]): {
    included: string[];
    excluded: Array<{ file: string; pattern: string }>;
  } {
    const included: string[] = [];
    const excluded: Array<{ file: string; pattern: string }> = [];

    for (const file of files) {
      const result = this.checkIgnored(file);
      if (result.ignored && result.matchedPattern) {
        excluded.push({ file, pattern: result.matchedPattern });
      } else if (!result.ignored) {
        included.push(file);
      }
    }

    return { included, excluded };
  }

  /**
   * Get current pattern list.
   *
   * @returns Object containing patterns and negations
   */
  getPatterns(): { patterns: readonly string[]; negations: readonly string[] } {
    return {
      patterns: [...this.patterns],
      negations: [...this.negations],
    };
  }

  /**
   * Clear all patterns.
   */
  clear(): void {
    this.patterns = [];
    this.negations = [];
    this.loaded = false;
  }

  /**
   * Check if patterns have been loaded.
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Get the number of patterns.
   */
  get patternCount(): number {
    return this.patterns.length + this.negations.length;
  }
}
