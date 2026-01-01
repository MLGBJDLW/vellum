// ============================================
// ArchitectWorker Implementation
// ============================================
// REQ-029: Builtin worker for system design and architecture tasks

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";

/**
 * ArchitectWorker - Level 2 worker specialized in system design.
 *
 * Handles tasks related to:
 * - System architecture design
 * - ADR (Architecture Decision Record) creation
 * - Design patterns and best practices
 * - Technical specifications
 *
 * **CAN EDIT**: Limited to ADR and design documentation files.
 *
 * @example
 * ```typescript
 * import { architectWorker } from './builtin/architect.js';
 *
 * // Check if worker can handle a task
 * architectWorker.canHandle('design the authentication system'); // true
 * architectWorker.canHandle('create ADR for caching strategy'); // true
 *
 * // Execute a task
 * const result = await architectWorker.execute({
 *   subsession,
 *   taskPacket,
 * });
 * ```
 */
export const architectWorker: BaseWorker = createBaseWorker({
  slug: "architect",
  name: "System Architect",
  capabilities: {
    canEdit: true, // Can edit ADRs and design docs
    canExecute: false,
    canNetwork: false,
    specializations: ["design", "adr", "system-design", "patterns"],
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

      // Determine the type of architecture task
      const lowerTask = task.toLowerCase();
      let action = "design";

      if (lowerTask.includes("adr")) {
        action = "adr_creation";
      } else if (lowerTask.includes("pattern")) {
        action = "pattern_recommendation";
      } else if (lowerTask.includes("system") || lowerTask.includes("architecture")) {
        action = "system_design";
      } else if (lowerTask.includes("specification") || lowerTask.includes("spec")) {
        action = "technical_specification";
      }

      // TODO: Integrate with actual architecture design logic
      // For now, return a placeholder result indicating the task was received
      // The actual implementation will be connected to design tools and templates

      return {
        success: true,
        data: {
          task,
          action,
          message: `Architect worker processed task: ${task.substring(0, 100)}${task.length > 100 ? "..." : ""}`,
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
