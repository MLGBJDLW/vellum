// ============================================
// SecurityWorker Implementation
// ============================================
// REQ-029: Builtin worker for security analysis and auditing tasks (READ-ONLY)

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";
import { executeWorkerTask } from "../worker-executor.js";

/**
 * SecurityWorker - Level 2 worker specialized in security analysis (READ-ONLY).
 *
 * Handles tasks related to:
 * - Vulnerability scanning and assessment
 * - Security audits and reviews
 * - Compliance checking
 * - Security best practices validation
 *
 * **IMPORTANT**: This worker is READ-ONLY for audit integrity.
 * Security workers should not modify code they are auditing.
 *
 * Uses AgentLoop for actual LLM-powered security analysis with tools:
 * - read_file: Read source files for audit
 * - search_files: Find security patterns
 * - codebase_search: Semantic search for vulnerabilities
 * - list_dir: Explore project structure
 * - lsp: Language server features
 *
 * @example
 * ```typescript
 * import { securityWorker } from './builtin/security.js';
 *
 * // Check if worker can handle a task
 * securityWorker.canHandle('scan for vulnerabilities'); // true
 * securityWorker.canHandle('security audit of auth module'); // true
 *
 * // Execute a task
 * const result = await securityWorker.execute({
 *   subsession,
 *   taskPacket,
 * });
 * ```
 */
export const securityWorker: BaseWorker = createBaseWorker({
  slug: "security",
  name: "Security Analyst",
  capabilities: {
    canEdit: false, // READ-ONLY: Audit integrity requires no modifications
    canExecute: false, // No command execution for security isolation
    canNetwork: false, // No network access for security isolation
    specializations: ["vulnerability", "audit", "security-review", "compliance"],
  },
  handler: async (context): Promise<WorkerResult> => {
    // Execute using the worker executor with security-specific configuration
    const result = await executeWorkerTask("security", context, {
      maxIterations: 25, // Security audits may need thorough analysis
    });

    // Ensure filesModified is always empty for read-only worker
    return {
      ...result,
      filesModified: [], // Always empty for read-only worker
    };
  },
});
