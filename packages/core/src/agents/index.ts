// ============================================
// Agents Module - Barrel Export
// ============================================

// Re-export all custom agent components (T027)
export * from "./custom/index.js";

// Re-export delegation types (migrated from @vellum/tool)
export {
  canDelegate,
  DEFAULT_DELEGATION_TIMEOUT,
  type DelegateTaskContext,
  type DelegateTaskParams,
  type DelegateTaskParamsInferred,
  DelegateTaskParamsSchema,
  type DelegateTaskResult,
  type DelegateTaskResultInferred,
  DelegateTaskResultSchema,
  type DelegationHandler,
  delegateTaskTool,
  executeDelegateTask,
  getDelegationHandler,
  setDelegationHandler,
  WorkerDelegationError,
} from "./delegation/index.js";

// Re-export all orchestrator components
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
  createApprovalForwarder,
  // Core orchestrator exports
  createOrchestrator,
  createResultAggregator,
  // Task chain exports
  createTaskChainManager,
  // Decomposer exports
  createTaskDecomposer,
  // Router exports
  createTaskRouter,
  type DecompositionResult,
  DecompositionResultSchema,
  type EstimatedEffort,
  EstimatedEffortSchema,
  MAX_DELEGATION_DEPTH,
  type OrchestratorConfig,
  type OrchestratorCore,
  type OrchestratorEvent,
  type OrchestratorEventHandler,
  type OrchestratorEventType,
  type PartialFailureStrategy,
  PartialFailureStrategySchema,
  type ResultAggregator,
  type RouteCandidate,
  type RouteResult,
  type RoutingRule,
  // Spec agent routing (T033)
  registerSpecAgentRoutes,
  SPEC_ROUTING_RULES,
  type SpawnOptions,
  type SubagentHandle,
  type SubtaskDefinition,
  SubtaskDefinitionSchema,
  type SubtaskDependency,
  SubtaskDependencySchema,
  type TaskAnalysis,
  TaskAnalysisSchema,
  type TaskChain,
  type TaskChainManager,
  type TaskChainNode,
  type TaskComplexity,
  TaskComplexitySchema,
  type TaskDecomposer,
  type TaskResult,
  TaskResultSchema,
  type TaskRouter,
  type TaskStatus,
  TaskStatusSchema,
} from "./orchestrator/index.js";

// Re-export all protocol types and schemas
export {
  // Delegation target types
  type BuiltinTarget,
  // Inferred types
  type BuiltinTargetInferred,
  // Delegation schemas
  BuiltinTargetSchema,
  type CreateTaskPacketOptions,
  type CustomAgentTarget,
  type CustomAgentTargetInferred,
  CustomAgentTargetSchema,
  type CustomModeTarget,
  type CustomModeTargetInferred,
  CustomModeTargetSchema,
  // Handoff factory
  createHandoff,
  // TaskPacket factory
  createTaskPacket,
  type DelegationTarget,
  type DelegationTargetInferred,
  DelegationTargetSchema,
  // Handoff types
  type HandoffRequest,
  // Handoff inferred types
  type HandoffRequestInferred,
  // Handoff schemas
  HandoffRequestSchema,
  type HandoffResult,
  type HandoffResultInferred,
  HandoffResultSchema,
  // Type guards
  isBuiltinTarget,
  isCustomAgentTarget,
  isCustomModeTarget,
  isMcpTarget,
  type McpTarget,
  type McpTargetInferred,
  McpTargetSchema,
  type TaskConstraints,
  type TaskConstraintsInferred,
  TaskConstraintsSchema,
  type TaskContext,
  type TaskContextInferred,
  TaskContextSchema,
  // TaskPacket types
  type TaskPacket,
  // TaskPacket inferred types
  type TaskPacketInferred,
  // TaskPacket schemas
  TaskPacketSchema,
} from "./protocol/index.js";

// Re-export all session types
export {
  // Approval routing
  type ApprovalRoute,
  type ApprovalRouter,
  // Context isolation
  type ContextIsolator,
  createApprovalRouter,
  createContextIsolator,
  createFilteredToolRegistry,
  createPermissionInheritance,
  createResourceQuotaManager,
  createSubsessionManager,
  // Filtered tool registry
  type FilteredToolRegistry,
  type IsolatedContext,
  // Permission inheritance
  type PermissionInheritance,
  type PermissionSet,
  // Resource quota management
  type QuotaStatus,
  type ResourceQuota,
  type ResourceQuotaManager,
  type ResourceUsage,
  // Subsession management
  type Subsession,
  type SubsessionCreateConfig,
  type SubsessionManager,
  type SubsessionStatus,
  WORKER_BLOCKED_TOOLS,
} from "./session/index.js";
// Re-export all spec agent types (T032)
export {
  getSpecAgentSlugs,
  registerSpecAgents,
  SPEC_SPAWNABLE_AGENTS,
  specArchitectAgent,
  specRequirementsAgent,
  specResearcherAgent,
  specTasksAgent,
  specValidatorAgent,
} from "./spec/index.js";
// Re-export all worker types
export {
  analystWorker,
  architectWorker,
  // BaseWorker interface and factory
  type BaseWorker,
  type BaseWorkerConfig,
  // Builtin workers registry
  BUILTIN_WORKERS,
  // Builtin worker instances
  coderWorker,
  createBaseWorker,
  createWorkerFactory,
  DuplicateWorkerError,
  devopsWorker,
  getBuiltinWorkerCapabilities,
  qaWorker,
  registerBuiltinWorkers,
  researcherWorker,
  securityWorker,
  UnknownWorkerError,
  type WorkerCapabilities,
  type WorkerContext,
  // WorkerFactory types and errors
  type WorkerFactory,
  type WorkerMetadata,
  type WorkerResult,
  writerWorker,
} from "./workers/index.js";
