/**
 * Cost Limits Types (Phase 35+)
 *
 * Type definitions for cost limits, guardrails, and budget enforcement.
 *
 * @module @vellum/core/cost
 * @see REQ-COST-005 - Cost limits and guardrails
 */

import { z } from "zod";

// =============================================================================
// Cost Limits Configuration Schema
// =============================================================================

/**
 * Cost limits configuration schema with sensible defaults.
 *
 * @example
 * ```typescript
 * const limits: CostLimitsConfig = {
 *   maxCostPerSession: 5.00,      // $5.00 max
 *   maxRequestsPerSession: 100,   // 100 requests max
 *   warningThreshold: 0.8,        // Warn at 80%
 *   pauseOnLimitReached: true,    // Pause for approval
 * };
 * ```
 */
export const CostLimitsConfigSchema = z.object({
  /** Maximum cost per session in USD (e.g., 5.00 for $5.00) */
  maxCostPerSession: z.number().positive().optional(),

  /** Maximum number of requests per session */
  maxRequestsPerSession: z.number().int().positive().optional(),

  /** Warning threshold as a fraction (e.g., 0.8 for 80%) */
  warningThreshold: z.number().min(0).max(1).default(0.8),

  /** Whether to pause execution when limit is reached (true = pause for approval) */
  pauseOnLimitReached: z.boolean().default(false),
});

export type CostLimitsConfig = z.infer<typeof CostLimitsConfigSchema>;

// =============================================================================
// Limit Check Result Types
// =============================================================================

/**
 * Reason why a limit was reached.
 */
export type LimitReason = "cost" | "requests";

/**
 * Result of checking cost limits.
 */
export interface LimitCheckResult {
  /** Whether operation is within all limits */
  withinLimits: boolean;

  /** Current cost used in USD */
  costUsed: number;

  /** Cost limit in USD (undefined if no limit set) */
  costLimit: number | undefined;

  /** Number of requests made */
  requestsUsed: number;

  /** Request limit (undefined if no limit set) */
  requestLimit: number | undefined;

  /** Percentage of limit used (0-100, based on highest limit reached) */
  percentUsed: number;

  /** Which limit was exceeded (if any) */
  reason?: LimitReason;
}

// =============================================================================
// Cost Limit Events
// =============================================================================

/**
 * Event emitted when approaching a limit.
 */
export interface CostWarningEvent {
  /** Type of limit being approached */
  type: LimitReason;

  /** Current usage (cost in USD or request count) */
  current: number;

  /** Limit value */
  limit: number;

  /** Percentage used (0-100) */
  percentUsed: number;
}

/**
 * Event emitted when a limit is reached.
 */
export interface CostLimitReachedEvent {
  /** Type of limit reached */
  type: LimitReason;

  /** Current usage at time limit was reached */
  current: number;

  /** The limit that was reached */
  limit: number;

  /** Whether execution should pause for approval */
  requiresApproval: boolean;
}

/**
 * Event emitted when user approves continuation after limit.
 */
export interface CostApprovedEvent {
  /** Type of limit that was approved */
  type: LimitReason;

  /** Amount approved (cost or requests) */
  approvedAmount: number;

  /** New limit after approval (may be extended) */
  newLimit?: number;
}

// =============================================================================
// Limit Handler Events Interface
// =============================================================================

/**
 * Events emitted by CostLimitHandler.
 */
export interface CostLimitHandlerEvents {
  /** Emitted when approaching a limit threshold */
  warning: [event: CostWarningEvent];

  /** Emitted when a limit is reached */
  limitReached: [event: CostLimitReachedEvent];

  /** Emitted when user approves continuation */
  approved: [event: CostApprovedEvent];
}
