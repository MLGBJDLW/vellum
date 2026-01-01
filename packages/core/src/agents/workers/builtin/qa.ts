// ============================================
// QAWorker Implementation
// ============================================
// REQ-029: Builtin worker for testing and debugging tasks

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";

/**
 * QAWorker - Level 2 worker specialized in testing and quality assurance.
 *
 * Handles tasks related to:
 * - Writing and running tests
 * - Debugging issues and fixing bugs
 * - Verification and validation of implementations
 * - Vitest test framework integration
 *
 * @example
 * ```typescript
 * import { qaWorker } from './builtin/qa.js';
 *
 * // Check if worker can handle a task
 * qaWorker.canHandle('write tests for auth module'); // true
 *
 * // Execute a task
 * const result = await qaWorker.execute({
 *   subsession,
 *   taskPacket,
 * });
 * ```
 */
export const qaWorker: BaseWorker = createBaseWorker({
  slug: "qa",
  name: "QA Engineer",
  capabilities: {
    canEdit: true,
    canExecute: true,
    canNetwork: false,
    specializations: ["testing", "debugging", "verification", "vitest"],
  },
  handler: async (context): Promise<WorkerResult> => {
    const { taskPacket, signal } = context;

    // Check for cancellation
    if (signal?.aborted) {
      return {
        success: false,
        error: new Error("Task cancelled"),
      };
    }

    try {
      // Parse task from packet
      const task = taskPacket.task;
      const filesModified: string[] = [];

      // Determine the type of QA task
      const lowerTask = task.toLowerCase();
      let action = "verification";

      if (lowerTask.includes("test") || lowerTask.includes("vitest")) {
        action = "test_writing";
      } else if (lowerTask.includes("debug") || lowerTask.includes("fix")) {
        action = "debugging";
      }

      // TODO: Integrate with actual testing/debugging logic
      // For now, return a placeholder result indicating the task was received
      // The actual implementation will be connected to test runners and debugging tools

      return {
        success: true,
        data: {
          task,
          action,
          message: `QA worker processed task: ${task.substring(0, 100)}${task.length > 100 ? "..." : ""}`,
        },
        filesModified,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
});
