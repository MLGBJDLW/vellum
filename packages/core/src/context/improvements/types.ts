/**
 * Context Management Improvements - Type Definitions
 *
 * Addresses 6 issues identified in the expert assessment report:
 * - P0-1: Summary Quality Validation
 * - P0-2: Truncation Recovery Mechanism
 * - P1-1: Cross-Session Context Inheritance
 * - P1-2: Summary Compression Protection
 * - P2-1: Checkpoint Disk Persistence
 * - P2-2: Compaction Stats Tracking
 *
 * @module @vellum/core/context/improvements
 */

// ============================================================================
// P0-1: Summary Quality Validation
// ============================================================================

/**
 * Configuration for summary quality validation.
 * Controls both rule-based (fast) and LLM-based (deep) validation.
 */
export interface SummaryQualityConfig {
  /** Enable rule-based validation (fast) */
  enableRuleValidation: boolean;
  /** Enable LLM validation (deep, higher cost) */
  enableLLMValidation: boolean;
  /** Minimum technical term retention ratio (0-1) */
  minTechTermRetention: number;
  /** Minimum code reference retention ratio (0-1) */
  minCodeRefRetention: number;
  /** Maximum compression ratio (original/summary) */
  maxCompressionRatio: number;
}

/**
 * Complete quality report for a summary operation.
 */
export interface SummaryQualityReport {
  /** Whether the summary passed all validations */
  passed: boolean;
  /** Original message token count */
  originalTokens: number;
  /** Summary token count */
  summaryTokens: number;
  /** Compression ratio (original/summary) */
  compressionRatio: number;
  /** Rule-based validation results */
  ruleResults?: RuleValidationResult;
  /** LLM-based validation results */
  llmResults?: LLMValidationResult;
  /** Warning messages for borderline issues */
  warnings: string[];
}

/**
 * Results from rule-based validation.
 * Fast validation using pattern matching and heuristics.
 */
export interface RuleValidationResult {
  /** Technical term retention ratio */
  techTermRetention: number;
  /** Code reference retention ratio */
  codeRefRetention: number;
  /** Whether critical file paths are preserved */
  criticalPathsPreserved: boolean;
  /** List of items lost during summarization */
  lostItems: LostItem[];
}

/**
 * Represents an important item lost during summarization.
 */
export interface LostItem {
  /** Type of the lost item */
  type: "tech_term" | "code_ref" | "file_path" | "error_message";
  /** Original content that was lost */
  original: string;
  /** Surrounding context for debugging */
  context: string;
}

/**
 * Results from LLM-based validation.
 * Deep validation using language model scoring.
 */
export interface LLMValidationResult {
  /** Information completeness score (0-10) */
  completenessScore: number;
  /** Technical accuracy score (0-10) */
  accuracyScore: number;
  /** Actionability score (0-10) */
  actionabilityScore: number;
  /** Suggested improvements */
  suggestions: string[];
}

// ============================================================================
// P0-2: Truncation Recovery
// ============================================================================

/**
 * Represents the state of a truncation operation.
 * Used for recovery and debugging.
 */
export interface TruncationState {
  /** Unique identifier for this truncation */
  truncationId: string;
  /** IDs of messages that were truncated */
  truncatedMessageIds: string[];
  /** Timestamp when truncation occurred */
  truncatedAt: number;
  /** Reason for the truncation */
  reason: TruncationReason;
  /** Recovery snapshot if stored */
  snapshot?: TruncationSnapshot;
}

/**
 * Reason why truncation was performed.
 */
export type TruncationReason =
  | "token_overflow"
  | "sliding_window"
  | "emergency_recovery"
  | "manual";

/**
 * Snapshot of truncated messages for potential recovery.
 */
export interface TruncationSnapshot {
  /** Unique identifier for this snapshot */
  snapshotId: string;
  /** Serialized message data */
  messagesData: string;
  /** Size of the snapshot in bytes */
  sizeBytes: number;
  /** Whether the snapshot is compressed */
  compressed: boolean;
}

/**
 * Configuration for truncation recovery behavior.
 */
export interface TruncationRecoveryOptions {
  /** Maximum number of snapshots to keep */
  maxSnapshots: number;
  /** Maximum size per snapshot in bytes */
  maxSnapshotSize: number;
  /** Enable compression for stored snapshots */
  enableCompression: boolean;
  /** Snapshot expiration time in milliseconds */
  expirationMs: number;
}

// ============================================================================
// P1-1: Cross-Session Inheritance
// ============================================================================

/**
 * Configuration for cross-session context inheritance.
 */
export interface SessionInheritanceConfig {
  /** Enable automatic context inheritance */
  enabled: boolean;
  /** Source for inherited context */
  source: InheritanceSource;
  /** Maximum number of summaries to inherit */
  maxInheritedSummaries: number;
  /** Types of content to inherit */
  inheritTypes: InheritanceContentType[];
}

/**
 * Source for context inheritance.
 */
export type InheritanceSource = "last_session" | "project_context" | "manual";

/**
 * Types of content that can be inherited between sessions.
 */
export type InheritanceContentType = "summary" | "decisions" | "code_state" | "pending_tasks";

/**
 * Context inherited from a previous session.
 */
