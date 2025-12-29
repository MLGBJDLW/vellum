// ============================================
// Tool Executor - T012, T013, T024, T025, T035, T037a
// ============================================

import type { z } from "zod";

import { ErrorCode, VellumError } from "../errors/index.js";
import type { IGitSnapshotService } from "../git/types.js";
import { createDefaultPermissionChecker } from "../permission/checker.js";
import type { Tool, ToolContext, ToolResult } from "../types/tool.js";

// =============================================================================
// T037a: Structured Logging Types
// =============================================================================

/**
 * Structured log entry for tool execution.
 */
export interface ToolExecutionLog {
  /** Name of the tool being executed */
  tool: string;
  /** Sanitized parameters (sensitive data redacted) */
  params: Record<string, unknown>;
  /** Type of result (success, failure, timeout, aborted) */
  resultType: "success" | "failure" | "timeout" | "aborted";
  /** Duration of execution in milliseconds */
  durationMs: number;
  /** Error message if execution failed */
  error?: string;
  /** Unique call identifier */
  callId: string;
  /** Timestamp of execution start */
  timestamp: string;
}

/**
 * Logger interface for tool execution logging.
 */
export interface ExecutionLogger {
  /**
   * Log a tool execution event.
   *
   * @param entry - Structured log entry
   */
  logExecution(entry: ToolExecutionLog): void;
}

/**
 * Default console logger for tool execution.
 */
export const defaultExecutionLogger: ExecutionLogger = {
  logExecution(entry: ToolExecutionLog): void {
    const logFn = entry.resultType === "success" ? console.debug : console.warn;
    logFn("[ToolExecutor]", JSON.stringify(entry));
  },
};

/**
 * Sanitize parameters for logging by redacting sensitive content.
 *
 * @param params - Raw parameters
 * @param toolName - Tool name for context-aware sanitization
 * @returns Sanitized parameters safe for logging
 */
export function sanitizeParamsForLogging(
  params: unknown,
  _toolName: string
): Record<string, unknown> {
  if (!params || typeof params !== "object") {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const sensitive = new Set([
    "content",
    "data",
    "body",
    "text",
    "secret",
    "password",
    "token",
    "key",
    "auth",
    "credential",
    "diff",
    "patch",
    "search",
    "replace",
  ]);

  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    // Redact sensitive fields
    if (sensitive.has(lowerKey)) {
      if (typeof value === "string") {
        sanitized[key] = `[REDACTED: ${value.length} chars]`;
      } else if (Array.isArray(value)) {
        sanitized[key] = `[REDACTED: ${value.length} items]`;
      } else {
        sanitized[key] = "[REDACTED]";
      }
    }
    // Include non-sensitive fields
    else if (typeof value === "string") {
      // Truncate long strings
      sanitized[key] = value.length > 200 ? `${value.slice(0, 200)}...` : value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = `[Array: ${value.length} items]`;
    } else {
      sanitized[key] = "[Object]";
    }
  }

  return sanitized;
}

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
    super(message ?? `Permission denied for tool: ${toolName}`, ErrorCode.TOOL_PERMISSION_DENIED, {
      context: { toolName },
      isRetryable: false,
    });
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
// T008: Timeout Error
// =============================================================================

/**
 * Error thrown when tool execution times out.
 */
export class ToolTimeoutError extends VellumError {
  public readonly toolName: string;
  public readonly timeoutMs: number;
  public readonly partialOutput?: unknown;

  constructor(toolName: string, timeoutMs: number, partialOutput?: unknown) {
    super(`Tool execution timed out after ${timeoutMs}ms: ${toolName}`, ErrorCode.TOOL_TIMEOUT, {
      context: { toolName, timeoutMs, hasPartialOutput: partialOutput !== undefined },
      isRetryable: true,
      retryDelay: 1000,
    });
    this.name = "ToolTimeoutError";
    this.toolName = toolName;
    this.timeoutMs = timeoutMs;
    this.partialOutput = partialOutput;
  }
}

// =============================================================================
// T009: Abort Error
// =============================================================================

/**
 * Error thrown when tool execution is aborted via AbortSignal.
 */
export class ToolAbortedError extends VellumError {
  public readonly toolName: string;
  public readonly partialOutput?: unknown;

  constructor(toolName: string, partialOutput?: unknown) {
    super(`Tool execution was aborted: ${toolName}`, ErrorCode.TOOL_ABORTED, {
      context: { toolName, hasPartialOutput: partialOutput !== undefined },
      isRetryable: false,
    });
    this.name = "ToolAbortedError";
    this.toolName = toolName;
    this.partialOutput = partialOutput;
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
  /** Whether execution was aborted */
  aborted?: boolean;
  /** Whether execution timed out */
  timedOut?: boolean;
  /** T025: Git snapshot hash taken before tool execution (if enabled) */
  preToolSnapshot?: string;
  /** T025: List of files changed by tool execution (if snapshot enabled) */
  changedFiles?: string[];
}

// =============================================================================
// T008, T009: Execute Options
// =============================================================================

/**
 * Options for individual tool execution.
 */
export interface ExecuteOptions {
  /**
   * Timeout for this execution in milliseconds.
   * Overrides the default timeout.
   */
  timeout?: number;

