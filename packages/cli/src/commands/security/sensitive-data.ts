/**
 * Sensitive Data Handler
 *
 * Detects and masks sensitive data (API keys, tokens, passwords) in text.
 * Provides configurable patterns for various credential formats.
 *
 * @module cli/commands/security/sensitive-data
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Pattern definition for sensitive data detection
 */
export interface SensitivePattern {
  /** Unique name for the pattern */
  name: string;
  /** Regular expression to match sensitive data */
  regex: RegExp;
}

// =============================================================================
// T051: SensitiveDataHandler Class
// =============================================================================

/**
 * SensitiveDataHandler - Detects and masks sensitive data in text
 *
 * Identifies sensitive information like API keys, tokens, and passwords,
 * then masks them while preserving enough context for debugging.
 *
 * Masking format: Shows first 4 and last 4 characters, masks the middle.
 * Example: `sk-proj-abcd...wxyz`
 *
 * @example
 * ```typescript
 * const handler = createDefaultHandler();
 *
 * const text = 'API key: sk-proj-abcdefghij1234567890';
 * console.log(handler.mask(text));
 * // Output: 'API key: sk-p...7890'
 *
 * if (handler.isSensitive(text)) {
 *   console.log('Warning: sensitive data detected');
 * }
 * ```
 */
export class SensitiveDataHandler {
  private patterns: Map<string, SensitivePattern> = new Map();

  /**
   * Create a new SensitiveDataHandler
   *
   * @param patterns - Initial patterns to register
   */
  constructor(patterns?: SensitivePattern[]) {
    if (patterns) {
      for (const pattern of patterns) {
        this.patterns.set(pattern.name, pattern);
      }
    }
  }

  /**
   * Add a custom pattern for sensitive data detection
   *
   * @param name - Unique identifier for the pattern
   * @param regex - Regular expression to match sensitive data
   *
   * @example
   * ```typescript
   * handler.addPattern('custom-key', /my-api-[a-z0-9]{32}/gi);
   * ```
   */
  addPattern(name: string, regex: RegExp): void {
    // Ensure the regex has global flag for proper replacement
    const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
    const globalRegex = new RegExp(regex.source, flags);

    this.patterns.set(name, { name, regex: globalRegex });
  }

  /**
   * Remove a registered pattern
   *
   * @param name - Name of the pattern to remove
   * @returns true if the pattern was removed, false if it didn't exist
   */
  removePattern(name: string): boolean {
    return this.patterns.delete(name);
  }

  /**
   * Get all registered pattern names
   *
   * @returns Array of pattern names
   */
  getPatternNames(): string[] {
    return Array.from(this.patterns.keys());
  }

