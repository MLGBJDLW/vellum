/**
 * Token Budget Calculator for Context Management
 *
 * Calculates token budget allocation for LLM context windows including:
 * - Output reserve calculation based on context window size
 * - History budget computation after reserves
 * - Budget usage tracking
 * - Model context window lookup
 *
 * @module @vellum/core/context/token-budget
 * @see REQ-TOK-001 Output Reserve Calculation
 * @see REQ-TOK-002 Token Budget Allocation
 */

import type { TokenBudget } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Model output reserve thresholds based on context window size.
 *
 * Based on practical experience (Cline strategy):
 * - Small windows need higher reserve ratios for output quality
 * - Large windows can lower reserve ratios for better context utilization
 *
 * @see REQ-TOK-001 for threshold specifications
 */
const MODEL_RESERVE_THRESHOLDS = [
  { maxContext: 64_000, reserve: 27_000 },
  { maxContext: 128_000, reserve: 30_000 },
  { maxContext: 200_000, reserve: 40_000 },
] as const;

/**
 * Common model context window sizes.
 *
 * Maps model identifiers to their maximum context window in tokens.
 * Used by `getModelContextWindow()` for lookup.
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Anthropic
  "claude-3-5-sonnet": 200_000,
  "claude-3-5-haiku": 200_000,
  "claude-3-opus": 200_000,
  "claude-3-sonnet": 200_000,
  "claude-3-haiku": 200_000,
  "claude-2": 100_000,

  // OpenAI
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  o1: 200_000,
  "o1-mini": 128_000,
  "o1-preview": 128_000,
  o3: 200_000,
  "o3-mini": 200_000,

  // Google
  "gemini-2.0-flash": 1_048_576,
  "gemini-1.5-pro": 2_097_152,
  "gemini-1.5-flash": 1_048_576,

  // DeepSeek
  "deepseek-chat": 64_000,
  "deepseek-coder": 64_000,

  // Default fallback
  default: 128_000,
} as const;

/** Default system reserve when not specified */
const DEFAULT_SYSTEM_RESERVE = 4_000;

// ============================================================================
// Output Reserve Calculation
// ============================================================================

/**
 * Calculate output reserve based on context window size.
 *
 * Reserves tokens for LLM response generation. Larger context windows
 * get proportionally larger reserves to accommodate longer outputs.
 *
 * Rules (per REQ-TOK-001):
 * - ≤64K tokens → 27,000 reserve
 * - 65K-128K tokens → 30,000 reserve
 * - 129K-200K tokens → 40,000 reserve
 * - >200K tokens → max(40,000, 20% of context)
 *
 * @param contextWindow - Total context window in tokens
 * @returns Recommended output reserve in tokens
 *
 * @example
 * ```typescript
 * calculateOutputReserve(64_000);    // 27_000
 * calculateOutputReserve(128_000);   // 30_000
 * calculateOutputReserve(200_000);   // 40_000
 * calculateOutputReserve(1_000_000); // 200_000 (20%)
 * ```
 */
export function calculateOutputReserve(contextWindow: number): number {
  // Handle edge case: non-positive context window
  if (contextWindow <= 0) {
    return 0;
  }

  // Find matching threshold
  for (const threshold of MODEL_RESERVE_THRESHOLDS) {
    if (contextWindow <= threshold.maxContext) {
      return threshold.reserve;
    }
  }

  // Super large windows (>200K): max(40K, 20%)
  const percentageReserve = Math.floor(contextWindow * 0.2);
  return Math.max(40_000, percentageReserve);
}

// ============================================================================
// Token Budget Calculation
// ============================================================================

/**
 * Options for token budget calculation.
 */
export interface TokenBudgetOptions {
  /** Total context window in tokens */
  contextWindow: number;
  /** Custom output reserve (overrides calculated value) */
  outputReserve?: number;
  /** Static system reserve for system prompts */
  systemReserve?: number;
  /** Actual system prompt token count (overrides systemReserve if provided) */
  systemPromptTokens?: number;
}

/**
 * Calculate token budget allocation for context management.
 *
 * Computes how tokens are distributed across reserves:
 * - Output reserve: Space for LLM response
 * - System reserve: Space for system prompts
 * - History budget: Remaining space for conversation history
 *
 * Formula (per REQ-TOK-002):
 * ```
 * historyBudget = contextWindow - outputReserve - systemReserve
 * ```
 *
 * @param options - Configuration options for budget calculation
 * @returns Token allocation breakdown
 *
 * @example Basic usage
 * ```typescript
 * const budget = calculateTokenBudget({ contextWindow: 128_000 });
 * // {
 * //   totalWindow: 128_000,
 * //   outputReserve: 30_000,
 * //   systemReserve: 4_000,
 * //   historyBudget: 94_000
 * // }
 * ```
 *
 * @example With custom reserves
 * ```typescript
 * const budget = calculateTokenBudget({
 *   contextWindow: 200_000,
 *   systemReserve: 2_000,
 * });
 * // {
 * //   totalWindow: 200_000,
 * //   outputReserve: 40_000,
 * //   systemReserve: 2_000,
 * //   historyBudget: 158_000
 * // }
 * ```
 *
 * @example With actual system prompt size
 * ```typescript
 * const budget = calculateTokenBudget({
 *   contextWindow: 128_000,
 *   systemPromptTokens: 1_500, // Actual measured tokens
 * });
 * // systemReserve will be 1_500, not the default
 * ```
 */
