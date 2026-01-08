/**
 * Cost Tracking Module (Phase 35)
 *
 * Provides cost tracking, pricing data, and usage statistics for LLM API calls.
 *
 * @module @vellum/core/cost
 *
 * @example
 * ```typescript
 * import {
 *   CostService,
 *   createCostService,
 *   calculateCost,
 *   formatCost,
 *   getPricing,
 * } from '@vellum/core/cost';
 *
 * // Create a cost service
 * const service = createCostService({ sessionId: 'session-123' });
 *
 * // Track usage
 * service.trackUsage(
 *   { inputTokens: 1500, outputTokens: 800 },
 *   'claude-3-5-sonnet-20241022',
 *   'anthropic'
 * );
 *
 * // Get formatted cost
 * const cost = service.getSessionCost();
 * console.log(`Session cost: ${formatCost(cost.total)}`);
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  CostBreakdown,
  CostCalculationParams,
  CostRecord,
  CostServiceOptions,
  CostSummary,
  CostUpdateEvent,
  ModelPricing,
  ModelUsage,
  PricingTier,
  ProviderPricing,
  ProviderUsage,
  TokenUsage,
} from "./types.js";

// =============================================================================
// Pricing
// =============================================================================

export {
  getPricing,
  getSupportedModels,
  getTieredPricing,
  hasPricing,
  MODEL_PRICING,
} from "./pricing.js";

// =============================================================================
// Calculator
// =============================================================================

export {
  calculateCost,
  calculateCostBreakdown,
  calculateCostWithUsage,
  type FormatCostOptions,
  formatCost,
  formatCostBreakdown,
  formatTokenCount,
  sumCostBreakdowns,
} from "./calculator.js";

// =============================================================================
// Service
// =============================================================================

export { CostService, createCostService } from "./service.js";
