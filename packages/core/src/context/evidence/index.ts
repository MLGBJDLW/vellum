/**
 * Evidence Pack System - Context Builder for Vellum
 *
 * Provides intelligent context assembly for LLM interactions by:
 * 1. Extracting signals from user input and errors
 * 2. Ranking evidence by multi-feature scoring
 * 3. Allocating token budget across providers
 * 4. Assembling final evidence pack
 *
 * @packageDocumentation
 * @module context/evidence
 */

// =============================================================================
// Type Re-exports
// =============================================================================

export type {
  Evidence,
  EvidenceMetadata,
  EvidencePack,
  EvidenceProvider,
  EvidenceTelemetry,
  // Pack types
  ProjectSummary,
  // Provider types
  ProviderQueryOptions,
  // Evidence types
  ProviderType,
  Signal,
  SignalSource,
  // Signal types
  SignalType,
  WorkingSetEntry,
} from "./types.js";

// =============================================================================
// Component Re-exports
// =============================================================================

export {
  type BudgetAllocation,
  BudgetAllocator,
  type BudgetAllocatorConfig,
} from "./budget-allocator.js";
export {
  type CacheEntry as EvidenceCacheEntry,
  type CacheStats as EvidenceCacheStats,
  EvidenceCache,
  type EvidenceCacheConfig,
} from "./cache.js";
export {
  PackBuilder,
  type PackBuilderConfig,
  type PackBuilderInput,
} from "./pack-builder.js";
export {
  DEFAULT_WEIGHTS,
  Reranker,
  type RerankerConfig,
  type RerankerWeights,
} from "./reranker.js";
export {
  type ErrorContext,
  type GitDiffInfo,
  SignalExtractor,
  type SignalExtractorConfig,
  type SignalInput,
} from "./signal-extractor.js";
export {
  EvidenceTelemetryService,
  type TelemetryRecord,
  type TelemetryServiceConfig,
  type TelemetryStats,
} from "./telemetry.js";

// =============================================================================
// System Facade Re-export
// =============================================================================

export {
  EvidencePackSystem,
  type EvidencePackSystemConfig,
} from "./system.js";

// =============================================================================
// Provider Re-exports
// =============================================================================

export { DiffProvider, type DiffProviderConfig } from "./providers/diff-provider.js";
export { LspProvider, type LspProviderConfig } from "./providers/lsp-provider.js";
export { SearchProvider, type SearchProviderConfig } from "./providers/search-provider.js";

// =============================================================================
// Adaptive Components Re-exports
// =============================================================================

export {
  type BudgetRatios,
  IntentAwareProviderStrategy,
  type IntentStrategy,
  type IntentStrategyProviderConfig,
  type OptimizationResult,
  type OptimizerStats,
  WeightOptimizer,
  type WeightOptimizerConfig,
} from "./adaptive/index.js";
