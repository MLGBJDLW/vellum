/**
 * Hook Executor
 *
 * Executes plugin hooks with permission checking, timeout handling,
 * and proper error handling based on hook type.
 *
 * @module plugin/hooks/executor
 */

import type { HookAction, HookEvent, HookRule } from "./types.js";
import { DEFAULT_HOOK_TIMEOUT } from "./types.js";

// =============================================================================
// Error Codes (7xxx range for Hook errors)
// =============================================================================

/**
 * Error codes specific to hook execution.
 */
export enum HookErrorCode {
  /** Hook execution timed out */
  HOOK_TIMEOUT = 7001,
  /** Hook execution failed */
  HOOK_EXECUTION_FAILED = 7002,
  /** Permission denied for hook */
  HOOK_PERMISSION_DENIED = 7003,
  /** Hook action type not supported */
  HOOK_UNSUPPORTED_ACTION = 7004,
  /** Hook was aborted */
  HOOK_ABORTED = 7005,
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Options for hook error construction.
 */
export interface HookErrorOptions {
  /** The underlying cause of this error */
  cause?: Error;
  /** Hook name associated with this error */
  hookName?: string;
  /** Event type that triggered the hook */
  event?: HookEvent;
  /** Additional context about the error */
  context?: Record<string, unknown>;
}

/**
 * Base error class for all hook execution errors.
 *
 * @example
 * ```typescript
 * try {
 *   await executeHooks(event, context, rules);
 * } catch (error) {
 *   if (error instanceof HookExecutionError) {
 *     console.error(`Hook error [${error.code}]: ${error.message}`);
 *   }
 * }
 * ```
 */
export class HookExecutionError extends Error {
  public readonly code: HookErrorCode;
  public readonly hookName?: string;
  public readonly event?: HookEvent;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: HookErrorCode, options?: HookErrorOptions) {
    super(message, { cause: options?.cause });
    this.name = "HookExecutionError";
    this.code = code;
    this.hookName = options?.hookName;
    this.event = options?.event;
    this.context = options?.context;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HookExecutionError);
    }
  }

  /**
   * Returns a JSON-serializable representation of this error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      hookName: this.hookName,
      event: this.event,
      context: this.context,
      cause: this.cause instanceof Error ? this.cause.message : undefined,
    };
  }
}

/**
 * Error thrown when a hook times out.
 */
export class HookTimeoutError extends HookExecutionError {
  public readonly timeout: number;

  constructor(hookName: string, timeout: number, event?: HookEvent) {
    super(`Hook '${hookName}' timed out after ${timeout}ms`, HookErrorCode.HOOK_TIMEOUT, {
      hookName,
      event,
    });
    this.name = "HookTimeoutError";
    this.timeout = timeout;
  }
}

/**
 * Error thrown when permission is denied for a hook.
 */
export class HookPermissionError extends HookExecutionError {
  constructor(hookName: string, event?: HookEvent) {
    super(`Permission denied for hook '${hookName}'`, HookErrorCode.HOOK_PERMISSION_DENIED, {
      hookName,
      event,
    });
    this.name = "HookPermissionError";
  }
}

// =============================================================================
// Permission Bridge Interface
// =============================================================================

/**
 * Interface for checking permissions before hook execution.
 *
 * Allows the hook executor to delegate permission decisions to an external
 * system (e.g., trust store, user prompts).
 *
 * @example
 * ```typescript
 * const permissionBridge: PermissionBridge = {
 *   async checkPermission(pluginName, action) {
 *     return trustStore.hasCapability(pluginName, 'execute-hooks');
 *   }
 * };
 * ```
 */
export interface PermissionBridge {
  /**
   * Check if a plugin has permission to execute a hook action.
   *
   * @param pluginName - Name of the plugin requesting permission
   * @param action - The action type being requested
   * @param event - The hook event being triggered
   * @returns `true` if permitted, `false` otherwise
   */
  checkPermission(
    pluginName: string,
    action: HookAction["type"],
    event: HookEvent
  ): Promise<boolean>;
}

