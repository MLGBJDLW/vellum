// ============================================
// Tool Executor - T012, T013
// ============================================

import type { z } from "zod";

import { ErrorCode, VellumError } from "../errors/index.js";
import type { Tool, ToolContext, ToolResult } from "../types/tool.js";

// =============================================================================
// T013: Permission Types
// =============================================================================

/**
 * Permission check result.
 *
 * - allow: Tool execution can proceed immediately
 * - ask: User confirmation is required before execution
 * - deny: Tool execution is forbidden
 */
export type PermissionDecision = "allow" | "ask" | "deny";

/**
 * Permission checker interface for tool execution.
 *
 * Implementations can provide custom permission logic based on
 * tool name, parameters, and execution context.
 */
export interface PermissionChecker {
  /**
   * Check if a tool execution is permitted.
   *
   * @param toolName - Name of the tool being executed
   * @param params - Parameters passed to the tool
   * @param context - Tool execution context
   * @returns Permission decision
   */
  checkPermission(
    toolName: string,
    params: unknown,
    context: ToolContext
  ): Promise<PermissionDecision>;
}

/**
 * Error thrown when tool execution is denied due to permissions.
 *
 * This error has USER_ACTION severity, meaning the user needs to
 * grant permission before the operation can proceed.
 */
export class PermissionDeniedError extends VellumError {
  public readonly toolName: string;

  constructor(toolName: string, message?: string) {
    super(
      message ?? `Permission denied for tool: ${toolName}`,
      ErrorCode.TOOL_PERMISSION_DENIED,
      {
        context: { toolName },
        isRetryable: false,
      }
    );
    this.name = "PermissionDeniedError";
    this.toolName = toolName;
  }
}

/**
 * Error thrown when a requested tool is not found in the registry.
 */
export class ToolNotFoundError extends VellumError {
  public readonly toolName: string;

  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, ErrorCode.TOOL_NOT_FOUND, {
      context: { toolName },
      isRetryable: false,
    });
    this.name = "ToolNotFoundError";
    this.toolName = toolName;
  }
}

/**
 * Error thrown when tool execution fails.
 */
export class ToolExecutionError extends VellumError {
  public readonly toolName: string;

  constructor(toolName: string, message: string, cause?: Error) {
    super(`Tool execution failed [${toolName}]: ${message}`, ErrorCode.TOOL_EXECUTION_FAILED, {
      context: { toolName },
      cause,
      isRetryable: false,
    });
    this.name = "ToolExecutionError";
    this.toolName = toolName;
  }
}

// =============================================================================
// T012: ToolExecutor Result with Timing
// =============================================================================

/**
 * Extended tool result with execution metadata.
 */
export interface ExecutionResult<T = unknown> {
  /** The tool result (success or failure) */
  result: ToolResult<T>;
  /** Execution timing metadata */
  timing: {
    /** Start timestamp in milliseconds */
    startedAt: number;
    /** End timestamp in milliseconds */
    completedAt: number;
    /** Total duration in milliseconds */
    durationMs: number;
  };
  /** Name of the executed tool */
  toolName: string;
  /** Unique call identifier */
  callId: string;
}

// =============================================================================
// T012, T013: ToolExecutor Class
// =============================================================================

/**
 * Configuration for ToolExecutor.
 */
export interface ToolExecutorConfig {
  /**
   * Optional permission checker for tool execution.
   * If not provided, all tools are allowed by default.
   */
  permissionChecker?: PermissionChecker;

  /**
   * Default timeout for tool execution in milliseconds.
   * Default: 30000 (30 seconds)
   */
  defaultTimeout?: number;
}

/**
 * ToolExecutor manages tool registration and execution.
 *
 * Features:
 * - Case-insensitive tool lookup
 * - Permission checking before execution
 * - Execution timing metadata
 * - Graceful error handling
 *
 * @example
 * ```typescript
 * const executor = new ToolExecutor();
 *
 * // Register tools
 * executor.registerTool(readFileTool);
 * executor.registerTool(writeFileTool);
 *
 * // Execute a tool
 * const result = await executor.execute("read_file", { path: "/etc/hosts" }, context);
 * if (result.result.success) {
 *   console.log(result.result.output);
 * }
 * ```
 */
export class ToolExecutor {
  /** Tool registry (lowercase name -> tool) */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  private readonly tools = new Map<string, Tool<z.ZodType, any>>();

  /** Original case-preserved names for display */
  private readonly originalNames = new Map<string, string>();

  /** Permission checker for authorization */
  private readonly permissionChecker?: PermissionChecker;

  constructor(config: ToolExecutorConfig = {}) {
    this.permissionChecker = config.permissionChecker;
  }

  /**
   * Register a tool with the executor.
   *
   * Tools are stored with case-insensitive names for lookup,
   * but original casing is preserved for display purposes.
   *
   * @param tool - Tool to register
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  registerTool(tool: Tool<z.ZodType, any>): void {
    const name = tool.definition.name;
    const normalizedName = name.toLowerCase();

    this.tools.set(normalizedName, tool);
    this.originalNames.set(normalizedName, name);
  }

  /**
   * Get a tool by name (case-insensitive).
   *
   * @param name - Tool name to look up
   * @returns Tool if found, undefined otherwise
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  getTool(name: string): Tool<z.ZodType, any> | undefined {
    return this.tools.get(name.toLowerCase());
  }

  /**
   * Check if a tool is registered.
   *
   * @param name - Tool name to check (case-insensitive)
   * @returns true if tool is registered
   */
  hasTool(name: string): boolean {
    return this.tools.has(name.toLowerCase());
  }

