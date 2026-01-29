/**
 * Intent-Aware Provider Strategy
 *
 * Dynamically adjusts evidence gathering strategy based on classified task intent.
 * Provides intent-specific budget ratios, weight modifiers, and provider priorities.
 *
 * Algorithm:
 * 1. Map TaskIntent to predefined or custom strategy
 * 2. Apply weight modifiers to base reranker weights
 * 3. Return optimized budget ratios for the intent
 * 4. Track feedback for strategy refinement
 *
 * @packageDocumentation
 * @module context/evidence/adaptive
 */

import type { RerankerWeights } from "../reranker.js";
import type { ProviderType } from "../types.js";
import type { TaskIntent } from "./task-intent-classifier.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Budget allocation ratios per provider type.
 * Values should sum to approximately 1.0.
 */
export type BudgetRatios = Record<ProviderType, number>;

/**
 * Strategy configuration for a specific task intent.
 */
export interface IntentStrategy {
  /** Budget ratios for this intent */
  readonly budgetRatios: BudgetRatios;
  /** Reranker weight adjustments (applied multiplicatively or as overrides) */
  readonly weightModifiers: Partial<RerankerWeights>;
  /** Provider priority order (highest priority first) */
  readonly providerPriority: readonly ProviderType[];
  /** Additional context types to request */
  readonly additionalContext?: readonly string[];
}

/**
 * Configuration options for IntentAwareProviderStrategy.
 */
export interface IntentStrategyProviderConfig {
  /** Custom strategy overrides per intent */
  readonly customStrategies?: Partial<Record<TaskIntent, Partial<IntentStrategy>>>;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default strategies for each task intent.
 * Based on expert analysis of optimal evidence gathering patterns.
 */
const DEFAULT_STRATEGIES: Record<TaskIntent, IntentStrategy> = {
  debug: {
    budgetRatios: { diff: 0.5, lsp: 0.3, search: 0.2 },
    weightModifiers: { stackFrame: 120, diff: 150, definition: 80 },
    providerPriority: ["diff", "lsp", "search"],
    additionalContext: ["error_logs", "recent_changes"],
  },
  implement: {
    budgetRatios: { diff: 0.3, lsp: 0.4, search: 0.3 },
    weightModifiers: { definition: 100, reference: 50 },
    providerPriority: ["lsp", "search", "diff"],
  },
  refactor: {
    budgetRatios: { diff: 0.3, lsp: 0.5, search: 0.2 },
    weightModifiers: { reference: 80, definition: 100 },
    providerPriority: ["lsp", "diff", "search"],
  },
  explore: {
    budgetRatios: { diff: 0.2, lsp: 0.4, search: 0.4 },
    weightModifiers: { keyword: 30, definition: 80 },
    providerPriority: ["search", "lsp", "diff"],
  },
  document: {
    budgetRatios: { diff: 0.2, lsp: 0.3, search: 0.5 },
    weightModifiers: { keyword: 40 },
    providerPriority: ["search", "lsp", "diff"],
  },
  test: {
    budgetRatios: { diff: 0.4, lsp: 0.4, search: 0.2 },
    weightModifiers: { diff: 120, definition: 90 },
    providerPriority: ["diff", "lsp", "search"],
  },
  review: {
    budgetRatios: { diff: 0.6, lsp: 0.3, search: 0.1 },
    weightModifiers: { diff: 150 },
    providerPriority: ["diff", "lsp", "search"],
  },
  unknown: {
    budgetRatios: { diff: 0.4, lsp: 0.35, search: 0.25 },
    weightModifiers: {},
    providerPriority: ["diff", "lsp", "search"],
  },
} as const;

// =============================================================================
// Implementation
// =============================================================================

/**
 * Intent-aware provider strategy manager.
 *
 * Provides dynamic strategy selection based on task intent, allowing
 * customization and feedback-based refinement.
 *
 * @example
 * ```ts
 * const strategy = new IntentAwareProviderStrategy();
 * const debugStrategy = strategy.getStrategy('debug');
 * const adjustedWeights = strategy.applyWeightModifiers(baseWeights, 'debug');
 * ```
 */
export class IntentAwareProviderStrategy {
  private readonly strategies: Map<TaskIntent, IntentStrategy>;
  private readonly feedbackHistory: Map<TaskIntent, Array<{ success: boolean; timestamp: number }>>;

