/**
 * Context Management System - Module Index
 *
 * Provides a comprehensive token-aware context management system for LLM conversations.
 * Features include token budget calculation, message prioritization, compression,
 * checkpointing, and automatic context management.
 *
 * @module @vellum/core/context
 */

// ============================================================================
// Types (Core Data Structures)
// ============================================================================

export type {
  ContentBlock,
  // Message types
  ContextMessage,
  ContextState,
  ImageBlock,
  // Image calculation
  ImageCalculator,
  ImageSource,
  ManageResult,
  MessageRole,
  // Content blocks
  TextBlock,
  ThresholdConfig,
  // Budget and state
  TokenBudget,
  ToolResultBlock,
  ToolUseBlock,
} from "./types.js";

// Re-export MessagePriority as runtime value (the type is inferred from the const object)
export { DEFAULT_PRIORITY, DEFAULT_THRESHOLDS, MessagePriority } from "./types.js";

// ============================================================================
// Configuration
// ============================================================================

export type { ConfigValidationResult, ContextManagerConfig } from "./config.js";
export { createConfig, DEFAULT_CONFIG, validateConfig } from "./config.js";

// ============================================================================
// Token Budget Calculation
// ============================================================================

export type { TokenBudgetOptions } from "./token-budget.js";
export {
  calculateBudgetUsage,
  calculateOutputReserve,
  calculateTokenBudget,
  getModelContextWindow,
  isCriticalState,
  isOverflowState,
  isWarningState,
} from "./token-budget.js";

// ============================================================================
// Token Caching
// ============================================================================

export type { CachedTokenizerOptions, TokenCacheStats, TokenizerFn } from "./token-cache.js";
export { CachedTokenizer, withCache } from "./token-cache.js";

// ============================================================================
// Image Token Calculation
// ============================================================================

export {
  AnthropicImageCalculator,
  calculateMessageImageTokens,
  createImageCalculator,
  DefaultImageCalculator,
  extractImageDimensions,
  GeminiImageCalculator,
  hasImageBlocks,
  OpenAIImageCalculator,
} from "./image-tokens.js";

// ============================================================================
// Tool Pairing Analysis
// ============================================================================

export type { OrphanedBlock, ToolPair, ToolPairAnalysis } from "./tool-pairing.js";
export {
  analyzeToolPairs,
  areInSameToolPair,
  extractToolResultBlocks,
  extractToolUseBlocks,
  getLinkedIndices,
  hasToolBlocks,
} from "./tool-pairing.js";

// ============================================================================
// Sliding Window Truncation
// ============================================================================

export type { TruncateOptions, TruncateResult, TruncationCandidate } from "./sliding-window.js";
export {
  assignPriorities,
  calculatePriority,
  estimateTokens,
  fitsInBudget,
  getTruncationCandidates,
  truncate,
} from "./sliding-window.js";

// ============================================================================
// Tool Output Trimming/Pruning
// ============================================================================

export type { PruneOptions, PruneResult, TrimBlockResult } from "./tool-trimming.js";
export {
  cloneMessage,
  DEFAULT_MAX_OUTPUT_CHARS,
  DEFAULT_PROTECTED_TOOLS,
  DEFAULT_TRUNCATION_MARKER,
  getToolNameForResult,
  getToolResultLength,
  isProtectedTool,
  PRUNE_MINIMUM_TOKENS,
  PRUNE_PROTECT_TOKENS,
  pruneToolOutputs,
  trimToolResult,
} from "./tool-trimming.js";

// ============================================================================
// Compression (LLM-Based Summarization)
// ============================================================================

export type {
  CompressionLLMClient,
  CompressionOptions,
  CompressionRange,
  CompressionResult,
} from "./compression.js";
export {
  calculateCompressionSavings,
  DEFAULT_SUMMARY_PROMPT,
  estimateCompressionTokens,
  generateCondenseId,
  getCompressedMessages,
  isSummaryMessage,
  linkCompressedMessages,
  NonDestructiveCompressor,
} from "./compression.js";

// ============================================================================
// Checkpointing
// ============================================================================

export type { Checkpoint, CheckpointManagerOptions, RollbackResult } from "./checkpoint.js";
export {
  CheckpointManager,
  createPreCompressionCheckpoint,
  generateCheckpointId,
  resetCheckpointCounter,
} from "./checkpoint.js";

// ============================================================================
// Threshold Configuration
// ============================================================================

export type {
  ModelThresholdConfig,
  ThresholdProfile,
  ThresholdValidationResult,
} from "./threshold.js";
export {
  addModelThreshold,
  clearCustomThresholds,
  getAllThresholdConfigs,
  getThresholdConfig,
  getThresholdProfile,
  MODEL_THRESHOLDS,
  matchesModelPattern,
  THRESHOLD_PROFILES,
  validateThresholds,
} from "./threshold.js";

