// ============================================
// WriterWorker Implementation
// ============================================
// REQ-029: Builtin worker for documentation tasks

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";
import { executeWorkerTask } from "../worker-executor.js";

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
 * Uses AgentLoop for actual LLM-powered documentation with tools:
 * - read_file: Read source files and docs
 * - write_file: Create new documentation
 * - search_files: Find existing docs
 * - codebase_search: Understand code for documentation
 * - list_dir: Explore project structure
 * - smart_edit: Edit existing documentation
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
    // Execute using the worker executor with writer-specific configuration
    return executeWorkerTask("writer", context, {
      maxIterations: 15, // Documentation tasks are typically well-scoped
    });
  },
});
