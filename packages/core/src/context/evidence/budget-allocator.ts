/**
 * BudgetAllocator Module - Token Budget Management
 *
 * Allocates token budget across providers and evidence items.
 * Per-provider quotas prevent any single source from dominating,
 * enabling graceful degradation when budget is tight.
 *
 * @packageDocumentation
 * @module context/evidence/budget-allocator
 */

import type { Evidence, ProviderType } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of budget allocation calculation.
 * Contains budget breakdowns for each context component.
 */
export interface BudgetAllocation {
  /** Total available budget (after reserves) */
  readonly total: number;
  /** Budget for project summary */
  readonly summary: number;
  /** Budget for working set */
  readonly workingSet: number;
  /** Budget per provider */
  readonly perProvider: Readonly<Record<ProviderType, number>>;
  /** Remaining after allocations (rounding leftovers) */
  readonly remaining: number;
}

/**
 * Configuration options for the BudgetAllocator.
 */
export interface BudgetAllocatorConfig {
  /** Context window size (total tokens available) */
  readonly contextWindow: number;
  /** Output reserve tokens (default: 4000) */
  readonly outputReserve?: number;
  /** System prompt reserve tokens (default: 2000) */
  readonly systemReserve?: number;
  /** Summary budget ratio 0-1 (default: 0.05 = 5%) */
  readonly summaryRatio?: number;
  /** Working set budget ratio 0-1 (default: 0.15 = 15%) */
  readonly workingSetRatio?: number;
  /** Provider budget ratios (default: { diff: 0.4, lsp: 0.35, search: 0.25 }) */
  readonly providerRatios?: Partial<Record<ProviderType, number>>;
}

// =============================================================================
// Constants
// =============================================================================

/** Default output reserve tokens */
const DEFAULT_OUTPUT_RESERVE = 4000;

/** Default system prompt reserve tokens */
const DEFAULT_SYSTEM_RESERVE = 2000;

/** Default summary budget ratio (5%) */
const DEFAULT_SUMMARY_RATIO = 0.05;

/** Default working set budget ratio (15%) */
const DEFAULT_WORKING_SET_RATIO = 0.15;

/** Default provider budget ratios */
const DEFAULT_PROVIDER_RATIOS: Record<ProviderType, number> = {
  diff: 0.4,
  lsp: 0.35,
  search: 0.25,
};

// =============================================================================
// Implementation
// =============================================================================

/**
 * Resolved configuration with all defaults applied.
 */
type ResolvedConfig = {
  readonly contextWindow: number;
  readonly outputReserve: number;
  readonly systemReserve: number;
  readonly summaryRatio: number;
  readonly workingSetRatio: number;
  readonly providerRatios: Record<ProviderType, number>;
};

/**
 * Allocates token budget across context components and evidence providers.
 *
 * Budget Hierarchy:
 * 1. Context Window (total)
 *    └─ Output Reserve (reserved for LLM response)
 *    └─ System Reserve (reserved for system prompt)
 *    └─ Available Budget
 *       ├─ Summary (5% default)
 *       ├─ Working Set (15% default)
 *       └─ Evidence Budget (remainder)
 *           ├─ Diff Provider (40% default)
 *           ├─ LSP Provider (35% default)
 *           └─ Search Provider (25% default)
 *
 * @example
 * ```typescript
 * const allocator = new BudgetAllocator({ contextWindow: 100000 });
 * const allocation = allocator.allocate();
 * // allocation.total = 94000 (100k - 4k output - 2k system)
 * // allocation.summary = 4700 (5% of 94k)
 * // allocation.workingSet = 14100 (15% of 94k)
 * // allocation.perProvider.diff = 30080 (40% of evidence budget)
 *
 * const budgetedEvidence = allocator.fitToBudget(sortedEvidence, allocation);
 * ```
 */
export class BudgetAllocator {
  private readonly config: ResolvedConfig;

