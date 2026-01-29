/**
 * EvidencePackSystem - High-level facade for the Evidence Pack System.
 *
 * Integrates all components (SignalExtractor, Reranker, BudgetAllocator, PackBuilder)
 * into a single, easy-to-use API for building context-aware evidence packs.
 *
 * @packageDocumentation
 * @module context/evidence/system
 */

import { BudgetAllocator } from "./budget-allocator.js";
import { PackBuilder } from "./pack-builder.js";
import { Reranker, type RerankerWeights } from "./reranker.js";
import {
  type GitDiffInfo,
  SignalExtractor,
  type SignalExtractorConfig,
  type SignalInput,
} from "./signal-extractor.js";
import type { EvidencePack, ProjectSummary, ProviderType, Signal } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for the EvidencePackSystem facade.
 */
export interface EvidencePackSystemConfig {
  /** Context window size (total tokens available) */
  readonly contextWindow: number;
  /** Custom reranker weights to override defaults */
  readonly weights?: Partial<RerankerWeights>;
  /** Custom budget ratios per provider */
  readonly budgetRatios?: Partial<Record<ProviderType, number>>;
  /** Signal extractor configuration */
  readonly signalConfig?: SignalExtractorConfig;
}

/**
 * Input for building an evidence pack via the system facade.
 */
export interface EvidencePackBuildInput {
  /** User message text */
  readonly userMessage: string;
  /** Error context array */
  readonly errors?: ReadonlyArray<{
    readonly message: string;
    readonly stack?: string;
    readonly code?: string;
  }>;
  /** Working set file paths */
  readonly workingSet?: readonly string[];
  /** Git diff information */
  readonly gitDiff?: GitDiffInfo;
  /** Project summary for context injection */
  readonly summary?: ProjectSummary;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * High-level facade for the Evidence Pack System.
 *
 * Provides a simplified API for building evidence packs by orchestrating
 * all underlying components: SignalExtractor, Reranker, BudgetAllocator, and PackBuilder.
 *
 * Build Flow:
 * 1. Extract signals from user input and errors
 * 2. (Phase 2) Query evidence providers with signals
 * 3. Rank evidence by multi-feature scoring
 * 4. Allocate budget and assemble pack
 *
 * @example
 * ```typescript
 * const system = new EvidencePackSystem({ contextWindow: 100000 });
 *
 * const pack = await system.build({
 *   userMessage: "Why is validateUser throwing TypeError?",
 *   errors: [{ message: "TypeError: Cannot read property 'id' of undefined" }],
 *   workingSet: ['src/auth/validate.ts', 'src/models/user.ts'],
 * });
 *
 * // Use pack.evidence for context injection
 * console.log(`Pack contains ${pack.evidence.length} evidence items`);
 * ```
 */
export class EvidencePackSystem {
  private readonly signalExtractor: SignalExtractor;
  private readonly reranker: Reranker;
  private readonly budgetAllocator: BudgetAllocator;
  private readonly packBuilder: PackBuilder;

  /**
   * Create a new EvidencePackSystem instance.
   * @param config - System configuration
   */
  constructor(config: EvidencePackSystemConfig) {
    // Initialize signal extractor
    this.signalExtractor = new SignalExtractor(config.signalConfig);

    // Initialize reranker with optional custom weights
    this.reranker = new Reranker({
      weights: config.weights,
    });

    // Initialize budget allocator with context window and optional ratios
    this.budgetAllocator = new BudgetAllocator({
      contextWindow: config.contextWindow,
      providerRatios: config.budgetRatios,
    });

    // Initialize pack builder with reranker and allocator
    this.packBuilder = new PackBuilder({
      reranker: this.reranker,
      budgetAllocator: this.budgetAllocator,
    });
  }

  /**
   * Build evidence pack from user input and context.
   *
   * This is the main entry point for the Evidence Pack System.
   * Currently returns empty evidence (providers implemented in Phase 2),
   * but the full pipeline framework is operational.
   *
   * @param input - Build input containing user message and context
   * @returns Complete evidence pack ready for context injection
   */
  async build(input: EvidencePackBuildInput): Promise<EvidencePack> {
    // Step 1: Extract signals from input
    const signalInput: SignalInput = {
      userMessage: input.userMessage,
      errors: input.errors?.map((e) => ({
        message: e.message,
        stack: e.stack,
        code: e.code,
      })),
      workingSet: input.workingSet ? [...input.workingSet] : undefined,
      gitDiff: input.gitDiff,
    };

    const signals = this.signalExtractor.extract(signalInput);

    // Step 2: Query providers with signals
    // TODO: Phase 2 - Implement provider queries
    // const evidence = await this.queryProviders(signals);
    // For now, signals are extracted but not yet used for provider queries
    void signals;

    // Step 3: Build pack from evidence
    // Currently returns pack with empty evidence (providers not yet implemented)
    return this.packBuilder.build({
      evidence: [], // Empty until Phase 2 providers implemented
      summary: input.summary,
      workingSet: input.workingSet?.map((path) => ({
        path,
        isDirty: false,
        lastModified: Date.now(),
        tokens: 0,
      })),
    });
  }

  /**
   * Extract signals from input (for testing/debugging).
   *
   * @param input - Signal extraction input
   * @returns Array of extracted signals
   */
  extractSignals(input: SignalInput): Signal[] {
    return this.signalExtractor.extract(input);
  }

  /**
   * Get current reranker weights.
   *
   * @returns Current weight configuration
   */
  getWeights(): RerankerWeights {
    return this.reranker.getWeights();
  }

  /**
   * Update reranker weights (for adaptive optimization).
   *
   * @param weights - Partial weights to update
   */
  updateWeights(weights: Partial<RerankerWeights>): void {
    this.reranker.updateWeights(weights);
  }
}