  constructor(config?: IntentStrategyProviderConfig) {
    this.strategies = new Map();
    this.feedbackHistory = new Map();

    // Initialize with default strategies
    for (const [intent, strategy] of Object.entries(DEFAULT_STRATEGIES)) {
      this.strategies.set(intent as TaskIntent, { ...strategy });
    }

    // Apply custom strategy overrides
    if (config?.customStrategies) {
      for (const [intent, overrides] of Object.entries(config.customStrategies)) {
        const existing = this.strategies.get(intent as TaskIntent);
        if (existing && overrides) {
          this.strategies.set(intent as TaskIntent, this.mergeStrategy(existing, overrides));
        }
      }
    }
  }

  /**
   * Get strategy for a specific task intent.
   *
   * @param intent - The task intent to get strategy for
   * @returns The strategy configuration for the intent
   */
  getStrategy(intent: TaskIntent): IntentStrategy {
    const strategy = this.strategies.get(intent);
    if (!strategy) {
      // Fallback to unknown if intent not found (defensive)
      const unknownStrategy = this.strategies.get("unknown");
      if (!unknownStrategy) {
        throw new Error("Unknown intent strategy not found in registry");
      }
      return unknownStrategy;
    }
    return strategy;
  }

  /**
   * Apply weight modifiers from a strategy to base weights.
   *
   * Modifiers are applied as overrides - if a modifier exists for a weight,
   * it replaces the base value; otherwise the base value is preserved.
   *
   * @param baseWeights - The base reranker weights
   * @param intent - The task intent to apply modifiers for
   * @returns New weights with modifiers applied
   */
  applyWeightModifiers(baseWeights: RerankerWeights, intent: TaskIntent): RerankerWeights {
    const strategy = this.getStrategy(intent);
    const modifiers = strategy.weightModifiers;

    return {
      diff: modifiers.diff ?? baseWeights.diff,
      stackFrame: modifiers.stackFrame ?? baseWeights.stackFrame,
      definition: modifiers.definition ?? baseWeights.definition,
      reference: modifiers.reference ?? baseWeights.reference,
      keyword: modifiers.keyword ?? baseWeights.keyword,
      workingSet: modifiers.workingSet ?? baseWeights.workingSet,
      stackDepthDecay: modifiers.stackDepthDecay ?? baseWeights.stackDepthDecay,
    };
  }

  /**
   * Get optimized budget ratios for a specific intent.
   *
   * @param intent - The task intent to get ratios for
   * @returns Budget ratios per provider type
   */
  getBudgetRatios(intent: TaskIntent): BudgetRatios {
    const strategy = this.getStrategy(intent);
    return { ...strategy.budgetRatios };
  }

  /**
   * Update strategy based on feedback.
   *
   * Tracks feedback history and can apply adjustments to the strategy.
   * This enables gradual refinement based on observed outcomes.
   *
   * @param intent - The task intent to update strategy for
   * @param feedback - Feedback containing success status and optional adjustments
   */
  updateStrategy(
    intent: TaskIntent,
    feedback: { success: boolean; adjustments?: Partial<IntentStrategy> }
  ): void {
    // Track feedback history
    const history = this.feedbackHistory.get(intent) ?? [];
    history.push({ success: feedback.success, timestamp: Date.now() });

    // Keep only last 100 feedback entries per intent
    if (history.length > 100) {
      history.shift();
    }
    this.feedbackHistory.set(intent, history);

    // Apply explicit adjustments if provided
    if (feedback.adjustments) {
      const existing = this.getStrategy(intent);
      this.strategies.set(intent, this.mergeStrategy(existing, feedback.adjustments));
    }
  }

  /**
   * Get feedback statistics for an intent.
   *
   * @param intent - The task intent to get stats for
   * @returns Success rate and sample count, or undefined if no feedback
   */
  getFeedbackStats(intent: TaskIntent): { successRate: number; sampleCount: number } | undefined {
    const history = this.feedbackHistory.get(intent);
    if (!history || history.length === 0) {
      return undefined;
    }

    const successCount = history.filter((f) => f.success).length;
    return {
      successRate: successCount / history.length,
      sampleCount: history.length,
    };
  }

  /**
   * Merge a partial strategy update into an existing strategy.
   */
  private mergeStrategy(
    existing: IntentStrategy,
    updates: Partial<IntentStrategy>
  ): IntentStrategy {
    return {
      budgetRatios: updates.budgetRatios
        ? { ...existing.budgetRatios, ...updates.budgetRatios }
        : existing.budgetRatios,
      weightModifiers: updates.weightModifiers
        ? { ...existing.weightModifiers, ...updates.weightModifiers }
        : existing.weightModifiers,
      providerPriority: updates.providerPriority ?? existing.providerPriority,
      additionalContext: updates.additionalContext ?? existing.additionalContext,
    };
  }
}
