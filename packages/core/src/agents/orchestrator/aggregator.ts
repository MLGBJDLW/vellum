// ============================================
// Result Aggregator for Multi-Agent Task Results
// ============================================

import { z } from "zod";

// ============================================
// Types and Schemas
// ============================================

/**
 * Status of a task result.
 */
export type TaskStatus = "success" | "failure" | "partial";

/**
 * Zod schema for TaskStatus validation.
 */
export const TaskStatusSchema = z.enum(["success", "failure", "partial"]);

/**
 * Strategy for handling partial failures.
 */
export type PartialFailureStrategy = "continue" | "abort" | "retry";

/**
 * Zod schema for PartialFailureStrategy validation.
 */
export const PartialFailureStrategySchema = z.enum(["continue", "abort", "retry"]);

/**
 * Result of a single task executed by an agent.
 *
 * @template T - The type of data returned by the task
 */
export interface TaskResult<T> {
  /** Unique identifier for the task */
  taskId: string;
  /** Identifier of the agent that executed the task */
  agentSlug: string;
  /** Outcome status of the task */
  status: TaskStatus;
  /** Result data if task succeeded or partially succeeded */
  data?: T;
  /** Error information if task failed */
  error?: Error;
  /** Timestamp when task execution started */
  startedAt: Date;
  /** Timestamp when task execution completed */
  completedAt: Date;
}

/**
 * Zod schema for TaskResult validation.
 * Note: Generic data is validated as unknown, caller should validate specific types.
 */
export const TaskResultSchema = z.object({
  taskId: z.string().min(1),
  agentSlug: z.string().min(1),
  status: TaskStatusSchema,
  data: z.unknown().optional(),
  error: z.instanceof(Error).optional(),
  startedAt: z.date(),
  completedAt: z.date(),
});

/**
 * Aggregated results from multiple task executions.
 *
 * @template T - The type of data in individual task results
 */
export interface AggregatedResult<T> {
  /** All individual task results */
  results: TaskResult<T>[];
  /** Total number of tasks */
  totalTasks: number;
  /** Number of tasks that succeeded */
  succeeded: number;
  /** Number of tasks that failed */
  failed: number;
  /** Number of tasks that partially succeeded */
  partial: number;
  /** Overall status based on all task outcomes */
  overallStatus: TaskStatus;
}

/**
 * Zod schema for AggregatedResult validation.
 */
export const AggregatedResultSchema = z.object({
  results: z.array(TaskResultSchema),
  totalTasks: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  overallStatus: TaskStatusSchema,
});

/**
 * Interface for aggregating results from multiple agent tasks.
 *
 * @template T - The type of data in task results
 *
 * @example
 * ```typescript
 * const aggregator = createResultAggregator<string>();
 *
 * aggregator.addResult({
 *   taskId: 'task-1',
 *   agentSlug: 'worker-1',
 *   status: 'success',
 *   data: 'completed',
 *   startedAt: new Date('2025-01-01T00:00:00Z'),
 *   completedAt: new Date('2025-01-01T00:01:00Z'),
 * });
 *
 * if (aggregator.isComplete(1)) {
 *   const result = aggregator.aggregate();
 *   console.log(result.overallStatus); // 'success'
 * }
 * ```
 */
export interface ResultAggregator<T> {
  /**
   * Adds a task result to the aggregator.
   *
   * @param result - The task result to add
   */
  addResult(result: TaskResult<T>): void;

  /**
   * Checks if all expected results have been collected.
   *
   * @param expectedCount - The expected number of results
   * @returns `true` if all results have been collected
   */
  isComplete(expectedCount: number): boolean;

  /**
   * Aggregates all collected results into a summary.
   *
   * @returns The aggregated result containing all task results and statistics
   */
  aggregate(): AggregatedResult<T>;