export interface InheritedContext {
  /** ID of the source session */
  sourceSessionId: string;
  /** Timestamp when context was inherited */
  inheritedAt: number;
  /** Inherited summaries */
  summaries: InheritedSummary[];
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * A summary inherited from a previous session.
 */
export interface InheritedSummary {
  /** Unique identifier for this summary */
  id: string;
  /** Summary content */
  content: string;
  /** ID of the original session */
  originalSession: string;
  /** Timestamp when summary was created */
  createdAt: number;
  /** Type of summary */
  type: "task" | "decisions" | "code_changes" | "full";
}

// ============================================================================
// P1-2: Summary Compression Protection
// ============================================================================

/**
 * Configuration for protecting summaries from further compression.
 */
export interface SummaryProtectionConfig {
  /** Enable summary protection */
  enabled: boolean;
  /** Maximum number of summaries to protect */
  maxProtectedSummaries: number;
  /** Protection strategy to use */
  strategy: SummaryProtectionStrategy;
}

/**
 * Strategy for determining which summaries to protect.
 */
export type SummaryProtectionStrategy =
  | "all" // Protect all summaries
  | "recent" // Only protect most recent N summaries
  | "weighted"; // Protect based on importance score

// ============================================================================
// P2-1: Disk Checkpoint Persistence
// ============================================================================

/**
 * Configuration for persisting checkpoints to disk.
 */
export interface DiskCheckpointConfig {
  /** Enable disk persistence */
  enabled: boolean;
  /** Directory for checkpoint storage */
  directory: string;
  /** Maximum disk usage in bytes */
  maxDiskUsage: number;
  /** Persistence strategy */
  strategy: CheckpointPersistenceStrategy;
  /** Enable compression for stored checkpoints */
  enableCompression: boolean;
}

/**
 * Strategy for checkpoint persistence timing.
 */
export type CheckpointPersistenceStrategy =
  | "immediate" // Persist immediately when created
  | "lazy" // Persist on next idle cycle
  | "on_demand"; // Only persist when explicitly requested

/**
 * Metadata for a checkpoint persisted to disk.
 */
export interface PersistedCheckpoint {
  /** Unique identifier for this checkpoint */
  checkpointId: string;
  /** Path to the checkpoint file */
  filePath: string;
  /** Timestamp when checkpoint was created */
  createdAt: number;
  /** Size of the checkpoint file in bytes */
  sizeBytes: number;
  /** Number of messages in the checkpoint */
  messageCount: number;
  /** Whether the checkpoint is compressed */
  compressed: boolean;
}

// ============================================================================
// P2-2: Compaction Stats Tracking
// ============================================================================

/**
 * Statistics for compaction operations within a session.
 */
export interface CompactionStats {
  /** Current session ID */
  sessionId: string;
  /** Total compaction count (all-time) */
  totalCompactions: number;
  /** Compaction count for this session */
  sessionCompactions: number;
  /** Number of cascade compactions */
  cascadeCompactions: number;
  /** Total tokens before all compactions */
  totalOriginalTokens: number;
  /** Total tokens after all compactions */
  totalCompressedTokens: number;
  /** Compaction history entries */
  history: CompactionHistoryEntry[];
}

/**
 * A single entry in the compaction history.
 */
export interface CompactionHistoryEntry {
  /** Unique identifier for this compaction */
  compactionId: string;
  /** Timestamp when compaction occurred */
  timestamp: number;
  /** Token count before compaction */
  originalTokens: number;
  /** Token count after compaction */
  compressedTokens: number;
  /** Number of messages compacted */
  messageCount: number;
  /** Whether this was a cascade compaction */
  isCascade: boolean;
  /** Quality report if validation was enabled */
  qualityReport?: SummaryQualityReport;
}

/**
 * Configuration for compaction statistics tracking.
 */
export interface CompactionStatsConfig {
  /** Enable statistics tracking */
  enabled: boolean;
  /** Persist statistics to disk */
  persist: boolean;
  /** Maximum number of history entries to keep */
  maxHistoryEntries: number;
  /** Path to statistics file (if persisting) */
  statsFilePath?: string;
}

// ============================================================================
// Unified Configuration
// ============================================================================

/**
 * Unified configuration for all context management improvements.
 */
export interface ContextImprovementsConfig {
  /** P0-1: Summary quality validation config */
  summaryQuality: SummaryQualityConfig;
  /** P0-2: Truncation recovery config */
  truncationRecovery: TruncationRecoveryOptions;
  /** P1-1: Cross-session inheritance config */
  sessionInheritance: SessionInheritanceConfig;
  /** P1-2: Summary protection config */
  summaryProtection: SummaryProtectionConfig;
  /** P2-1: Disk checkpoint config */
  diskCheckpoint: DiskCheckpointConfig;
  /** P2-2: Compaction stats config */
  compactionStats: CompactionStatsConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration with conservative, production-safe values.
 *
 * Design principles:
 * - Expensive features (LLM validation) disabled by default
 * - Memory-efficient defaults for resource-constrained environments
 * - Sensible retention periods to prevent unbounded growth
 */
export const DEFAULT_IMPROVEMENTS_CONFIG: ContextImprovementsConfig = {
  summaryQuality: {
    enableRuleValidation: true,
    enableLLMValidation: false, // Disabled by default (cost consideration)
    minTechTermRetention: 0.8,
    minCodeRefRetention: 0.9,
    maxCompressionRatio: 10,
  },
  truncationRecovery: {
    maxSnapshots: 3,
    maxSnapshotSize: 1024 * 1024, // 1MB
    enableCompression: true,
    expirationMs: 30 * 60 * 1000, // 30 minutes
  },
  sessionInheritance: {
    enabled: true,
    source: "last_session",
    maxInheritedSummaries: 3,
    inheritTypes: ["summary", "decisions"],
  },
  summaryProtection: {
    enabled: true,
    maxProtectedSummaries: 5,
    strategy: "recent",
  },
  diskCheckpoint: {
    enabled: false, // Disabled by default
    directory: ".vellum/checkpoints",
    maxDiskUsage: 100 * 1024 * 1024, // 100MB
    strategy: "lazy",
    enableCompression: true,
  },
  compactionStats: {
    enabled: true,
    persist: true,
    maxHistoryEntries: 100,
    statsFilePath: ".vellum/compaction-stats.json",
  },
};