  /**
   * Creates a new BudgetAllocator instance.
   *
   * @param config - Configuration options
   */
  constructor(config: BudgetAllocatorConfig) {
    this.config = {
      contextWindow: config.contextWindow,
      outputReserve: config.outputReserve ?? DEFAULT_OUTPUT_RESERVE,
      systemReserve: config.systemReserve ?? DEFAULT_SYSTEM_RESERVE,
      summaryRatio: config.summaryRatio ?? DEFAULT_SUMMARY_RATIO,
      workingSetRatio: config.workingSetRatio ?? DEFAULT_WORKING_SET_RATIO,
      providerRatios: {
        ...DEFAULT_PROVIDER_RATIOS,
        ...config.providerRatios,
      },
    };
  }

  /**
   * Calculate budget allocation.
   *
   * Computes the token budget breakdown for each context component:
   * - Reserves output and system prompt space
   * - Allocates summary and working set by ratio
   * - Distributes remaining budget across providers
   *
   * @returns Budget allocation with per-component breakdowns
   */
  allocate(): BudgetAllocation {
    const { contextWindow, outputReserve, systemReserve } = this.config;
    const { summaryRatio, workingSetRatio, providerRatios } = this.config;

    // Calculate available budget after reserves
    const available = Math.max(0, contextWindow - outputReserve - systemReserve);

    // Allocate summary and working set
    const summary = Math.floor(available * summaryRatio);
    const workingSet = Math.floor(available * workingSetRatio);

    // Calculate evidence budget (remainder after summary + working set)
    const evidenceBudget = Math.max(0, available - summary - workingSet);

    // Allocate per-provider budgets
    const perProvider: Record<ProviderType, number> = {
      diff: Math.floor(evidenceBudget * (providerRatios.diff ?? DEFAULT_PROVIDER_RATIOS.diff)),
      lsp: Math.floor(evidenceBudget * (providerRatios.lsp ?? DEFAULT_PROVIDER_RATIOS.lsp)),
      search: Math.floor(
        evidenceBudget * (providerRatios.search ?? DEFAULT_PROVIDER_RATIOS.search)
      ),
    };

    // Calculate remaining (rounding leftovers)
    const allocatedToProviders = Object.values(perProvider).reduce((a, b) => a + b, 0);
    const remaining = evidenceBudget - allocatedToProviders;

    return {
      total: available,
      summary,
      workingSet,
      perProvider,
      remaining,
    };
  }

  /**
   * Fit evidence into allocated budget.
   *
   * Prioritizes evidence by score (assumes pre-sorted input),
   * respecting per-provider limits to ensure diverse context.
   *
   * Algorithm:
   * 1. Maintain per-provider token usage
   * 2. Iterate through evidence (pre-sorted by score DESC)
   * 3. Skip if provider quota exceeded
   * 4. Break if total budget exceeded
   * 5. Include item if within both limits
   *
   * @param evidence - Pre-sorted evidence by score (descending)
   * @param allocation - Budget allocation from allocate()
   * @returns Evidence items that fit within budget constraints
   */
  fitToBudget(evidence: readonly Evidence[], allocation: BudgetAllocation): Evidence[] {
    // Handle edge case: empty evidence
    if (evidence.length === 0) {
      return [];
    }

    const result: Evidence[] = [];

    // Track usage per provider
    const usedPerProvider: Record<ProviderType, number> = {
      diff: 0,
      lsp: 0,
      search: 0,
    };

    // Calculate evidence budget
    const evidenceBudget = Math.max(
      0,
      allocation.total - allocation.summary - allocation.workingSet
    );

    let totalUsed = 0;

    // Evidence should be pre-sorted by score (descending)
    for (const item of evidence) {
      const { provider, tokens } = item;

      // Handle edge case: item with zero or negative tokens
      if (tokens <= 0) {
        continue;
      }

      const providerBudget = allocation.perProvider[provider];
      const providerUsed = usedPerProvider[provider];

      // Check provider budget constraint
      if (providerUsed + tokens > providerBudget) {
        // Skip this item, but continue checking others
        continue;
      }

      // Check total budget constraint
      if (totalUsed + tokens > evidenceBudget) {
        // No more room, stop processing
        break;
      }

      // Include this evidence item
      result.push(item);
      usedPerProvider[provider] += tokens;
      totalUsed += tokens;
    }

    return result;
  }
}
