// ============================================
// Custom Agent Error Classes
// ============================================

import { type ErrorCode, VellumError, type VellumErrorOptions } from "../../errors/types.js";

// ============================================
// Error Codes for Agent System
// ============================================

/**
 * Error codes specific to the custom agent system.
 *
 * Range: 6xxx - Agent errors
 */
export enum AgentErrorCode {
  /** Agent definition failed validation */
  AGENT_VALIDATION_ERROR = 6001,
  /** Requested agent was not found */
  AGENT_NOT_FOUND = 6002,
  /** Circular inheritance detected in agent chain */
  AGENT_CIRCULAR_INHERITANCE = 6003,
  /** Failed to parse agent definition file */
  AGENT_PARSE_ERROR = 6004,
  /** Agent definition file not found */
  AGENT_FILE_NOT_FOUND = 6005,
  /** Invalid agent slug format */
  AGENT_INVALID_SLUG = 6006,
  /** Agent spawn not allowed */
  AGENT_SPAWN_DENIED = 6007,
}

// ============================================
// Base Agent Error
// ============================================

/**
 * Options for creating agent errors.
 */
export interface AgentErrorOptions extends VellumErrorOptions {
  /** Agent slug related to the error */
  agentSlug?: string;
  /** File path where error occurred */
  filePath?: string;
}

/**
 * Base class for all agent-related errors.
 *
 * Extends VellumError with agent-specific context.
 */
export class AgentError extends VellumError {
  /** Agent slug related to this error */
  public readonly agentSlug?: string;
  /** File path where error occurred */
  public readonly filePath?: string;

  constructor(message: string, code: ErrorCode | AgentErrorCode, options?: AgentErrorOptions) {
    super(message, code as ErrorCode, options);
    this.name = "AgentError";
    this.agentSlug = options?.agentSlug;
    this.filePath = options?.filePath;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentError);
    }
  }
}

// ============================================
// Specific Error Classes (T007)
// ============================================

/**
 * Error thrown when agent definition validation fails.
 *
 * Contains validation errors from Zod schema validation.
 *
 * @example
 * ```typescript
 * const result = CustomAgentDefinitionSchema.safeParse(definition);
 * if (!result.success) {
 *   throw new AgentValidationError(
 *     "Invalid agent definition",
 *     result.error.issues,
 *     { agentSlug: "test-agent" }
 *   );
 * }
 * ```
 */
export class AgentValidationError extends AgentError {
  /** Array of validation issues */
  public readonly validationErrors: ValidationIssue[];

  constructor(message: string, validationErrors: ValidationIssue[], options?: AgentErrorOptions) {
    const errorContext = {
      ...options?.context,
      validationErrors,
    };
    super(message, AgentErrorCode.AGENT_VALIDATION_ERROR, {
      ...options,
      context: errorContext,
    });
    this.name = "AgentValidationError";
    this.validationErrors = validationErrors;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentValidationError);
    }
  }

  /**
   * Creates a formatted error message with all validation issues.
   */
  getFormattedErrors(): string {
    const lines = this.validationErrors.map((issue) => {
      const path = issue.path.join(".");
      return `  - ${path ? `${path}: ` : ""}${issue.message}`;
    });
    return `${this.message}:\n${lines.join("\n")}`;
  }
}

/**
 * Validation issue structure (compatible with Zod issues).
 */
export interface ValidationIssue {
  /** Path to the invalid field */
  path: (string | number)[];
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
}

/**
 * Error thrown when a requested agent is not found.
 *
 * @example
 * ```typescript
 * const agent = registry.get("unknown-agent");
 * if (!agent) {
 *   throw new AgentNotFoundError("unknown-agent");
 * }
 * ```
 */
export class AgentNotFoundError extends AgentError {
  constructor(agentSlug: string, options?: Omit<AgentErrorOptions, "agentSlug">) {
    super(`Agent not found: "${agentSlug}"`, AgentErrorCode.AGENT_NOT_FOUND, {
      ...options,
      agentSlug,
    });
    this.name = "AgentNotFoundError";

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentNotFoundError);
    }
  }
}

