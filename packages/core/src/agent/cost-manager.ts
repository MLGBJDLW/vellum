// ============================================
// Agent Cost Manager
// ============================================

import type { TokenUsage } from "@vellum/shared";
import type { CostLimitReachedEvent, CostWarningEvent, LimitCheckResult } from "../cost/index.js";
import type { CostBreakdown } from "../cost/types.js";
import type { Logger } from "../logger/logger.js";
import type {
  CostCheckResult,
  CostLimitIntegration,
  CostLimitIntegrationConfig,
} from "./cost-limit-integration.js";
import { CostLimitIntegration as CostLimitIntegrationClass } from "./cost-limit-integration.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for creating CostLimitIntegration.
 * Optional - if not provided, cost management is disabled.
 */
export interface CostManagerConfig {
  /** Config to create CostLimitIntegration */
  integrationConfig?: CostLimitIntegrationConfig;
  /** Logger instance */
  logger?: Logger;
}

/**
 * Callbacks for cost events.
 */
export interface CostManagerCallbacks {
  /** Called when cost warning threshold reached */
  onCostWarning?: (event: CostWarningEvent) => void;
  /** Called when cost limit is reached */
  onCostLimitReached?: (event: CostLimitReachedEvent) => void;
  /** Called when awaiting user approval */
  onCostAwaitingApproval?: (limits: LimitCheckResult) => void;
}

// =============================================================================
// AgentCostManager Class
// =============================================================================

/**
 * Manages cost tracking and limits for AgentLoop.
 *
 * Extracted from AgentLoop to separate cost management concerns.
 * This class wraps CostLimitIntegration and provides a simpler interface
 * for the AgentLoop to interact with.
 *
 * @example
 * ```typescript
 * const costManager = new AgentCostManager({
 *   integrationConfig: {
 *     costService,
 *     limits: { maxCostPerSession: 5.00 },
 *     providerType: 'anthropic',
 *     model: 'claude-3-5-sonnet-20241022',
 *   },
 *   logger,
 * });
 *
 * // Track usage
 * const result = costManager.trackUsage(usage);
 * if (result?.awaitingApproval) {
 *   // Handle pause for approval
 * }
 *
 * // Check limits
 * if (!costManager.checkLimits()) {
 *   // Handle limit exceeded
 * }
 * ```
 */
export class AgentCostManager {
  private readonly costLimitIntegration?: CostLimitIntegration;
  private readonly logger?: Logger;

  constructor(config: CostManagerConfig, callbacks?: CostManagerCallbacks) {
    this.logger = config.logger;

    // Initialize CostLimitIntegration if config provided
    if (config.integrationConfig) {
      this.costLimitIntegration = new CostLimitIntegrationClass(config.integrationConfig);

      // Setup event forwarding if callbacks provided
      if (callbacks) {
        if (callbacks.onCostWarning) {
          this.costLimitIntegration.on("cost:warning", callbacks.onCostWarning);
        }
        if (callbacks.onCostLimitReached) {
          this.costLimitIntegration.on("cost:limitReached", callbacks.onCostLimitReached);
        }
        if (callbacks.onCostAwaitingApproval) {
          this.costLimitIntegration.on("cost:awaitingApproval", callbacks.onCostAwaitingApproval);
        }
      }

      this.logger?.debug("AgentCostManager initialized with cost limits", {
        maxCostPerSession: config.integrationConfig.limits.maxCostPerSession,
        maxRequestsPerSession: config.integrationConfig.limits.maxRequestsPerSession,
        warningThreshold: config.integrationConfig.limits.warningThreshold,
        pauseOnLimitReached: config.integrationConfig.limits.pauseOnLimitReached,
      });
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Track token usage and check limits.
   *
   * @param usage - Token usage from LLM
   * @returns Cost check result or undefined if no cost limits configured
   */
  trackUsage(usage: TokenUsage): CostCheckResult | undefined {
    if (!this.costLimitIntegration) {
      return undefined;
    }

    const costResult = this.costLimitIntegration.trackUsage(usage);
    this.logger?.debug("Cost limit check after usage", {
      withinLimits: costResult.limits.withinLimits,
      percentUsed: costResult.limits.percentUsed.toFixed(1),
      awaitingApproval: costResult.awaitingApproval,
    });

    return costResult;
  }

  /**
   * Check if cost limits allow continuation.
   *
   * @returns true if within limits or no limits configured
   */
  checkLimits(): boolean {
    if (!this.costLimitIntegration) {
      return true;
    }
    return this.costLimitIntegration.checkLimits().withinLimits;
  }

  /**
   * Grant approval to continue past cost limit.
   *
   * @param extendLimit - Optional new limits to set
   */
  grantApproval(extendLimit?: { cost?: number; requests?: number }): void {
    this.costLimitIntegration?.grantApproval(extendLimit);
  }

  /**
   * Deny approval (stop execution due to cost limit).
   */
  denyApproval(): void {
    this.costLimitIntegration?.denyApproval();
  }

  /**
   * Returns the underlying CostLimitIntegration instance if configured.
   */
  getIntegration(): CostLimitIntegration | undefined {
    return this.costLimitIntegration;
  }

  /**
   * Check if cost limits are configured.
   */
  hasLimits(): boolean {
    return this.costLimitIntegration !== undefined;
  }

  /**
   * Get current session cost.
   *
   * @returns Cost breakdown or undefined if no limits configured
   */
  getSessionCost(): CostBreakdown | undefined {
    return this.costLimitIntegration?.getSessionCost();
  }

  /**
   * Get current request count.
   *
   * @returns Request count or 0 if no limits configured
   */
  getRequestCount(): number {
    return this.costLimitIntegration?.getRequestCount() ?? 0;
  }

  /**
   * Whether execution should pause for approval.
   */
  shouldPauseForApproval(): boolean {
    return this.costLimitIntegration?.shouldPauseForApproval() ?? false;
  }

  /**
   * Wait for user approval to continue.
   *
   * @returns Promise resolving to true if approved, or true immediately if no limits
   */
  async waitForApproval(): Promise<boolean> {
    if (!this.costLimitIntegration) {
      return true;
    }
    return this.costLimitIntegration.waitForApproval();
  }

  /**
   * Reset the cost manager state.
   */
  reset(): void {
    this.costLimitIntegration?.reset();
  }
}
