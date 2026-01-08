// ============================================
// QAWorker Implementation
// ============================================
// REQ-029: Builtin worker for testing and debugging tasks

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";
import { executeWorkerTask } from "../worker-executor.js";

/**
 * QAWorker - Level 2 worker specialized in testing and quality assurance.
 *
 * Handles tasks related to:
 * - Writing and running tests
 * - Debugging issues and fixing bugs
 * - Verification and validation of implementations
 * - Vitest test framework integration
 *
 * Uses AgentLoop for actual LLM-powered QA with tools:
 * - read_file: Read source and test files
 * - write_file: Create new test files
 * - search_files: Find test patterns
 * - codebase_search: Semantic search for code
 * - list_dir: Explore test structure
 * - bash/shell: Run test commands
 * - smart_edit: Edit test files
 * - lsp: Go-to-definition, find usages
 *
 * @example
 * ```typescript
 * import { qaWorker } from './builtin/qa.js';
 *
 * // Check if worker can handle a task
 * qaWorker.canHandle('write tests for auth module'); // true
 *
 * // Execute a task
 * const result = await qaWorker.execute({
 *   subsession,
 *   taskPacket,
 * });
 * ```
 */
export const qaWorker: BaseWorker = createBaseWorker({
  slug: "qa",
  name: "QA Engineer",
  capabilities: {
    canEdit: true,
    canExecute: true,
    canNetwork: false,
    specializations: ["testing", "debugging", "verification", "vitest"],
  },
  handler: async (context): Promise<WorkerResult> => {
    // Execute using the worker executor with QA-specific configuration
    return executeWorkerTask("qa", context, {
      maxIterations: 20, // Tests may need multiple iterations to get right
      timeout: 180000, // 3 minutes for test suites
    });
  },
});