// =============================================================================
// Hook Context and Result Types
// =============================================================================

/**
 * Context passed to hook execution.
 *
 * Contains the input data being processed and session information
 * needed for hook execution.
 *
 * @example
 * ```typescript
 * const context: HookContext = {
 *   input: { toolName: 'write_file', params: { path: '/tmp/test.txt' } },
 *   sessionId: 'sess_123',
 *   pluginName: 'security-guard',
 *   permissionBridge: myBridge
 * };
 * ```
 */
export interface HookContext {
  /** The data being processed (tool params, model request, etc.) */
  input: unknown;
  /** Current session identifier */
  sessionId: string;
  /** Name of the plugin whose hooks are being executed */
  pluginName: string;
  /** Optional permission bridge for checking capabilities */
  permissionBridge?: PermissionBridge;
}

/**
 * Result from executing a single hook.
 *
 * Contains the outcome of the hook execution including timing
 * and any modifications to the input.
 */
export interface HookResult {
  /** Whether the hook allowed the action to proceed */
  allowed: boolean;
  /** Modified input if the hook transformed it */
  modifiedInput?: unknown;
  /** Time taken to execute the hook in milliseconds */
  executionTime: number;
  /** Name/identifier of the hook that was executed */
  hookName: string;
}

/**
 * Result from executing all matching hooks for an event.
 */
export interface HooksExecutionResult {
  /** Whether all hooks allowed the action */
  allowed: boolean;
  /** Final input after all hook transformations */
  finalInput: unknown;
  /** Results from individual hook executions */
  results: HookResult[];
  /** Total execution time for all hooks */
  totalExecutionTime: number;
}

// =============================================================================
// Fail Behavior Helpers
// =============================================================================

/**
 * Events that use fail-closed behavior by default.
 * On error, these hooks block the action.
 */
const FAIL_CLOSED_EVENTS: ReadonlySet<HookEvent> = new Set(["PreToolUse", "BeforeModel"]);

/**
 * Determines the fail behavior for a hook rule.
 *
 * @param rule - The hook rule
 * @returns 'closed' if fail-closed, 'open' if fail-open
 */
function getFailBehavior(rule: HookRule): "open" | "closed" {
  // Explicit behavior takes precedence
  if (rule.failBehavior) {
    return rule.failBehavior;
  }
  // Default based on event type
  return FAIL_CLOSED_EVENTS.has(rule.event) ? "closed" : "open";
}

// =============================================================================
// Hook Matching
// =============================================================================

/**
 * Checks if a hook rule matches the given event and context.
 *
 * @param rule - The hook rule to check
 * @param event - The event being triggered
 * @param input - The input data (for matcher evaluation)
 * @returns `true` if the rule matches
 */
function matchesRule(rule: HookRule, event: HookEvent, input: unknown): boolean {
  // Event must match
  if (rule.event !== event) {
    return false;
  }

  // If no matcher, rule matches all inputs for this event
  if (!rule.matcher) {
    return true;
  }

  // Apply matcher regex against stringified input
  try {
    const pattern = new RegExp(rule.matcher);
    const inputStr = typeof input === "string" ? input : JSON.stringify(input);
    return pattern.test(inputStr);
  } catch {
    // Invalid regex - treat as non-match
    return false;
  }
}

/**
 * Filters rules that match the given event and input.
 *
 * @param rules - All hook rules
 * @param event - The event being triggered
 * @param input - The input data
 * @returns Rules that match the event and input
 */
function filterMatchingRules(rules: HookRule[], event: HookEvent, input: unknown): HookRule[] {
  return rules.filter((rule) => matchesRule(rule, event, input));
}

// =============================================================================
// Action Execution
// =============================================================================

/**
 * Executes a hook action with timeout handling.
 *
 * @param action - The action to execute
 * @param input - Input data for the action
 * @param timeout - Maximum execution time in milliseconds
 * @param abortController - Controller for cancellation
 * @returns Result of the action execution
 */
