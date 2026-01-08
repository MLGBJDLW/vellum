/**
 * Cost Tracking Service (Phase 35)
 *
 * Service for tracking and aggregating API usage costs.
 * Provides session-based and cumulative cost tracking.
 *
 * @module @vellum/core/cost
 * @see REQ-COST-004 - Cost tracking service
 */

import { EventEmitter } from "node:events";
import { calculateCostBreakdown, sumCostBreakdowns } from "./calculator.js";
import type {
  CostBreakdown,
  CostRecord,
  CostServiceOptions,
  CostSummary,
  CostUpdateEvent,
  ModelUsage,
  ProviderUsage,
  TokenUsage,
} from "./types.js";

// =============================================================================
// CostService Class
// =============================================================================

/**
 * Service for tracking API usage costs.
 *
 * Maintains session-based and cumulative cost tracking with event emission
 * for real-time cost updates. Supports multiple providers and models.
 *
 * @example
 * ```typescript
 * const service = createCostService({ sessionId: 'session-123' });
 *
 * // Track usage
 * service.trackUsage(
 *   { inputTokens: 1500, outputTokens: 800 },
 *   'claude-3-5-sonnet-20241022',
 *   'anthropic'
 * );
 *
 * // Get session cost
 * const breakdown = service.getSessionCost();
 * console.log(`Session total: $${breakdown.total.toFixed(4)}`);
 *
 * // Listen for cost updates
 * service.on('costUpdate', (event) => {
 *   console.log(`New cost: $${event.cost.toFixed(4)}`);
 * });
 * ```
 */
export class CostService extends EventEmitter {
  private readonly sessionId: string;
  private readonly debug: boolean;
  private readonly records: CostRecord[] = [];
  private sessionCost: CostBreakdown = createEmptyBreakdown();
  private totalCost: CostBreakdown = createEmptyBreakdown();

