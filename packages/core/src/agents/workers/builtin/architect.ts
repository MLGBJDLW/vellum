// ============================================
// ArchitectWorker Implementation
// ============================================
// REQ-029: Builtin worker for system design and architecture tasks

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";
import { executeWorkerTask } from "../worker-executor.js";

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
 * Uses AgentLoop for actual LLM-powered design with tools:
 * - read_file: Read existing code and docs
 * - write_file: Create ADRs and design docs
 * - search_files: Find relevant patterns
 * - codebase_search: Understand system structure
 * - list_dir: Explore project layout
 * - smart_edit: Edit existing documentation
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
    // Execute using the worker executor with architect-specific configuration
    return executeWorkerTask("architect", context, {
      maxIterations: 15, // Design tasks are typically well-scoped
    });
  },
});
