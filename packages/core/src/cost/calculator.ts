/**
 * Cost Calculator (Phase 35)
 *
 * Utilities for calculating and formatting LLM API costs.
 *
 * @module @vellum/core/cost
 * @see REQ-COST-003 - Cost calculation utilities
 */

import { getPricing, getTieredPricing } from "./pricing.js";
import type { CostBreakdown, CostCalculationParams, TokenUsage } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/** One million - base unit for pricing */
const MILLION = 1_000_000;

// =============================================================================
// Cost Calculation
// =============================================================================

/**
 * Calculate the cost for a single API call.
 *
 * Handles:
 * - Basic input/output token pricing
 * - Cache read/write pricing
 * - Reasoning/thinking token pricing
 * - Tiered pricing based on context size
 * - Provider-specific semantics (OpenAI cache included in input)
 *
 * @param params - Calculation parameters
 * @returns Detailed cost breakdown
 *
 * @example
 * ```typescript
 * const breakdown = calculateCostBreakdown({
 *   model: 'claude-3-5-sonnet-20241022',
 *   provider: 'anthropic',
 *   usage: {
 *     inputTokens: 1500,
 *     outputTokens: 800,
 *     cacheReadTokens: 500,
 *   },
 * });
 * console.log(`Total: ${formatCost(breakdown.total)}`);
 * ```
 */
export function calculateCostBreakdown(params: CostCalculationParams): CostBreakdown {
  const { model, provider, usage } = params;

  const pricing = getPricing(model);
  if (!pricing) {
    // Unknown model - return zero cost
    return createEmptyCostBreakdown();
  }

  // Adjust input tokens based on provider semantics
  const adjustedInputTokens = adjustInputTokensForProvider(
    provider,
    usage.inputTokens,
    usage.cacheReadTokens ?? 0
  );

  // Get tiered pricing if applicable
  const contextTokens = usage.contextTokens ?? usage.inputTokens;
  const { inputPrice, outputPrice } = getTieredPricing(pricing, contextTokens);

  // Calculate each cost component
  const inputCost = (adjustedInputTokens / MILLION) * inputPrice;
  const outputCost = (usage.outputTokens / MILLION) * outputPrice;

  const cacheReadCost = usage.cacheReadTokens
    ? (usage.cacheReadTokens / MILLION) * (pricing.cacheReadPricePerMillion ?? inputPrice * 0.1)
    : 0;

  const cacheWriteCost = usage.cacheWriteTokens
    ? (usage.cacheWriteTokens / MILLION) * (pricing.cacheWritePricePerMillion ?? inputPrice * 1.25)
    : 0;

  const reasoningCost = usage.thinkingTokens
    ? (usage.thinkingTokens / MILLION) * (pricing.reasoningPricePerMillion ?? outputPrice)
    : 0;

  const total = inputCost + outputCost + cacheReadCost + cacheWriteCost + reasoningCost;

  return {
    input: inputCost,
    output: outputCost,
    cacheRead: cacheReadCost,
    cacheWrite: cacheWriteCost,
    reasoning: reasoningCost,
    total,
  };
}

/**
 * Calculate total cost from token counts.
 * Simplified version for quick calculations.
 *
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param model - Model identifier
 * @param provider - Provider type
 * @returns Total cost in USD
 *
 * @example
 * ```typescript
 * const cost = calculateCost(1500, 800, 'gpt-4o', 'openai');
 * console.log(`Cost: ${formatCost(cost)}`);
 * ```
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
  provider: string
): number {
  const breakdown = calculateCostBreakdown({
    model,
    provider,
    usage: { inputTokens, outputTokens },
  });
  return breakdown.total;
}

/**
 * Calculate cost with full token usage data.
 *
 * @param usage - Token usage data
 * @param model - Model identifier
 * @param provider - Provider type
 * @returns Detailed cost breakdown
 */