  /**
   * AbortSignal for cancellation support.
   * When aborted, execution will be cancelled and return TOOL_ABORTED error.
   */
  abortSignal?: AbortSignal;
}

// =============================================================================
// T008: Default Timeouts
// =============================================================================

/** Default timeout for most tools (30 seconds) */
export const DEFAULT_TIMEOUT_MS = 30_000;

/** Extended timeout for shell tools (120 seconds) */
export const SHELL_TIMEOUT_MS = 120_000;

// =============================================================================
// T012, T013, T035: ToolExecutor Class
// =============================================================================

/**
 * Configuration for ToolExecutor.
 */
export interface ToolExecutorConfig {
  /**
   * Optional permission checker for tool execution.
   * If not provided and useDefaultPermissionChecker is false,
   * all tools are allowed by default.
   */
  permissionChecker?: PermissionChecker;

  /**
   * Whether to use the default permission checker when no explicit
   * permissionChecker is provided.
   *
   * When true, creates a DefaultPermissionChecker instance.
   * Default: false (for backward compatibility)
   *
   * @see createDefaultPermissionChecker
   */
  useDefaultPermissionChecker?: boolean;

  /**
   * Default timeout for tool execution in milliseconds.
   * Default: 30000 (30 seconds)
   */
  defaultTimeout?: number;

  /**
   * Timeout for shell tools in milliseconds.
   * Default: 120000 (120 seconds)
   */
  shellTimeout?: number;

  /**
   * Optional logger for structured execution logging.
   * If not provided, uses defaultExecutionLogger (console.debug).
   */
  logger?: ExecutionLogger;

  /**
   * Whether to enable execution logging.
   * Default: true
   */
  enableLogging?: boolean;

  /**
   * T024: Optional git snapshot service for tracking file changes.
   * When provided, snapshots are taken before tool execution and
   * changed files are detected after execution.
   */
  gitSnapshotService?: IGitSnapshotService;
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

  /** Default timeout for tool execution */
  private readonly defaultTimeout: number;

  /** Timeout for shell tools */
  private readonly shellTimeout: number;

  /** Logger for structured execution logging */
  private readonly logger: ExecutionLogger;

  /** Whether logging is enabled */
  private readonly enableLogging: boolean;

  /** T024: Optional git snapshot service for tracking file changes */
  private readonly gitSnapshotService?: IGitSnapshotService;

  constructor(config: ToolExecutorConfig = {}) {
    // T035: Use default permission checker if requested and no explicit checker provided
    if (config.permissionChecker) {
      this.permissionChecker = config.permissionChecker;
    } else if (config.useDefaultPermissionChecker) {
      this.permissionChecker = createDefaultPermissionChecker();
    }
    // Otherwise leave undefined (allow all)

    this.defaultTimeout = config.defaultTimeout ?? DEFAULT_TIMEOUT_MS;
    this.shellTimeout = config.shellTimeout ?? SHELL_TIMEOUT_MS;
    this.logger = config.logger ?? defaultExecutionLogger;
    this.enableLogging = config.enableLogging ?? true;
    // T024: Store git snapshot service reference
    this.gitSnapshotService = config.gitSnapshotService;
  }

