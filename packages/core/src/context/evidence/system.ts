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
import { DiffProvider, type DiffProviderConfig } from "./providers/diff-provider.js";
import { LspProvider, type LspProviderConfig } from "./providers/lsp-provider.js";
import { SearchProvider, type SearchProviderConfig } from "./providers/search-provider.js";
import { Reranker, type RerankerWeights } from "./reranker.js";
import {
  type GitDiffInfo,
  SignalExtractor,
  type SignalExtractorConfig,
  type SignalInput,
} from "./signal-extractor.js";
import type {
  Evidence,
  EvidencePack,
  EvidenceProvider,
  ProjectSummary,
  ProviderType,
  Signal,
} from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for the EvidencePackSystem facade.
 */
export interface EvidencePackSystemConfig {
  /** Workspace root path (required for providers) */
  readonly workspaceRoot: string;
  /** Context window size (total tokens available) */
  readonly contextWindow: number;
  /** Token budget for evidence (default: derived from contextWindow) */
  readonly tokenBudget?: number;
  /** Custom reranker weights to override defaults */
  readonly weights?: Partial<RerankerWeights>;
  /** Custom budget ratios per provider */
  readonly budgetRatios?: Partial<Record<ProviderType, number>>;
  /** Signal extractor configuration */
  readonly signalConfig?: SignalExtractorConfig;
  /** Provider-specific configurations */
  readonly providers?: {
    readonly diff?: Partial<Omit<DiffProviderConfig, "gitService">>;
    readonly search?: Partial<Omit<SearchProviderConfig, "workspaceRoot">>;
    readonly lsp?: Partial<Omit<LspProviderConfig, "workspaceRoot">>;
  };
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
 * 2. Query evidence providers with signals (parallel)
 * 3. Rank evidence by multi-feature scoring
 * 4. Allocate budget and assemble pack
 *
 * @example
 * ```typescript
 * const system = new EvidencePackSystem({
 *   workspaceRoot: '/path/to/project',
 *   contextWindow: 100000,
 * });
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
  private readonly providers: Map<ProviderType, EvidenceProvider> = new Map();

  // Built-in providers (for runtime service injection)
  private readonly searchProvider: SearchProvider;
  private readonly lspProvider: LspProvider;

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

    // Initialize built-in providers
    // DiffProvider requires gitService - deferred until setGitService() is called

    // SearchProvider
    this.searchProvider = new SearchProvider({
      workspaceRoot: config.workspaceRoot,
      ...config.providers?.search,
    });
    this.providers.set("search", this.searchProvider);

    // LspProvider (lspHub can be set later via setLspHub)
    this.lspProvider = new LspProvider({
      workspaceRoot: config.workspaceRoot,
      ...config.providers?.lsp,
    });
    this.providers.set("lsp", this.lspProvider);
  }

  /**
   * Register a custom evidence provider.
   *
   * @param provider - Provider to register
   * @throws Error if provider type is already registered
   */
  registerProvider(provider: EvidenceProvider): void {
    if (this.providers.has(provider.type)) {
      throw new Error(`Provider type '${provider.type}' is already registered`);
    }
    this.providers.set(provider.type, provider);
  }

  /**
   * Get all registered providers.
   *
   * @returns Array of registered providers
   */
  getProviders(): readonly EvidenceProvider[] {
    return [...this.providers.values()];
  }

  /**
   * Set the LSP hub for the LspProvider at runtime.
   * Call this when the LSP service becomes available.
   *
   * @param hub - LspHub instance
   */
  setLspHub(hub: unknown): void {
    this.lspProvider.setLspHub(hub as Parameters<LspProvider["setLspHub"]>[0]);
  }

  /**
   * Set the Git service for the DiffProvider at runtime.
   * This creates and registers the DiffProvider.
   *
   * @param service - GitSnapshotService instance
   * @param snapshotHash - Optional snapshot hash to diff against
   */
  setGitService(service: unknown, snapshotHash?: string): void {
    // If already registered, update existing provider
    if (this.providers.has("diff")) {
      const existingDiff = this.providers.get("diff") as DiffProvider;
      if (snapshotHash) {
        existingDiff.setSnapshotHash(snapshotHash);
      }
      return;
    }

    // Create and register new DiffProvider
    const diffProvider = new DiffProvider({
      gitService: service as DiffProviderConfig["gitService"],
      snapshotHash,
    });
    this.providers.set("diff", diffProvider);
  }

  /**
   * Build evidence pack from user input and context.
   *
   * This is the main entry point for the Evidence Pack System.
   * Queries all available providers in parallel and assembles a ranked pack.
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

    // Step 2: Query all available providers in parallel
    const evidence = await this.queryProviders(signals);

    // Step 3: Build pack from evidence
    return this.packBuilder.build({
      evidence,
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
   * Query all available providers in parallel.
   *
   * @param signals - Signals to search for
   * @returns Combined evidence from all providers
   */
  private async queryProviders(signals: Signal[]): Promise<Evidence[]> {
    // Skip if no signals
    if (signals.length === 0) {
      return [];
    }

    // Check availability and query providers in parallel
    const providerPromises: Promise<Evidence[]>[] = [];

    for (const provider of this.providers.values()) {
      providerPromises.push(this.queryProvider(provider, signals));
    }

    const results = await Promise.all(providerPromises);

    // Flatten and return all evidence
    return results.flat();
  }

  /**
   * Query a single provider, handling availability checks and errors.
   *
   * @param provider - Provider to query
   * @param signals - Signals to search for
   * @returns Evidence from provider, or empty array on failure
   */
  private async queryProvider(provider: EvidenceProvider, signals: Signal[]): Promise<Evidence[]> {
    try {
      // Check if provider is available
      const available = await provider.isAvailable();
      if (!available) {
        return [];
      }

      // Query provider
      return await provider.query(signals);
    } catch {
      // Silently fail - provider unavailable or errored
      return [];
    }
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
