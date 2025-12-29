/**
 * Auto-Approval Limits Handler for Vellum
 *
 * Tracks and enforces limits on automatic approvals per session.
 * Implements REQ-012: Auto-approval limits for safety.
 *
 * @module @vellum/core/permission
 */

// ============================================
// Constants
// ============================================

/**
 * Default maximum number of auto-approvals per session.
 */
export const DEFAULT_AUTO_APPROVAL_LIMIT = 100;

// ============================================
// Types
// ============================================

/**
 * Options for AutoApprovalLimitsHandler.
 */
export interface AutoApprovalLimitsHandlerOptions {
  /** Maximum number of auto-approvals allowed per session */
  limit?: number;
  /** Enable detailed tracking per permission type */
  trackByType?: boolean;
}

/**
 * Statistics about auto-approvals.
 */
export interface AutoApprovalStats {
  /** Total number of auto-approvals recorded */
  total: number;
  /** Maximum limit */
  limit: number;
  /** Number of remaining auto-approvals */
  remaining: number;
  /** Whether the limit has been reached */
  limitReached: boolean;
  /** Counts by permission type (if tracking enabled) */
  byType?: Record<string, number>;
}

/**
 * Options for recording an approval.
 */
export interface RecordApprovalOptions {
  /** Type of permission (for per-type tracking) */
  type?: string;
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
 * - Configurable limit (default: 100 per session)
 * - Record approvals and check if limit reached
 * - Optional per-type tracking
 * - Reset capability for new sessions
 *
 * @example
 * ```typescript
 * const handler = new AutoApprovalLimitsHandler({ limit: 50 });
 *
 * // Check before auto-approving
 * if (!handler.isLimitReached()) {
 *   handler.recordApproval({ type: 'bash' });
 *   // Proceed with auto-approval
 * }
 *
 * // Get stats
 * const stats = handler.getStats();
 * console.log(`${stats.remaining} auto-approvals remaining`);
 *
 * // Reset for new session
 * handler.reset();
 * ```
 */
export class AutoApprovalLimitsHandler {
  readonly #limit: number;
  readonly #trackByType: boolean;
  #count: number = 0;
  #byType: Map<string, number> = new Map();

  /**
   * Creates a new AutoApprovalLimitsHandler.
   *
   * @param options - Configuration options
   */
  constructor(options: AutoApprovalLimitsHandlerOptions = {}) {
    this.#limit = options.limit ?? DEFAULT_AUTO_APPROVAL_LIMIT;
    this.#trackByType = options.trackByType ?? false;
  }

  /**
   * Record an auto-approval.
   *
   * @param options - Options for the approval
   * @returns true if the approval was recorded, false if limit was already reached
   */
  recordApproval(options: RecordApprovalOptions = {}): boolean {
    if (this.#count >= this.#limit) {
      return false;
    }

    this.#count++;

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
   * @returns true if the limit has been reached
   */
  isLimitReached(): boolean {
    return this.#count >= this.#limit;
  }

  /**
   * Get the number of remaining auto-approvals.
   *
   * @returns Number of remaining auto-approvals
   */
  getRemaining(): number {
    return Math.max(0, this.#limit - this.#count);
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
   * Get the configured limit.
   *
   * @returns The auto-approval limit
   */
  getLimit(): number {
    return this.#limit;
  }

  /**
   * Get statistics about auto-approvals.
   *
   * @returns Auto-approval statistics
   */
  getStats(): AutoApprovalStats {
    const stats: AutoApprovalStats = {
      total: this.#count,
      limit: this.#limit,
      remaining: this.getRemaining(),
      limitReached: this.isLimitReached(),
    };

    if (this.#trackByType && this.#byType.size > 0) {
      stats.byType = Object.fromEntries(this.#byType);
    }

    return stats;
  }

  /**
   * Reset the approval count.
   *
   * Call this at the start of a new session.
   */
  reset(): void {
    this.#count = 0;
    this.#byType.clear();
  }

  /**
   * Check if a specific number of approvals can be made.
   *
   * @param count - Number of approvals to check
   * @returns true if the specified number of approvals is available
   */
  canApprove(count: number = 1): boolean {
    return this.#count + count <= this.#limit;
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
