/**
 * Cost Tracker Interface (Shared)
 *
 * Defines the interface for cost tracking implementations.
 * Moved to shared to avoid circular dependency between core and provider.
 *
 * @module @vellum/shared/types/cost-tracker
 */

// =============================================================================
// Cost Tracking Types
// =============================================================================

/**
 * Parameters for recording a cost entry.
 */
export interface CostRecordParams {
  /** Provider that processed the request */
  provider: string;
  /** Model used for the request */
  model: string;
  /** Number of input tokens */
  inputTokens: number;
  /** Number of output tokens */
  outputTokens: number;
  /** Number of cache read tokens (optional) */
  cacheReadTokens?: number;
  /** Number of cache write tokens (optional) */
  cacheWriteTokens?: number;
  /** Number of reasoning/thinking tokens (optional) */
  reasoningTokens?: number;
}

/**
 * Interface for cost tracking implementations.
 * Used by InstrumentedProvider to record API costs.
 *
 * @example
 * ```typescript
 * const tracker: CostTracker = {
 *   async record(params, sessionId) {
 *     console.log(`Recording cost for ${params.model}: ${params.inputTokens} in, ${params.outputTokens} out`);
 *   },
 *   on(event, listener) { return this; },
 *   off(event, listener) { return this; },
 * };
 * ```
 */
export interface CostTracker {
  /**
   * Record a cost entry for an API call.
   *
   * @param params - Cost record parameters
   * @param sessionId - Session identifier for grouping costs
   */
  record(params: CostRecordParams, sessionId: string): Promise<void> | void;

  /**
   * Subscribe to cost update events.
   *
   * @param event - Event name (typically "costUpdate" or "cost")
   * @param listener - Event listener function
   */
  on(event: string, listener: (...args: unknown[]) => void): this;

  /**
   * Unsubscribe from cost update events.
   *
   * @param event - Event name
   * @param listener - Event listener function to remove
   */
  off(event: string, listener: (...args: unknown[]) => void): this;
}
