/**
 * Cost Limit Handler (Phase 35+)
 *
 * Monitors cost and request usage against configured limits.
 * Emits warnings and limit events for guardrail enforcement.
 *
 * @module @vellum/core/cost
 * @see REQ-COST-005 - Cost limits and guardrails
 */

import { EventEmitter } from "node:events";

import type { CostService } from "./service.js";
import type {
  CostApprovedEvent,
  CostLimitHandlerEvents,
  CostLimitReachedEvent,
  CostLimitsConfig,
  CostWarningEvent,
  LimitCheckResult,
  LimitReason,
} from "./types-limits.js";

// =============================================================================
// CostLimitHandler Class
// =============================================================================

/**
 * Handler for monitoring and enforcing cost limits.
 *
 * Tracks cost and request usage against configured limits, emitting
 * warnings when approaching thresholds and limit events when exceeded.
 *
 * @example
 * ```typescript
 * const handler = new CostLimitHandler(costService, {
 *   maxCostPerSession: 5.00,
 *   maxRequestsPerSession: 100,
 *   warningThreshold: 0.8,
 *   pauseOnLimitReached: true,
 * });
 *
 * handler.on('warning', (event) => {
 *   console.log(`[!] Warning: ${event.percentUsed}% of ${event.type} limit used`);
 * });
 *
 * handler.on('limitReached', (event) => {
 *   console.log(`[X] Limit reached: ${event.type}`);
 * });
 * ```
 */
export class CostLimitHandler extends EventEmitter<CostLimitHandlerEvents> {
  private requestCount = 0;
  private warningEmitted: { cost: boolean; requests: boolean } = {
    cost: false,
    requests: false,
  };
  private limitReached: { cost: boolean; requests: boolean } = {
    cost: false,
    requests: false,
  };
  private awaitingApproval = false;
  private approvalResolver: ((approved: boolean) => void) | null = null;

