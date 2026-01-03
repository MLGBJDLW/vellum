// ============================================
// Session Module Exports
// ============================================

/**
 * @module @vellum/core/session
 *
 * Session management for the agent loop.
 * Provides LLM streaming, message handling, and thinking support.
 *
 * T045: PluginManager should be initialized after permission setup
 * in the session startup flow. Integration point is in the TUI/CLI layer
 * where session creation occurs.
 */

// Checkpoint-Snapshot Integration (T026)
export {
  type CheckpointWithSnapshot,
  type CreateCheckpointWithSnapshotOptions,
  createCheckpointWithSnapshot,
  getCheckpointDiff,
  getCheckpointsWithSnapshots,
  hasSnapshot,
  type RollbackWithSnapshotResult,
  rollbackWithSnapshot,
} from "./checkpoint-snapshot.js";
// Compaction Service (T029, T030)
export {
  type AutoCompactionConfig,
  type CompactionCallbacks,
  type CompactionConfig,
  type CompactionResult,
  CompactionService,
  type CompactionStrategy,
  DEFAULT_AUTO_COMPACTION_CONFIG,
  DEFAULT_COMPACTION_CONFIG,
  type LLMSummaryCall,
  type SessionCompactionStats,
  type ShouldCompactResult,
} from "./compaction.js";
// Error Classification (T039)
export {
  classifyError,
  type ErrorClassSeverity,
  type ErrorInfo,
  getRetryDelay,
  getSuggestedErrorAction,
  isFatal,
  isRetryable,
  isTransient,
  type SuggestedAction,
} from "./errors.js";
// Export Service (T020)
export { type ExportFormat, type ExportOptions, ExportService } from "./export.js";
// Command History Service (T035)
export {
  CommandHistory,
  type HistoryEntry,
  type HistoryExpansionResult,
} from "./history.js";
// Session List Service (T016)
export {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  type PaginatedResult,
  PaginatedResultSchema,
  type PaginationOptions,
  PaginationOptionsSchema,
  type SessionFilter,
  SessionFilterSchema,
  SessionListService,
  type SessionSort,
  type SessionSortField,
  SessionSortFieldSchema,
  SessionSortSchema,
  type SortDirection,
  SortDirectionSchema,
} from "./list.js";
// LLM Streaming
export {
  buildToolLookup,
  DEFAULT_STREAM_TIMEOUT_MS,
  LLM,
  type LLMStreamEvent,
  MAX_OUTPUT_TOKENS,
  repairToolCall,
  type StreamConfig,
  StreamConfigSchema,
  type ToolCallRepairResult,
} from "./llm.js";
// Session Message Types and Converters
export {
  createAssistantMessage,
  createSystemMessage,
  createToolResultMessage,
  createUserMessage,
  getReasoningContent,
  // Utilities
  getTextContent,
  getToolCalls,
  hasToolCalls,
  hasToolResults,
  type SessionFilePart,
  SessionFilePartSchema,
  type SessionImagePart,
  SessionImagePartSchema,
  type SessionMessage,
  type SessionMessageMetadata,
  SessionMessageMetadataSchema,
  type SessionMessagePart,
  SessionMessagePartSchema,
  SessionMessageSchema,
  // Constructors
  SessionParts,
  type SessionReasoningPart,
  SessionReasoningPartSchema,
  type SessionRole,
  SessionRoleSchema,
  // Types
  type SessionTextPart,
  // Schemas
  SessionTextPartSchema,
  type SessionToolPart,
  SessionToolPartSchema,
  type SessionToolResultPart,
  SessionToolResultPartSchema,
  // Converters
  toModelMessages,
} from "./message.js";
// Persistence Manager (T012)
export {
  DEFAULT_PERSISTENCE_CONFIG,
  type PersistenceConfig,
  type PersistenceEvents,
  PersistenceManager,
} from "./persistence.js";
// Session Recovery (T013)
export {
  type CrashedSessionInfo,
  RecoveryError,
  RecoveryErrorType,
  type RecoveryLog,
  RecoveryLogSchema,
  type RecoveryLogStatus,
  RecoveryManager,
  type StartupCheckResult,
} from "./recovery.js";
// Session Retry (T022)
export {
  abortableSleep,
  calculateRetryDelay,
  createSessionRetry,
  isAbortError,
  RetryAbortedError,
  type SessionRetryOptions,
  withSessionRetry,
} from "./retry.js";
// Search Service (T017, T018)
export {
  type SearchDocument,
  type SearchOptions,
  SearchService,
  type SessionSearchHit,
  type SessionSearchResult,
} from "./search.js";
// Session Snapshot (T024)
export {
  type DiffResult,
  Snapshot,
  SnapshotError,
  SnapshotErrorCode,
  type SnapshotInfo,
} from "./snapshot.js";
// Storage Configuration (T006)
export {
  createStorageConfig,
  getDefaultStorageConfig,
  type StorageConfig,
  StorageConfigSchema,
  StorageError,
  type StorageErrorOptions,
  StorageErrorType,
  StorageManager,
} from "./storage.js";
// Summary Service (T028)
export {
  DEFAULT_SUMMARY_CONFIG,
  type LLMCallFunction,
  SessionSummaryService,
  type SummaryConfig,
} from "./summary.js";
// Session Switcher (T021, T022)
export {
  type ForkOptions,
  type MergeOptions,
  SessionSwitcher,
  type SwitcherEvents,
} from "./switcher.js";
// Thinking Handler
export {
  // Functions
  createThinkingState,
  finalizeThinking,
  handleThinking,
  handleThinkingDelta,
  type ReasoningDeltaEvent,
  type ReasoningEndEvent,
  // Types
  type ReasoningStartEvent,
  type ThinkingEvent,
  // Class
  ThinkingHandler,
  type ThinkingState,
} from "./thinking.js";
// Session Types (T005)
export {
  addCheckpoint,
  addMessage,
  type CreateCheckpointOptions,
  type CreateSessionOptions,
  createCheckpoint,
  createSession,
  type Session,
  type SessionCheckpoint,
  SessionCheckpointSchema,
  type SessionMetadata,
  SessionMetadataSchema,
  type SessionMode,
  SessionModeSchema,
  SessionSchema,
  type SessionStatus,
  SessionStatusSchema,
  updateSessionMetadata,
} from "./types.js";