async function executeAction(
  action: HookAction,
  input: unknown,
  timeout: number,
  abortController: AbortController
): Promise<{ allowed: boolean; modifiedInput?: unknown }> {
  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      abortController.abort();
      reject(new Error(`Action timed out after ${timeout}ms`));
    }, timeout);

    // Clean up timeout if aborted externally
    abortController.signal.addEventListener("abort", () => {
      clearTimeout(timeoutId);
    });
  });

  // Create action execution promise
  const actionPromise = (async (): Promise<{
    allowed: boolean;
    modifiedInput?: unknown;
  }> => {
    switch (action.type) {
      case "command":
        return executeCommandAction(action, input, abortController.signal);

      case "script":
        return executeScriptAction(action, input, abortController.signal);

      case "prompt":
        return executePromptAction(action, input);

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = action;
        throw new HookExecutionError(
          `Unsupported action type: ${(_exhaustive as HookAction).type}`,
          HookErrorCode.HOOK_UNSUPPORTED_ACTION
        );
      }
    }
  })();

  // Race between action and timeout
  return Promise.race([actionPromise, timeoutPromise]);
}

/**
 * Executes a command action.
 *
 * @param action - Command action to execute
 * @param input - Input data
 * @param signal - Abort signal for cancellation
 * @returns Execution result
 */
async function executeCommandAction(
  action: Extract<HookAction, { type: "command" }>,
  input: unknown,
  signal: AbortSignal
): Promise<{ allowed: boolean; modifiedInput?: unknown }> {
  // Check if already aborted
  if (signal.aborted) {
    throw new HookExecutionError("Command execution aborted", HookErrorCode.HOOK_ABORTED);
  }

  const { spawn } = await import("node:child_process");

  return new Promise((resolve, reject) => {
    const args = action.args ?? [];
    const child = spawn(action.command, args, {
      signal,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        HOOK_INPUT: JSON.stringify(input),
      },
    });

    let stdout = "";
    let _stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      _stderr += data.toString();
    });

    child.on("error", (error) => {
      if (error.name === "AbortError") {
        reject(
          new HookExecutionError("Command execution aborted", HookErrorCode.HOOK_ABORTED, {
            cause: error,
          })
        );
      } else {
        reject(
          new HookExecutionError(
            `Command execution failed: ${error.message}`,
            HookErrorCode.HOOK_EXECUTION_FAILED,
            { cause: error }
          )
        );
      }
    });

    child.on("close", (code) => {
      // Non-zero exit code means action blocked
      const allowed = code === 0;

      // Try to parse modified input from stdout
      let modifiedInput: unknown;
      if (stdout.trim()) {
        try {
          modifiedInput = JSON.parse(stdout.trim());
        } catch {
          // Not JSON, ignore
        }
      }

      resolve({ allowed, modifiedInput });
    });
  });
}

/**
 * Executes a script action.
 *
 * @param action - Script action to execute
 * @param input - Input data
 * @param signal - Abort signal for cancellation
 * @returns Execution result
 */
async function executeScriptAction(
  action: Extract<HookAction, { type: "script" }>,
  input: unknown,
  signal: AbortSignal
): Promise<{ allowed: boolean; modifiedInput?: unknown }> {
  // Check if already aborted
  if (signal.aborted) {
    throw new HookExecutionError("Script execution aborted", HookErrorCode.HOOK_ABORTED);
  }

  const { spawn } = await import("node:child_process");

  // Determine command and args based on interpreter
  const command = action.interpreter ?? getDefaultInterpreter(action.path);
  const args = action.interpreter ? [action.path] : [action.path];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      signal,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        HOOK_INPUT: JSON.stringify(input),
      },
    });

    let stdout = "";
    let _stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      _stderr += data.toString();
    });

    child.on("error", (error) => {
      if (error.name === "AbortError") {
        reject(
          new HookExecutionError("Script execution aborted", HookErrorCode.HOOK_ABORTED, {
            cause: error,
          })
        );
      } else {
        reject(
          new HookExecutionError(
            `Script execution failed: ${error.message}`,
            HookErrorCode.HOOK_EXECUTION_FAILED,
            { cause: error }
          )
        );
      }
    });

    child.on("close", (code) => {
      const allowed = code === 0;

      let modifiedInput: unknown;
      if (stdout.trim()) {
        try {
          modifiedInput = JSON.parse(stdout.trim());
        } catch {
          // Not JSON, ignore
        }
      }

      resolve({ allowed, modifiedInput });
    });
  });
}

