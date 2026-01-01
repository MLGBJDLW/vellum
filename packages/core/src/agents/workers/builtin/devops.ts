// ============================================
// DevOpsWorker Implementation
// ============================================
// REQ-029: Builtin worker for deployment and infrastructure tasks

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";

/**
 * DevOpsWorker - Level 2 worker specialized in DevOps and infrastructure.
 *
 * Handles tasks related to:
 * - Deployment configuration and automation
 * - CI/CD pipeline setup and maintenance
 * - Docker containerization
 * - Infrastructure management
 *
 * **FULL ACCESS**: Can edit files, execute commands, and make network requests.
 *
 * @example
 * ```typescript
 * import { devopsWorker } from './builtin/devops.js';
 *
 * // Check if worker can handle a task
 * devopsWorker.canHandle('deploy to production'); // true
 * devopsWorker.canHandle('setup docker container'); // true
 *
 * // Execute a task
 * const result = await devopsWorker.execute({
 *   subsession,
 *   taskPacket,
 * });
 * ```
 */
export const devopsWorker: BaseWorker = createBaseWorker({
  slug: "devops",
  name: "DevOps Engineer",
  capabilities: {
    canEdit: true, // Can edit config files
    canExecute: true, // Can run deployment commands
    canNetwork: true, // Can access external services
    specializations: ["deployment", "ci-cd", "docker", "infrastructure"],
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

      // Determine the type of DevOps task
      const lowerTask = task.toLowerCase();
      let action = "devops_operation";

      if (lowerTask.includes("deploy")) {
        action = "deployment";
      } else if (
        lowerTask.includes("ci") ||
        lowerTask.includes("cd") ||
        lowerTask.includes("pipeline")
      ) {
        action = "ci_cd_setup";
      } else if (lowerTask.includes("docker") || lowerTask.includes("container")) {
        action = "containerization";
      } else if (lowerTask.includes("infrastructure") || lowerTask.includes("infra")) {
        action = "infrastructure_management";
      }

      // TODO: Integrate with actual DevOps tooling
      // For now, return a placeholder result indicating the task was received
      // The actual implementation will be connected to deployment and infrastructure tools

      return {
        success: true,
        data: {
          task,
          action,
          message: `DevOps worker processed task: ${task.substring(0, 100)}${task.length > 100 ? "..." : ""}`,
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
