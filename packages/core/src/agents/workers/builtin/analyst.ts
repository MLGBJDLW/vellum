// ============================================
// AnalystWorker Implementation
// ============================================
// REQ-029: Builtin worker for code analysis tasks (READ-ONLY)

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";

/**
 * AnalystWorker - Level 2 worker specialized in code analysis (READ-ONLY).
 *
 * Handles tasks related to:
 * - Code analysis and review
 * - Dependency mapping and tracing
 * - Impact assessment for changes
 * - Architecture review and documentation
 *
 * **IMPORTANT**: This worker is READ-ONLY and cannot modify files.
 *
 * @example
 * ```typescript
 * import { analystWorker } from './builtin/analyst.js';
 *
 * // Check if worker can handle a task
 * analystWorker.canHandle('analyze dependencies for auth module'); // true
 *
 * // Execute a task
 * const result = await analystWorker.execute({
 *   subsession,
 *   taskPacket,
 * });
 * ```
 */
export const analystWorker: BaseWorker = createBaseWorker({
  slug: "analyst",
  name: "Code Analyst",
  capabilities: {
    canEdit: false, // READ-ONLY: Analyst cannot modify files
    canExecute: false,
    canNetwork: false,
    specializations: ["analysis", "review", "dependency-mapping", "impact-assessment"],
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

      // Determine the type of analysis task
      const lowerTask = task.toLowerCase();
      let action = "analysis";

      if (lowerTask.includes("review")) {
        action = "code_review";
      } else if (lowerTask.includes("dependency") || lowerTask.includes("dependencies")) {
        action = "dependency_mapping";
      } else if (lowerTask.includes("impact")) {
        action = "impact_assessment";
      } else if (lowerTask.includes("architecture") || lowerTask.includes("structure")) {
        action = "architecture_analysis";
      }

      // TODO: Integrate with actual code analysis logic
      // For now, return a placeholder result indicating the task was received
      // The actual implementation will be connected to code analysis tools

      // NOTE: Analyst is READ-ONLY, so filesModified should always be empty
      return {
        success: true,
        data: {
          task,
          action,
          readOnly: true,
          message: `Analyst worker processed task: ${task.substring(0, 100)}${task.length > 100 ? "..." : ""}`,
        },
        filesModified: [], // Always empty for read-only worker
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
});
