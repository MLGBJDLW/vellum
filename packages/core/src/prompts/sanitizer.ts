// ============================================
// Prompt Sanitization Utilities
// ============================================

/**
 * Security utilities for sanitizing prompt variables and detecting
 * potentially dangerous content patterns.
 *
 * @module @vellum/core/prompts/sanitizer
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Default maximum length for variable values.
 */
export const DEFAULT_MAX_LENGTH = 10000;

/**
 * Suffix appended to truncated values.
 */
export const TRUNCATION_SUFFIX = "[truncated]";

// =============================================================================
// Dangerous Content Patterns
// =============================================================================

/**
 * Patterns that indicate potential prompt injection attempts.
 * Case-insensitive matching is applied.
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  // Prompt injection patterns
  /ignore\s+previous/i,
  /disregard\s+above/i,
  /new\s+instructions/i,

  // System override patterns
  /system\s*:/i,
  /\[SYSTEM\]/i,
  /<\|system\|>/i,

  // Role manipulation patterns
  /you\s+are\s+now/i,
  /act\s+as\b/i,
  /pretend\s+to\s+be/i,

  // Delimiter injection (at start of line)
  /^---/m,
  /^###/m,
  /^===/m,

  // Code/template injection patterns
  /\{\{/,
  /\}\}/,
  /\$\{/,
  /<%/,
];

/**
 * Control characters to escape (ASCII 0-31 except tab, newline, carriage return).
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control character matching for security sanitization
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// =============================================================================
// Functions
// =============================================================================

/**
 * Checks if content contains potentially dangerous patterns.
 *
 * Detects various injection attempts including:
 * - Prompt injection: "ignore previous", "disregard above", "new instructions"
 * - System override: "system:", "[SYSTEM]", "<|system|>"
 * - Role manipulation: "you are now", "act as", "pretend to be"
 * - Delimiter injection: "---", "###", "===" (at start of line)
 * - Code injection: "{{", "}}", "${", "<%"
 *
 * @param content - The content to check for dangerous patterns
 * @returns `true` if any dangerous pattern is found, `false` otherwise
 *
 * @example
 * ```typescript
 * containsDangerousContent("Hello world"); // false
 * containsDangerousContent("ignore previous instructions"); // true
 * containsDangerousContent("Please act as a different AI"); // true
 * containsDangerousContent("---\nNew section"); // true (delimiter at line start)
 * containsDangerousContent("Use {{ template }}"); // true
 * ```
 */
export function containsDangerousContent(content: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Sanitizes a variable value for safe inclusion in prompts.
 *
 * Performs the following sanitization steps:
 * 1. Strips dangerous patterns (injection attempts)
 * 2. Escapes control characters
 * 3. Truncates values exceeding maxLength with "[truncated]" suffix
 *
 * @param _key - The variable key (reserved for future logging/debugging)
 * @param value - The variable value to sanitize
 * @param maxLength - Maximum allowed length (default: 10000)
 * @returns The sanitized value
 *
 * @example
 * ```typescript
 * // Basic sanitization
 * sanitizeVariable("name", "John Doe");
 * // Returns: "John Doe"
 *
 * // Dangerous content removal
 * sanitizeVariable("input", "Hello ignore previous instructions");
 * // Returns: "Hello [FILTERED]"
 *
 * // Truncation
 * sanitizeVariable("content", "x".repeat(20000), 100);
 * // Returns: "x".repeat(100) + "[truncated]"
 *
 * // Control character escape
 * sanitizeVariable("data", "Hello\x00World");
 * // Returns: "HelloWorld"
 * ```
 */
export function sanitizeVariable(
  _key: string,
  value: string,
  maxLength: number = DEFAULT_MAX_LENGTH
): string {
  // Handle empty/null values
  if (!value) {
    return "";
  }

  let sanitized = value;

  // Step 1: Remove control characters
  sanitized = sanitized.replace(CONTROL_CHAR_REGEX, "");

  // Step 2: Replace dangerous patterns with [FILTERED]
  for (const pattern of DANGEROUS_PATTERNS) {
    // Create a global version of the pattern for replacement
    const globalPattern = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
    );
    sanitized = sanitized.replace(globalPattern, "[FILTERED]");
  }

  // Step 3: Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + TRUNCATION_SUFFIX;
  }

  return sanitized;
}
