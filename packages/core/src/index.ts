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
// @ Mention System (Phase: TUI Context Mentions)
// ============================================
export {
  DEFAULT_EXPANSION_OPTIONS,
  expandAllMentions,
  expandMention,
  getAllMentionSuggestions,
  getMentionFormat,
  getMentionSuggestions,
  hasMentions,
  MENTION_PARTIAL_REGEX,
  MENTION_REGEX,
  MENTION_TYPES,
  MENTION_TYPES_STANDALONE,
  MENTION_TYPES_WITH_VALUE,
  MENTION_VALUE_PARTIAL_REGEX,
  type Mention,
  MentionErrorCode,
  type MentionExpansion,
  type MentionExpansionContext,
  type MentionExpansionMetadata,
  type MentionExpansionOptions,
  type MentionExpansionResult,
  type MentionHandler,
  type MentionHandlerRegistry,
  type MentionSuggestion,
  type MentionType,
  mentionIsStandalone,
  mentionRequiresValue,
  parseMentions,
  previewMention,
  stripMentions,
  validateMentionValue,
} from "./mentions/index.js";

// ============================================
// Phase 19: Multi-Agent Orchestration
// ============================================
// This section exports all Phase 19 types for multi-agent orchestration:
// - Mode System (T008): AgentLevel, ExtendedModeConfig, ModeRegistry, ModeLoader
// - Orchestrator (T016): ./agents/orchestrator/index.js
// - Protocol (T025): ./agents/protocol/index.js
// - Session (T034): ./agents/session/index.js
// - Workers (T041): ./agents/workers/index.js

