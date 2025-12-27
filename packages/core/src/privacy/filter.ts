/**
 * Privacy filtering utilities for redacting sensitive information
 * from logs, telemetry, and other outputs.
 */

/**
 * Represents a pattern for detecting and replacing sensitive data.
 */
export interface SensitivePattern {
  pattern: RegExp;
  replacement: string;
}

/**
 * Default patterns for detecting sensitive information.
 * Patterns are designed to avoid catastrophic backtracking.
 */
export const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // Anthropic API keys (sk-ant-xxx format)
  { pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g, replacement: "[ANTHROPIC_KEY_REDACTED]" },
  // OpenAI API keys (sk-xxx format, but not sk-ant-)
  { pattern: /sk-(?!ant-)[a-zA-Z0-9]{20,}/g, replacement: "[OPENAI_KEY_REDACTED]" },
  // Generic API keys in various formats
  {
    pattern: /api[_-]?key[_-]?[=:]["']?[a-zA-Z0-9_-]{16,}["']?/gi,
    replacement: "[API_KEY_REDACTED]",
  },
  // Bearer tokens
  { pattern: /Bearer\s+[a-zA-Z0-9_.-]+/gi, replacement: "Bearer [TOKEN_REDACTED]" },
  // Private keys (PEM format)
  {
    pattern:
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    replacement: "[PRIVATE_KEY_REDACTED]",
  },
  // Generic secrets in key=value format
  { pattern: /secret[_-]?[=:]["']?[a-zA-Z0-9_-]{8,}["']?/gi, replacement: "[SECRET_REDACTED]" },
  // AWS access keys
  { pattern: /AKIA[0-9A-Z]{16}/g, replacement: "[AWS_ACCESS_KEY_REDACTED]" },
  // Google API keys
  { pattern: /AIza[0-9A-Za-z_-]{35}/g, replacement: "[GOOGLE_API_KEY_REDACTED]" },
  // GitHub tokens
  { pattern: /gh[pousr]_[a-zA-Z0-9]{36,}/g, replacement: "[GITHUB_TOKEN_REDACTED]" },
];

/**
 * Field names that should be redacted entirely when found in objects.
 */
const SENSITIVE_FIELD_NAMES = new Set([
  "password",
  "passwd",
  "secret",
  "apikey",
  "api_key",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "authorization",
  "auth",
  "credentials",
  "privatekey",
  "private_key",
]);

/**
 * Attribute keys that should be removed from telemetry spans.
 */
const TELEMETRY_EXCLUDED_KEYS = new Set([
  "prompt",
  "response",
  "input",
  "output",
  "content",
  "message",
  "gen_ai.prompt",
  "gen_ai.response",
  "gen_ai.content",
]);

/**
 * Filters sensitive information from strings and objects.
 */
export class PrivacyFilter {
  private patterns: SensitivePattern[];

  /**
   * Creates a new PrivacyFilter instance.
   * @param additionalPatterns - Additional patterns to include beyond defaults
   */
  constructor(additionalPatterns: SensitivePattern[] = []) {
    this.patterns = [...SENSITIVE_PATTERNS, ...additionalPatterns];
  }

  /**
   * Filters sensitive information from a string.
   * @param input - The string to filter
   * @returns The filtered string with sensitive data redacted
   */
  filterString(input: string): string {
    let result = input;
    for (const { pattern, replacement } of this.patterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  /**
   * Recursively filters sensitive information from an object.
   * @param obj - The object to filter
   * @param maxDepth - Maximum recursion depth (default: 10)
   * @returns A new object with sensitive data redacted
   */
  filterObject<T>(obj: T, maxDepth = 10): T {
    if (maxDepth <= 0) {
      return "[MAX_DEPTH_EXCEEDED]" as unknown as T;
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === "string") {
      return this.filterString(obj) as unknown as T;
    }

    if (typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.filterObject(item, maxDepth - 1)) as unknown as T;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_FIELD_NAMES.has(key.toLowerCase())) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = this.filterObject(value, maxDepth - 1);
      }
    }
    return result as unknown as T;
  }
}

/**
 * Sanitizes telemetry span attributes by removing sensitive keys
 * and filtering string values.
 */
export class TelemetrySanitizer {
  private filter: PrivacyFilter;

  /**
   * Creates a new TelemetrySanitizer instance.
   * @param filter - Optional custom PrivacyFilter instance
   */
  constructor(filter?: PrivacyFilter) {
    this.filter = filter ?? new PrivacyFilter();
  }

  /**
   * Sanitizes telemetry attributes by removing excluded keys
   * and filtering string values for sensitive patterns.
   * @param attributes - The attributes to sanitize
   * @returns Sanitized attributes with sensitive data removed or redacted
   */
  sanitizeAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(attributes)) {
      // Skip excluded telemetry keys entirely
      if (TELEMETRY_EXCLUDED_KEYS.has(key.toLowerCase())) {
        continue;
      }

      // Filter string values for sensitive patterns
      if (typeof value === "string") {
        result[key] = this.filter.filterString(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
