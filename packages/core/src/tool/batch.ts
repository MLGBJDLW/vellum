// ============================================
// Batch Tool Execution - T075
// ============================================

import type { ExecuteOptions, ExecutionResult, ToolExecutor } from "./executor.js";

// =============================================================================
// T075: Batch Execution Types
// =============================================================================

/**
 * A tool call to be executed in a batch.
 */
export interface BatchToolCall {
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool to execute */
  name: string;
  /** Parameters to pass to the tool */
  params: Record<string, unknown>;
}

/**
 * Options for batch tool execution.
 */
export interface BatchExecutionOptions {
  /**
   * Whether to execute tools in parallel.
   * If false, tools are executed sequentially.
   * @default false
   */
  parallel?: boolean;

  /**
   * Maximum number of tools to execute concurrently.
   * Only applies when `parallel` is true.
   * @default 5
   */
  maxConcurrency?: number;

  /**
   * Whether to stop all execution if one tool fails.
   * If false, errors are collected and execution continues.
   * @default false
   */
  stopOnError?: boolean;

  /**
   * AbortSignal for cancellation support.
   * When aborted, pending executions are cancelled.
   */
  abortSignal?: AbortSignal;

  /**
   * Timeout for each individual tool execution in milliseconds.
   * Passed through to ToolExecutor.execute().
   */
  timeout?: number;
}

/**
 * Error entry in batch execution results.
 */
export interface BatchExecutionError {
  /** Index of the tool call that failed */
  index: number;
  /** ID of the tool call that failed */
  callId: string;
  /** Name of the tool that failed */
  toolName: string;
  /** The error that occurred */
  error: Error;
}

/**
 * Result of batch tool execution.
 */
export interface BatchExecutionResult {
  /** Results from all executed tools (in order of input calls) */
  results: Array<ExecutionResult | null>;
  /** Errors that occurred during execution */
  errors: BatchExecutionError[];
  /** Total execution time in milliseconds */
  totalTime: number;
  /** Whether execution was aborted */
  aborted: boolean;
  /** Number of successfully executed tools */
  successCount: number;
  /** Number of failed tools */
  failureCount: number;
}

/**
 * Context required for batch execution.
 * Subset of ToolContext needed for executing tools.
 */
export interface BatchExecutionContext {
  /** Current working directory */
  workingDir: string;
  /** Session identifier */
  sessionId: string;
  /** Message identifier */
  messageId: string;
  /** Permission check function */
  checkPermission(action: string, resource?: string): Promise<boolean>;
}

// =============================================================================
// T075: Semaphore for Concurrency Control
// =============================================================================

/**
 * Simple semaphore for controlling concurrency.
 * Limits the number of concurrent operations.
 */
class Semaphore {
  private permits: number;
  private readonly waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  /**
   * Acquire a permit. Blocks if no permits are available.
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    // Wait for a permit to become available
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  /**
   * Release a permit, potentially unblocking a waiting acquire.
   */
  release(): void {
    const next = this.waiting.shift();
    if (next) {
      // Give the permit to the next waiter
      next();
    } else {
      // No one waiting, add permit back to pool
      this.permits++;
    }
  }
}

// =============================================================================
// T075: Batch Execution Implementation
// =============================================================================

/**
 * Execute multiple tool calls in batch.
 *
 * Supports both sequential and parallel execution with configurable
 * concurrency limits. Collects all results and errors, optionally
 * stopping on first error.
 *
 * @param executor - The ToolExecutor to use for individual tool calls
 * @param calls - Array of tool calls to execute
 * @param context - Execution context for all tool calls
 * @param options - Batch execution options
 * @returns Batch execution result with all results and errors
 *
 * @example
 * ```typescript
 * // Sequential execution (default)
 * const result = await executeBatch(executor, calls, context);
 *
 * // Parallel execution with concurrency limit
 * const result = await executeBatch(executor, calls, context, {
 *   parallel: true,
 *   maxConcurrency: 3,
 * });
 *
 * // Stop on first error
 * const result = await executeBatch(executor, calls, context, {
 *   stopOnError: true,
 * });
 * ```
 */
