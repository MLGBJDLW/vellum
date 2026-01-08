// ============================================
// DevOpsWorker Implementation
// ============================================
// REQ-029: Builtin worker for deployment and infrastructure tasks

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";
import { executeWorkerTask } from "../worker-executor.js";

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
 * Uses AgentLoop for actual LLM-powered DevOps with tools:
 * - read_file: Read config files
 * - write_file: Create configs and scripts
 * - search_files: Find relevant files
 * - list_dir: Explore project structure
 * - bash/shell: Run deployment commands
 * - smart_edit: Edit configurations
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
    // Execute using the worker executor with devops-specific configuration
    return executeWorkerTask("devops", context, {
      maxIterations: 20, // DevOps tasks may involve multiple steps
      timeout: 300000, // 5 minutes for deployment tasks
    });
  },
});