  /**
   * Log a tool execution event.
   *
   * @param entry - Execution log entry
   */
  private logExecution(entry: ToolExecutionLog): void {
    if (this.enableLogging) {
      this.logger.logExecution(entry);
    }
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
   * 4. Executes the tool with timeout and abort support
   * 5. Returns result with timing metadata
   *
   * @param name - Tool name (case-insensitive)
   * @param params - Parameters to pass to the tool
   * @param context - Execution context
   * @param options - Optional execution options (timeout, abortSignal)
   * @returns Execution result with timing metadata
   * @throws ToolNotFoundError if tool doesn't exist
   * @throws PermissionDeniedError if permission is denied
   */
  async execute(
    name: string,
    params: unknown,
    context: ToolContext,
    options?: ExecuteOptions
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
      throw new PermissionDeniedError(name, `User confirmation required for tool: ${name}`);
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

    // T008, T009: Execute with timeout and abort signal support
    const timeout = options?.timeout ?? this.getTimeoutForTool(tool);
    const abortSignal = options?.abortSignal ?? context.abortSignal;

    // T024: Take pre-tool snapshot if git snapshot service is available
    let preToolSnapshot: string | undefined;
    if (this.gitSnapshotService) {
      try {
        const trackResult = await this.gitSnapshotService.track();
        if (trackResult.ok && trackResult.value) {
          preToolSnapshot = trackResult.value;
        }
      } catch {
        // Gracefully ignore snapshot errors - don't block tool execution
      }
    }

    const executionResult = await this.executeWithTimeoutAndAbort(
      tool,
      parseResult.data,
      context,
      startedAt,
      timeout,
      abortSignal
    );

    // T024: Detect changed files if we have a pre-tool snapshot
    if (preToolSnapshot && this.gitSnapshotService) {
      try {
        const patchResult = await this.gitSnapshotService.patch(preToolSnapshot);
        if (patchResult.ok) {
          executionResult.preToolSnapshot = preToolSnapshot;
          executionResult.changedFiles = patchResult.value.files.map((f) => f.path);
        }
      } catch {
        // Gracefully ignore patch errors - result is still valid
        executionResult.preToolSnapshot = preToolSnapshot;
      }
    }

    return executionResult;
  }

  /**
   * Get the appropriate timeout for a tool based on its kind.
   *
   * @param tool - The tool to get timeout for
   * @returns Timeout in milliseconds
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  private getTimeoutForTool(tool: Tool<z.ZodType, any>): number {
    return tool.definition.kind === "shell" ? this.shellTimeout : this.defaultTimeout;
  }

  /**
   * Execute a tool with timeout and abort signal handling.
   *
   * @param tool - Tool to execute
   * @param input - Validated input
   * @param context - Execution context
   * @param startedAt - Start timestamp
   * @param timeout - Timeout in milliseconds
   * @param abortSignal - Optional abort signal
   * @returns Execution result
   */
  // biome-ignore lint/suspicious/noExplicitAny: Tools have varying input/output types
  private async executeWithTimeoutAndAbort(
    tool: Tool<z.ZodType, any>,
    input: unknown,
    context: ToolContext,
    startedAt: number,
    timeout: number,
    abortSignal?: AbortSignal
  ): Promise<ExecutionResult> {
    const toolName = this.getOriginalName(tool.definition.name);
    const sanitizedParams = sanitizeParamsForLogging(input, toolName);
    const timestamp = new Date().toISOString();

    // Helper to create and log execution result
    const createResult = (
      result: ToolResult<unknown>,
      completedAt: number,
      options: { aborted?: boolean; timedOut?: boolean } = {}
    ): ExecutionResult => {
      const durationMs = completedAt - startedAt;
      const resultType: ToolExecutionLog["resultType"] = options.timedOut
        ? "timeout"
        : options.aborted
          ? "aborted"
          : result.success
            ? "success"
            : "failure";

      // T037a: Log execution
      this.logExecution({
        tool: toolName,
        params: sanitizedParams,
        resultType,
        durationMs,
        error: result.success ? undefined : result.error,
        callId: context.callId,
        timestamp,
      });

      return {
        result,
        timing: {
          startedAt,
          completedAt,
          durationMs,
        },
        toolName,
        callId: context.callId,
        aborted: options.aborted,
        timedOut: options.timedOut,
      };
    };

    // Check if already aborted
    if (abortSignal?.aborted) {
      const completedAt = Date.now();
      return createResult(
        { success: false, error: `Tool execution aborted: ${toolName}` },
        completedAt,
        { aborted: true }
      );
    }

    // Create an internal abort controller for timeout
    const timeoutController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Set up abort signal listener
    const abortHandler = () => {
      timeoutController.abort();
    };
    abortSignal?.addEventListener("abort", abortHandler);

    try {
      // Create promise for tool execution
      const executionPromise = tool.execute(input, context);

      // Create promise for timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          timeoutController.abort();
          reject(new ToolTimeoutError(toolName, timeout));
        }, timeout);
      });

      // Create promise for abort signal
      const abortPromise = abortSignal
        ? new Promise<never>((_, reject) => {
            if (abortSignal.aborted) {
              reject(new ToolAbortedError(toolName));
            }
            const onAbort = () => reject(new ToolAbortedError(toolName));
            abortSignal.addEventListener("abort", onAbort, { once: true });
          })
        : new Promise<never>(() => {}); // Never resolves

      // Race execution against timeout and abort
      const result = await Promise.race([executionPromise, timeoutPromise, abortPromise]);

      const completedAt = Date.now();
      return createResult(result, completedAt);
    } catch (error) {
      const completedAt = Date.now();

      // Handle timeout error
      if (error instanceof ToolTimeoutError) {
        return createResult({ success: false, error: error.message }, completedAt, {
          timedOut: true,
        });
      }

      // Handle abort error
      if (error instanceof ToolAbortedError) {
        return createResult({ success: false, error: error.message }, completedAt, {
          aborted: true,
        });
      }

      // Handle other errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      return createResult({ success: false, error: errorMessage }, completedAt);
    } finally {
      // Clean up
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      abortSignal?.removeEventListener("abort", abortHandler);
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