export async function executeBatch(
  executor: ToolExecutor,
  calls: BatchToolCall[],
  context: BatchExecutionContext,
  options: BatchExecutionOptions = {}
): Promise<BatchExecutionResult> {
  const startTime = Date.now();

  const {
    parallel = false,
    maxConcurrency = 5,
    stopOnError = false,
    abortSignal,
    timeout,
  } = options;

  // Initialize results array with nulls (filled in as tools complete)
  const results: Array<ExecutionResult | null> = new Array(calls.length).fill(null);
  const errors: BatchExecutionError[] = [];
  let aborted = false;

  // Check if already aborted
  if (abortSignal?.aborted) {
    return {
      results,
      errors,
      totalTime: Date.now() - startTime,
      aborted: true,
      successCount: 0,
      failureCount: 0,
    };
  }

  // Create abort controller for stopping on error
  const batchAbortController = new AbortController();
  const effectiveSignal = abortSignal
    ? combineAbortSignals(abortSignal, batchAbortController.signal)
    : batchAbortController.signal;

  // Listen for external abort
  abortSignal?.addEventListener("abort", () => {
    aborted = true;
    batchAbortController.abort();
  });

  /**
   * Execute a single tool call and store the result.
   */
  const executeOne = async (call: BatchToolCall, index: number): Promise<void> => {
    // Check if we should stop
    if (effectiveSignal.aborted) {
      return;
    }

    const toolContext = {
      workingDir: context.workingDir,
      sessionId: context.sessionId,
      messageId: context.messageId,
      callId: call.id,
      abortSignal: effectiveSignal,
      checkPermission: context.checkPermission,
    };

    const executeOptions: ExecuteOptions = {
      abortSignal: effectiveSignal,
    };
    if (timeout !== undefined) {
      executeOptions.timeout = timeout;
    }

    try {
      const result = await executor.execute(call.name, call.params, toolContext, executeOptions);
      results[index] = result;

      // Check for tool-level failure (not execution error)
      if (!result.result.success && stopOnError) {
        batchAbortController.abort();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push({
        index,
        callId: call.id,
        toolName: call.name,
        error: err,
      });

      if (stopOnError) {
        batchAbortController.abort();
      }
    }
  };

  if (parallel) {
    // Parallel execution with concurrency limit
    const semaphore = new Semaphore(Math.max(1, maxConcurrency));
    const promises: Promise<void>[] = [];

    for (const [index, call] of calls.entries()) {
      // Create a promise that acquires semaphore, executes, and releases
      const promise = (async () => {
        if (effectiveSignal.aborted) {
          return;
        }

        await semaphore.acquire();
        try {
          if (!effectiveSignal.aborted) {
            await executeOne(call, index);
          }
        } finally {
          semaphore.release();
        }
      })();

      promises.push(promise);
    }

    // Wait for all to complete (or abort)
    await Promise.all(promises);
  } else {
    // Sequential execution
    for (const [index, call] of calls.entries()) {
      if (effectiveSignal.aborted) {
        break;
      }

      await executeOne(call, index);
    }
  }

  // Check if we were aborted (either external or stopOnError)
  if (abortSignal?.aborted) {
    aborted = true;
  }

  // Calculate success/failure counts
  let successCount = 0;
  let failureCount = 0;

  for (const result of results) {
    if (result !== null) {
      if (result.result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }
  }

  // Add execution errors to failure count
  failureCount += errors.length;

  return {
    results,
    errors,
    totalTime: Date.now() - startTime,
    aborted,
    successCount,
    failureCount,
  };
}

// =============================================================================
// T075: Helper Functions
// =============================================================================

/**
 * Combine multiple AbortSignals into one.
 * The combined signal aborts when any of the input signals abort.
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return controller.signal;
}

/**
 * Create a batch of tool calls from an array of tool call specifications.
 *
 * @param calls - Array of [name, params] tuples or objects with name and params
 * @returns Array of BatchToolCall objects with generated IDs
 *
 * @example
 * ```typescript
 * const batch = createBatch([
 *   { name: "read_file", params: { path: "a.txt" } },
 *   { name: "read_file", params: { path: "b.txt" } },
 * ]);
 * ```
 */
export function createBatch(
  calls: Array<{ name: string; params: Record<string, unknown> }>
): BatchToolCall[] {
  return calls.map((call, index) => ({
    id: `batch-${Date.now()}-${index}`,
    name: call.name,
    params: call.params,
  }));
}

/**
 * Extract successful results from a batch execution result.
 *
 * @param result - Batch execution result
 * @returns Array of successful tool outputs
 */
export function getSuccessfulResults<T = unknown>(result: BatchExecutionResult): T[] {
  const successful: T[] = [];

  for (const execResult of result.results) {
    if (execResult?.result.success) {
      successful.push(execResult.result.output as T);
    }
  }

  return successful;
}

/**
 * Check if a batch execution completed without any errors.
 *
 * @param result - Batch execution result
 * @returns true if all tools executed successfully
 */
export function isBatchSuccess(result: BatchExecutionResult): boolean {
  return !result.aborted && result.errors.length === 0 && result.failureCount === 0;
}