/**
 * Error thrown when circular inheritance is detected.
 *
 * Occurs when agent A extends B, B extends C, and C extends A.
 *
 * @example
 * ```typescript
 * // agent-a extends agent-b
 * // agent-b extends agent-c
 * // agent-c extends agent-a ← circular!
 * throw new AgentCircularInheritanceError(
 *   ["agent-a", "agent-b", "agent-c", "agent-a"]
 * );
 * ```
 */
export class AgentCircularInheritanceError extends AgentError {
  /** The inheritance chain that forms the cycle */
  public readonly inheritanceChain: string[];

  constructor(inheritanceChain: string[], options?: Omit<AgentErrorOptions, "agentSlug">) {
    const chainStr = inheritanceChain.join(" → ");
    const agentSlug = inheritanceChain[0];
    super(`Circular inheritance detected: ${chainStr}`, AgentErrorCode.AGENT_CIRCULAR_INHERITANCE, {
      ...options,
      agentSlug,
      context: {
        ...options?.context,
        inheritanceChain,
      },
    });
    this.name = "AgentCircularInheritanceError";
    this.inheritanceChain = inheritanceChain;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentCircularInheritanceError);
    }
  }
}

/**
 * Error thrown when parsing an agent definition file fails.
 *
 * @example
 * ```typescript
 * try {
 *   const yaml = parseYaml(content);
 * } catch (err) {
 *   throw new AgentParseError(
 *     "Failed to parse YAML frontmatter",
 *     { filePath: "agents/test.md", cause: err }
 *   );
 * }
 * ```
 */
export class AgentParseError extends AgentError {
  /** Line number where parse error occurred (if available) */
  public readonly lineNumber?: number;
  /** Column number where parse error occurred (if available) */
  public readonly column?: number;

  constructor(
    message: string,
    options?: AgentErrorOptions & {
      lineNumber?: number;
      column?: number;
    }
  ) {
    super(message, AgentErrorCode.AGENT_PARSE_ERROR, options);
    this.name = "AgentParseError";
    this.lineNumber = options?.lineNumber;
    this.column = options?.column;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentParseError);
    }
  }

  /**
   * Creates a formatted error message with location info.
   */
  getFormattedError(): string {
    const location =
      this.lineNumber !== undefined
        ? ` at line ${this.lineNumber}${this.column !== undefined ? `:${this.column}` : ""}`
        : "";
    const file = this.filePath ? ` in ${this.filePath}` : "";
    return `${this.message}${location}${file}`;
  }
}

// ============================================
// Error Factory Functions
// ============================================

/**
 * Creates an AgentValidationError from Zod validation result.
 *
 * @param zodError - Zod error object with issues
 * @param agentSlug - Optional agent slug for context
 * @returns AgentValidationError instance
 */
export function fromZodError(
  zodError: { issues: Array<{ path: (string | number)[]; message: string; code?: string }> },
  agentSlug?: string
): AgentValidationError {
  const issues: ValidationIssue[] = zodError.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  }));

  return new AgentValidationError("Agent definition validation failed", issues, { agentSlug });
}

/**
 * Type guard to check if an error is an AgentError.
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

/**
 * Type guard to check if an error is an AgentValidationError.
 */
export function isAgentValidationError(error: unknown): error is AgentValidationError {
  return error instanceof AgentValidationError;
}

/**
 * Type guard to check if an error is an AgentNotFoundError.
 */
export function isAgentNotFoundError(error: unknown): error is AgentNotFoundError {
  return error instanceof AgentNotFoundError;
}

/**
 * Type guard to check if an error is an AgentCircularInheritanceError.
 */
export function isAgentCircularInheritanceError(
  error: unknown
): error is AgentCircularInheritanceError {
  return error instanceof AgentCircularInheritanceError;
}

/**
 * Type guard to check if an error is an AgentParseError.
 */
export function isAgentParseError(error: unknown): error is AgentParseError {
  return error instanceof AgentParseError;
}
