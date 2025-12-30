/**
 * Input Sanitizer
 *
 * Security utilities for sanitizing user input to prevent:
 * - Shell injection attacks
 * - Path traversal attacks
 * - Command injection
 *
 * @module cli/commands/security/input-sanitizer
 */

import path from "node:path";

// =============================================================================
// Constants
// =============================================================================

/**
 * Shell metacharacters that need escaping
 * Includes: | & ; $ ` \ ! ( ) { } [ ] < > * ? # ~
 */
const SHELL_METACHARACTERS = /[|&;$`\\!(){}[\]<>*?#~]/g;

/**
 * Pattern to detect path traversal attempts
 * Matches: ../ ..\ ~/ and absolute paths
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[/\\]/, // ../ or ..\
  /^~[/\\]?/, // ~/ or ~\ or just ~
  /^[a-zA-Z]:[/\\]/, // Windows absolute path (C:\, D:/)
  /^[/\\]/, // Unix absolute path
];

/**
 * Dangerous characters to remove from general input
 */
const DANGEROUS_CHARS = /[|&;$`\\!(){}[\]<>*?#~\x00-\x1f\x7f]/g;

// =============================================================================
// InputSanitizer Class
// =============================================================================

/**
 * Provides methods for sanitizing and validating user input.
 *
 * @example
 * ```typescript
 * const sanitizer = new InputSanitizer();
 *
 * // Sanitize general input
 * const clean = sanitizer.sanitize("hello; rm -rf /");
 * // => "hello rm -rf "
 *
 * // Validate paths
 * const isValid = sanitizer.validatePath("../secret", "/app/data");
 * // => false
 *
 * // Escape shell metacharacters
 * const escaped = sanitizer.escapeShellMeta("hello; world");
 * // => "hello\\; world"
 * ```
 */
export class InputSanitizer {
  /**
   * Sanitizes input by removing dangerous characters.
   *
   * Removes shell metacharacters and control characters that could
   * be used for injection attacks.
   *
   * @param input - The input string to sanitize
   * @returns Sanitized string with dangerous characters removed
   */
  sanitize(input: string): string {
    if (!input) {
      return "";
    }

    // Remove dangerous characters
    return input.replace(DANGEROUS_CHARS, "");
  }

  /**
   * Validates that a path does not escape the allowed root directory.
   *
   * Prevents path traversal attacks by:
   * - Rejecting paths with ../ or ..\
   * - Rejecting absolute paths
   * - Rejecting paths starting with ~/
   * - Normalizing and checking the resolved path stays within root
   *
   * @param inputPath - The path to validate
   * @param allowedRoot - The root directory that must contain the resolved path
   * @returns true if path is safe and within allowedRoot, false otherwise
   */
  validatePath(inputPath: string, allowedRoot: string): boolean {
    if (!inputPath || !allowedRoot) {
      return false;
    }

    // Check for path traversal patterns in raw input
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(inputPath)) {
        return false;
      }
    }

    // Normalize both paths for comparison
    const normalizedRoot = path.resolve(allowedRoot);
    const resolvedPath = path.resolve(allowedRoot, inputPath);

    // Ensure resolved path starts with the allowed root
    // Add path.sep to prevent partial directory name matches
    // e.g., /app/data should not allow /app/data-secret
    return (
      resolvedPath === normalizedRoot || resolvedPath.startsWith(normalizedRoot + path.sep)
    );
  }

  /**
   * Escapes shell metacharacters in input.
   *
   * Instead of removing characters, this method escapes them with
   * backslashes so they are treated literally by the shell.
   *
   * Characters escaped: | & ; $ ` \ ! ( ) { } [ ] < > * ? # ~
   *
   * @param input - The input string to escape
   * @returns String with shell metacharacters escaped
   */
  escapeShellMeta(input: string): string {
    if (!input) {
      return "";
    }

    // Escape each metacharacter with a backslash
    return input.replace(SHELL_METACHARACTERS, "\\$&");
  }

  /**
   * Checks if a string contains any shell metacharacters.
   *
   * @param input - The input string to check
   * @returns true if input contains shell metacharacters
   */
  containsShellMeta(input: string): boolean {
    if (!input) {
      return false;
    }

    // Use a fresh regex to avoid lastIndex issues with global flag
    const pattern = /[|&;$`\\!(){}[\]<>*?#~]/;
    return pattern.test(input);
  }

  /**
   * Checks if a path contains traversal patterns.
   *
   * @param inputPath - The path to check
   * @returns true if path contains traversal patterns
   */
  containsPathTraversal(inputPath: string): boolean {
    if (!inputPath) {
      return false;
    }

    return PATH_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(inputPath));
  }
}