  constructor(
    private readonly costService: CostService,
    private readonly config: CostLimitsConfig
  ) {
    super();

    // Subscribe to cost updates from the service
    this.costService.on("costUpdate", () => {
      this.checkAndEmitEvents();
    });
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Check current usage against limits.
   *
   * @returns Result indicating whether limits are exceeded
   */
  checkLimits(): LimitCheckResult {
    const costUsed = this.costService.getSessionCost().total;
    const requestsUsed = this.requestCount;

    const { maxCostPerSession, maxRequestsPerSession } = this.config;

    // Calculate percentages
    const costPercent = maxCostPerSession ? (costUsed / maxCostPerSession) * 100 : 0;
    const requestPercent = maxRequestsPerSession ? (requestsUsed / maxRequestsPerSession) * 100 : 0;

    // Determine highest percentage used
    const percentUsed = Math.max(costPercent, requestPercent);

    // Check if any limit exceeded
    let withinLimits = true;
    let reason: LimitReason | undefined;

    if (maxCostPerSession && costUsed >= maxCostPerSession) {
      withinLimits = false;
      reason = "cost";
    } else if (maxRequestsPerSession && requestsUsed >= maxRequestsPerSession) {
      withinLimits = false;
      reason = "requests";
    }

    return {
      withinLimits,
      costUsed,
      costLimit: maxCostPerSession,
      requestsUsed,
      requestLimit: maxRequestsPerSession,
      percentUsed,
      reason,
    };
  }

  /**
   * Check if execution should pause for user approval.
   *
   * @returns true if limit reached and pauseOnLimitReached is enabled
   */
  shouldPauseForApproval(): boolean {
    if (!this.config.pauseOnLimitReached) {
      return false;
    }

    const result = this.checkLimits();
    return !result.withinLimits;
  }

  /**
   * Check if currently awaiting user approval.
   *
   * @returns true if waiting for approval
   */
  isAwaitingApproval(): boolean {
    return this.awaitingApproval;
  }

  /**
   * Wait for user approval to continue after limit reached.
   *
   * @returns Promise that resolves to true if approved, false if denied
   */
  async waitForApproval(): Promise<boolean> {
    if (!this.awaitingApproval) {
      return true;
    }

    return new Promise((resolve) => {
      this.approvalResolver = resolve;
    });
  }

  /**
   * Grant approval to continue after limit reached.
   *
   * @param extendLimit - Optional new limit to set (extends current limit)
   */
  grantApproval(extendLimit?: { cost?: number; requests?: number }): void {
    if (!this.awaitingApproval) {
      return;
    }

    const result = this.checkLimits();
    const type = result.reason || "cost";

    // Emit approved event
    const event: CostApprovedEvent = {
      type,
      approvedAmount: type === "cost" ? result.costUsed : result.requestsUsed,
      newLimit: extendLimit?.[type === "cost" ? "cost" : "requests"],
    };

    // Reset limit tracking to allow continuation
    this.limitReached[type] = false;
    this.warningEmitted[type] = false;
    this.awaitingApproval = false;

    this.emit("approved", event);

    if (this.approvalResolver) {
      this.approvalResolver(true);
      this.approvalResolver = null;
    }
  }

  /**
   * Deny approval to continue after limit reached.
   */
  denyApproval(): void {
    this.awaitingApproval = false;

    if (this.approvalResolver) {
      this.approvalResolver(false);
      this.approvalResolver = null;
    }
  }

  /**
   * Increment request count and check limits.
   * Call this after each LLM request completes.
   */
  incrementRequestCount(): void {
    this.requestCount++;
    this.checkAndEmitEvents();
  }

  /**
   * Get current request count.
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Reset the handler state (e.g., for new session).
   */
  reset(): void {
    this.requestCount = 0;
    this.warningEmitted = { cost: false, requests: false };
    this.limitReached = { cost: false, requests: false };
    this.awaitingApproval = false;
    this.approvalResolver = null;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Check limits and emit appropriate events.
   */
  private checkAndEmitEvents(): void {
    const result = this.checkLimits();
    const threshold = this.config.warningThreshold;

    // Check cost warnings/limits
    if (this.config.maxCostPerSession) {
      this.checkLimitType("cost", result.costUsed, this.config.maxCostPerSession, threshold);
    }

    // Check request warnings/limits
    if (this.config.maxRequestsPerSession) {
      this.checkLimitType(
        "requests",
        result.requestsUsed,
        this.config.maxRequestsPerSession,
        threshold
      );
    }
  }

  /**
   * Check a specific limit type and emit events.
   */
  private checkLimitType(
    type: LimitReason,
    current: number,
    limit: number,
    threshold: number
  ): void {
    const percentUsed = (current / limit) * 100;

    // Check for limit reached
    if (current >= limit && !this.limitReached[type]) {
      this.limitReached[type] = true;
      this.awaitingApproval = this.config.pauseOnLimitReached;

      const event: CostLimitReachedEvent = {
        type,
        current,
        limit,
        requiresApproval: this.config.pauseOnLimitReached,
      };

      this.emit("limitReached", event);
    }
    // Check for warning threshold
    else if (
      percentUsed >= threshold * 100 &&
      !this.warningEmitted[type] &&
      !this.limitReached[type]
    ) {
      this.warningEmitted[type] = true;

      const event: CostWarningEvent = {
        type,
        current,
        limit,
        percentUsed,
      };

      this.emit("warning", event);
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a CostLimitHandler instance.
 *
 * @param costService - CostService to monitor
 * @param config - Cost limits configuration
 * @returns New CostLimitHandler instance
 *
 * @example
 * ```typescript
 * const handler = createCostLimitHandler(costService, {
 *   maxCostPerSession: 5.00,
 *   warningThreshold: 0.8,
 * });
 * ```
 */
export function createCostLimitHandler(
  costService: CostService,
  config: CostLimitsConfig
): CostLimitHandler {
  return new CostLimitHandler(costService, config);
}
