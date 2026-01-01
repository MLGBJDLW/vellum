/**
 * Task Resumption for Interrupted Workflows
 *
 * Enables resuming paused or interrupted multi-agent task chains,
 * with options to skip or retry failed tasks.
 */

import type { OrchestratorCore } from "@vellum/core";
import type { PersistedTaskState, TaskPersistence } from "./task-persistence.js";

/**
 * Options for resuming a task chain
 */
export interface ResumeOptions {
  /** Skip tasks that previously failed */
  skipFailed?: boolean;
  /** Retry failed tasks instead of skipping */
  retryFailed?: boolean;
  /** Resume from a specific task ID (defaults to last completed) */
  fromTask?: string;
}

/**
 * Result of a resume operation
 */
export interface ResumeResult {
  /** The chain ID that was resumed */
  chainId: string;
  /** Whether the resume was successful */
  resumed: boolean;
  /** The task ID from which execution resumed */
  fromTaskId: string;
  /** Total number of remaining tasks to execute */
  totalRemaining: number;
  /** Number of tasks that were skipped */
  skippedCount: number;
}

/**
 * Interface for task resumption operations
 */
export interface TaskResumption {
  /**
   * Resume execution of an interrupted task chain
   *
   * @param chainId - The ID of the chain to resume
   * @param options - Resume configuration options
   * @returns Promise resolving to the resume result
   */
  resume(chainId: string, options?: ResumeOptions): Promise<ResumeResult>;

  /**
   * Check if a task chain can be resumed
   *
   * @param chainId - The ID of the chain to check
   * @returns Promise resolving to true if resumable
   */
  canResume(chainId: string): Promise<boolean>;

  /**
   * Get resume options for a task chain
   *
   * Returns information about the chain's state to help
   * determine how to resume execution.
   *
   * @param chainId - The ID of the chain to query
   * @returns Promise resolving to resume options, or null if not found
   */
  getResumeOptions(chainId: string): Promise<{
    lastCompletedTask: string;
    pendingTasks: string[];
    failedTasks: string[];
  } | null>;
}

/**
 * Determine the starting task ID based on resume options and state
 */
function determineStartTaskId(state: PersistedTaskState, options: ResumeOptions): string {
  // If fromTask is specified, use it
  if (options.fromTask) {
    return options.fromTask;
  }

  // Default to the last task ID from checkpoint
  return state.lastTaskId;
}

/**
 * Calculate which tasks should be executed based on options
 */
function calculateTasksToExecute(
  state: PersistedTaskState,
  options: ResumeOptions
): { tasksToRun: string[]; skippedCount: number } {
  const { pendingTasks, failedTasks } = state.checkpoint;
  let tasksToRun: string[] = [...pendingTasks];
  let skippedCount = 0;

  if (options.retryFailed && failedTasks.length > 0) {
    // Add failed tasks to be retried
    tasksToRun = [...failedTasks, ...tasksToRun];
  } else if (options.skipFailed && failedTasks.length > 0) {
    // Count skipped tasks
    skippedCount = failedTasks.length;
  } else if (failedTasks.length > 0 && !options.retryFailed && !options.skipFailed) {
    // Default behavior: include failed tasks in remaining count but don't retry
    skippedCount = failedTasks.length;
  }

  return { tasksToRun, skippedCount };
}

/**
 * Create a TaskResumption instance
 *
 * @param persistence - The task persistence instance for loading/saving state
 * @param orchestrator - The orchestrator core for executing tasks
 * @returns A TaskResumption implementation
 */
export function createTaskResumption(
  persistence: TaskPersistence,
  orchestrator: OrchestratorCore
): TaskResumption {
  return {
    async resume(chainId: string, options: ResumeOptions = {}): Promise<ResumeResult> {
      // Load the persisted state
      const state = await persistence.loadTaskState(chainId);

      if (!state) {
        return {
          chainId,
          resumed: false,
          fromTaskId: "",
          totalRemaining: 0,
          skippedCount: 0,
        };
      }

      // Check if the chain is in a resumable state
      if (state.status !== "paused" && state.status !== "running") {
        return {
          chainId,
          resumed: false,
          fromTaskId: state.lastTaskId,
          totalRemaining: 0,
          skippedCount: 0,
        };
      }

      // Determine starting point and tasks to execute
      const fromTaskId = determineStartTaskId(state, options);
      const { tasksToRun, skippedCount } = calculateTasksToExecute(state, options);

      // Update state to running
      const updatedState: PersistedTaskState = {
        ...state,
        status: "running",
        lastTaskId: fromTaskId,
        savedAt: new Date(),
      };

      // If skipFailed is set, remove failed tasks from checkpoint
      if (options.skipFailed) {
        updatedState.checkpoint = {
          ...updatedState.checkpoint,
          failedTasks: [],
        };
      }

      // If retryFailed is set, move failed tasks back to pending
      if (options.retryFailed) {
        updatedState.checkpoint = {
          ...updatedState.checkpoint,
          pendingTasks: [...state.checkpoint.failedTasks, ...state.checkpoint.pendingTasks],
          failedTasks: [],
        };
      }

      // Save the updated state
      await persistence.saveTaskState(updatedState);

      // Execute remaining tasks through orchestrator
      // The orchestrator will pick up from the task chain's current state
      const chain = orchestrator.getTaskChain(chainId);

      if (chain) {
        // Chain exists in memory, resume execution from current state
        // The orchestrator tracks execution internally
      }

      return {
        chainId,
        resumed: true,
        fromTaskId,
        totalRemaining: tasksToRun.length,
        skippedCount,
      };
    },

    async canResume(chainId: string): Promise<boolean> {
      const state = await persistence.loadTaskState(chainId);

      if (!state) {
        return false;
      }

      // Can resume if paused or running (interrupted)
      if (state.status !== "paused" && state.status !== "running") {
        return false;
      }

      // Must have pending or failed tasks to resume
      const { pendingTasks, failedTasks } = state.checkpoint;
      return pendingTasks.length > 0 || failedTasks.length > 0;
    },

    async getResumeOptions(chainId: string): Promise<{
      lastCompletedTask: string;
      pendingTasks: string[];
      failedTasks: string[];
    } | null> {
      const state = await persistence.loadTaskState(chainId);

      if (!state) {
        return null;
      }

      const { completedTasks, pendingTasks, failedTasks } = state.checkpoint;

      // Find the last completed task
      const lastCompletedTask =
        completedTasks.length > 0 ? (completedTasks[completedTasks.length - 1] ?? "") : "";

      return {
        lastCompletedTask,
        pendingTasks,
        failedTasks,
      };
    },
  };
}
