// ============================================
// Approval Forwarder for Subagent Permission Requests
// ============================================
// Implements Codex pattern for forwarding approval requests
// from subagents to parent orchestrator with caching support.

import { z } from "zod";

// ============================================
// Types and Schemas
// ============================================

/**
 * Request for approval from a subagent to execute a tool.
 */
export interface ApprovalRequest {
  /** Unique identifier for this approval request */
  requestId: string;
  /** Identifier of the subagent requesting approval */
  subagentId: string;
  /** Session ID of the parent orchestrator */
  parentSessionId: string;
  /** Name of the tool requiring approval */
  tool: string;
  /** Parameters for the tool execution */
  params: Record<string, unknown>;
  /** Optional reason for the request */
  reason?: string;
  /** Timestamp when request was created */
  createdAt: Date;
}

/**
 * Zod schema for ApprovalRequest validation.
 */
export const ApprovalRequestSchema = z.object({
  requestId: z.string().min(1),
  subagentId: z.string().min(1),
  parentSessionId: z.string().min(1),
  tool: z.string().min(1),
  params: z.record(z.unknown()),
  reason: z.string().optional(),
  createdAt: z.date(),
});

/**
 * Decision response for an approval request.
 */
export interface ApprovalDecision {
  /** ID of the request this decision responds to */
  requestId: string;
  /** Whether the request was approved */
  approved: boolean;
  /** Who/what approved the request */
  approvedBy?: "user" | "parent" | "cached";
  /** Timestamp when decision was made */
  decidedAt: Date;
}

/**
 * Zod schema for ApprovalDecision validation.
 */
export const ApprovalDecisionSchema = z.object({
  requestId: z.string().min(1),
  approved: z.boolean(),
  approvedBy: z.enum(["user", "parent", "cached"]).optional(),
  decidedAt: z.date(),
});

/**
 * Interface for forwarding approval requests from subagents to parent.
 * Implements caching to avoid redundant approval prompts.
 */
export interface ApprovalForwarder {
  /**
   * Forward an approval request to the parent handler.
   * Checks cache first for pre-approved patterns.
   *
   * @param request - The approval request to forward
   * @returns Promise resolving to the approval decision
   */
  forwardApproval(request: ApprovalRequest): Promise<ApprovalDecision>;

  /**
   * Check if a tool with given params is pre-approved.
   *
   * @param tool - Name of the tool
   * @param params - Parameters to check against approved patterns
   * @returns True if the tool+params match a registered pattern
   */
  isPreApproved(tool: string, params: Record<string, unknown>): boolean;

  /**
   * Register an approval pattern for a tool.
   * Future requests matching this pattern will be auto-approved.
   *
   * @param tool - Name of the tool
   * @param pattern - Parameter pattern to approve
   */
  registerApproval(tool: string, pattern: Record<string, unknown>): void;

  /**
   * Get all cached approval patterns.
   *
   * @returns Map of tool names to arrays of approved parameter patterns
   */
  getCachedApprovals(): Map<string, Record<string, unknown>[]>;

  /**
   * Clear all cached approvals.
   */
  clearCache(): void;
}

// ============================================
// Implementation
// ============================================

/**
 * Check if params match an approved pattern.
 * A pattern matches if all keys in the pattern exist in params
 * with equal values (shallow comparison).
 *
 * @param params - The actual parameters to check
 * @param pattern - The approved pattern to match against
 * @returns True if params match the pattern
 */
function matchesPattern(
  params: Record<string, unknown>,
  pattern: Record<string, unknown>
): boolean {
  for (const [key, value] of Object.entries(pattern)) {
    if (!(key in params)) {
      return false;
    }
    // Deep equality check for objects/arrays, strict equality for primitives
    const paramValue = params[key];
    if (typeof value === "object" && value !== null) {
      if (typeof paramValue !== "object" || paramValue === null) {
        return false;
      }
      // Recursive check for nested objects
      if (
        !matchesPattern(paramValue as Record<string, unknown>, value as Record<string, unknown>)
      ) {
        return false;
      }
    } else if (paramValue !== value) {
      return false;
    }
  }
  return true;
}

/**
 * Creates an ApprovalForwarder instance with the given parent handler.
 *
 * The forwarder implements the Codex pattern:
 * 1. Check cache for pre-approved patterns
 * 2. If not cached, forward to parent handler
 * 3. Cache approved patterns for future requests
 *
 * @param parentHandler - Function to call when approval needs parent decision
 * @returns An ApprovalForwarder instance
 *
 * @example
 * ```typescript
 * const forwarder = createApprovalForwarder(async (req) => {
 *   // Forward to user or parent agent
 *   return await askUser(`Allow ${req.tool}?`);
 * });
 *
 * // Register a pattern for auto-approval
 * forwarder.registerApproval('readFile', { path: '/safe/dir/*' });
 *
 * // Forward a request
 * const decision = await forwarder.forwardApproval({
 *   requestId: 'req-123',
 *   subagentId: 'agent-1',
 *   parentSessionId: 'session-1',
 *   tool: 'readFile',
 *   params: { path: '/safe/dir/file.txt' },
 *   createdAt: new Date(),
 * });
 * ```
 */
export function createApprovalForwarder(
  parentHandler: (req: ApprovalRequest) => Promise<boolean>
): ApprovalForwarder {
  // Cache: Map<toolName, Array<approvedParamPatterns>>
  const approvalCache = new Map<string, Record<string, unknown>[]>();

  return {
    async forwardApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
      // Validate request
      ApprovalRequestSchema.parse(request);

      // Check cache first (Codex pattern: cache before forward)
      if (this.isPreApproved(request.tool, request.params)) {
        return {
          requestId: request.requestId,
          approved: true,
          approvedBy: "cached",
          decidedAt: new Date(),
        };
      }

      // Forward to parent handler
      const approved = await parentHandler(request);

      // If approved, register the pattern for future requests
      if (approved) {
        this.registerApproval(request.tool, request.params);
      }

      return {
        requestId: request.requestId,
        approved,
        approvedBy: "parent",
        decidedAt: new Date(),
      };
    },

    isPreApproved(tool: string, params: Record<string, unknown>): boolean {
      const patterns = approvalCache.get(tool);
      if (!patterns || patterns.length === 0) {
        return false;
      }

      // Check if params match any registered pattern
      return patterns.some((pattern) => matchesPattern(params, pattern));
    },

    registerApproval(tool: string, pattern: Record<string, unknown>): void {
      const existing = approvalCache.get(tool) ?? [];

      // Avoid duplicate patterns
      const isDuplicate = existing.some(
        (existingPattern) => JSON.stringify(existingPattern) === JSON.stringify(pattern)
      );

      if (!isDuplicate) {
        existing.push(pattern);
        approvalCache.set(tool, existing);
      }
    },

    getCachedApprovals(): Map<string, Record<string, unknown>[]> {
      // Return a copy to prevent external mutation
      const copy = new Map<string, Record<string, unknown>[]>();
      for (const [tool, patterns] of approvalCache) {
        copy.set(tool, [...patterns]);
      }
      return copy;
    },

    clearCache(): void {
      approvalCache.clear();
    },
  };
}
