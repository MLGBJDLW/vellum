// ============================================
// Agent Module - Barrel Export
// ============================================

export {
  type CancelCallback,
  CancellationToken,
  CancelledError,
  type PendingTool,
} from "./cancellation.js";
// Context Integration (T403)
export {
  type ContextIntegration,
  type ContextIntegrationConfig,
  type ContextManageResult,
  type ContextManagerConfig,
  contextsToSessions,
  contextToSession,
  createContextIntegration,
  createContextIntegrationFromLoopConfig,
  sessionsToContexts,
  sessionToContext,
} from "./context-integration.js";
// Doom Loop Detection (T018)
export {
  countConsecutiveIdenticalCalls,
  createToolCall,
  DEFAULT_DOOM_LOOP_OPTIONS,
  type DoomLoopOptions,
  type DoomLoopResult,
  detectDoomLoop,
  serializeToolCall,
  type ToolCall,
} from "./doom.js";
// Agent Level Hierarchy (T001)
export { AgentLevel, AgentLevelSchema, canSpawn } from "./level.js";
export {
  AgentLoop,
  type AgentLoopConfig,
  type AgentLoopEvents,
} from "./loop.js";
// Combined Loop Detection (T040)
export {
  type CombinedLoopResult,
  createLoopDetectionContext,
  DEFAULT_LOOP_DETECTION_CONFIG,
  detectLoop,
  detectLoopAsync,
  getLoopWarningLevel,
  type LoopAction,
  type LoopDetectionConfig,
  type LoopDetectionContext,
  type LoopType,
} from "./loop-detection.js";
// Mode Loader (T006)
export {
  createModeLoader,
  ModeFileNotFoundError,
  type ModeLoader,
  ModeValidationError,
  type YamlModeConfig,
  YamlModeConfigSchema,
} from "./mode-loader.js";
// Mode Registry (T005)
export { createModeRegistry, type ModeRegistry } from "./mode-registry.js";
export {
  AGENT_MODES,
  type AgentMode,
  AgentModeSchema,
  canEdit,
  DEFAULT_MAX_CONCURRENT_SUBAGENTS,
  type ExtendedModeConfig,
  ExtendedModeConfigSchema,
  getBashPermission,
  getModeConfig,
  getTemperature,
  MODE_CONFIGS,
  type ModeConfig,
  ModeConfigSchema,
  type ToolPermissions,
  ToolPermissionsSchema,
  toExtendedMode,
} from "./modes.js";
export {
  buildEnvironmentInfo,
  buildEnvironmentSection,
  buildModePrompt,
  buildSystemPrompt,
  findGlobalRuleFiles,
  findLocalRuleFiles,
  getProviderHeader,
  readRuleFile,
  type SystemPromptConfig,
  SystemPromptConfigSchema,
  type SystemPromptResult,
} from "./prompt.js";
// Restrictions (T003)
export {
  type FileAccess,
  FileAccessSchema,
  type FileRestriction,
  FileRestrictionSchema,
  type ToolGroupEntry,
  ToolGroupEntrySchema,
} from "./restrictions.js";
// Graceful Shutdown (T024)
export {
  GracefulShutdownHandler,
  type GracefulShutdownHandlerOptions,
  registerShutdownHandler,
  type ShutdownResult,
  type ShutdownSignal,
} from "./shutdown.js";

// Similarity Functions (T019)
export {
  averageSimilarity,
  computeSimilarityStats,
  jaccardSimilarity,
  maxSimilarity,
  minSimilarity,
  type SimilarityStats,
  textSimilarity,
  tokenize,
} from "./similarity.js";
export {
  AGENT_STATES,
  type AgentState,
  AgentStateSchema,
  createStateContext,
  isValidTransition,
  type StateContext,
  type StateTransitionEvent,
  VALID_TRANSITIONS,
} from "./state.js";
// State Persistence (T023)
export {
  createSnapshot,
  DEFAULT_SESSION_DIR,
  FileStatePersister,
  type FileStatePersisterOptions,
  isValidSnapshot,
  MemoryStatePersister,
  type SessionSnapshot,
  SNAPSHOT_VERSION,
  type SnapshotContext,
  type StatePersister,
} from "./state-persister.js";
// LLM Stuck Detection (T020)
export {
  createStuckDetector,
  DEFAULT_STUCK_DETECTOR_CONFIG,
  detectStuck,
  extractTextFromMessages,
  type LLMJudgmentCallback,
  LLMStuckDetector,
  type StuckDetectorConfig,
  type StuckResult,
} from "./stuck-detector.js";
// Termination (T017)
export {
  createTerminationContext,
  DEFAULT_TERMINATION_LIMITS,
  TerminationChecker,
  type TerminationContext,
  type TerminationLimits,
  type TerminationMetadata,
  TerminationReason,
  type TerminationResult,
  type TerminationTokenUsage,
  type ToolCallInfo,
} from "./termination.js";