/**
 * Gets the default interpreter for a script based on extension.
 *
 * @param scriptPath - Path to the script file
 * @returns Interpreter command
 */
function getDefaultInterpreter(scriptPath: string): string {
  const ext = scriptPath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "py":
      return "python3";
    case "js":
    case "mjs":
      return "node";
    case "sh":
      return "sh";
    case "ps1":
      return "pwsh";
    default:
      // Default to shell
      return process.platform === "win32" ? "cmd" : "sh";
  }
}

/**
 * Executes a prompt action.
 *
 * Prompt actions inject content into the context but don't block.
 *
 * @param action - Prompt action to execute
 * @param input - Input data
 * @returns Execution result with injected content
 */
async function executePromptAction(
  action: Extract<HookAction, { type: "prompt" }>,
  input: unknown
): Promise<{ allowed: boolean; modifiedInput?: unknown }> {
  // Prompt actions always allow and inject content
  const modifiedInput =
    typeof input === "object" && input !== null
      ? { ...input, injectedPrompt: action.content }
      : { original: input, injectedPrompt: action.content };

  return { allowed: true, modifiedInput };
}

// =============================================================================
// Single Hook Execution
// =============================================================================

/**
 * Internal result from executing a single rule.
 */
interface SingleRuleResult {
  /** Hook result to add to results array */
  hookResult: HookResult;
  /** Updated input after hook execution */
  updatedInput: unknown;
  /** Whether to short-circuit the loop */
  shouldShortCircuit: boolean;
}

/**
 * Executes a single hook rule.
 *
 * @param rule - The rule to execute
 * @param index - Index of the rule in the matching rules array
 * @param currentInput - Current input data
 * @param context - Hook execution context
 * @param event - The event being processed
 * @returns Result of executing this single rule
 */
async function executeSingleRule(
  rule: HookRule,
  index: number,
  currentInput: unknown,
  context: HookContext,
  event: HookEvent
): Promise<SingleRuleResult> {
  const hookName = generateHookName(rule, index);
  const hookStartTime = Date.now();

  // Check permission if bridge is available
  if (context.permissionBridge) {
    const permitted = await context.permissionBridge.checkPermission(
      context.pluginName,
      rule.action.type,
      event
    );

    if (!permitted) {
      return {
        hookResult: {
          allowed: false,
          executionTime: Date.now() - hookStartTime,
          hookName,
        },
        updatedInput: currentInput,
        shouldShortCircuit: true,
      };
    }
  }

  // Create abort controller for this hook
  const abortController = new AbortController();
  const timeout = rule.timeout ?? DEFAULT_HOOK_TIMEOUT;

  // Execute the action
  const actionResult = await executeAction(rule.action, currentInput, timeout, abortController);

  const hookResult: HookResult = {
    allowed: actionResult.allowed,
    modifiedInput: actionResult.modifiedInput,
    executionTime: Date.now() - hookStartTime,
    hookName,
  };

  // Update input if modified
  const updatedInput =
    actionResult.modifiedInput !== undefined ? actionResult.modifiedInput : currentInput;

  return {
    hookResult,
    updatedInput,
    shouldShortCircuit: !actionResult.allowed,
  };
}

/**
 * Handles an error during hook execution.
 *
 * @param error - The error that occurred
 * @param hookName - Name of the hook that failed
 * @param hookStartTime - Start time of hook execution
 * @param failBehavior - Whether to fail open or closed
 * @param currentInput - Current input data
 * @returns Result with error handling applied
 */