  /**
   * Get all registered tools.
   *
   * @returns Array of registered tools
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  listTools(): Tool<z.ZodType, any>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get original (case-preserved) name for a tool.
   *
   * @param name - Tool name (case-insensitive)
   * @returns Original cased name, or input if not found
   */
  getOriginalName(name: string): string {
    return this.originalNames.get(name.toLowerCase()) ?? name;
  }

  /**
   * Check permission for tool execution.
   *
   * @param toolName - Name of the tool
   * @param params - Tool parameters
   * @param context - Execution context
   * @returns Permission decision
   */
  async checkPermission(
    toolName: string,
    params: unknown,
    context: ToolContext
  ): Promise<PermissionDecision> {
    // If no permission checker, allow all
    if (!this.permissionChecker) {
      return "allow";
    }

    return this.permissionChecker.checkPermission(toolName, params, context);
  }

  /**
   * Execute a tool by name.
   *
   * This method:
   * 1. Looks up the tool (case-insensitive)
   * 2. Validates parameters against the tool's schema
   * 3. Checks permissions (if checker configured)
   * 4. Executes the tool
   * 5. Returns result with timing metadata
   *
   * @param name - Tool name (case-insensitive)
   * @param params - Parameters to pass to the tool
   * @param context - Execution context
   * @returns Execution result with timing metadata
   * @throws ToolNotFoundError if tool doesn't exist
   * @throws PermissionDeniedError if permission is denied
   */
  async execute(
    name: string,
    params: unknown,
    context: ToolContext
  ): Promise<ExecutionResult> {
    const startedAt = Date.now();

    // Look up tool (case-insensitive)
    const tool = this.getTool(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }

    // Check permission
    const permission = await this.checkPermission(name, params, context);

    if (permission === "deny") {
      throw new PermissionDeniedError(name);
    }

    if (permission === "ask") {
      // Return a special result indicating permission is needed
      // The caller (AgentLoop) should handle this by transitioning to wait_permission
      throw new PermissionDeniedError(
        name,
        `User confirmation required for tool: ${name}`
      );
    }

    // Validate parameters
    const parseResult = tool.definition.parameters.safeParse(params);
    if (!parseResult.success) {
      const completedAt = Date.now();
      return {
        result: {
          success: false,
          error: `Validation failed: ${parseResult.error.message}`,
        },
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
        },
        toolName: this.getOriginalName(name),
        callId: context.callId,
      };
    }

    // Run additional validation if provided
    if (tool.validate) {
      const validationResult = tool.validate(parseResult.data);
      if (!validationResult.ok) {
        const completedAt = Date.now();
        return {
          result: {
            success: false,
            error: `Validation failed: ${validationResult.error}`,
          },
          timing: {
            startedAt,
            completedAt,
            durationMs: completedAt - startedAt,
          },
          toolName: this.getOriginalName(name),
          callId: context.callId,
        };
      }
    }

    // Execute tool
    try {
      const result = await tool.execute(parseResult.data, context);
      const completedAt = Date.now();

      return {
        result,
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
        },
        toolName: this.getOriginalName(name),
        callId: context.callId,
      };
    } catch (error) {
      const completedAt = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        result: {
          success: false,
          error: errorMessage,
        },
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt - startedAt,
        },
        toolName: this.getOriginalName(name),
        callId: context.callId,
      };
    }
  }

  /**
   * Execute a tool with permission "ask" handling.
   *
   * This is a convenience method that returns a discriminated union
   * indicating whether permission is needed or execution completed.
   *
   * @param name - Tool name (case-insensitive)
   * @param params - Parameters to pass to the tool
   * @param context - Execution context
   * @returns Execution status and result
   */
  async executeWithPermissionCheck(
    name: string,
    params: unknown,
    context: ToolContext
  ): Promise<
    | { status: "completed"; result: ExecutionResult }
    | { status: "permission_required"; toolName: string; params: unknown }
    | { status: "denied"; toolName: string; error: string }
    | { status: "not_found"; toolName: string }
  > {
    // Look up tool
    const tool = this.getTool(name);
    if (!tool) {
      return { status: "not_found", toolName: name };
    }

    // Check permission
    const permission = await this.checkPermission(name, params, context);

    if (permission === "deny") {
      return {
        status: "denied",
        toolName: name,
        error: `Permission denied for tool: ${name}`,
      };
    }

    if (permission === "ask") {
      return {
        status: "permission_required",
        toolName: name,
        params,
      };
    }

    // Permission allowed - execute
    try {
      const result = await this.execute(name, params, context);
      return { status: "completed", result };
    } catch (error) {
      // This shouldn't happen since we already checked permission,
      // but handle it gracefully
      if (error instanceof PermissionDeniedError) {
        return {
          status: "denied",
          toolName: name,
          error: error.message,
        };
      }
      if (error instanceof ToolNotFoundError) {
        return { status: "not_found", toolName: name };
      }
      throw error;
    }
  }
}
