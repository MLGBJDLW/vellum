/**
 * Auto-Approval Limits Handler for Vellum
 *
 * Tracks and enforces limits on automatic approvals per session.
 * Supports both request count and cost limits for consecutive auto-approvals.
 * Counters reset on user interaction for safety.
 *
 * Implements REQ-012: Auto-approval limits for safety.
 *
 * @module @vellum/core/permission
 */

// ============================================
// Constants
// ============================================

/**
 * Default maximum number of consecutive auto-approved requests.
 */
export const DEFAULT_AUTO_APPROVAL_REQUEST_LIMIT = 100;

/**
 * Default maximum cost for consecutive auto-approved operations (in USD).
 */
export const DEFAULT_AUTO_APPROVAL_COST_LIMIT = 10.0;

/**
 * Legacy export for backward compatibility.
 * @deprecated Use DEFAULT_AUTO_APPROVAL_REQUEST_LIMIT instead
 */
export const DEFAULT_AUTO_APPROVAL_LIMIT = DEFAULT_AUTO_APPROVAL_REQUEST_LIMIT;

// ============================================
// Types
// ============================================

/**
 * Configuration for auto-approval limits.
 *
 * @example
 * ```typescript
 * const config: AutoApprovalConfig = {
 *   maxConsecutiveRequests: 50,
 *   maxConsecutiveCost: 5.00,
 *   resetOnUserInteraction: true,
 * };
 * ```
 */
export interface AutoApprovalConfig {
  /** Maximum number of consecutive auto-approved requests (e.g., 50) */
  maxConsecutiveRequests?: number;
  /** Maximum cost for consecutive auto-approved operations in USD (e.g., 5.00) */
  maxConsecutiveCost?: number;
  /** Whether to reset counters when user sends a message (default: true) */
  resetOnUserInteraction?: boolean;
}

/**
 * Result of checking auto-approval limits.
 */
export interface AutoApprovalResult {
  /** Whether the operation should proceed with auto-approval */
  shouldProceed: boolean;
  /** Whether manual approval is required */
  requiresApproval: boolean;
  /** Which limit triggered approval requirement */
  approvalType?: "requests" | "cost";
  /** Current count/cost at time of check */
  currentValue?: number;
  /** The limit that was reached */
  limitValue?: number;
}

/**
 * Current state of auto-approval tracking.
 */
export interface AutoApprovalState {
  /** Number of consecutive auto-approved requests */
  consecutiveRequests: number;
  /** Cumulative cost of consecutive auto-approved operations in USD */
  consecutiveCost: number;
  /** Maximum requests limit */
  requestLimit: number;
  /** Maximum cost limit in USD */
  costLimit: number;
  /** Whether request limit is reached */
  requestLimitReached: boolean;
  /** Whether cost limit is reached */
  costLimitReached: boolean;
  /** Percentage of request limit used (0-100) */
  requestPercentUsed: number;
  /** Percentage of cost limit used (0-100) */
  costPercentUsed: number;
}

/**
 * Options for AutoApprovalLimitsHandler.
 */
export interface AutoApprovalLimitsHandlerOptions {
  /** Maximum number of auto-approvals allowed per session (legacy, use config.maxConsecutiveRequests) */
  limit?: number;
  /** Enable detailed tracking per permission type */
  trackByType?: boolean;
  /** Auto-approval configuration with cost limits */
  config?: AutoApprovalConfig;
}

/**
 * Statistics about auto-approvals.
 */
export interface AutoApprovalStats {
  /** Total number of auto-approvals recorded */
  total: number;
  /** Maximum limit (request limit) */
  limit: number;
  /** Number of remaining auto-approvals (based on request limit) */
  remaining: number;
  /** Whether the limit has been reached (request OR cost) */
  limitReached: boolean;
  /** Counts by permission type (if tracking enabled) */
  byType?: Record<string, number>;
  /** Current consecutive cost in USD */
  consecutiveCost: number;
  /** Maximum cost limit in USD */
  costLimit: number;
  /** Which limit type was reached */
  reachedType?: "requests" | "cost";
}

/**
 * Options for recording an approval.
 */
export interface RecordApprovalOptions {
  /** Type of permission (for per-type tracking) */
  type?: string;
  /** Cost of the operation in USD (for cost tracking) */
  cost?: number;
  /** Metadata about the approval */
  metadata?: Record<string, unknown>;
}

// ============================================
// AutoApprovalLimitsHandler
// ============================================