export function calculateTokenBudget(options: TokenBudgetOptions): TokenBudget {
  const { contextWindow, outputReserve, systemReserve, systemPromptTokens } = options;

  // Handle edge case: non-positive context window
  if (contextWindow <= 0) {
    return {
      totalWindow: 0,
      outputReserve: 0,
      systemReserve: 0,
      historyBudget: 0,
    };
  }

  // Calculate output reserve (use provided or compute)
  const effectiveOutputReserve = outputReserve ?? calculateOutputReserve(contextWindow);

  // Determine system reserve:
  // 1. If systemPromptTokens provided, use it (actual measurement)
  // 2. Else if systemReserve provided, use it
  // 3. Else use default
  const effectiveSystemReserve = systemPromptTokens ?? systemReserve ?? DEFAULT_SYSTEM_RESERVE;

  // Calculate history budget (per REQ-TOK-002)
  // historyBudget = contextWindow - outputReserve - systemReserve
  const rawHistoryBudget = contextWindow - effectiveOutputReserve - effectiveSystemReserve;

  // Clamp to 0 if negative (per REQ-TOK-002 acceptance criteria #2)
  const historyBudget = Math.max(0, rawHistoryBudget);

  return {
    totalWindow: contextWindow,
    outputReserve: effectiveOutputReserve,
    systemReserve: effectiveSystemReserve,
    historyBudget,
  };
}

// ============================================================================
// Budget Usage Calculation
// ============================================================================

/**
 * Calculate what percentage of the budget is used.
 *
 * Returns usage as a decimal where:
 * - 0.0 = empty
 * - 0.5 = 50% used
 * - 1.0 = exactly at limit
 * - >1.0 = overflow (more tokens than budget)
 *
 * @param currentTokens - Current token count in history
 * @param budget - Token budget allocation
 * @returns Usage percentage as decimal (can exceed 1 in overflow)
 *
 * @example Normal usage
 * ```typescript
 * const budget = calculateTokenBudget({ contextWindow: 128_000 });
 * const usage = calculateBudgetUsage(47_000, budget);
 * // 0.5 (50% of historyBudget)
 * ```
 *
 * @example Overflow detection
 * ```typescript
 * const budget = calculateTokenBudget({ contextWindow: 128_000 });
 * const usage = calculateBudgetUsage(150_000, budget);
 * // > 1.0 (overflow condition)
 * ```
 */
export function calculateBudgetUsage(currentTokens: number, budget: TokenBudget): number {
  // Handle edge cases
  if (budget.historyBudget <= 0) {
    // If no budget available, any tokens = overflow
    return currentTokens > 0 ? Number.POSITIVE_INFINITY : 0;
  }

  if (currentTokens < 0) {
    return 0;
  }

  return currentTokens / budget.historyBudget;
}

// ============================================================================
// Model Context Window Lookup
// ============================================================================

/**
 * Get context window size for a model.
 *
 * Looks up the context window from known model configurations.
 * Falls back to 128K if the model is unknown.
 *
 * Supports partial matching for model variants (e.g., "claude-3-5-sonnet-20241022"
 * matches "claude-3-5-sonnet").
 *
 * @param modelId - Model identifier (e.g., "claude-3-5-sonnet", "gpt-4o")
 * @returns Context window size in tokens
 *
 * @example Exact match
 * ```typescript
 * getModelContextWindow('claude-3-5-sonnet'); // 200_000
 * getModelContextWindow('gpt-4o');            // 128_000
 * ```
 *
 * @example Partial match (version suffix)
 * ```typescript
 * getModelContextWindow('claude-3-5-sonnet-20241022'); // 200_000
 * getModelContextWindow('gpt-4o-2024-08-06');          // 128_000
 * ```
 *
 * @example Unknown model (fallback)
 * ```typescript
 * getModelContextWindow('unknown-model'); // 128_000 (default)
 * ```
 */
export function getModelContextWindow(modelId: string): number {
  // Normalize model ID to lowercase for matching
  const normalizedId = modelId.toLowerCase();

  // Try exact match first
  const exactMatch = MODEL_CONTEXT_WINDOWS[normalizedId];
  if (exactMatch !== undefined) {
    return exactMatch;
  }

  // Try prefix matching for versioned model names
  // e.g., "claude-3-5-sonnet-20241022" should match "claude-3-5-sonnet"
  for (const [knownModel, windowSize] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (knownModel !== "default" && normalizedId.startsWith(knownModel)) {
      return windowSize;
    }
  }

  // Fallback to default (128K)
  return MODEL_CONTEXT_WINDOWS.default ?? 128_000;
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Check if budget usage indicates a warning state.
 *
 * @param usage - Budget usage ratio from calculateBudgetUsage
 * @param warningThreshold - Threshold for warning state (default: 0.8)
 * @returns True if usage exceeds warning threshold
 */
export function isWarningState(usage: number, warningThreshold = 0.8): boolean {
  return usage >= warningThreshold;
}

/**
 * Check if budget usage indicates a critical state.
 *
 * @param usage - Budget usage ratio from calculateBudgetUsage
 * @param criticalThreshold - Threshold for critical state (default: 0.9)
 * @returns True if usage exceeds critical threshold
 */
export function isCriticalState(usage: number, criticalThreshold = 0.9): boolean {
  return usage >= criticalThreshold;
}

/**
 * Check if budget usage indicates an overflow state.
 *
 * @param usage - Budget usage ratio from calculateBudgetUsage
 * @param overflowThreshold - Threshold for overflow state (default: 0.95)
 * @returns True if usage exceeds overflow threshold
 */
export function isOverflowState(usage: number, overflowThreshold = 0.95): boolean {
  return usage >= overflowThreshold;
}
