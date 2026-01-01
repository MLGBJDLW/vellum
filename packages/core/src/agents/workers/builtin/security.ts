// ============================================
// SecurityWorker Implementation
// ============================================
// REQ-029: Builtin worker for security analysis and auditing tasks (READ-ONLY)

import { type BaseWorker, createBaseWorker, type WorkerResult } from "../base.js";

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

      // Determine the type of security task
      const lowerTask = task.toLowerCase();
      let action = "security_review";

      if (lowerTask.includes("vulnerability") || lowerTask.includes("vulnerabilities")) {
        action = "vulnerability_scan";
      } else if (lowerTask.includes("audit")) {
        action = "security_audit";
      } else if (lowerTask.includes("compliance")) {
        action = "compliance_check";
      } else if (lowerTask.includes("review")) {
        action = "security_review";
      }

      // TODO: Integrate with actual security scanning tools
      // For now, return a placeholder result indicating the task was received
      // The actual implementation will be connected to security analysis tools

      // NOTE: Security worker is READ-ONLY, filesModified should always be empty
      return {
        success: true,
        data: {
          task,
          action,
          readOnly: true,
          message: `Security worker processed task: ${task.substring(0, 100)}${task.length > 100 ? "..." : ""}`,
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
