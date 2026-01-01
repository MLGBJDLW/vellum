// ============================================
// ResearcherWorker Implementation
// ============================================
// REQ-029: Builtin worker for research and exploration tasks (READ-ONLY)

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";

/**
 * ResearcherWorker - Level 2 worker specialized in research and exploration (READ-ONLY).
 *
 * Handles tasks related to:
 * - Technical research and exploration
 * - API and library discovery
 * - Documentation gathering
 * - Feasibility studies
 *
 * **IMPORTANT**: This worker is READ-ONLY but has network access for research.
 *
 * @example
 * ```typescript
 * import { researcherWorker } from './builtin/researcher.js';
 *
 * // Check if worker can handle a task
 * researcherWorker.canHandle('research authentication libraries'); // true
 * researcherWorker.canHandle('explore API options for payments'); // true
 *
 * // Execute a task
 * const result = await researcherWorker.execute({
 *   subsession,
 *   taskPacket,
 * });
 * ```
 */
export const researcherWorker: BaseWorker = createBaseWorker({
  slug: "researcher",
  name: "Technical Researcher",
  capabilities: {
    canEdit: false, // READ-ONLY: Research should not modify code
    canExecute: false, // No command execution needed for research
    canNetwork: true, // Network access for documentation and API research
    specializations: ["research", "exploration", "discovery", "documentation"],
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

      // Determine the type of research task
      const lowerTask = task.toLowerCase();
      let action = "research";

      if (lowerTask.includes("exploration") || lowerTask.includes("explore")) {
        action = "exploration";
      } else if (lowerTask.includes("discovery") || lowerTask.includes("discover")) {
        action = "discovery";
      } else if (lowerTask.includes("documentation") || lowerTask.includes("docs")) {
        action = "documentation_gathering";
      } else if (lowerTask.includes("feasibility") || lowerTask.includes("evaluate")) {
        action = "feasibility_study";
      }

      // TODO: Integrate with actual research tools (web search, documentation APIs, etc.)
      // For now, return a placeholder result indicating the task was received
      // The actual implementation will be connected to research and discovery tools

      // NOTE: Researcher is READ-ONLY, filesModified should always be empty
      return {
        success: true,
        data: {
          task,
          action,
          readOnly: true,
          message: `Researcher worker processed task: ${task.substring(0, 100)}${task.length > 100 ? "..." : ""}`,
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
