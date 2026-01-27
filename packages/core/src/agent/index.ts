// ============================================
// Agent Module - Barrel Export
// ============================================

// Prompt System (T027)
export * from "../prompts/index.js";
// Agent Config (T001, T002)
export {
  type AgentConfig,
  AgentConfigSchema,
  AgentLevel,
  AgentLevelSchema,
  BUILT_IN_AGENTS,
  type FileRestrictions,
  FileRestrictionsSchema,
  PLAN_AGENT,
  SPEC_ORCHESTRATOR,
  VIBE_AGENT,
} from "./agent-config.js";
// Agent Factory (T050, T056)
export {
  AgentFactory,
  type AgentFactoryOptions,
  type AgentFactoryResult,
  applyFactoryToConfig,
  createAgentFactory,
} from "./agent-factory.js";
// Agent Registry (T003)
export { AgentRegistry, DuplicateAgentError } from "./agent-registry.js";
// AGENTS.md Directory Scoping (Phase 25)
export * from "./agents-md/index.js";
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
// Context Manager (T403)
export {
  AgentContextManager,
  type AgentContextManagerConfig,
  type AgentContextManagerDeps,
  type ContextCompactedEvent,
} from "./context-manager.js";
// Cost Limit Integration (Phase 35+)
export {
  type CostCheckResult,
  CostLimitIntegration,
  type CostLimitIntegrationConfig,
  type CostLimitIntegrationEvents,
  createCostLimitIntegration,
} from "./cost-limit-integration.js";
// Cost Manager (Phase 35+)
export {
  AgentCostManager,
  type CostManagerCallbacks,
  type CostManagerConfig,
} from "./cost-manager.js";
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
// Agent Level Hierarchy (T001) - canSpawn function, T013 - canAgentSpawn function
export { canAgentSpawn, canSpawn } from "./level.js";
// LLM Loop Verifier (T041)
export {
  createLLMJudgmentCallback,
  createLLMLoopVerifier,
  DEFAULT_LLM_LOOP_VERIFIER_CONFIG,
  type LLMLoopCheckResult,
  LLMLoopVerifier,
  type LLMLoopVerifierConfig,
} from "./llm-loop-verifier.js";
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
  detectLoopWithVerification,
  type ExtendedLoopDetectionContext,
  getLoopWarningLevel,
  type LoopAction,
  type LoopDetectionConfig,
  type LoopDetectionContext,
  type LoopType,
} from "./loop-detection.js";
// File Memory Manager (Phase 2a)
export * from "./memory/index.js";
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
  type AgentLevelOverride,
  type AgentLevelOverrideSource,
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
export { CUSTOM_AGENT_PREFIX, createModeRegistry, type ModeRegistry } from "./mode-registry.js";
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
// Prompt utilities
export {
  buildEnvironmentInfo,
  buildEnvironmentSection,
  findGlobalRuleFiles,
  findLocalRuleFiles,
  fromPromptBuilder,
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
// Retry Manager (Step 6 - Extracted from AgentLoop)
export {
  AgentRetryManager,
  type HandleErrorResult,
  type RetryConfig,
  type RetryManagerDeps,
} from "./retry-manager.js";
// Role Manager (Specialist Roles)
export {
  AGENT_ROLES,
  type AgentRole,
  AVAILABLE_ROLES,
  createRoleManager,
  type Role,
  type RoleInfo,
  RoleManager,
  type RoleManagerOptions,
  type RoleSwitchResult,
} from "./role-manager.js";
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
// Skills Integration (T053)
export {
  AgentSkillsIntegration,
  type AgentSkillsIntegrationConfig,
  type AgentSkillsIntegrationDeps,
} from "./skills-integration.js";
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
// Stream Handler (Step 7 - Extracted from AgentLoop)
export {
  AgentStreamHandler,
  type AgentStreamHandlerConfig,
  type AgentStreamHandlerDeps,
  type PendingToolCall,
  type StreamHandlerCallbacks,
  type StreamProcessResult,
  type StreamState,
} from "./stream-handler.js";
// Streaming Loop Detection
export {
  DEFAULT_STREAMING_LOOP_CONFIG,
  type StreamingLoopConfig,
  StreamingLoopDetector,
  type StreamingLoopResult,
  type StreamingLoopState,
  type StreamingLoopType,
} from "./streaming-loop-detector.js";
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
// Termination Manager (Step 5 - Extracted from AgentLoop)
export {
  AgentTerminationManager,
  type AgentTerminationManagerConfig,
  type AgentTerminationManagerDeps,
  type MetadataTokens,
  type TerminationManagerCallbacks,
  type TurnUsage,
} from "./termination-manager.js";
