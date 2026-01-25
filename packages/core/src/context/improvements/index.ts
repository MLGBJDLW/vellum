/**
 * Context Management Improvements - Module Index
 *
 * Exports all types and utilities for context management improvements.
 *
 * @module @vellum/core/context/improvements
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // P2-1: Disk Checkpoint Persistence
  CheckpointPersistenceStrategy,
  // P2-2: Compaction Stats Tracking
  CompactionHistoryEntry,
  CompactionStats,
  CompactionStatsConfig,
  // Unified Config
  ContextImprovementsConfig,
  DiskCheckpointConfig,
  // P1-1: Cross-Session Inheritance
  InheritanceContentType,
  InheritanceSource,
  InheritedContext,
  InheritedSummary,
  // P0-1: Summary Quality Validation
  LLMValidationResult,
  LostItem,
  PersistedCheckpoint,
  RuleValidationResult,
  SessionInheritanceConfig,
  // P1-2: Summary Compression Protection
  SummaryProtectionConfig,
  SummaryProtectionStrategy,
  SummaryQualityConfig,
  SummaryQualityReport,
  TruncationReason,
  // P0-2: Truncation Recovery
  TruncationRecoveryOptions,
  TruncationSnapshot,
  TruncationState,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

export { DEFAULT_IMPROVEMENTS_CONFIG } from "./types.js";

// ============================================================================
// P0-1: Summary Quality Validation
// ============================================================================

export {
  createSummaryQualityValidator,
  type ExtractedTerms,
  extractTechnicalTerms,
  type QualityValidationLLMClient,
  SummaryQualityValidator,
} from "./summary-quality-validator.js";

// ============================================================================
// P0-2: Truncation State Manager
// ============================================================================

export {
  createTruncationStateManager,
  TruncationStateManager,
} from "./truncation-state-manager.js";

// ============================================================================
// P1-1: Cross-Session Inheritance
// ============================================================================

export {
  CrossSessionInheritanceResolver,
  createCrossSessionInheritanceResolver,
} from "./cross-session-inheritance.js";

// ============================================================================
// P1-2: Summary Protection Filter
// ============================================================================

export {
  createSummaryProtectionFilter,
  DEFAULT_SUMMARY_PROTECTION_CONFIG,
  SummaryProtectionFilter,
  type SummaryProtectionStats,
} from "./summary-protection-filter.js";

// ============================================================================
// P2-1: Disk Checkpoint Persistence
// ============================================================================

export {
  createDiskCheckpointPersistence,
  DiskCheckpointPersistence,
} from "./disk-checkpoint-persistence.js";

// ============================================================================
// P2-2: Compaction Stats Tracking
// ============================================================================

export {
  type CompactionMessageInfo,
  type CompactionRecordInput,
  CompactionStatsTracker,
  createCompactionStatsTracker,
} from "./compaction-stats-tracker.js";

// ============================================================================
// Unified Manager (T032)
// ============================================================================

export {
  ContextImprovementsManager,
  createContextImprovementsManager,
} from "./manager.js";
