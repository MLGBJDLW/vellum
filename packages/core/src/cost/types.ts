/**
 * Cost Tracking Types (Phase 35)
 *
 * Type definitions for cost tracking, pricing models, and usage statistics.
 *
 * @module @vellum/core/cost
 * @see REQ-COST-001 - Cost tracking system
 */

// =============================================================================
// Pricing Types
// =============================================================================

/**
 * Model-specific pricing information.
 * All prices are in USD per million tokens.
 *
 * @example
 * ```typescript
 * const pricing: ModelPricing = {
 *   inputPricePerMillion: 3.0,
 *   outputPricePerMillion: 15.0,
 *   effectiveDate: '2024-10-22',
 * };
 * ```
 */
export interface ModelPricing {
  /** Price per million input tokens (USD) */
  inputPricePerMillion: number;

  /** Price per million output tokens (USD) */
  outputPricePerMillion: number;

  /** Price per million cached read tokens (USD) */
  cacheReadPricePerMillion?: number;

  /** Price per million cache write tokens (USD) */
  cacheWritePricePerMillion?: number;

  /** Price per million reasoning/thinking tokens (USD) */
  reasoningPricePerMillion?: number;

  /** Tiered pricing based on context window size */
  tiers?: PricingTier[];

  /** ISO date string when pricing became effective */
  effectiveDate: string;

  /** Source URL for pricing reference */
  sourceUrl?: string;
}

/**
 * Tiered pricing configuration for context-dependent pricing.
 */
export interface PricingTier {
  /** Context window threshold in tokens */
  contextWindow: number;

  /** Input price per million for this tier */
  inputPricePerMillion: number;

  /** Output price per million for this tier */
  outputPricePerMillion: number;
}

/**
 * Provider-level pricing configuration.
 */
export interface ProviderPricing {
  /** Provider identifier */
  provider: string;

  /** Model-specific pricing */
  models: Record<string, ModelPricing>;

  /** Currency code */
  currency: "USD" | "CNY";

  /** Last update timestamp */
  lastUpdated: string;
}

// =============================================================================
// Token Usage Types
// =============================================================================

/**
 * Token usage from a single API call.
 * Used as input to cost calculation.
 *
 * @example
 * ```typescript
 * const usage: TokenUsage = {
 *   inputTokens: 1500,
 *   outputTokens: 800,
 *   cacheReadTokens: 500,
 * };
 * ```
 */
export interface TokenUsage {
  /** Number of input/prompt tokens */
  inputTokens: number;

  /** Number of output/completion tokens */
  outputTokens: number;

  /** Number of tokens read from cache */
  cacheReadTokens?: number;

  /** Number of tokens written to cache */
  cacheWriteTokens?: number;

  /** Number of reasoning/thinking tokens */
  thinkingTokens?: number;

  /** Total context size (for tiered pricing lookup) */
  contextTokens?: number;
}

// =============================================================================
// Cost Calculation Types
// =============================================================================

/**
 * Parameters for cost calculation.
 */
export interface CostCalculationParams {
  /** Model identifier */
  model: string;

  /** Provider type */
  provider: string;

  /** Token usage data */
  usage: TokenUsage;
}

/**
 * Detailed cost breakdown by token type.
 */
export interface CostBreakdown {
  /** Cost for input tokens (USD) */
  input: number;

  /** Cost for output tokens (USD) */
  output: number;

  /** Cost for cache read tokens (USD) */
  cacheRead: number;

  /** Cost for cache write tokens (USD) */
  cacheWrite: number;

  /** Cost for reasoning tokens (USD) */
  reasoning: number;

  /** Total cost (USD) */
  total: number;
}

// =============================================================================
// Cost Record Types
// =============================================================================

/**
 * A single cost record for an API call.
 */
export interface CostRecord {
  /** Unique record identifier */
  id: string;

  /** Timestamp of the API call */
  timestamp: Date;

  /** Provider that processed the request */
  provider: string;

  /** Model used for the request */
  model: string;

  /** Input token count */
  inputTokens: number;

  /** Output token count */
  outputTokens: number;

  /** Cache read token count */
  cacheReadTokens?: number;

  /** Cache write token count */
  cacheWriteTokens?: number;

  /** Reasoning token count */
  reasoningTokens?: number;

  /** Calculated total cost (USD) */
  cost: number;

  /** Detailed cost breakdown */
  costBreakdown?: CostBreakdown;

  /** Session this call belongs to */
  sessionId: string;

  /** Whether the request succeeded */
  success: boolean;

  /** Response latency in milliseconds */
  latencyMs?: number;
}

// =============================================================================
// Cost Summary Types
// =============================================================================

/**
 * Aggregated cost statistics.
 */
export interface CostSummary {
  /** Time period covered */
  period: {
    start: Date;
    end: Date;
  };

  /** Total number of requests */
  totalRequests: number;

  /** Number of successful requests */
  successfulRequests: number;

  /** Total input tokens used */
  totalInputTokens: number;

  /** Total output tokens generated */
  totalOutputTokens: number;

  /** Total cache read tokens */
  totalCacheReadTokens: number;

  /** Total cache write tokens */
  totalCacheWriteTokens: number;

  /** Total reasoning tokens */
  totalReasoningTokens: number;

  /** Total cost in USD */
  totalCost: number;

  /** Detailed cost breakdown */
  costBreakdown: CostBreakdown;

  /** Usage grouped by provider */
  byProvider: Record<string, ProviderUsage>;

  /** Usage grouped by model */
  byModel: Record<string, ModelUsage>;
}

/**
 * Usage statistics for a provider.
 */
export interface ProviderUsage {
  /** Number of requests */
  requests: number;

  /** Total input tokens */
  inputTokens: number;

  /** Total output tokens */
  outputTokens: number;

  /** Total cache read tokens */
  cacheReadTokens: number;

  /** Total cache write tokens */
  cacheWriteTokens: number;

  /** Total reasoning tokens */
  reasoningTokens: number;

  /** Total cost in USD */
  cost: number;
}

/**
 * Usage statistics for a model.
 */
export interface ModelUsage extends ProviderUsage {
  /** Average latency in milliseconds */
  avgLatencyMs: number;
}

// =============================================================================
// Service Types
// =============================================================================

/**
 * Options for creating a CostService.
 */
export interface CostServiceOptions {
  /** Session identifier for grouping costs */
  sessionId: string;

  /** Enable logging */
  debug?: boolean;
}

/**
 * Event emitted when cost is tracked.
 */
export interface CostUpdateEvent {
  /** Session ID */
  sessionId: string;

  /** Cost of this request */
  cost: number;

  /** Cost breakdown */
  breakdown: CostBreakdown;

  /** Total session cost so far */
  totalSessionCost: number;
}
