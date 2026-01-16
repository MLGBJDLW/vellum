/**
 * Batch Tool
 *
 * Parallel tool execution for improved performance.
 * Executes multiple tool calls concurrently with configurable concurrency limits.
 *
 * @module builtin/batch
 */

import { z } from "zod";

import type { ToolRegistry } from "../tool/registry.js";
import { defineTool, fail, ok, type ToolResult } from "../types/index.js";

/** Default maximum parallel operations */
const DEFAULT_CONCURRENCY = 5;

/** Maximum allowed concurrency */
const MAX_CONCURRENCY = 10;

/**
 * Schema for a single batch operation
 */
const batchOperationSchema = z.object({
  /** Name of the tool to call */
  tool: z.string().describe("Name of the tool to call"),
  /** Parameters to pass to the tool */
  params: z.record(z.string(), z.unknown()).describe("Parameters to pass to the tool"),
  /** Optional identifier for referencing this result */
  id: z.string().optional().describe("Optional identifier for referencing this result"),
});

/**
 * Schema for batch tool parameters
 */
export const batchParamsSchema = z.object({
  /** Array of tool operations to execute */
  operations: z
    .array(batchOperationSchema)
    .min(1)
    .max(50)
    .describe("Array of tool operations to execute (max: 50)"),
  /** Maximum number of parallel operations (default: 5) */
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(MAX_CONCURRENCY)
    .optional()
    .default(DEFAULT_CONCURRENCY)
    .describe("Maximum number of parallel operations (1-10, default: 5)"),
  /** Stop execution if any operation fails (default: false) */
  stopOnError: z
    .boolean()
    .optional()
    .default(false)
    .describe("Stop execution if any operation fails (default: false)"),
});

/** Inferred type for batch parameters */
export type BatchParams = z.infer<typeof batchParamsSchema>;

/** Single operation result in batch execution */
export interface BatchOperationResult {
  /** Identifier for this operation (generated if not provided) */
  id: string;
  /** Name of the tool that was called */
  tool: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data on success */
  result?: unknown;
  /** Error message on failure */
  error?: string;
  /** Execution time in milliseconds */
  durationMs: number;
}

/** Output type for batch tool */
export interface BatchOutput {
  /** Array of operation results */
  results: BatchOperationResult[];
  /** Number of successful operations */
  successCount: number;
  /** Number of failed operations */
  errorCount: number;
  /** Total execution time in milliseconds */
  totalDurationMs: number;
  /** Whether execution was stopped early due to error */
  stoppedEarly: boolean;
}

/**
 * Execute operations with concurrency limit
 */
async function executeWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  executor: (item: T, index: number) => Promise<R>,
  shouldStop: () => boolean
): Promise<R[]> {
  const results: R[] = [];
  let currentIndex = 0;

  async function runNext(): Promise<void> {
    while (currentIndex < items.length && !shouldStop()) {
      const index = currentIndex++;
      const item = items[index];
      if (item === undefined) break;
      const result = await executor(item, index);
      results[index] = result;
    }
  }

  // Start concurrent workers
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => runNext());

  await Promise.all(workers);

  return results;
}

// Store registry reference for batch execution
let toolRegistryRef: ToolRegistry | null = null;

/**
 * Set the tool registry for batch operations.
 * Must be called during initialization.
 */
export function setBatchToolRegistry(registry: ToolRegistry): void {
  toolRegistryRef = registry;
}

/**
 * Get the current tool registry
 */
export function getBatchToolRegistry(): ToolRegistry | null {
  return toolRegistryRef;
}

/**
 * Batch tool implementation
 *
 * Executes multiple tool calls in parallel with configurable concurrency.
 * Useful for operations that can be parallelized, like reading multiple files.
 *
 * @example
 * ```typescript
 * // Read multiple files in parallel
 * const result = await batchTool.execute({
 *   operations: [
 *     { tool: "read_file", params: { path: "src/a.ts" }, id: "file-a" },
 *     { tool: "read_file", params: { path: "src/b.ts" }, id: "file-b" },
 *     { tool: "read_file", params: { path: "src/c.ts" }, id: "file-c" },
 *   ],
 *   concurrency: 3
 * }, ctx);
 * ```
 */
export const batchTool = defineTool({
  name: "batch",
  description:
    "Execute multiple tool calls in parallel for improved performance. Useful for batch operations like reading multiple files or running multiple searches. Results are returned in the same order as operations.",
  parameters: batchParamsSchema,
  kind: "read", // Default to read, actual permissions depend on individual tools
  category: "utility",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    // Get tool registry
    const registry = toolRegistryRef;
    if (!registry) {
      return fail("Batch tool not initialized: tool registry not set");
    }

    const startTime = Date.now();
    const concurrency = input.concurrency ?? DEFAULT_CONCURRENCY;
    const stopOnError = input.stopOnError ?? false;
    let stoppedEarly = false;
    let hasError = false;

    // Validate all tools exist before execution
    for (const op of input.operations) {
      const tool = registry.get(op.tool);
      if (!tool) {
        return fail(`Unknown tool: ${op.tool}`);
      }

      // Prevent recursive batch calls
      if (op.tool === "batch") {
        return fail("Cannot nest batch operations");
      }
    }

    // Execute operations with concurrency
    const results = await executeWithConcurrency(
      input.operations,
      concurrency,
      async (op, index) => {
        const opStartTime = Date.now();
        const id = op.id ?? `op-${index}`;

        // Check for cancellation or early stop
        if (ctx.abortSignal.aborted || (stopOnError && hasError)) {
          return {
            id,
            tool: op.tool,
            success: false,
            error: ctx.abortSignal.aborted
              ? "Operation cancelled"
              : "Stopped due to previous error",
            durationMs: Date.now() - opStartTime,
          };
        }

        const tool = registry.get(op.tool);
        if (!tool) {
          hasError = true;
          return {
            id,
            tool: op.tool,
            success: false,
            error: `Unknown tool: ${op.tool}`,
            durationMs: Date.now() - opStartTime,
          };
        }

        try {
          // Execute the tool
          const result = (await tool.execute(op.params, ctx)) as ToolResult<unknown>;

          if (result.success) {
            return {
              id,
              tool: op.tool,
              success: true,
              result: result.output,
              durationMs: Date.now() - opStartTime,
            };
          } else {
            hasError = true;
            return {
              id,
              tool: op.tool,
              success: false,
              error: result.error,
              durationMs: Date.now() - opStartTime,
            };
          }
        } catch (error) {
          hasError = true;
          return {
            id,
            tool: op.tool,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            durationMs: Date.now() - opStartTime,
          };
        }
      },
      () => stopOnError && hasError
    );

    // Filter out undefined results (from stopped operations)
    const validResults = results.filter(
      (r): r is NonNullable<typeof r> => r !== undefined
    ) as BatchOperationResult[];

    // Check if we stopped early
    stoppedEarly = stopOnError && hasError && validResults.length < input.operations.length;

    const successCount = validResults.filter((r) => r.success).length;
    const errorCount = validResults.filter((r) => !r.success).length;

    return ok({
      results: validResults,
      successCount,
      errorCount,
      totalDurationMs: Date.now() - startTime,
      stoppedEarly,
    });
  },

  shouldConfirm(_input, _ctx) {
    // Batch itself doesn't need confirmation, individual tools handle their own
    return false;
  },
});