function handleHookError(
  error: unknown,
  hookName: string,
  hookStartTime: number,
  failBehavior: "open" | "closed",
  currentInput: unknown
): SingleRuleResult {
  const executionTime = Date.now() - hookStartTime;
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Log the error
  console.warn(`[hook:executor] Hook '${hookName}' failed: ${errorMessage}`);

  if (failBehavior === "closed") {
    // Fail-closed: block on error
    return {
      hookResult: {
        allowed: false,
        executionTime,
        hookName,
      },
      updatedInput: currentInput,
      shouldShortCircuit: true,
    };
  }

  // Fail-open: warn and continue
  return {
    hookResult: {
      allowed: true,
      executionTime,
      hookName,
    },
    updatedInput: currentInput,
    shouldShortCircuit: false,
  };
}

// =============================================================================
// Main Executor
// =============================================================================

/**
 * Generates a hook name from a rule for identification.
 *
 * @param rule - The hook rule
 * @param index - Index in the rules array
 * @returns A human-readable hook name
 */
function generateHookName(rule: HookRule, index: number): string {
  const actionType = rule.action.type;
  const actionDetail =
    rule.action.type === "command"
      ? rule.action.command
      : rule.action.type === "script"
        ? rule.action.path.split("/").pop()
        : "prompt";

  return `${rule.event}[${index}]:${actionType}:${actionDetail}`;
}

/**
 * Executes all matching hooks for an event.
 *
 * Hooks are executed sequentially in order. If any hook with fail-closed
 * behavior fails or returns `allowed: false`, execution short-circuits.
 *
 * @param event - The lifecycle event being triggered
 * @param context - Execution context including input and permissions
 * @param rules - Hook rules to evaluate
 * @returns Aggregated results from all executed hooks
 *
 * @example
 * ```typescript
 * const result = await executeHooks('PreToolUse', {
 *   input: { toolName: 'write_file', params: {} },
 *   sessionId: 'sess_123',
 *   pluginName: 'security-plugin'
 * }, rules);
 *
 * if (!result.allowed) {
 *   console.log('Tool execution blocked by hook');
 * }
 * ```
 */
export async function executeHooks(
  event: HookEvent,
  context: HookContext,
  rules: HookRule[]
): Promise<HooksExecutionResult> {
  const startTime = Date.now();
  const results: HookResult[] = [];
  let currentInput = context.input;

  // Filter rules matching this event and input
  const matchingRules = filterMatchingRules(rules, event, currentInput);

  // No matching rules - allow with original input
  if (matchingRules.length === 0) {
    return {
      allowed: true,
      finalInput: currentInput,
      results: [],
      totalExecutionTime: Date.now() - startTime,
    };
  }

  // Execute matching rules sequentially
  for (const [index, rule] of matchingRules.entries()) {
    const hookName = generateHookName(rule, index);
    const hookStartTime = Date.now();
    const failBehavior = getFailBehavior(rule);

    try {
      const singleResult = await executeSingleRule(rule, index, currentInput, context, event);

      results.push(singleResult.hookResult);
      currentInput = singleResult.updatedInput;

      if (singleResult.shouldShortCircuit) {
        return {
          allowed: false,
          finalInput: currentInput,
          results,
          totalExecutionTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      const errorResult = handleHookError(
        error,
        hookName,
        hookStartTime,
        failBehavior,
        currentInput
      );

      results.push(errorResult.hookResult);
      currentInput = errorResult.updatedInput;

      if (errorResult.shouldShortCircuit) {
        return {
          allowed: false,
          finalInput: currentInput,
          results,
          totalExecutionTime: Date.now() - startTime,
        };
      }
    }
  }

  // All hooks passed
  return {
    allowed: true,
    finalInput: currentInput,
    results,
    totalExecutionTime: Date.now() - startTime,
  };
}

/**
 * Executes a single hook rule directly.
 *
 * Useful for testing or when only one rule needs to be executed.
 *
 * @param rule - The hook rule to execute
 * @param context - Execution context
 * @returns Result of the hook execution
 */
export async function executeSingleHook(rule: HookRule, context: HookContext): Promise<HookResult> {
  const result = await executeHooks(rule.event, context, [rule]);
  return (
    result.results[0] ?? {
      allowed: true,
      executionTime: 0,
      hookName: "no-op",
    }
  );
}
