// ============================================
// Handoff Protocol Schema
// ============================================
// REQ-016: Agent-to-agent handoff protocol for result passing

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ============================================
// HandoffRequest Schema
// ============================================

/**
 * Request for handing off execution from one agent to another.
 *
 * Used when an agent needs to delegate control to another agent,
 * optionally passing context information along with the handoff.
 *
 * @example
 * ```typescript
 * const request = createHandoff(
 *   'coder',
 *   'qa',
 *   '550e8400-e29b-41d4-a716-446655440000',
 *   'Code implementation complete, needs testing'
 * );
 * ```
 */
export interface HandoffRequest {
  /** Auto-generated UUID for request identification */
  requestId: string;
  /** Source agent slug initiating the handoff */
  fromAgent: string;
  /** Target agent slug receiving the handoff */
  toAgent: string;
  /** Reference to the original TaskPacket being handed off */
  taskPacketId: string;
  /** Reason for the handoff */
  reason: string;
  /** Whether to pass context to the target agent */
  preserveContext: boolean;
  /** Timestamp when the request was created */
  createdAt: Date;
}

/**
 * Zod schema for HandoffRequest validation.
 *
 * @example
 * ```typescript
 * const result = HandoffRequestSchema.safeParse({
 *   requestId: '550e8400-e29b-41d4-a716-446655440000',
 *   fromAgent: 'coder',
 *   toAgent: 'qa',
 *   taskPacketId: '660e8400-e29b-41d4-a716-446655440001',
 *   reason: 'Implementation complete',
 *   preserveContext: true,
 *   createdAt: new Date(),
 * });
 *
 * if (result.success) {
 *   console.log('Valid handoff request:', result.data.requestId);
 * }
 * ```
 */
export const HandoffRequestSchema = z.object({
  requestId: z.string().uuid(),
  fromAgent: z.string().min(1, "Source agent slug cannot be empty"),
  toAgent: z.string().min(1, "Target agent slug cannot be empty"),
  taskPacketId: z.string().uuid(),
  reason: z.string().min(1, "Handoff reason cannot be empty"),
  preserveContext: z.boolean(),
  createdAt: z.date(),
});

// ============================================
// HandoffResult Schema
// ============================================

/**
 * Result of a handoff request.
 *
 * Indicates whether the target agent accepted the handoff and
 * provides details about the spawned agent or rejection reason.
 *
 * @example
 * ```typescript
 * const result: HandoffResult = {
 *   requestId: '550e8400-e29b-41d4-a716-446655440000',
 *   accepted: true,
 *   targetAgentId: 'qa-instance-001',
 *   completedAt: new Date(),
 * };
 * ```
 */
export interface HandoffResult {
  /** Matches the HandoffRequest requestId */
  requestId: string;
  /** Whether the handoff was accepted */
  accepted: boolean;
  /** ID of the spawned agent instance if accepted */
  targetAgentId?: string;
  /** Reason for rejection if not accepted */
  rejectionReason?: string;
  /** Timestamp when the handoff was completed */
  completedAt: Date;
}

/**
 * Zod schema for HandoffResult validation.
 *
 * Uses refinement to enforce mutual exclusivity:
 * - If accepted, targetAgentId should be present
 * - If rejected, rejectionReason should be present
 *
 * @example
 * ```typescript
 * // Accepted handoff
 * const accepted = HandoffResultSchema.safeParse({
 *   requestId: '550e8400-e29b-41d4-a716-446655440000',
 *   accepted: true,
 *   targetAgentId: 'qa-instance-001',
 *   completedAt: new Date(),
 * });
 *
 * // Rejected handoff
 * const rejected = HandoffResultSchema.safeParse({
 *   requestId: '550e8400-e29b-41d4-a716-446655440000',
 *   accepted: false,
 *   rejectionReason: 'Target agent unavailable',
 *   completedAt: new Date(),
 * });
 * ```
 */
export const HandoffResultSchema = z.object({
  requestId: z.string().uuid(),
  accepted: z.boolean(),
  targetAgentId: z.string().optional(),
  rejectionReason: z.string().optional(),
  completedAt: z.date(),
});

// ============================================
// Type Inference
// ============================================

/**
 * Inferred type from HandoffRequestSchema.
 */
export type HandoffRequestInferred = z.infer<typeof HandoffRequestSchema>;

/**
 * Inferred type from HandoffResultSchema.
 */
export type HandoffResultInferred = z.infer<typeof HandoffResultSchema>;

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new HandoffRequest with auto-generated requestId and createdAt.
 *
 * Factory function for creating properly initialized handoff requests.
 * Automatically generates a UUID for the requestId field and sets createdAt
 * to the current timestamp.
 *
 * @param fromAgent - Slug of the agent initiating the handoff
 * @param toAgent - Slug of the target agent
 * @param taskPacketId - UUID of the TaskPacket being handed off
 * @param reason - Reason for the handoff
 * @param preserveContext - Whether to pass context to target (default: true)
 * @returns A fully initialized HandoffRequest
 *
 * @example
 * ```typescript
 * // Basic handoff with context preservation (default)
 * const request = createHandoff(
 *   'coder',
 *   'qa',
 *   '550e8400-e29b-41d4-a716-446655440000',
 *   'Code implementation complete, ready for testing'
 * );
 *
 * // Handoff without context preservation
 * const cleanHandoff = createHandoff(
 *   'orchestrator',
 *   'coder',
 *   '660e8400-e29b-41d4-a716-446655440001',
 *   'Starting fresh implementation',
 *   false
 * );
 * ```
 */
export function createHandoff(
  fromAgent: string,
  toAgent: string,
  taskPacketId: string,
  reason: string,
  preserveContext = true
): HandoffRequest {
  return {
    requestId: randomUUID(),
    fromAgent,
    toAgent,
    taskPacketId,
    reason,
    preserveContext,
    createdAt: new Date(),
  };
}
