/**
 * Cost Limit Integration for AgentLoop (Phase 35+)
 *
 * Integrates CostLimitHandler with AgentLoop for cost guardrails.
 *
 * @module @vellum/core/agent
 * @see REQ-COST-005 - Cost limits and guardrails
 */

import type { TokenUsage } from "@vellum/shared";
import {
  CostLimitHandler,
  type CostLimitReachedEvent,
  type CostLimitsConfig,
  type CostWarningEvent,
  type LimitCheckResult,
} from "../cost/index.js";
import type { CostService } from "../cost/service.js";
import type { CostBreakdown } from "../cost/types.js";
import type { Logger } from "../logger/logger.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for cost limit integration with AgentLoop.
 */
export interface CostLimitIntegrationConfig {
  /** CostService instance to track costs */
  costService: CostService;

  /** Cost limits configuration */
  limits: CostLimitsConfig;

  /** Provider type for cost calculation */
  providerType: string;

  /** Model for cost calculation */
  model: string;

  /** Logger instance */
  logger?: Logger;
}

/**
 * Events emitted by cost limit integration.
 */
export interface CostLimitIntegrationEvents {
  /** Emitted when approaching a cost/request limit */
  "cost:warning": [event: CostWarningEvent];

  /** Emitted when a cost/request limit is reached */
  "cost:limitReached": [event: CostLimitReachedEvent];

  /** Emitted when cost is updated */
  "cost:updated": [cost: CostBreakdown];

  /** Emitted when awaiting user approval */
  "cost:awaitingApproval": [result: LimitCheckResult];
}

/**
 * Result of checking and processing cost limits.
 */
export interface CostCheckResult {
  /** Whether to continue execution */
  continue: boolean;

  /** Whether waiting for user approval */
  awaitingApproval: boolean;

  /** Current limit check result */
  limits: LimitCheckResult;
}

// =============================================================================
// CostLimitIntegration Class
// =============================================================================

/**
 * Integration between AgentLoop and CostLimitHandler.
 *
 * Handles:
 * - Tracking token usage from AgentLoop events
 * - Forwarding cost events to AgentLoop
 * - Managing pause/resume for limit approval
 *
 * @example
 * ```typescript
 * const integration = new CostLimitIntegration({
 *   costService,
 *   limits: { maxCostPerSession: 5.00 },
 *   providerType: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 * });
 *
 * // Connect to AgentLoop usage events
 * agentLoop.on('usage', (usage) => {
 *   const result = integration.trackUsage(usage);
 *   if (result.awaitingApproval) {
 *     // Handle pause for approval
 *   }
 * });
 *
 * // Listen for cost events
 * integration.on('cost:warning', (event) => {
 *   console.log(`Warning: ${event.percentUsed}% used`);
 * });
 * ```
 */
export class CostLimitIntegration {
  private readonly handler: CostLimitHandler;
  private readonly costService: CostService;
  private readonly providerType: string;
  private readonly model: string;
  private readonly logger?: Logger;
  private readonly listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  constructor(config: CostLimitIntegrationConfig) {
    this.costService = config.costService;
    this.providerType = config.providerType;
    this.model = config.model;
    this.logger = config.logger;

    // Create limit handler
    this.handler = new CostLimitHandler(this.costService, config.limits);

    // Forward handler events
    this.handler.on("warning", (event) => {
      this.logger?.debug("[CostLimitIntegration] Warning threshold reached", event);
      this.emit("cost:warning", event);
    });

    this.handler.on("limitReached", (event) => {
      this.logger?.warn("[CostLimitIntegration] Limit reached", event);
      this.emit("cost:limitReached", event);
    });

    // Forward cost updates
    this.costService.on("costUpdate", (event) => {
      this.emit("cost:updated", event.breakdown);
    });
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Track token usage and check limits.
   *
   * Call this when AgentLoop emits 'usage' event.
   *
   * @param usage - Token usage from LLM
   * @returns Result indicating whether to continue
   */
  trackUsage(usage: TokenUsage): CostCheckResult {
    // Track usage with cost service
    this.costService.trackUsage(usage, this.model, this.providerType);

    // Increment request count
    this.handler.incrementRequestCount();

    // Check limits
    const limits = this.handler.checkLimits();
    const awaitingApproval = this.handler.shouldPauseForApproval();

    if (awaitingApproval) {
      this.emit("cost:awaitingApproval", limits);
    }

    return {
      continue: limits.withinLimits || !awaitingApproval,
      awaitingApproval,
      limits,
    };
  }

  /**
   * Check current limits without tracking new usage.
   *
   * @returns Current limit check result
   */
  checkLimits(): LimitCheckResult {
    return this.handler.checkLimits();
  }

  /**
   * Whether execution should pause for approval.
   */
  shouldPauseForApproval(): boolean {
    return this.handler.shouldPauseForApproval();
  }

  /**
   * Wait for user approval to continue.
   *
   * @returns Promise resolving to true if approved
   */
  async waitForApproval(): Promise<boolean> {
    return this.handler.waitForApproval();
  }

  /**
   * Grant approval to continue past limit.
   *
   * @param extendLimit - Optional new limits to set
   */
  grantApproval(extendLimit?: { cost?: number; requests?: number }): void {
    this.handler.grantApproval(extendLimit);
  }

  /**
   * Deny approval (stop execution).
   */
  denyApproval(): void {
    this.handler.denyApproval();
  }

  /**
   * Get the underlying CostLimitHandler.
   */
  getHandler(): CostLimitHandler {
    return this.handler;
  }

  /**
   * Get current session cost.
   */
  getSessionCost(): CostBreakdown {
    return this.costService.getSessionCost();
  }

  /**
   * Get current request count.
   */
  getRequestCount(): number {
    return this.handler.getRequestCount();
  }

  /**
   * Reset the integration state.
   */
  reset(): void {
    this.handler.reset();
    this.costService.reset();
  }

  // ===========================================================================
  // Event Emitter Pattern
  // ===========================================================================

  /**
   * Register an event listener.
   */
  on<K extends keyof CostLimitIntegrationEvents>(
    event: K,
    listener: (...args: CostLimitIntegrationEvents[K]) => void
  ): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const listenerSet = this.listeners.get(event);
    if (listenerSet) {
      listenerSet.add(listener as (...args: unknown[]) => void);
    }
    return this;
  }

  /**
   * Remove an event listener.
   */
  off<K extends keyof CostLimitIntegrationEvents>(
    event: K,
    listener: (...args: CostLimitIntegrationEvents[K]) => void
  ): this {
    this.listeners.get(event)?.delete(listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Emit an event.
   */
  private emit<K extends keyof CostLimitIntegrationEvents>(
    event: K,
    ...args: CostLimitIntegrationEvents[K]
  ): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(...(args as unknown[]));
      } catch (error) {
        this.logger?.error("[CostLimitIntegration] Event listener error", { event, error });
      }
    });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a CostLimitIntegration instance.
 *
 * @param config - Integration configuration
 * @returns New CostLimitIntegration instance
 *
 * @example
 * ```typescript
 * const integration = createCostLimitIntegration({
 *   costService,
 *   limits: {
 *     maxCostPerSession: 5.00,
 *     maxRequestsPerSession: 100,
 *     warningThreshold: 0.8,
 *     pauseOnLimitReached: true,
 *   },
 *   providerType: 'anthropic',
 *   model: 'claude-3-5-sonnet-20241022',
 * });
 * ```
 */
export function createCostLimitIntegration(
  config: CostLimitIntegrationConfig
): CostLimitIntegration {
  return new CostLimitIntegration(config);
}
