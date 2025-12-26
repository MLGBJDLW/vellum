/**
 * Tool-related type definitions and schemas
 *
 * Defines the core tool system types including tool definitions,
 * execution context, and factory functions for creating typed tools.
 */

import { z } from "zod";

import type { Result } from "./result.js";

// =============================================================================
// T012: ToolKindSchema Enum
// =============================================================================

/**
 * Schema for tool categories/kinds
 *
 * - read: Tools that read data without side effects
 * - write: Tools that modify files or state
 * - shell: Tools that execute shell commands
 * - mcp: Model Context Protocol tools
 * - browser: Web browsing tools
 * - agent: Sub-agent invocation tools
 */
export const ToolKindSchema = z.enum(["read", "write", "shell", "mcp", "browser", "agent"]);

/** Inferred type for tool kinds */
export type ToolKind = z.infer<typeof ToolKindSchema>;

// =============================================================================
// T013: ToolDefinition Interface
// =============================================================================

/**
 * Definition of a tool's metadata and parameters
 *
 * @template TInput - Zod schema type for the tool's input parameters
 */
export interface ToolDefinition<TInput extends z.ZodType> {
  /** Unique identifier for the tool */
  name: string;
  /** Human-readable description for LLM context */
  description: string;
  /** Zod schema defining and validating input parameters */
  parameters: TInput;
  /** Category of tool determining permissions and behavior */
  kind: ToolKind;
  /** Optional grouping category for organization */
  category?: string;
  /** Whether the tool is enabled (default: true) */
  enabled?: boolean;
}

// =============================================================================
// T014: ToolContext Interface
// =============================================================================

/**
 * Execution context passed to tool invocations
 *
 * Provides environmental information and utilities for tool execution.
 */
export interface ToolContext {
  /** Current working directory for the tool */
  workingDir: string;
  /** Identifier for the current session */
  sessionId: string;
  /** Identifier for the message that triggered this tool call */
  messageId: string;
  /** Unique identifier for this specific tool call */
  callId: string;
  /** Signal for cancellation support */
  abortSignal: AbortSignal;
  /**
   * Check if an action is permitted
   *
   * @param action - The action being requested
   * @param resource - Optional resource the action targets
   * @returns Promise resolving to whether the action is permitted
   */
  checkPermission(action: string, resource?: string): Promise<boolean>;
}

// =============================================================================
// T015: ToolResult Interface and Helpers
// =============================================================================

/**
 * Result of a tool execution
 *
 * Discriminated union representing either success with output
 * or failure with an error message.
 *
 * @template T - Type of the output on success
 */
export type ToolResult<T> = { success: true; output: T } | { success: false; error: string };

/**
 * Create a successful tool result
 *
 * @template T - Type of the output value
 * @param output - The successful output value
 * @returns ToolResult indicating success with the output
 *
 * @example
 * ```typescript
 * const result = ok({ files: ["a.txt", "b.txt"] });
 * // { success: true, output: { files: ["a.txt", "b.txt"] } }
 * ```
 */
export function ok<T>(output: T): ToolResult<T> {
  return { success: true, output };
}

/**
 * Create a failed tool result
 *
 * @param error - Error message describing the failure
 * @returns ToolResult indicating failure with the error
 *
 * @example
 * ```typescript
 * const result = fail("File not found");
 * // { success: false, error: "File not found" }
 * ```
 */
export function fail(error: string): ToolResult<never> {
  return { success: false, error };
}

// =============================================================================
// T016: Tool Interface
// =============================================================================

/**
 * Complete tool interface with definition and execution
 *
 * @template TInput - Zod schema type for input parameters
 * @template TOutput - Type of successful execution output
 */
export interface Tool<TInput extends z.ZodType, TOutput> {
  /** Tool metadata and parameter schema */
  definition: ToolDefinition<TInput>;

  /**
   * Execute the tool with validated input
   *
   * @param input - Validated input matching the parameters schema
   * @param ctx - Execution context
   * @returns Promise resolving to the tool result
   */
  execute(input: z.infer<TInput>, ctx: ToolContext): Promise<ToolResult<TOutput>>;

  /**
   * Optional: Check if this tool call requires user confirmation
   *
   * @param input - The input parameters
   * @param ctx - Execution context
   * @returns Whether confirmation is required
   */
  shouldConfirm?(input: z.infer<TInput>, ctx: ToolContext): boolean;

  /**
   * Optional: Additional validation beyond Zod schema
   *
   * @param input - The input parameters to validate
   * @returns Result indicating validation success or failure reason
   */
  validate?(input: z.infer<TInput>): Result<void, string>;
}

// =============================================================================
// T017: defineTool Factory Function
// =============================================================================

/**
 * Configuration for creating a tool via the factory function
 *
 * @template TInput - Zod schema type for input parameters
 * @template TOutput - Type of successful execution output
 */
export interface DefineToolConfig<TInput extends z.ZodType, TOutput> {
  /** Unique identifier for the tool */
  name: string;
  /** Human-readable description for LLM context */
  description: string;
  /** Zod schema defining and validating input parameters */
  parameters: TInput;
  /** Category of tool determining permissions and behavior */
  kind: ToolKind;
  /** Optional grouping category for organization */
  category?: string;
  /** Whether the tool is enabled (default: true) */
  enabled?: boolean;
  /**
   * Execute the tool with validated input
   *
   * @param input - Validated input matching the parameters schema
   * @param ctx - Execution context
   * @returns Promise resolving to the tool result
   */
  execute: (input: z.infer<TInput>, ctx: ToolContext) => Promise<ToolResult<TOutput>>;
  /**
   * Optional: Check if this tool call requires user confirmation
   *
   * @param input - The input parameters
   * @param ctx - Execution context
   * @returns Whether confirmation is required
   */
  shouldConfirm?: (input: z.infer<TInput>, ctx: ToolContext) => boolean;
  /**
   * Optional: Additional validation beyond Zod schema
   *
   * @param input - The input parameters to validate
   * @returns Result indicating validation success or failure reason
   */
  validate?: (input: z.infer<TInput>) => Result<void, string>;
}

/**
 * Factory function to create a typed tool
 *
 * Provides a convenient way to define tools with full type inference
 * from the Zod parameter schema.
 *
 * @template TInput - Zod schema type for input parameters (inferred)
 * @template TOutput - Type of successful execution output (inferred)
 * @param config - Tool configuration including definition and handlers
 * @returns A fully typed Tool instance
 *
 * @example
 * ```typescript
 * const readFileTool = defineTool({
 *   name: "read_file",
 *   description: "Read contents of a file",
 *   parameters: z.object({
 *     path: z.string().describe("Path to the file"),
 *   }),
 *   kind: "read",
 *   async execute(input, ctx) {
 *     const content = await fs.readFile(input.path, "utf-8");
 *     return ok({ content });
 *   },
 * });
 * ```
 */
export function defineTool<TInput extends z.ZodType, TOutput>(
  config: DefineToolConfig<TInput, TOutput>
): Tool<TInput, TOutput> {
  const {
    name,
    description,
    parameters,
    kind,
    category,
    enabled = true,
    execute,
    shouldConfirm,
    validate,
  } = config;

  return {
    definition: {
      name,
      description,
      parameters,
      kind,
      category,
      enabled,
    },
    execute,
    ...(shouldConfirm && { shouldConfirm }),
    ...(validate && { validate }),
  };
}