/**
 * Tracks and enforces auto-approval limits.
 *
 * Features:
 * - Configurable request limit (default: 100 per session)
 * - Configurable cost limit (default: $10.00 per session)
 * - Reset on user interaction for safety
 * - Optional per-type tracking
 * - Backward compatible with existing API
 *
 * @example
 * ```typescript
 * // Basic usage with request counting
 * const handler = new AutoApprovalLimitsHandler({ limit: 50 });
 *
 * // With cost tracking
 * const handler = new AutoApprovalLimitsHandler({
 *   config: {
 *     maxConsecutiveRequests: 50,
 *     maxConsecutiveCost: 5.00,
 *     resetOnUserInteraction: true,
 *   },
 * });
 *
 * // Check before auto-approving
 * const result = handler.checkAutoApprovalLimits();
 * if (result.requiresApproval) {
 *   // Ask user for permission
 * } else {
 *   handler.trackAutoApproval(0.05); // Track with cost
 * }
 *
 * // Reset on user message
 * handler.resetOnUserMessage();
 * ```
 */
export class AutoApprovalLimitsHandler {
  readonly #requestLimit: number;
  readonly #costLimit: number;
  readonly #trackByType: boolean;
  readonly #resetOnUserInteraction: boolean;
  #count: number = 0;
  #consecutiveCost: number = 0;
  #byType: Map<string, number> = new Map();

  /**
   * Creates a new AutoApprovalLimitsHandler.
   *
   * @param options - Configuration options
   */
  constructor(options: AutoApprovalLimitsHandlerOptions = {}) {
    // Support legacy `limit` option and new `config` option
    this.#requestLimit =
      options.config?.maxConsecutiveRequests ??
      options.limit ??
      DEFAULT_AUTO_APPROVAL_REQUEST_LIMIT;
    this.#costLimit = options.config?.maxConsecutiveCost ?? DEFAULT_AUTO_APPROVAL_COST_LIMIT;
    this.#trackByType = options.trackByType ?? false;
    this.#resetOnUserInteraction = options.config?.resetOnUserInteraction ?? true;
  }

  // ============================================
  // New API: Auto-Approval Limits Checking
  // ============================================

  /**
   * Check if auto-approval limits have been reached.
   *
   * Call this before auto-approving an operation to determine
   * if manual approval is required.
   *
   * @returns Result indicating whether to proceed or require approval
   *
   * @example
   * ```typescript
   * const result = handler.checkAutoApprovalLimits();
   * if (result.requiresApproval) {
   *   console.log(`[!] ${result.approvalType} limit reached`);
   * }
   * ```
   */
  checkAutoApprovalLimits(): AutoApprovalResult {
    // Check request limit
    if (this.#count >= this.#requestLimit) {
      return {
        shouldProceed: false,
        requiresApproval: true,
        approvalType: "requests",
        currentValue: this.#count,
        limitValue: this.#requestLimit,
      };
    }

    // Check cost limit
    if (this.#consecutiveCost >= this.#costLimit) {
      return {
        shouldProceed: false,
        requiresApproval: true,
        approvalType: "cost",
        currentValue: this.#consecutiveCost,
        limitValue: this.#costLimit,
      };
    }

    // Within limits
    return {
      shouldProceed: true,
      requiresApproval: false,
    };
  }

  /**
   * Track an auto-approved operation.
   *
   * Call this after successfully auto-approving an operation.
   *
   * @param cost - Cost of the operation in USD (optional)
   *
   * @example
   * ```typescript
   * handler.trackAutoApproval(0.05); // Track operation costing $0.05
   * handler.trackAutoApproval();     // Track without cost
   * ```
   */
  trackAutoApproval(cost?: number): void {
    this.#count++;
    if (cost !== undefined && cost > 0) {
      this.#consecutiveCost += cost;
    }
  }

  /**
   * Reset counters on user interaction.
   *
   * Call this when the user sends a message to reset consecutive counters.
   * This is a safety measure to ensure the user stays engaged.
   *
   * @example
   * ```typescript
   * // In message handler
   * if (message.role === 'user') {
   *   handler.resetOnUserMessage();
   * }
   * ```
   */
  resetOnUserMessage(): void {
    if (this.#resetOnUserInteraction) {
      this.#count = 0;
      this.#consecutiveCost = 0;
      this.#byType.clear();
    }
  }

