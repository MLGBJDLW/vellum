// ============================================
// Automatic Instructions Matcher
// ============================================
// Pattern-based matching for automatic instruction activation.
// Implements REQ-023, REQ-024.

import picomatch from "picomatch";

// ============================================
// Types
// ============================================

/**
 * Configuration for file pattern matching.
 * Determines which files an instruction set applies to.
 */
export interface ApplyToConfig {
  /** Glob patterns to include (empty = all files) */
  include?: string[];
  /** Glob patterns to exclude (takes precedence over include) */
  exclude?: string[];
}

/**
 * Parsed pattern configuration with compiled matchers.
 */
interface CompiledPatterns {
  /** Compiled include matchers */
  includeMatchers: picomatch.Matcher[];
  /** Compiled exclude matchers */
  excludeMatchers: picomatch.Matcher[];
  /** Whether to match all files (no include patterns) */
  matchAll: boolean;
}

// ============================================
// AutomaticInstructionsMatcher Class
// ============================================

/**
 * Matches file paths against include/exclude patterns for automatic
 * instruction activation.
 *
 * Pattern Matching Rules:
 * 1. If no include patterns: all files are included by default
 * 2. If include patterns exist: file must match at least one
 * 3. Exclude patterns always take precedence over includes
 * 4. Supports glob patterns (*, **, ?, etc.)
 * 5. Dot files are included in matching
 *
 * @example
 * ```typescript
 * // Match all TypeScript files except tests
 * const matcher = new AutomaticInstructionsMatcher({
 *   include: ['*.ts', '*.tsx'],
 *   exclude: ['*.test.ts', '*.spec.ts']
 * });
 *
 * matcher.matches('src/index.ts');     // true
 * matcher.matches('src/index.test.ts'); // false
 * matcher.matches('src/index.js');      // false
 *
 * // Match all files (no patterns)
 * const allMatcher = new AutomaticInstructionsMatcher();
 * allMatcher.matches('anything.xyz');   // true
 * ```
 */
export class AutomaticInstructionsMatcher {
  private readonly config: ApplyToConfig;
  private readonly compiled: CompiledPatterns;

  /**
   * Creates a new AutomaticInstructionsMatcher.
   *
   * @param applyTo - Pattern configuration (include/exclude arrays)
   */
  constructor(applyTo?: ApplyToConfig) {
    this.config = this.normalizeConfig(applyTo);
    this.compiled = this.compilePatterns();
  }

  /**
   * Checks if a file path matches the configured patterns.
   *
   * @param filePath - File path to check (relative or absolute)
   * @returns True if the file matches the pattern configuration
   *
   * @example
   * ```typescript
   * const matcher = new AutomaticInstructionsMatcher({
   *   include: ['src/**\/*.ts'],
   *   exclude: ['**\/*.test.ts']
   * });
   *
   * matcher.matches('src/utils/helper.ts');      // true
   * matcher.matches('src/utils/helper.test.ts'); // false
   * matcher.matches('lib/index.ts');             // false
   * ```
   */
  public matches(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);

    // Check exclusions first (they take precedence)
    if (this.isExcluded(normalizedPath)) {
      return false;
    }

    // Check inclusions
    return this.isIncluded(normalizedPath);
  }

  /**
   * Filters an array of file paths, returning only those that match.
   *
   * @param filePaths - Array of file paths to filter
   * @returns Array of matching file paths
   *
   * @example
   * ```typescript
   * const matcher = new AutomaticInstructionsMatcher({
   *   include: ['*.ts']
   * });
   *
   * matcher.filter(['index.ts', 'style.css', 'utils.ts']);
   * // Returns: ['index.ts', 'utils.ts']
   * ```
   */
  public filter(filePaths: string[]): string[] {
    return filePaths.filter((fp) => this.matches(fp));
  }

  /**
   * Gets the current pattern configuration.
   *
   * @returns ApplyTo configuration object
   */
  public getConfig(): ApplyToConfig {
    return { ...this.config };
  }

  /**
   * Checks if any include patterns are configured.
   *
   * @returns True if include patterns exist
   */
  public hasIncludePatterns(): boolean {
    return !this.compiled.matchAll;
  }

  /**
   * Checks if any exclude patterns are configured.
   *
   * @returns True if exclude patterns exist
   */
  public hasExcludePatterns(): boolean {
    return this.compiled.excludeMatchers.length > 0;
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Normalizes the applyTo configuration.
   */
  private normalizeConfig(applyTo?: ApplyToConfig): ApplyToConfig {
    if (!applyTo) {
      return { include: [], exclude: [] };
    }

    return {
      include: this.normalizePatterns(applyTo.include),
      exclude: this.normalizePatterns(applyTo.exclude),
    };
  }

  /**
   * Normalizes pattern arrays, handling various input formats.
   */
  private normalizePatterns(patterns?: string[]): string[] {
    if (!patterns) {
      return [];
    }

    // Filter out empty strings and trim patterns
    return patterns.map((p) => p.trim()).filter((p) => p.length > 0);
  }

  /**
   * Compiles patterns into picomatch matchers for efficient matching.
   */
  private compilePatterns(): CompiledPatterns {
    const includePatterns = this.config.include ?? [];
    const excludePatterns = this.config.exclude ?? [];

    const matchAll = includePatterns.length === 0;

    const includeMatchers = includePatterns.map((pattern) =>
      picomatch(pattern, { dot: true, nocase: false })
    );

    const excludeMatchers = excludePatterns.map((pattern) =>
      picomatch(pattern, { dot: true, nocase: false })
    );

    return {
      includeMatchers,
      excludeMatchers,
      matchAll,
    };
  }

  /**
   * Checks if a file path is excluded.
   */
  private isExcluded(normalizedPath: string): boolean {
    return this.compiled.excludeMatchers.some((matcher) => matcher(normalizedPath));
  }

  /**
   * Checks if a file path is included.
   */
  private isIncluded(normalizedPath: string): boolean {
    // If no include patterns, match all files
    if (this.compiled.matchAll) {
      return true;
    }

    // Check if any include pattern matches
    return this.compiled.includeMatchers.some((matcher) => matcher(normalizedPath));
  }

  /**
   * Normalizes file path for consistent matching.
   * Converts backslashes to forward slashes for cross-platform compatibility.
   */
  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, "/");
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new AutomaticInstructionsMatcher instance.
 *
 * @param applyTo - Pattern configuration
 * @returns AutomaticInstructionsMatcher instance
 *
 * @example
 * ```typescript
 * const matcher = createAutomaticInstructionsMatcher({
 *   include: ['src/**'],
 *   exclude: ['**\/node_modules/**']
 * });
 * ```
 */
export function createAutomaticInstructionsMatcher(
  applyTo?: ApplyToConfig
): AutomaticInstructionsMatcher {
  return new AutomaticInstructionsMatcher(applyTo);
}