// ============================================================================
// Profile Thresholds (Named Profiles)
// ============================================================================

export type { ProfileThresholds } from "./profile-thresholds.js";
export {
  createProfile,
  DEFAULT_PROFILE_THRESHOLDS,
  getAllProfiles,
  getProfileInfo,
  getProfileThreshold,
  listProfiles,
  profileExists,
  validateProfileThreshold,
} from "./profile-thresholds.js";

// ============================================================================
// Threshold Constants
// ============================================================================

export {
  clampThreshold,
  DEFAULT_CONDENSE_THRESHOLD,
  decimalToPercent,
  formatThresholdPercent,
  getDefaultThresholdDecimal,
  isValidThreshold,
  MAX_CONDENSE_THRESHOLD,
  MIN_CONDENSE_THRESHOLD,
  normalizeThreshold,
  parseThreshold,
  percentToDecimal,
  thresholdEquals,
} from "./threshold-constants.js";

// ============================================================================
// Auto Context Manager (Main Entry Point)
// ============================================================================

export type {
  AutoContextManagerConfig,
  AutoManageResult,
  RecoveryStrategy,
} from "./auto-manager.js";
export {
  AutoContextManager,
  createDefaultConfig,
  estimateRequiredActions,
} from "./auto-manager.js";

// ============================================================================
// API History Filter
// ============================================================================

export type { ApiHistoryFilterOptions, ApiHistoryFilterResult } from "./api-history-filter.js";
export {
  buildSummaryMap,
  getCompressionChain,
  getEffectiveApiHistory,
  getMessagesWithCondenseParent,
  shouldIncludeInApiHistory,
  summaryExistsForCondenseId,
  toApiFormat,
} from "./api-history-filter.js";

// ============================================================================
// Feature Flags
// ============================================================================

export type { ContextFeatureFlags } from "./feature-flags.js";
export {
  createFeatureFlagsFromEnv,
  DEFAULT_FEATURE_FLAGS,
  getAllEnvVarNames,
  getEnvVarName,
  isFeatureEnabled,
  mergeFlags,
} from "./feature-flags.js";

// ============================================================================
// Ignore Patterns
// ============================================================================

export type { IgnoreManagerOptions, IgnoreResult } from "./ignore-manager.js";
export { IgnoreManager } from "./ignore-manager.js";
export { DEFAULT_IGNORE_PATTERNS } from "./ignore-patterns.js";

// ============================================================================
// Tool Block Repair
// ============================================================================

export type {
  RepairAction,
  RepairOptions,
  RepairResult,
  ToolBlockHealthSummary,
  ValidationError,
} from "./tool-block-repair.js";
export {
  createPlaceholderToolUse,
  fixMismatchedToolBlocks,
  getToolBlockHealthSummary,
  hasToolBlockIssues,
  reorderToolResult,
  validateToolBlockPairing,
} from "./tool-block-repair.js";

// ============================================================================
// Compaction Timestamp
// ============================================================================

export type {
  CompactedBlockLocation,
  CompactionStats,
  CompactionStatus,
} from "./compaction-timestamp.js";
export {
  clearBlocksCompaction,
  clearCompactionTimestamp,
  findCompactedBlocks,
  formatDuration,
  getCompactionAge,
  getCompactionStats,
  getCompactionStatus,
  isCompacted,
  markAsCompacted,
  markBlocksAsCompacted,
} from "./compaction-timestamp.js";

// ============================================================================
// Summary Detection
// ============================================================================

export type { SummaryTrackingState } from "./summary-detection.js";
export {
  countSummaries,
  createContextState,
  DEFAULT_SUMMARY_WINDOW_MS,
  findSummaries,
  getLatestSummary,
  getSummariesAfter,
  recentSummaryExists,
} from "./summary-detection.js";

// ============================================================================
// Provider Overrides
// ============================================================================

export type { ProviderOverride } from "./provider-overrides.js";
export {
  addProviderOverride,
  clearCustomOverrides,
  getAllOverrides,
  getContextWindowOverride,
  PROVIDER_OVERRIDES,
} from "./provider-overrides.js";

// ============================================================================
// Orphan Cleanup
// ============================================================================

export type {
  InvalidPointerInfo,
  OrphanPointerCount,
  ValidationResult as OrphanValidationResult,
} from "./orphan-cleanup.js";
export {
  clearOrphanedParentPointers,
  countOrphanedPointers,
  getMessagesPointingTo,
  hasParentPointers,
  removeAllParentPointers,
  validateParentPointers,
} from "./orphan-cleanup.js";

// ============================================================================
// Agents Configuration (AGENTS.md Protocol)
// ============================================================================

export * from "./agents/index.js";
