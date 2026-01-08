// ============================================
// CoderWorker Implementation
// ============================================
// REQ-029: Builtin worker for code implementation tasks

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";
import { executeWorkerTask } from "../worker-executor.js";

/**
 * CoderWorker - Level 2 worker specialized in code implementation.
 *
 * Handles tasks related to:
 * - Code implementation and feature development
 * - Refactoring and code improvements
 * - TypeScript and JavaScript development
 *
 * Uses AgentLoop for actual LLM-powered coding with tools:
 * - read_file: Read source files
 * - write_file: Create new files
 * - search_files: Find code patterns
 * - codebase_search: Semantic search
 * - list_dir: Explore structure
 * - bash/shell: Run commands
 * - smart_edit: Intelligent editing
 * - apply_diff/apply_patch: Apply changes
 * - search_and_replace: Pattern replacement
 * - lsp: Language server features
 *
 * @example
 * ```typescript
 * import { coderWorker } from './builtin/coder.js';
 *
 * // Check if worker can handle a task
 * coderWorker.canHandle('implement user authentication'); // true
 *
 * // Execute a task
 * const result = await coderWorker.execute({
 *   subsession,
 *   taskPacket,
 * });
 * ```
 */
export const coderWorker: BaseWorker = createBaseWorker({
  slug: "coder",
  name: "Coder",
  capabilities: {
    canEdit: true,
    canExecute: true,
    canNetwork: false,
    specializations: ["implementation", "refactoring", "typescript", "javascript"],
  },
  handler: async (context): Promise<WorkerResult> => {
    // Execute using the worker executor with coder-specific configuration
    return executeWorkerTask("coder", context, {
      maxIterations: 25, // Complex implementations may need more iterations
      timeout: 180000, // 3 minutes for larger tasks
    });
  },
});