  /**
   * Sets the strategy for handling partial failures.
   * This strategy is stored and can be used by orchestrators to decide
   * how to proceed when some tasks fail.
   *
   * @param strategy - The failure handling strategy:
   *   - 'continue': Continue with remaining tasks despite failures
   *   - 'abort': Stop execution on first failure
   *   - 'retry': Retry failed tasks
   */
  handlePartialFailure(strategy: PartialFailureStrategy): void;

  /**
   * Gets the current partial failure strategy.
   *
   * @returns The currently set strategy, or undefined if not set
   */
  getPartialFailureStrategy(): PartialFailureStrategy | undefined;

  /**
   * Resets the aggregator to its initial state.
   * Clears all collected results and the partial failure strategy.
   */
  reset(): void;
}

// ============================================
// Implementation
// ============================================

/**
 * Calculates the overall status based on individual task statuses.
 *
 * @param succeeded - Number of successful tasks
 * @param failed - Number of failed tasks
 * @param total - Total number of tasks
 * @returns The overall status
 */
function calculateOverallStatus(succeeded: number, failed: number, total: number): TaskStatus {
  if (total === 0) {
    return "success"; // No tasks means success by default
  }
  if (succeeded === total) {
    return "success";
  }
  if (failed === total) {
    return "failure";
  }
  return "partial";
}

/**
 * Default implementation of ResultAggregator.
 */
class DefaultResultAggregator<T> implements ResultAggregator<T> {
  private results: TaskResult<T>[] = [];
  private partialFailureStrategy: PartialFailureStrategy | undefined;

  addResult(result: TaskResult<T>): void {
    // Validate the result
    const validated = TaskResultSchema.parse(result);
    this.results.push(validated as TaskResult<T>);
  }

  isComplete(expectedCount: number): boolean {
    return this.results.length >= expectedCount;
  }

  aggregate(): AggregatedResult<T> {
    const succeeded = this.results.filter((r) => r.status === "success").length;
    const failed = this.results.filter((r) => r.status === "failure").length;
    const partial = this.results.filter((r) => r.status === "partial").length;
    const totalTasks = this.results.length;

    const overallStatus = calculateOverallStatus(succeeded, failed, totalTasks);

    return {
      results: [...this.results],
      totalTasks,
      succeeded,
      failed,
      partial,
      overallStatus,
    };
  }

  handlePartialFailure(strategy: PartialFailureStrategy): void {
    // Validate the strategy
    PartialFailureStrategySchema.parse(strategy);
    this.partialFailureStrategy = strategy;
  }

  getPartialFailureStrategy(): PartialFailureStrategy | undefined {
    return this.partialFailureStrategy;
  }

  reset(): void {
    this.results = [];
    this.partialFailureStrategy = undefined;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new ResultAggregator instance.
 *
 * @template T - The type of data in task results
 * @returns A new ResultAggregator instance
 *
 * @example
 * ```typescript
 * const aggregator = createResultAggregator<{ message: string }>();
 *
 * // Add results from multiple agents
 * aggregator.addResult({
 *   taskId: 'task-1',
 *   agentSlug: 'analyzer',
 *   status: 'success',
 *   data: { message: 'Analysis complete' },
 *   startedAt: new Date(),
 *   completedAt: new Date(),
 * });
 *
 * aggregator.addResult({
 *   taskId: 'task-2',
 *   agentSlug: 'validator',
 *   status: 'failure',
 *   error: new Error('Validation failed'),
 *   startedAt: new Date(),
 *   completedAt: new Date(),
 * });
 *
 * // Set failure handling strategy
 * aggregator.handlePartialFailure('continue');
 *
 * // Get aggregated results
 * const result = aggregator.aggregate();
 * console.log(result.overallStatus); // 'partial'
 * console.log(result.succeeded); // 1
 * console.log(result.failed); // 1
 * ```
 */
export function createResultAggregator<T>(): ResultAggregator<T> {
  return new DefaultResultAggregator<T>();
}
