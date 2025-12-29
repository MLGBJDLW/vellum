// ============================================
// Vellum Core Engine
// ============================================

/**
 * @module @vellum/core
 *
 * The core engine for the Vellum AI agent framework.
 * Provides typed message handling, tool execution, error handling,
 * configuration management, event-driven architecture, logging,
 * and dependency injection.
 */

// ============================================
// Agent Module (T026-T031)
// ============================================
export {
  AGENT_MODES,
  AGENT_STATES,
  // Core Loop
  AgentLoop,
  type AgentLoopConfig,
  type AgentLoopEvents,
  type AgentMode,
  // Modes
  AgentModeSchema,
  type AgentState,
  // State Machine
  AgentStateSchema,
  buildEnvironmentSection,
  buildModePrompt,
  buildSystemPrompt,
  type CancelCallback,
  CancellationToken,
  // Cancellation
  CancelledError,
  type CombinedLoopResult,
  canEdit,
  createLoopDetectionContext,
  createSnapshot,
  createStateContext,
  createTerminationContext,
  DEFAULT_LOOP_DETECTION_CONFIG,
  DEFAULT_SESSION_DIR,
  DEFAULT_TERMINATION_LIMITS,
  // Loop Detection
  detectLoop,
  detectLoopAsync,
  // State Persistence
  FileStatePersister,
  type FileStatePersisterOptions,
  // Graceful Shutdown
  GracefulShutdownHandler,
  type GracefulShutdownHandlerOptions,
  getBashPermission,
  getLoopWarningLevel,
  getModeConfig,
  getTemperature,
  isValidSnapshot,
  isValidTransition,
  type LoopAction,
  type LoopDetectionConfig,
  type LoopDetectionContext,
  type LoopType,
  MemoryStatePersister,
  MODE_CONFIGS,
  type ModeConfig,
  type PendingTool,
  registerShutdownHandler,
  type SessionSnapshot,
  type ShutdownResult,
  type ShutdownSignal,
  SNAPSHOT_VERSION,
  type SnapshotContext,
  type StateContext,
  type StatePersister,
  type StateTransitionEvent,
  type SystemPromptConfig,
  // System Prompt
  SystemPromptConfigSchema,
  type SystemPromptResult,
  // Termination
  TerminationChecker,
  type TerminationContext,
  type TerminationLimits,
  type TerminationMetadata,
  TerminationReason,
  type TerminationResult,
  type TerminationTokenUsage,
  type ToolCallInfo,
  type ToolPermissions,
  VALID_TRANSITIONS,
} from "./agent/index.js";
// ============================================
// Legacy Exports (Agent/Loop)
// ============================================
export { Agent, type ExtendedAgentOptions } from "./agent.js";