  /**
   * Check if text contains any sensitive data
   *
   * @param text - Text to check for sensitive data
   * @returns true if sensitive data is detected
   *
   * @example
   * ```typescript
   * handler.isSensitive('My key is sk-abc123def456'); // true
   * handler.isSensitive('Hello world'); // false
   * ```
   */
  isSensitive(text: string): boolean {
    if (!text || typeof text !== "string") {
      return false;
    }

    for (const pattern of this.patterns.values()) {
      // Reset lastIndex for reuse
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(text)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Mask sensitive data in text
   *
   * Replaces detected sensitive data with a masked version that shows
   * the first 4 and last 4 characters with "..." in between.
   *
   * @param text - Text containing potentially sensitive data
   * @returns Text with sensitive data masked
   *
   * @example
   * ```typescript
   * handler.mask('Key: sk-proj-abc123456789xyz');
   * // Returns: 'Key: sk-p...9xyz'
   * ```
   */
  mask(text: string): string {
    if (!text || typeof text !== "string") {
      return text ?? "";
    }

    let result = text;

    for (const pattern of this.patterns.values()) {
      // Reset lastIndex for fresh matching
      pattern.regex.lastIndex = 0;
      result = result.replace(pattern.regex, (match) => this.maskValue(match));
    }

    return result;
  }

  /**
   * Mask a single sensitive value
   *
   * @param value - The sensitive value to mask
   * @returns Masked value showing first 4 and last 4 chars
   */
  private maskValue(value: string): string {
    const minLengthForMasking = 12;

    if (value.length <= minLengthForMasking) {
      // For short values, just show asterisks
      return "****";
    }

    const visibleChars = 4;
    const prefix = value.slice(0, visibleChars);
    const suffix = value.slice(-visibleChars);

    return `${prefix}...${suffix}`;
  }
}

// =============================================================================
// Default Patterns
// =============================================================================

/**
 * Default patterns for common sensitive data formats
 */
export const DEFAULT_SENSITIVE_PATTERNS: SensitivePattern[] = [
  // OpenAI API Keys (sk-proj-*, sk-*)
  {
    name: "openai-key",
    regex: /sk-(?:proj-)?[a-zA-Z0-9]{20,}/g,
  },

  // GitHub Personal Access Tokens (fine-grained)
  {
    name: "github-token-fine",
    regex: /ghp_[a-zA-Z0-9]{36}/g,
  },

  // GitHub Personal Access Tokens (classic with pat prefix)
  {
    name: "github-token-classic",
    regex: /github_pat_[a-zA-Z0-9_]{22,}/g,
  },

  // GitHub OAuth tokens
  {
    name: "github-oauth",
    regex: /gho_[a-zA-Z0-9]{36}/g,
  },

  // GitHub App tokens
  {
    name: "github-app",
    regex: /(?:ghu|ghs)_[a-zA-Z0-9]{36}/g,
  },

  // Anthropic API Keys
  {
    name: "anthropic-key",
    regex: /sk-ant-[a-zA-Z0-9-]{20,}/g,
  },

  // Google AI API Keys
  {
    name: "google-ai-key",
    regex: /AIza[a-zA-Z0-9_-]{35}/g,
  },

  // AWS Access Key IDs
  {
    name: "aws-access-key",
    regex: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g,
  },

  // AWS Secret Access Keys (40 char base64)
  {
    name: "aws-secret-key",
    regex: /(?<=aws_secret_access_key[\s]*[=:]\s*["']?)[a-zA-Z0-9/+=]{40}(?=["']?)/gi,
  },

  // Generic API key patterns (keyword + long alphanumeric)
  {
    name: "generic-api-key",
    regex:
      /(?:api[_-]?key|apikey|api[_-]?secret|secret[_-]?key)[\s]*[=:]\s*["']?([a-zA-Z0-9_-]{20,})["']?/gi,
  },

  // Bearer tokens in headers
  {
    name: "bearer-token",
    regex: /Bearer\s+[a-zA-Z0-9_-]{20,}/gi,
  },

  // Authorization headers with tokens
  {
    name: "auth-header",
    regex: /(?:Authorization|X-Api-Key|X-Auth-Token)[\s]*[=:]\s*["']?([a-zA-Z0-9_-]{20,})["']?/gi,
  },

  // Password patterns (password=value, pwd=value)
  {
    name: "password-assign",
    regex: /(?:password|passwd|pwd|pass)[\s]*[=:]\s*["']?([^\s"']{4,})["']?/gi,
  },

  // Connection strings with passwords
  {
    name: "connection-string-password",
    regex: /(?:mongodb|mysql|postgres|redis|amqp):\/\/[^:]+:([^@\s]{4,})@/gi,
  },

  // Private keys (PEM format markers)
  {
    name: "private-key",
    regex:
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
  },

  // NPM tokens
  {
    name: "npm-token",
    regex: /npm_[a-zA-Z0-9]{36}/g,
  },

  // Slack tokens
  {
    name: "slack-token",
    regex: /xox[baprs]-[a-zA-Z0-9-]{10,}/g,
  },

  // Discord tokens
  {
    name: "discord-token",
    regex: /[MN][a-zA-Z0-9_-]{23,}\.[a-zA-Z0-9_-]{6}\.[a-zA-Z0-9_-]{27,}/g,
  },

  // Stripe keys
  {
    name: "stripe-key",
    regex: /(?:sk|pk)_(?:test|live)_[a-zA-Z0-9]{24,}/g,
  },

  // Twilio keys
  {
    name: "twilio-key",
    regex: /SK[a-f0-9]{32}/g,
  },
];

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a SensitiveDataHandler with default patterns
 *
 * Includes patterns for:
 * - OpenAI API keys
 * - GitHub tokens (fine-grained and classic)
 * - Anthropic API keys
 * - Google AI keys
 * - AWS credentials
 * - Generic API keys and secrets
 * - Bearer tokens
 * - Passwords in various formats
 * - Private keys (PEM format)
 * - Various service tokens (Slack, Discord, Stripe, etc.)
 *
 * @returns SensitiveDataHandler configured with default patterns
 *
 * @example
 * ```typescript
 * const handler = createDefaultHandler();
 *
 * // Mask all sensitive data
 * const safe = handler.mask(logOutput);
 *
 * // Add custom pattern
 * handler.addPattern('my-service', /my-svc-[a-z0-9]{32}/gi);
 * ```
 */
export function createDefaultHandler(): SensitiveDataHandler {
  return new SensitiveDataHandler(DEFAULT_SENSITIVE_PATTERNS);
}
