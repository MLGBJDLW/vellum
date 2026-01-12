// ============================================
// Prompt System Errors
// ============================================

/**
 * Error codes and classes for the prompt system.
 *
 * Provides structured error handling with specific error codes
 * for different failure scenarios in prompt discovery, parsing,
 * and loading operations.
 *
 * @module @vellum/core/prompts/errors
 * @see REQ-014
 */

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Error codes for prompt system failures.
 *
 * Each code represents a specific failure scenario:
 * - `PROMPT_NOT_FOUND`: Requested prompt does not exist in any source
 * - `PROMPT_YAML_ERROR`: YAML frontmatter parsing failed
 * - `PROMPT_PARSE_ERROR`: Markdown content parsing failed
 * - `PROMPT_VARIABLE_ERROR`: Variable interpolation failed
 * - `PROMPT_SCHEMA_ERROR`: Frontmatter validation against schema failed
 * - `PROMPT_LOAD_ERROR`: General file loading error
 */
export const PromptErrorCode = {
  /** Requested prompt does not exist in any source */
  PROMPT_NOT_FOUND: "PROMPT_NOT_FOUND",
  /** YAML frontmatter parsing failed */
  PROMPT_YAML_ERROR: "PROMPT_YAML_ERROR",
  /** Markdown content parsing failed */
  PROMPT_PARSE_ERROR: "PROMPT_PARSE_ERROR",
  /** Variable interpolation failed */
  PROMPT_VARIABLE_ERROR: "PROMPT_VARIABLE_ERROR",
  /** Frontmatter validation against schema failed */
  PROMPT_SCHEMA_ERROR: "PROMPT_SCHEMA_ERROR",
  /** General file loading error */
  PROMPT_LOAD_ERROR: "PROMPT_LOAD_ERROR",
} as const;

/**
 * Type for prompt error code values.
 */
export type PromptErrorCodeType = keyof typeof PromptErrorCode;

// =============================================================================
// Error Class
// =============================================================================

/**
 * Custom error class for prompt system failures.
 *
 * Provides structured error information including:
 * - Specific error code for programmatic handling
 * - Human-readable message
 * - Optional context object with additional details
 *
 * @example
 * ```typescript
 * throw new PromptError(
 *   'PROMPT_NOT_FOUND',
 *   'Prompt "coder" not found in any source',
 *   { name: 'coder', searchedPaths: ['.vellum/prompts/', '~/.vellum/prompts/'] }
 * );
 * ```
 *
 * @example
 * ```typescript
 * try {
 *   await loader.load('invalid-prompt');
 * } catch (error) {
 *   if (error instanceof PromptError) {
 *     switch (error.code) {
 *       case 'PROMPT_NOT_FOUND':
 *         console.log('Prompt not found:', error.context);
 *         break;
 *       case 'PROMPT_YAML_ERROR':
 *         console.log('Invalid YAML:', error.message);
 *         break;
 *     }
 *   }
 * }
 * ```
 */
export class PromptError extends Error {
  /**
   * The specific error code identifying the failure type.
   */
  public readonly code: PromptErrorCodeType;

  /**
   * Optional context object with additional error details.
   * Contains relevant information for debugging and error reporting.
   */
  public readonly context?: Record<string, unknown>;

  /**
   * Creates a new PromptError instance.
   *
   * @param code - The error code identifying the failure type
   * @param message - Human-readable error message
   * @param context - Optional context object with additional details
   */
  constructor(code: PromptErrorCodeType, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "PromptError";
    this.code = code;
    this.context = context;

    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PromptError);
    }
  }

  /**
   * Returns a string representation of the error.
   * Includes the error code for easier identification in logs.
   */
  override toString(): string {
    return `[${this.code}] ${this.message}`;
  }

  /**
   * Converts the error to a plain object for serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack,
    };
  }
}

// =============================================================================
// Error Factory Functions
// =============================================================================

/**
 * Creates a PROMPT_NOT_FOUND error.
 *
 * @param name - The name of the prompt that was not found
 * @param searchedPaths - List of paths that were searched
 * @returns A PromptError with the PROMPT_NOT_FOUND code
 */
export function promptNotFoundError(name: string, searchedPaths?: string[]): PromptError {
  return new PromptError("PROMPT_NOT_FOUND", `Prompt "${name}" not found in any source`, {
    name,
    searchedPaths,
  });
}

/**
 * Creates a PROMPT_YAML_ERROR error.
 *
 * @param path - The file path where YAML parsing failed
 * @param reason - The reason for the parsing failure
 * @returns A PromptError with the PROMPT_YAML_ERROR code
 */
export function promptYamlError(path: string, reason: string): PromptError {
  return new PromptError("PROMPT_YAML_ERROR", `Invalid YAML frontmatter in "${path}": ${reason}`, {
    path,
    reason,
  });
}

/**
 * Creates a PROMPT_PARSE_ERROR error.
 *
 * @param path - The file path where parsing failed
 * @param reason - The reason for the parsing failure
 * @returns A PromptError with the PROMPT_PARSE_ERROR code
 */
export function promptParseError(path: string, reason: string): PromptError {
  return new PromptError("PROMPT_PARSE_ERROR", `Failed to parse prompt "${path}": ${reason}`, {
    path,
    reason,
  });
}

/**
 * Creates a PROMPT_VARIABLE_ERROR error.
 *
 * @param variable - The variable name that caused the error
 * @param reason - The reason for the variable error
 * @returns A PromptError with the PROMPT_VARIABLE_ERROR code
 */
export function promptVariableError(variable: string, reason: string): PromptError {
  return new PromptError(
    "PROMPT_VARIABLE_ERROR",
    `Variable interpolation failed for "${variable}": ${reason}`,
    {
      variable,
      reason,
    }
  );
}

/**
 * Creates a PROMPT_SCHEMA_ERROR error.
 *
 * @param path - The file path where schema validation failed
 * @param issues - List of schema validation issues
 * @returns A PromptError with the PROMPT_SCHEMA_ERROR code
 */
export function promptSchemaError(path: string, issues: string[]): PromptError {
  return new PromptError(
    "PROMPT_SCHEMA_ERROR",
    `Schema validation failed for "${path}": ${issues.join(", ")}`,
    {
      path,
      issues,
    }
  );
}

/**
 * Creates a PROMPT_LOAD_ERROR error.
 *
 * @param path - The file path that failed to load
 * @param reason - The reason for the load failure
 * @returns A PromptError with the PROMPT_LOAD_ERROR code
 */
export function promptLoadError(path: string, reason: string): PromptError {
  return new PromptError("PROMPT_LOAD_ERROR", `Failed to load prompt "${path}": ${reason}`, {
    path,
    reason,
  });
}