// ============================================
// Builtin Tools (T117)
// ============================================
export * from "./builtin/index.js";
// ============================================
// Config (T027-T043)
// ============================================
export {
  // Schemas
  AgentConfigSchema,
  type AgentConfigSettings,
  type ApiKeyCredential,
  // T014 - Credential config schemas
  ApiKeyCredentialSchema,
  type BearerTokenCredential,
  BearerTokenCredentialSchema,
  type CertificateCredential,
  CertificateCredentialSchema,
  type Config,
  type ConfigCredential,
  // T014 - Credential discriminated union schema
  ConfigCredentialSchema,
  // Config loader utilities
  type ConfigError,
  type ConfigErrorCode,
  // ConfigManager
  ConfigManager,
  type ConfigManagerEmitter,
  type ConfigManagerEvents,
  ConfigSchema,
  type CredentialMetadata,
  CredentialMetadataSchema,
  // T023 - Credential wizard types
  type CredentialPromptCallback,
  type CredentialPromptOptions,
  type CredentialSource,
  CredentialSourceSchema,
  type CredentialType,
  CredentialTypeSchema,
  // T024 - Deprecation warnings
  checkDeprecatedApiKeyUsage,
  clearDeprecationWarningsCache,
  deepMerge,
  findProjectConfig,
  // T023 - Credential wizard helpers
  getProviderDisplayName,
  // T025 - Credential resolution
  hasProviderCredentials,
  type LLMProvider,
  LLMProviderSchema,
  type LoadConfigOptions,
  // T025 - Extended config loading with credentials
  type LoadConfigWithCredentialsResult,
  // Re-export LogLevel from config as ConfigLogLevel to avoid conflict
  type LogLevel as ConfigLogLevel,
  LogLevelSchema,
  loadConfig,
  loadConfigWithCredentials,
  type OAuthTokenCredential,
  OAuthTokenCredentialSchema,
  type PartialConfig,
  type Permission,
  type PermissionMode,
  PermissionModeSchema,
  PermissionSchema,
  type ProviderName,
  ProviderNameSchema,
  parseEnvConfig,
  promptForCredentials,
  resolveProviderCredential,
  type ServiceAccountCredential,
  ServiceAccountCredentialSchema,
  storeCredential,
} from "./config/index.js";
// ============================================
// Logging Config
// ============================================
export * from "./config/logging.config.js";
// ============================================
// Context Management (T401-T402)
// ============================================
export * from "./context/index.js";
export { ContextManager } from "./context.js";
// ============================================
// Credentials (T001-T003)
// ============================================
export * from "./credentials/index.js";
// ============================================
// DI (T084-T108)
// ============================================
export * from "./di/index.js";
// ============================================
// Errors (T077-T083)
// ============================================
export * from "./errors/index.js";
// ============================================
// Events (T045-T050)
// ============================================
export * from "./events/index.js";
// ============================================
// Git Snapshot (T016-T029)
// ============================================
export {
  type CreateGitSnapshotServiceOptions,
  // T007 - Safety module
  checkProtectedPath,
  createGitSnapshotService,
  type DiffHunk as GitDiffHunk,
  // Rename to avoid collision with builtin/apply-diff.ts DiffHunk
  DiffHunkSchema as GitDiffHunkSchema,
  type DiffLine,
  DiffLineSchema,
  type DiffLineType,
  DiffLineTypeSchema,
  type DiffNameEntry,
  type FileChangeType,
  // T005 - Git types and schemas
  FileChangeTypeSchema,
  type FormattedDiff,
  FormattedDiffSchema,
  // T039 - Diff formatter
  formatFileDiff,
  formatMultiFileDiff,
  type GitFileChange,
  GitFileChangeSchema,
  type GitFileDiff,
  GitFileDiffSchema,
  // T011-T015 - Git operations
  GitOperations,
  type GitPatch,
  GitPatchSchema,
  type GitSnapshotConfig,
  GitSnapshotConfigSchema,
  type GitSnapshotCreatedEvent,
  type GitSnapshotEventBus,
  // T009 - Git snapshot lock
  GitSnapshotLock,
  type GitSnapshotRecord,
  GitSnapshotRecordSchema,
  type GitSnapshotRestoredEvent,
  type GitSnapshotRevertedEvent,
  // T016-T022 - Git snapshot service
  GitSnapshotService,
  getDiffStats,
  // T008 - Exclusion patterns
  getExclusionPatterns,
  getGitSafetyConfig,
  getMinimalExclusionPatterns,
  getNoGpgFlags,
  getSanitizedEnv,
  gitLockTimeoutError,
  // T006 - Git error factory functions
  gitNotInitializedError,
  gitOperationFailedError,
  gitProtectedPathError,
  gitSnapshotDisabledError,
  globalSnapshotLock,
  type IGitSnapshotService,
  renderFormattedDiff,
} from "./git/index.js";
// ============================================
// Logger (T052-T076)
// ============================================
export {
  ConsoleTransport,
  type ConsoleTransportOptions,
  FileTransport,
  type FileTransportOptions,
  JsonTransport,
  type JsonTransportOptions,
  LOG_LEVEL_PRIORITY,
  type LogEntry,
  Logger,
  type LoggerOptions,
  type LogLevel,
  type LogTransport,
} from "./logger/index.js";
// Note: AgentLoop is now exported from ./agent/index.js above
// The ./loop.js re-export is deprecated but kept for backward compatibility
// ============================================
// Metrics
// ============================================
export * from "./metrics/index.js";
// ============================================
// Migration (T115-T120)
// ============================================
export * from "./migration/index.js";
// ============================================
// Permission System (T004-T007)
// ============================================
export * from "./permission/index.js";
// ============================================
// Privacy
// ============================================
export * from "./privacy/index.js";
// ============================================
// Session (LLM, Messages, Thinking)
// ============================================
export * from "./session/index.js";
// ============================================
// Streaming (T005-T008)
// ============================================
export * from "./streaming/index.js";
// ============================================
// Telemetry
// ============================================
export * from "./telemetry/index.js";
// ============================================
// Tool Executor (T012-T016)
// ============================================
export * from "./tool/index.js";
// ============================================
// Types (T001-T024)
// ============================================
export * from "./types/index.js";
export type {
  AgentOptions,
  CompleteEvent,
  ErrorEvent,
  LoopEvent,
  MessageEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "./types.js";