// ============================================
// Agent Module (T026-T031)
// ============================================
export {
  // Mode Switching (T031-T034)
  type ActivityTracker,
  AGENT_MODES,
  AGENT_STATES,
  type AgentFactoryOptions,
  type AgentFactoryResult,
  // Agent Level Hierarchy (T001)
  AgentLevel,
  AgentLevelSchema,
  // Core Loop
  AgentLoop,
  type AgentLoopConfig,
  type AgentLoopEvents,
  type AgentMode,
  // Modes
  AgentModeSchema,
  // Agent Registry (T003) - Built-in agent registry for mode-agent resolution
  AgentRegistry as BuiltinAgentRegistry,
  type AgentState,
  // State Machine
  AgentStateSchema,
  APPROVAL_POLICIES,
  // Coding Modes (Phase 23: T004-T016)
  type ApprovalPolicy,
  ApprovalPolicySchema,
  // Mode Handlers (T018-T027)
  BaseModeHandler,
  BUILT_IN_AGENTS,
  BUILTIN_CODING_MODES,
  buildEnvironmentSection,
  type CancelCallback,
  CancellationToken,
  // Cancellation
  CancelledError,
  CODING_MODES,
  type CodingMode,
  type CodingModeConfig,
  CodingModeConfigSchema,
  CodingModeSchema,
  type CombinedLoopResult,
  // Mode Detection (T028-T029)
  ComplexityAnalyzer,
  type ComplexityAnalyzerConfig,
  type ComplexityLevel,
  type ComplexityResult,
  ComplexityResultSchema,
  // Context Integration (T403)
  type ContextIntegration,
  type ContextIntegrationConfig,
  type ContextManageResult,
  type ContextManagerConfig,
  canAgentSpawn,
  canEdit,
  canSpawn,
  codingModeToCore,
  createActivityTracker,
  // Agent Factory (T050, T056)
  createAgentFactory,
  createComplexityAnalyzer,
  createContextIntegration,
  createContextIntegrationFromLoopConfig,
  createLoopDetectionContext,
  createModeDetector,
  // Mode Loader (T006)
  createModeLoader,
  // Mode Manager (T035)
  createModeManager,
  // Mode Registry (T005)
  createModeRegistry,
  createModeSwitcher,
  createSnapshot,
  createStateContext,
  createTerminationContext,
  DEFAULT_LOOP_DETECTION_CONFIG,
  // Extended Mode Config (Multi-Agent)
  DEFAULT_MAX_CONCURRENT_SUBAGENTS,
  DEFAULT_SESSION_DIR,
  DEFAULT_TERMINATION_LIMITS,
  type DetectionResult,
  DetectionResultSchema,
  DuplicateAgentError,
  // Loop Detection
  detectLoop,
  detectLoopAsync,
  type ExtendedModeConfig,
  ExtendedModeConfigSchema,
  // Legacy Mode Mapping (T049-T053)
  emitDeprecationWarning,
  // Restrictions (T003)
  type FileAccess,
  FileAccessSchema,
  type FileRestriction,
  FileRestrictionSchema,
  type FileRestrictions,
  FileRestrictionsSchema,
  // State Persistence
  FileStatePersister,
  type FileStatePersisterOptions,
  // Graceful Shutdown
  GracefulShutdownHandler,
  type GracefulShutdownHandlerOptions,
  getBashPermission,
  getLegacyTemperature,
  getLoopWarningLevel,
  getModeConfig,
  getTemperature,
  type HandlerResult,
  InvalidModeError,
  isLegacyMode,
  isValidCodingMode,
  isValidSnapshot,
  isValidTransition,
  LEGACY_MODE_MAP,
  LEGACY_MODES,
  type LoopAction,
  type LoopDetectionConfig,
  type LoopDetectionContext,
  type LoopType,
  legacyToNewMode,
  MemoryStatePersister,
  MODE_CONFIGS,
  type ModeChangedEvent,
  type ModeConfig,
  ModeConfigSchema,
  ModeDetector,
  type ModeDetectorConfig,
  ModeFileNotFoundError,
  type ModeHandler,
  type ModeLoader,
  ModeManager,
  type ModeManagerConfig,
  type ModeManagerEvents,
  type ModeRegistry,
  ModeSwitcher,
  type ModeSwitcherConfig,
  type ModeSwitchFailedEvent,
  type ModeSwitchResult,
  ModeSwitchResultSchema,
  ModeValidationError,
  NoOpActivityTracker,
  type NormalizationResult,
  normalizeMode,
  type PendingTool,
  type PhaseValidationResult,
  PLAN_AGENT,
  PLAN_MODE,
  PlanModeHandler,
  type PlanPhase,
  policyToTrustPreset,
  registerShutdownHandler,
  SANDBOX_POLICIES,
  type SandboxPolicy,
  SandboxPolicySchema,
  type SessionSnapshot,
  type ShutdownResult,
  type ShutdownSignal,
  SimpleActivityTracker,
  SNAPSHOT_VERSION,
  type SnapshotContext,
  SPEC_MODE,
  SPEC_ORCHESTRATOR,
  SPEC_PHASE_CONFIG,
  SPEC_PHASES,
  type SpecConfirmationRequiredEvent,
  SpecModeHandler,
  type SpecModeState,
  type SpecPhase,
  type SpecPhaseConfig,
  SpecPhaseSchema,
  type SpecPhaseToolAccess,
  type StateContext,
  type StatePersister,
  type StateTransitionEvent,
  type SystemPromptConfig,
  // System Prompt
  SystemPromptConfigSchema,
  type SystemPromptResult,
  sandboxToRestrictions,
  // Termination
  TerminationChecker,
  type TerminationContext,
  type TerminationLimits,
  type TerminationMetadata,
  TerminationReason,
  type TerminationResult,
  type TerminationTokenUsage,
  type ToolAccessConfig,
  type ToolCallInfo,
  type ToolGroup,
  type ToolGroupEntry,
  ToolGroupEntrySchema,
  type ToolPermissions,
  ToolPermissionsSchema,
  TypedEventEmitter,
  toExtendedMode,
  type UserMessage,
  VALID_TRANSITIONS,
  // Built-in Agents (T002)
  VIBE_AGENT,
  VIBE_MODE,
  VibeModeHandler,
  type YamlModeConfig,
  YamlModeConfigSchema,
} from "./agent/index.js";
// ============================================
// Legacy Exports (Agent/Loop)
// ============================================
export { Agent, type ExtendedAgentOptions } from "./agent.js";
// ============================================
// Custom Agents Module (T004-T016)
// ============================================
export {
  AgentCircularInheritanceError,
  // Type exports
  type AgentCoordination,
  AgentCoordinationSchema,
  AgentDiscovery,
  // Discovery exports
  type AgentDiscoveryEvents,
  type AgentDiscoveryOptions,
  AgentError,
  AgentErrorCode,
  // Error exports
  type AgentErrorOptions,
  type AgentHooks,
  AgentHooksSchema,
  // Loader exports
  type AgentLoadError,
  AgentLoader,
  AgentNotFoundError,
  AgentParseError,
  // Resolver exports
  type AgentRegistry as CustomAgentRegistryInterface,
  type AgentRestrictions as CustomAgentRestrictions,
  AgentRestrictionsSchema as CustomAgentRestrictionsSchema,
  AgentRouter,
  type AgentSettings,
  AgentSettingsSchema,
  AgentValidationError,
  type CustomAgentDefinition,
  CustomAgentDefinitionSchema,
  CustomAgentRegistry as CustomAgentRegistryClass,
  type CustomTrigger,
  createAgentDiscovery,
  createAgentLoader,
  createAgentRegistry as createCustomAgentRegistry,
  createAgentRouter,
  createInheritanceResolver,
  DEFAULT_DEBOUNCE_MS,
  type DiscoveredAgent,
  DiscoverySource,
  type FileRestriction as CustomFileRestriction,
  fromZodError,
  getInheritanceDepth,
  getSlugFromFilePath,
  hasNoCycles,
  InheritanceResolver,
  isAgentCircularInheritanceError,
  isAgentError,
  isAgentNotFoundError,
  isAgentParseError,
  isAgentValidationError,
  isSupportedAgentFile,
  isValidSlug,
  type LoadResult,
  MAX_DESCRIPTION_LENGTH,
  MAX_INHERITANCE_DEPTH,
  MAX_NAME_LENGTH,
  MAX_SLUG_LENGTH,
  MIN_ROUTING_SCORE,
  // Registry exports
  type RegistryEvents,
  type RegistryOptions,
  type ResolutionError,
  type ResolvedAgent,
  type ResolveResult,
  ROUTING_WEIGHTS,
  // Router exports
  type RouterOptions,
  type RoutingContext,
  type RoutingResult as CustomRoutingResult,
  type RoutingWeights,
  type ScoreBreakdown,
  type ScoredCandidate,
  SLUG_PATTERN,
  SUPPORTED_EXTENSIONS,
  type SupportedExtension,
  type ToolGroupEntry as CustomToolGroupEntry,
  type TriggerPattern,
  TriggerPatternSchema,
  TriggerPatternTypeSchema,
  // Schema exports
  type ValidatedCustomAgentDefinition,
  type ValidationIssue,
  validateAgentDefinition,
  type WhenToUse,
  WhenToUseSchema,
} from "./agents/custom/index.js";
// ============================================
// Agents Module (Phase 19: Multi-Agent Orchestration)
// ============================================
// Exports from:
// - Orchestrator (T016): ./agents/orchestrator/index.js
// - Protocol (T025): ./agents/protocol/index.js
// - Session (T034): ./agents/session/index.js
// - Workers (T041): ./agents/workers/index.js
export {
  // Aggregator exports
  type AggregatedResult,
  AggregatedResultSchema,
  // Approval forwarder exports
  type ApprovalDecision,
  ApprovalDecisionSchema,
  type ApprovalForwarder,
  type ApprovalRequest,
  ApprovalRequestSchema,
  // Session: Approval routing (T034)
  type ApprovalRoute,
  type ApprovalRouter,
  analystWorker,
  architectWorker,
  // Workers exports (T027-T041)
  type BaseWorker,
  type BaseWorkerConfig,
  BUILTIN_WORKERS,
  // Protocol exports (T017)
  type BuiltinTarget,
  type BuiltinTargetInferred,
  BuiltinTargetSchema,
  // Session: Context isolation (T034)
  type ContextIsolator,
  type CreateTaskPacketOptions,
  type CustomAgentTarget,
  type CustomAgentTargetInferred,
  CustomAgentTargetSchema,
  type CustomModeTarget,
  type CustomModeTargetInferred,
  CustomModeTargetSchema,
  // Delegation exports (migrated from @vellum/tool)
  canDelegate,
  coderWorker,
  createApprovalForwarder,
  // Session factories (T034)
  createApprovalRouter,
  createBaseWorker,
  createContextIsolator,
  createFilteredToolRegistry,
  createHandoff,
  // Core orchestrator exports
  createOrchestrator,
  createPermissionInheritance,
  createResourceQuotaManager,
  createResultAggregator,
  createSubsessionManager,
  // Task chain exports
  createTaskChainManager,
  // Decomposer exports
  createTaskDecomposer,
  createTaskPacket,
  // Router exports
  createTaskRouter,
  createWorkerFactory,
  DEFAULT_DELEGATION_TIMEOUT,
  type DecompositionResult,
  DecompositionResultSchema,
  type DelegateTaskContext,
  type DelegateTaskParams,
  type DelegateTaskParamsInferred,
  DelegateTaskParamsSchema,
  type DelegateTaskResult,
  type DelegateTaskResultInferred,
  DelegateTaskResultSchema,
  type DelegationHandler,
  type DelegationTarget,
  type DelegationTargetInferred,
  DelegationTargetSchema,
  DuplicateWorkerError,
  delegateTaskTool,
  devopsWorker,
  type EstimatedEffort,
  EstimatedEffortSchema,
  executeDelegateTask,
  // Session: Filtered tool registry (T034)
  type FilteredToolRegistry,
  getBuiltinWorkerCapabilities,
  getDelegationHandler,
  getSpecAgentSlugs,
  // Handoff exports (T019)
  type HandoffRequest,
  type HandoffRequestInferred,
  HandoffRequestSchema,
  type HandoffResult,
  type HandoffResultInferred,
  HandoffResultSchema,
  // Session: Context isolation (T034)
  type IsolatedContext,
  isBuiltinTarget,
  isCustomAgentTarget,
  isCustomModeTarget,
  isMcpTarget,
  MAX_DELEGATION_DEPTH,
  type McpTarget,
  type McpTargetInferred,
  McpTargetSchema,
  type OrchestratorConfig,
  type OrchestratorCore,
  type OrchestratorEvent,
  type OrchestratorEventHandler,
  type OrchestratorEventType,
  type PartialFailureStrategy,
  PartialFailureStrategySchema,
  // Session: Permission inheritance (T034)
  type PermissionInheritance,
  type PermissionSet,
  // Session: Resource quota (T034)
  type QuotaStatus,
  qaWorker,
  type ResourceQuota,
  type ResourceQuotaManager,
  type ResourceUsage,
  type ResultAggregator,
  type RouteCandidate,
  type RouteResult,
  type RoutingRule,
  // Builtin agent registration (T032)
  registerBuiltinAgents,
  registerBuiltinWorkers,
  // Spec agent routing (T033)
  registerSpecAgentRoutes,
  // Spec agent registration (T032)
  registerSpecAgents,
  researcherWorker,
  SPEC_ROUTING_RULES,
  SPEC_SPAWNABLE_AGENTS,
  type SpawnOptions,
  type SubagentHandle,
  // Session: Subsession management (T034)
  type Subsession,
  type SubsessionCreateConfig,
  type SubsessionManager,
  type SubsessionStatus,
  type SubtaskDefinition,
  SubtaskDefinitionSchema,
  type SubtaskDependency,
  SubtaskDependencySchema,
  securityWorker,
  setDelegationHandler,
  // Spec agents (T032)
  specArchitectAgent,
  specRequirementsAgent,
  specResearcherAgent,
  specTasksAgent,
  specValidatorAgent,
  type TaskAnalysis,
  TaskAnalysisSchema,
  type TaskChain,
  type TaskChainManager,
  type TaskChainNode,
  type TaskComplexity,
  TaskComplexitySchema,
  type TaskConstraints,
  type TaskConstraintsInferred,
  TaskConstraintsSchema,
  type TaskContext,
  type TaskContextInferred,
  TaskContextSchema,
  type TaskDecomposer,
  // TaskPacket exports (T018)
  type TaskPacket,
  type TaskPacketInferred,
  TaskPacketSchema,
  type TaskResult,
  TaskResultSchema,
  type TaskRouter,
  type TaskStatus,
  TaskStatusSchema,
  UnknownWorkerError,
  // Session: Filtered tool registry constant (T034)
  WORKER_BLOCKED_TOOLS,
  type WorkerCapabilities,
  type WorkerContext,
  WorkerDelegationError,
  type WorkerFactory,
  type WorkerMetadata,
  type WorkerResult,
  writerWorker,
} from "./agents/index.js";
// ============================================
// Builtin Tools (T117)
// ============================================
export * from "./builtin/index.js";
// ============================================
// Commands (T032)
// ============================================
export * from "./commands/index.js";
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
  // Circuit breaker config
  type CircuitBreakerConfig,
  CircuitBreakerConfigSchema,
  // Config defaults
  CONFIG_DEFAULTS,
  type Config,
  type ConfigCredential,
  // T014 - Credential discriminated union schema
  ConfigCredentialSchema,
  type ConfigDefaults,
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
  // Config value resolution
  getCircuitBreaker,
  getLimit,
  getProviderDefault,
  // T023 - Credential wizard helpers
  getProviderDisplayName,
  getTimeout,
  // T025 - Credential resolution
  hasProviderCredentials,
  // Limits config
  type LimitsConfig,
  LimitsConfigSchema,
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
  // Timeouts config
  type TimeoutsConfig,
  TimeoutsConfigSchema,
} from "./config/index.js";
// ============================================
// Logging Config
// ============================================
export * from "./config/logging.config.js";
// ============================================
// Web Browsing Config
// ============================================
export {
  type BrowserConfig,
  BrowserConfigSchema,
  type CacheConfig,
  CacheConfigSchema,
  type DomainControl,
  DomainControlSchema,
  parseWebBrowsingConfig,
  type RateLimit,
  RateLimitSchema,
  type SecurityConfig,
  SecurityConfigSchema,
  type WebBrowsingConfig,
  WebBrowsingConfigSchema,
} from "./config/web-browsing.js";
// ============================================
// Context Management (T401-T402)
// ============================================
export * from "./context/index.js";
export { ContextManager } from "./context.js";
// ============================================
// Cost Tracking (Phase 35)
// ============================================
export {
  type CostBreakdown,
  type CostCalculationParams,
  type CostRecord,
  // Service
  CostService,
  type CostServiceOptions,
  type CostSummary,
  type CostUpdateEvent,
  // Calculator
  calculateCost,
  calculateCostBreakdown,
  calculateCostWithUsage,
  createCostService,
  type FormatCostOptions,
  formatCost,
  formatCostBreakdown,
  formatTokenCount,
  getPricing,
  getSupportedModels,
  getTieredPricing,
  hasPricing,
  MODEL_PRICING,
  type ModelPricing,
  type ModelUsage,
  type PricingTier,
  type ProviderPricing,
  type ProviderUsage,
  sumCostBreakdowns,
  type TokenUsage as CostTokenUsage,
} from "./cost/index.js";
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
  // TUI mode control for console suppression
  isTuiModeActive,
  JsonTransport,
  type JsonTransportOptions,
  LOG_LEVEL_PRIORITY,
  type LogEntry,
  Logger,
  type LoggerOptions,
  type LogLevel,
  type LogTransport,
  setTuiModeActive,
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
// Onboarding (Phase 38)
// ============================================
export * from "./onboarding/index.js";
// ============================================
// Permission System (T004-T007)
// ============================================
export * from "./permission/index.js";
// ============================================
// Privacy
// ============================================
export * from "./privacy/index.js";
// ============================================
// Rate Limiting (Phase 34)
// ============================================
export * from "./rate-limit/index.js";
// ============================================
// Session (LLM, Messages, Thinking)
// ============================================
export * from "./session/index.js";
// ============================================
// Shell Integration (Phase 37)
// ============================================
export * from "./shell/index.js";
// ============================================
// Skill System
// ============================================
export * from "./skill/index.js";
// ============================================
// Spec Workflow Module (T030-T034)
// ============================================
export {
  CHECKPOINT_DIR,
  // Checkpoint Manager
  type Checkpoint,
  CheckpointManager,
  type CheckpointReason,
  DEFAULT_KEEP_COUNT,
  // Handoff Executor
  HandoffExecutor,
  type ImplementationResult,
  // State Machine
  PHASE_EXECUTION_MODE,
  // Template Loader
  PHASE_TEMPLATES,
  PHASE_TRANSITIONS,
  // Types
  type PhaseResult,
  type PhaseState,
  type PhaseStatus,
  SKIPPABLE_PHASES,
  type SpecHandoffPacket,
  // Workflow Engine
  SpecWorkflowEngine,
  type SpecWorkflowEngineConfig,
  type SpecWorkflowState,
  type SpecWorkflowStatus,
  StateMachine,
  TEMPLATE_SEARCH_PATHS,
  TemplateLoader,
  // Workflow Events
  type WorkflowEvents,
  type WorkflowResult,
  type WorkflowStatus,
} from "./spec/index.js";
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
// ============================================
// Auto Update (Phase 39)
// ============================================
export * from "./update/index.js";
// ============================================
// Vision (Phase 32)
// ============================================
export * from "./vision/index.js";
// ============================================
// Watch (Phase 36)
// ============================================
export * from "./watch/index.js";
// ============================================
// Coder Worker Utilities
// ============================================
export {
  CoderTaskTracker,
  type ExecutionResult as CoderExecutionResult,
  type ParsedTask as CoderParsedTask,
  type ProgressEvent,
  ProgressReporter,
  TaskExecutor as CoderTaskExecutor,
  type TaskResult as CoderTaskResult,
  type TaskStatus as CoderTaskStatus,
} from "./workers/index.js";
// ============================================
// Workflows (T034-T035)
// ============================================
export {
  createWorkflowLoader,
  type StepResult as WorkflowStepResult,
  type StepValidation,
  type Workflow,
  WorkflowLoader,
  type WorkflowLoaderOptions,
  type WorkflowSource,
  type WorkflowStep,
} from "./workflows/index.js";
