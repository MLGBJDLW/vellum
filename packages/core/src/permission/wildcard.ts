/**
 * Wildcard pattern matching utilities for permission system
 *
 * Provides glob-style pattern matching:
 * - `*` matches any characters (including none)
 * - `?` matches exactly one character
 * - Special regex characters are escaped
 */

import type { PermissionLevel } from "./types.js";

/**
 * Wildcard namespace for pattern matching operations
 */
export namespace Wildcard {
  /**
   * Convert a wildcard pattern to a RegExp
   *
   * @param pattern - Wildcard pattern (* = any chars, ? = single char)
   * @returns RegExp that matches the pattern
   *
   * @example
   * ```ts
   * Wildcard.toRegex("*.ts")  // matches "foo.ts", "bar.ts"
   * Wildcard.toRegex("file?") // matches "file1", "fileA"
   * ```
   */
  export function toRegex(pattern: string): RegExp {
    // Escape special regex characters except * and ?
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

    // Convert wildcards to regex equivalents
    const regexStr = escaped
      .replace(/\*/g, ".*") // * -> match any characters
      .replace(/\?/g, "."); // ? -> match single character

    return new RegExp(`^${regexStr}$`, "s");
  }

  /**
   * Check if a string matches a wildcard pattern
   *
   * @param input - String to test
   * @param pattern - Wildcard pattern to match against
   * @returns true if input matches the pattern
   *
   * @example
   * ```ts
   * Wildcard.matches("git status", "git *")     // true
   * Wildcard.matches("git push", "git status")  // false
   * Wildcard.matches("test.ts", "*.ts")         // true
   * ```
   */
  export function matches(input: string, pattern: string): boolean {
    const regex = toRegex(pattern);
    return regex.test(input);
  }

  /**
   * Find the first matching pattern from a list and return its value
   *
   * Patterns are sorted by specificity (length) - longer patterns match first,
   * with exact matches taking precedence.
   *
   * @param input - String to match against patterns
   * @param patterns - Record of pattern -> value mappings
   * @returns The value for the matching pattern, or undefined if no match
   *
   * @example
   * ```ts
   * const patterns = {
   *   "git status": "allow",
   *   "git *": "ask",
   *   "*": "deny"
   * };
   * Wildcard.findMatch("git status", patterns)  // "allow" (exact match)
   * Wildcard.findMatch("git push", patterns)    // "ask" (git * matches)
   * Wildcard.findMatch("rm -rf", patterns)      // "deny" (* matches)
   * ```
   */
  export function findMatch<T>(input: string, patterns: Record<string, T>): T | undefined {
    // Sort patterns by specificity:
    // 1. Exact matches first (no wildcards)
    // 2. Then by length (longer = more specific)
    const sortedPatterns = Object.entries(patterns).sort((a, b) => {
      const aHasWildcard = a[0].includes("*") || a[0].includes("?");
      const bHasWildcard = b[0].includes("*") || b[0].includes("?");

      // Exact matches (no wildcards) come first
      if (!aHasWildcard && bHasWildcard) return -1;
      if (aHasWildcard && !bHasWildcard) return 1;

      // Among wildcards, longer patterns are more specific
      return b[0].length - a[0].length;
    });

    for (const [pattern, value] of sortedPatterns) {
      if (matches(input, pattern)) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * Resolve permission level for a command using pattern matching
   *
   * Finds the most specific matching pattern and returns its permission level.
   * More specific patterns (longer, fewer wildcards) take precedence.
   *
   * @param input - Command or resource to check
   * @param patterns - Record of pattern -> permission level mappings
   * @returns The matched permission level, or undefined if no match
   *
   * @example
   * ```ts
   * const bashPermissions = {
   *   "git status": "allow",
   *   "git push *": "ask",
   *   "rm -rf *": "deny",
   *   "*": "ask"
   * };
   * Wildcard.resolvePermission("git status", bashPermissions)     // "allow"
   * Wildcard.resolvePermission("git push origin", bashPermissions) // "ask"
   * Wildcard.resolvePermission("rm -rf /", bashPermissions)       // "deny"
   * ```
   */
  export function resolvePermission(
    input: string,
    patterns: Record<string, PermissionLevel>
  ): PermissionLevel | undefined {
    return findMatch(input, patterns);
  }

  /**
   * Check if a pattern contains any wildcard characters
   *
   * @param pattern - Pattern to check
   * @returns true if pattern contains * or ?
   */
  export function hasWildcard(pattern: string): boolean {
    return pattern.includes("*") || pattern.includes("?");
  }

  /**
   * Escape special wildcard characters in a string
   *
   * @param str - String to escape
   * @returns String with * and ? escaped as \* and \?
   */
  export function escapeWildcard(str: string): string {
    return str.replace(/[*?]/g, "\\$&");
  }

  /**
   * Calculate pattern specificity score
   * Higher scores = more specific patterns
   *
   * @param pattern - Pattern to score
   * @returns Specificity score
   */
  export function specificity(pattern: string): number {
    // Count wildcard characters (reduce specificity)
    const wildcards = (pattern.match(/[*?]/g) || []).length;
    // Base score is pattern length
    const lengthScore = pattern.length;
    // Penalize wildcards heavily, but * more than ?
    const wildcardPenalty = wildcards * 10 + (pattern.match(/\*/g) || []).length * 5;

    return lengthScore - wildcardPenalty;
  }

  /**
   * Sort patterns by specificity (most specific first)
   *
   * @param patterns - Array of patterns to sort
   * @returns New array sorted by specificity
   */
  export function sortBySpecificity(patterns: string[]): string[] {
    return [...patterns].sort((a, b) => specificity(b) - specificity(a));
  }
}
