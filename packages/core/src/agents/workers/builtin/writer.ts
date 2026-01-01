// ============================================
// WriterWorker Implementation
// ============================================
// REQ-029: Builtin worker for documentation tasks

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";

/**
 * WriterWorker - Level 2 worker specialized in technical documentation.
 *
 * Handles tasks related to:
 * - Writing and updating documentation
 * - Creating and maintaining README files
 * - Generating API documentation
 * - Writing changelogs and release notes
 * - Markdown content creation and editing
 *
 * @example
 * ```typescript
 * import { writerWorker } from './builtin/writer.js';
 *
 * // Check if worker can handle a task
 * writerWorker.canHandle('update the README with usage examples'); // true
 *
 * // Execute a task
 * const result = await writerWorker.execute({
 *   subsession,
 *   taskPacket,
 * });
 * ```
 */
export const writerWorker: BaseWorker = createBaseWorker({
  slug: "writer",
  name: "Technical Writer",
  capabilities: {
    canEdit: true,
    canExecute: false,
    canNetwork: false,
    specializations: ["documentation", "readme", "api-docs", "changelog", "markdown"],
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

      // Determine the type of documentation task
      const lowerTask = task.toLowerCase();
      let action = "documentation";

      if (lowerTask.includes("readme")) {
        action = "readme_update";
      } else if (lowerTask.includes("api") || lowerTask.includes("api-docs")) {
        action = "api_documentation";
      } else if (lowerTask.includes("changelog") || lowerTask.includes("release")) {
        action = "changelog_update";
      } else if (lowerTask.includes("markdown") || lowerTask.includes("md")) {
        action = "markdown_editing";
      }

      // TODO: Integrate with actual documentation generation logic
      // For now, return a placeholder result indicating the task was received
      // The actual implementation will be connected to doc generation and file editing

      return {
        success: true,
        data: {
          task,
          action,
          message: `Writer worker processed task: ${task.substring(0, 100)}${task.length > 100 ? "..." : ""}`,
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