  /**
   * Create a new CostService instance.
   *
   * @param options - Service configuration
   */
  constructor(options: CostServiceOptions) {
    super();
    this.sessionId = options.sessionId;
    this.debug = options.debug ?? false;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Track token usage and calculate cost.
   *
   * @param usage - Token usage data
   * @param model - Model identifier
   * @param provider - Provider type
   * @returns The cost record created
   *
   * @fires CostService#costUpdate
   */
  trackUsage(usage: TokenUsage, model: string, provider: string): CostRecord {
    const breakdown = calculateCostBreakdown({ model, provider, usage });

    const record: CostRecord = {
      id: generateRecordId(),
      timestamp: new Date(),
      provider,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      reasoningTokens: usage.thinkingTokens,
      cost: breakdown.total,
      costBreakdown: breakdown,
      sessionId: this.sessionId,
      success: true,
    };

    this.records.push(record);
    this.updateCosts(breakdown);

    if (this.debug) {
      console.log(`[CostService] Tracked: ${model} - $${breakdown.total.toFixed(6)}`);
    }

    const event: CostUpdateEvent = {
      sessionId: this.sessionId,
      cost: breakdown.total,
      breakdown,
      totalSessionCost: this.sessionCost.total,
    };

    this.emit("costUpdate", event);
    this.emit("cost", record);

    return record;
  }

  /**
   * Get the current session's cost breakdown.
   *
   * @returns Cost breakdown for the current session
   */
  getSessionCost(): CostBreakdown {
    return { ...this.sessionCost };
  }

  /**
   * Get the total cumulative cost breakdown.
   *
   * @returns Total cost breakdown across all tracking
   */
  getTotalCost(): CostBreakdown {
    return { ...this.totalCost };
  }

  /**
   * Get a detailed summary of session costs.
   *
   * @returns Aggregated cost summary with breakdowns by provider/model
   */
  getSessionSummary(): CostSummary {
    return this.aggregateRecords(this.records.filter((r) => r.sessionId === this.sessionId));
  }

  /**
   * Get all cost records for the session.
   *
   * @returns Array of cost records
   */
  getRecords(): CostRecord[] {
    return [...this.records];
  }

  /**
   * Get the number of tracked requests.
   */
  get requestCount(): number {
    return this.records.length;
  }

  /**
   * Get total input tokens.
   */
  get totalInputTokens(): number {
    return this.records.reduce((sum, r) => sum + r.inputTokens, 0);
  }

  /**
   * Get total output tokens.
   */
  get totalOutputTokens(): number {
    return this.records.reduce((sum, r) => sum + r.outputTokens, 0);
  }

  /**
   * Reset session cost tracking.
   * Clears session records and resets session cost to zero.
   */
  reset(): void {
    this.records.length = 0;
    this.sessionCost = createEmptyBreakdown();

    if (this.debug) {
      console.log("[CostService] Session reset");
    }

    this.emit("reset", { sessionId: this.sessionId });
  }

  /**
   * Reset all cost tracking (session and total).
   */
  resetAll(): void {
    this.reset();
    this.totalCost = createEmptyBreakdown();
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Update accumulated costs with a new breakdown.
   */
  private updateCosts(breakdown: CostBreakdown): void {
    this.sessionCost = sumCostBreakdowns([this.sessionCost, breakdown]);
    this.totalCost = sumCostBreakdowns([this.totalCost, breakdown]);
  }

  /**
   * Aggregate records into a summary.
   */
  private aggregateRecords(records: CostRecord[]): CostSummary {
    const firstRecord = records[0];
    const lastRecord = records[records.length - 1];
    const summary: CostSummary = {
      period: {
        start: firstRecord ? firstRecord.timestamp : new Date(),
        end: lastRecord ? lastRecord.timestamp : new Date(),
      },
      totalRequests: records.length,
      successfulRequests: records.filter((r) => r.success).length,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalReasoningTokens: 0,
      totalCost: 0,
      costBreakdown: createEmptyBreakdown(),
      byProvider: {},
      byModel: {},
    };

    for (const record of records) {
      summary.totalInputTokens += record.inputTokens;
      summary.totalOutputTokens += record.outputTokens;
      summary.totalCacheReadTokens += record.cacheReadTokens ?? 0;
      summary.totalCacheWriteTokens += record.cacheWriteTokens ?? 0;
      summary.totalReasoningTokens += record.reasoningTokens ?? 0;
      summary.totalCost += record.cost;

      if (record.costBreakdown) {
        summary.costBreakdown.input += record.costBreakdown.input;
        summary.costBreakdown.output += record.costBreakdown.output;
        summary.costBreakdown.cacheRead += record.costBreakdown.cacheRead;
        summary.costBreakdown.cacheWrite += record.costBreakdown.cacheWrite;
        summary.costBreakdown.reasoning += record.costBreakdown.reasoning;
        summary.costBreakdown.total += record.costBreakdown.total;
      }

      // Aggregate by provider
      this.aggregateByProvider(summary.byProvider, record);

      // Aggregate by model
      this.aggregateByModel(summary.byModel, record);
    }

    return summary;
  }

  /**
   * Aggregate a record into provider statistics.
   */
  private aggregateByProvider(byProvider: Record<string, ProviderUsage>, record: CostRecord): void {
    if (!byProvider[record.provider]) {
      byProvider[record.provider] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        cost: 0,
      };
    }

    const stats = byProvider[record.provider]!;
    stats.requests++;
    stats.inputTokens += record.inputTokens;
    stats.outputTokens += record.outputTokens;
    stats.cacheReadTokens += record.cacheReadTokens ?? 0;
    stats.cacheWriteTokens += record.cacheWriteTokens ?? 0;
    stats.reasoningTokens += record.reasoningTokens ?? 0;
    stats.cost += record.cost;
  }

  /**
   * Aggregate a record into model statistics.
   */
  private aggregateByModel(byModel: Record<string, ModelUsage>, record: CostRecord): void {
    if (!byModel[record.model]) {
      byModel[record.model] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        cost: 0,
        avgLatencyMs: 0,
      };
    }

    const stats = byModel[record.model]!;
    const prevTotal = stats.avgLatencyMs * stats.requests;
    stats.requests++;
    stats.inputTokens += record.inputTokens;
    stats.outputTokens += record.outputTokens;
    stats.cacheReadTokens += record.cacheReadTokens ?? 0;
    stats.cacheWriteTokens += record.cacheWriteTokens ?? 0;
    stats.reasoningTokens += record.reasoningTokens ?? 0;
    stats.cost += record.cost;

    if (record.latencyMs) {
      stats.avgLatencyMs = (prevTotal + record.latencyMs) / stats.requests;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new CostService instance.
 *
 * @param options - Service configuration
 * @returns New CostService instance
 *
 * @example
 * ```typescript
 * const costService = createCostService({
 *   sessionId: 'session-123',
 *   debug: true,
 * });
 * ```
 */
export function createCostService(options: CostServiceOptions): CostService {
  return new CostService(options);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create an empty cost breakdown.
 */
function createEmptyBreakdown(): CostBreakdown {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    total: 0,
  };
}

/**
 * Generate a unique record ID.
 */
function generateRecordId(): string {
  return `cost-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
