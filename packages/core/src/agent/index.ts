// ============================================
// Agent Module - Barrel Export
// ============================================

// Prompt System (T027)
export * from "../prompts/index.js";
export {
  type CancelCallback,
  CancellationToken,
  CancelledError,
  type PendingTool,
} from "./cancellation.js";
// Coding Modes (T004, T005, T010-T016)
export {
  BUILTIN_CODING_MODES,
  CODING_MODES,
  type CodingMode,
  type CodingModeConfig,
  CodingModeConfigSchema,
  CodingModeSchema,
  codingModeToCore,
  PLAN_MODE,
  SPEC_MODE,
  SPEC_PHASE_CONFIG,
  SPEC_PHASES,
  type SpecPhase,
  type SpecPhaseConfig,
  SpecPhaseSchema,
  type SpecPhaseToolAccess,
  VIBE_MODE,
} from "./coding-modes.js";
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
// Legacy Mode Mapping (T049-T053)
export {
  emitDeprecationWarning,
  getLegacyTemperature,
  InvalidModeError,
  isLegacyMode,
  isValidCodingMode,
  LEGACY_MODE_MAP,
  LEGACY_MODES,
  legacyToNewMode,
  type NormalizationResult,
  normalizeMode,
} from "./legacy-modes.js";
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
// Mode Detection (T028, T029)
export {
  ComplexityAnalyzer,
  type ComplexityAnalyzerConfig,
  type ComplexityLevel,
  type ComplexityResult,
  ComplexityResultSchema,
  createComplexityAnalyzer,
  createModeDetector,
  type DetectionResult,
  DetectionResultSchema,
  ModeDetector,
  type ModeDetectorConfig,
} from "./mode-detection.js";
// Mode Handlers (T018-T027)
export {
  BaseModeHandler,
  type HandlerResult,
  type ModeHandler,
  type PhaseValidationResult,
  PlanModeHandler,
  type PlanPhase,
  SpecModeHandler,
  type SpecModeState,
  type ToolAccessConfig,
  type ToolGroup,
  type UserMessage,
  VibeModeHandler,
} from "./mode-handlers/index.js";
// Mode Loader (T006)
export {
  createModeLoader,
  ModeFileNotFoundError,
  type ModeLoader,
  ModeValidationError,
  type YamlModeConfig,
  YamlModeConfigSchema,
} from "./mode-loader.js";
// Mode Manager (T035)
export {
  createModeManager,
  type ModeChangedEvent,
  ModeManager,
  type ModeManagerConfig,
  type ModeManagerEvents,
  type ModeSwitchFailedEvent,
  type SpecConfirmationRequiredEvent,
  TypedEventEmitter,
} from "./mode-manager.js";
// Mode Registry (T005)
export { createModeRegistry, type ModeRegistry } from "./mode-registry.js";
// Mode Switching (T031, T032, T033, T034)
export {
  type ActivityTracker,
  createActivityTracker,
  createModeSwitcher,
  ModeSwitcher,
  type ModeSwitcherConfig,
  type ModeSwitchResult,
  ModeSwitchResultSchema,
  NoOpActivityTracker,
  SimpleActivityTracker,
} from "./mode-switching.js";
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
// Policies (T006, T007, T008, T009)
export {
  APPROVAL_POLICIES,
  type ApprovalPolicy,
  ApprovalPolicySchema,
  policyToTrustPreset,
  SANDBOX_POLICIES,
  type SandboxPolicy,
  SandboxPolicySchema,
  sandboxToRestrictions,
} from "./policies.js";
export {
  buildEnvironmentInfo,
  buildEnvironmentSection,
  buildModePrompt,
  buildSystemPrompt,
  findGlobalRuleFiles,
  findLocalRuleFiles,
  fromPromptBuilder,
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