  /**
   * Get the current state of auto-approval tracking.
   *
   * @returns Current state with all counters and limits
   *
   * @example
   * ```typescript
   * const state = handler.getState();
   * console.log(`Requests: ${state.consecutiveRequests}/${state.requestLimit}`);
   * console.log(`Cost: $${state.consecutiveCost.toFixed(2)}/${state.costLimit.toFixed(2)}`);
   * ```
   */
  getState(): AutoApprovalState {
    const requestPercentUsed =
      this.#requestLimit > 0 ? (this.#count / this.#requestLimit) * 100 : 0;
    const costPercentUsed =
      this.#costLimit > 0 ? (this.#consecutiveCost / this.#costLimit) * 100 : 0;

    return {
      consecutiveRequests: this.#count,
      consecutiveCost: this.#consecutiveCost,
      requestLimit: this.#requestLimit,
      costLimit: this.#costLimit,
      requestLimitReached: this.#count >= this.#requestLimit,
      costLimitReached: this.#consecutiveCost >= this.#costLimit,
      requestPercentUsed: Math.min(100, requestPercentUsed),
      costPercentUsed: Math.min(100, costPercentUsed),
    };
  }

  // ============================================
  // Legacy API (backward compatible)
  // ============================================

  /**
   * Record an auto-approval.
   *
   * @param options - Options for the approval
   * @returns true if the approval was recorded, false if limit was already reached
   */
  recordApproval(options: RecordApprovalOptions = {}): boolean {
    // Check limits first
    const result = this.checkAutoApprovalLimits();
    if (result.requiresApproval) {
      return false;
    }

    this.#count++;

    // Track cost if provided
    if (options.cost !== undefined && options.cost > 0) {
      this.#consecutiveCost += options.cost;
    }

    // Track by type if enabled
    if (this.#trackByType && options.type) {
      const typeCount = this.#byType.get(options.type) ?? 0;
      this.#byType.set(options.type, typeCount + 1);
    }

    return true;
  }

  /**
   * Check if the auto-approval limit has been reached.
   *
   * @returns true if either limit (request or cost) has been reached
   */
  isLimitReached(): boolean {
    return this.#count >= this.#requestLimit || this.#consecutiveCost >= this.#costLimit;
  }

  /**
   * Get the number of remaining auto-approvals (based on request limit).
   *
   * @returns Number of remaining auto-approvals
   */
  getRemaining(): number {
    return Math.max(0, this.#requestLimit - this.#count);
  }

  /**
   * Get the current count of auto-approvals.
   *
   * @returns Current approval count
   */
  getCount(): number {
    return this.#count;
  }

  /**
   * Get the configured limit (request limit).
   *
   * @returns The auto-approval request limit
   */
  getLimit(): number {
    return this.#requestLimit;
  }

  /**
   * Get the current consecutive cost.
   *
   * @returns Current consecutive cost in USD
   */
  getConsecutiveCost(): number {
    return this.#consecutiveCost;
  }

  /**
   * Get the configured cost limit.
   *
   * @returns The auto-approval cost limit in USD
   */
  getCostLimit(): number {
    return this.#costLimit;
  }

  /**
   * Get statistics about auto-approvals.
   *
   * @returns Auto-approval statistics
   */
  getStats(): AutoApprovalStats {
    const requestLimitReached = this.#count >= this.#requestLimit;
    const costLimitReached = this.#consecutiveCost >= this.#costLimit;

    const stats: AutoApprovalStats = {
      total: this.#count,
      limit: this.#requestLimit,
      remaining: this.getRemaining(),
      limitReached: requestLimitReached || costLimitReached,
      consecutiveCost: this.#consecutiveCost,
      costLimit: this.#costLimit,
    };

    if (stats.limitReached) {
      stats.reachedType = requestLimitReached ? "requests" : "cost";
    }

    if (this.#trackByType && this.#byType.size > 0) {
      stats.byType = Object.fromEntries(this.#byType);
    }

    return stats;
  }

  /**
   * Reset the approval count and cost.
   *
   * Call this at the start of a new session.
   */
  reset(): void {
    this.#count = 0;
    this.#consecutiveCost = 0;
    this.#byType.clear();
  }

  /**
   * Check if a specific number of approvals can be made.
   *
   * @param count - Number of approvals to check
   * @returns true if the specified number of approvals is available
   */
  canApprove(count: number = 1): boolean {
    return this.#count + count <= this.#requestLimit;
  }
}

/**
 * Create an AutoApprovalLimitsHandler with default options.
 *
 * @param options - Optional configuration
 * @returns Configured AutoApprovalLimitsHandler instance
 */
export function createAutoApprovalLimitsHandler(
  options?: AutoApprovalLimitsHandlerOptions
): AutoApprovalLimitsHandler {
  return new AutoApprovalLimitsHandler(options);
}
