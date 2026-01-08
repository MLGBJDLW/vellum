// ============================================
// AnalystWorker Implementation
// ============================================
// REQ-029: Builtin worker for code analysis tasks (READ-ONLY)

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";
import { executeWorkerTask } from "../worker-executor.js";

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
 * Uses AgentLoop for actual LLM-powered analysis with tools:
 * - read_file: Read source files
 * - search_files: Search for patterns
 * - codebase_search: Semantic code search
 * - list_dir: Explore directory structure
 * - lsp: Language server features (go-to-definition, etc.)
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
    // Execute using the worker executor with analyst-specific configuration
    const result = await executeWorkerTask("analyst", context, {
      maxIterations: 20, // Analysis may need more iterations for thorough review
    });

    // Ensure filesModified is always empty for read-only worker
    return {
      ...result,
      filesModified: [], // Always empty for read-only worker
    };
  },
});
