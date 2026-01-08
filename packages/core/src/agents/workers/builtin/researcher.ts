// ============================================
// ResearcherWorker Implementation
// ============================================
// REQ-029: Builtin worker for research and exploration tasks (READ-ONLY)

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";
import { executeWorkerTask } from "../worker-executor.js";

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
 * Uses AgentLoop for actual LLM-powered research with tools:
 * - read_file: Read source files and docs
 * - search_files: Find relevant patterns
 * - codebase_search: Semantic search
 * - list_dir: Explore project structure
 * - web_fetch: Fetch web resources
 * - web_search: Search the web
 * - doc_lookup: Query documentation
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
    // Execute using the worker executor with researcher-specific configuration
    const result = await executeWorkerTask("researcher", context, {
      maxIterations: 25, // Research may need many iterations for thorough results
      timeout: 300000, // 5 minutes for web-based research
    });

    // Ensure filesModified is always empty for read-only worker
    return {
      ...result,
      filesModified: [], // Always empty for read-only worker
    };
  },
});