export function calculateCostWithUsage(
  usage: TokenUsage,
  model: string,
  provider: string
): CostBreakdown {
  return calculateCostBreakdown({ model, provider, usage });
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Format a cost value for display.
 *
 * @param cost - Cost in USD
 * @param options - Formatting options
 * @returns Formatted string (e.g., "$0.0045" or "$1.23")
 *
 * @example
 * ```typescript
 * formatCost(0.0000123); // "$0.000012"
 * formatCost(0.0045);    // "$0.0045"
 * formatCost(1.234);     // "$1.23"
 * formatCost(1234.56);   // "$1,234.56"
 * ```
 */
export function formatCost(cost: number, options: FormatCostOptions = {}): string {
  const { currency = "USD", showCurrency = true, minDecimals = 2, maxDecimals = 6 } = options;

  if (cost === 0) {
    return showCurrency ? "$0.00" : "0.00";
  }

  // Determine appropriate decimal places based on magnitude
  let decimals: number;
  if (cost >= 1) {
    decimals = minDecimals;
  } else if (cost >= 0.01) {
    decimals = 4;
  } else {
    // For very small amounts, show enough precision
    decimals = Math.min(maxDecimals, -Math.floor(Math.log10(cost)) + 2);
  }

  const formatted = cost.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (!showCurrency) {
    return formatted;
  }

  switch (currency) {
    case "USD":
      return `$${formatted}`;
    case "CNY":
      return `¥${formatted}`;
    default:
      return `${formatted} ${currency}`;
  }
}

/**
 * Options for cost formatting.
 */
export interface FormatCostOptions {
  /** Currency code */
  currency?: "USD" | "CNY";
  /** Whether to show currency symbol */
  showCurrency?: boolean;
  /** Minimum decimal places */
  minDecimals?: number;
  /** Maximum decimal places */
  maxDecimals?: number;
}

/**
 * Format token count for display.
 *
 * @param count - Token count
 * @returns Formatted string (e.g., "1.5K", "2.3M")
 *
 * @example
 * ```typescript
 * formatTokenCount(500);     // "500"
 * formatTokenCount(1500);    // "1.5K"
 * formatTokenCount(1500000); // "1.5M"
 * ```
 */
export function formatTokenCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  }
  if (count < 1_000_000) {
    const k = count / 1000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  const m = count / 1_000_000;
  return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
}

/**
 * Format cost breakdown for display.
 *
 * @param breakdown - Cost breakdown
 * @returns Multi-line formatted string
 */
export function formatCostBreakdown(breakdown: CostBreakdown): string {
  const lines: string[] = [];

  if (breakdown.input > 0) {
    lines.push(`  Input:     ${formatCost(breakdown.input)}`);
  }
  if (breakdown.output > 0) {
    lines.push(`  Output:    ${formatCost(breakdown.output)}`);
  }
  if (breakdown.cacheRead > 0) {
    lines.push(`  Cache (R): ${formatCost(breakdown.cacheRead)}`);
  }
  if (breakdown.cacheWrite > 0) {
    lines.push(`  Cache (W): ${formatCost(breakdown.cacheWrite)}`);
  }
  if (breakdown.reasoning > 0) {
    lines.push(`  Reasoning: ${formatCost(breakdown.reasoning)}`);
  }
  lines.push(`  ─────────────────`);
  lines.push(`  Total:     ${formatCost(breakdown.total)}`);

  return lines.join("\n");
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create an empty cost breakdown.
 */
function createEmptyCostBreakdown(): CostBreakdown {
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
 * Adjust input tokens based on provider-specific semantics.
 *
 * - Anthropic: cache tokens are separate from input tokens
 * - OpenAI: cached tokens are included in prompt tokens (need to subtract)
 * - Google/DeepSeek: cache tokens are separate
 */
function adjustInputTokensForProvider(
  provider: string,
  inputTokens: number,
  cacheReadTokens: number
): number {
  switch (provider.toLowerCase()) {
    case "openai":
      // OpenAI includes cached tokens in prompt_tokens, subtract to avoid double-counting
      return Math.max(0, inputTokens - cacheReadTokens);
    default:
      // These providers report cache tokens separately
      return inputTokens;
  }
}

/**
 * Sum multiple cost breakdowns.
 *
 * @param breakdowns - Array of cost breakdowns
 * @returns Combined breakdown
 */
export function sumCostBreakdowns(breakdowns: CostBreakdown[]): CostBreakdown {
  return breakdowns.reduce(
    (acc, b) => ({
      input: acc.input + b.input,
      output: acc.output + b.output,
      cacheRead: acc.cacheRead + b.cacheRead,
      cacheWrite: acc.cacheWrite + b.cacheWrite,
      reasoning: acc.reasoning + b.reasoning,
      total: acc.total + b.total,
    }),
    createEmptyCostBreakdown()
  );
}
