// ============================================
// Orchestrator Module - Barrel Export
// ============================================

export {
  type AggregatedResult,
  AggregatedResultSchema,
  createResultAggregator,
  type PartialFailureStrategy,
  PartialFailureStrategySchema,
  type ResultAggregator,
  type TaskResult,
  TaskResultSchema,
  type TaskStatus,
  TaskStatusSchema,
} from "./aggregator.js";

export {
  type ApprovalDecision,
  ApprovalDecisionSchema,
  type ApprovalForwarder,
  type ApprovalRequest,
  ApprovalRequestSchema,
  createApprovalForwarder,
} from "./approval-forwarder.js";
export {
  createOrchestrator,
  type OrchestratorConfig,
  type OrchestratorCore,
  type OrchestratorEvent,
  type OrchestratorEventHandler,
  type OrchestratorEventType,
  type SpawnOptions,
  type SubagentHandle,
} from "./core.js";
export {
  createTaskDecomposer,
  type DecompositionResult,
  DecompositionResultSchema,
  type EstimatedEffort,
  EstimatedEffortSchema,
  type SubtaskDefinition,
  SubtaskDefinitionSchema,
  type SubtaskDependency,
  SubtaskDependencySchema,
  type TaskAnalysis,
  TaskAnalysisSchema,
  type TaskComplexity,
  TaskComplexitySchema,
  type TaskDecomposer,
} from "./decomposer.js";
export {
  createTaskRouter,
  type RouteCandidate,
  type RouteResult,
  type RoutingRule,
  type TaskRouter,
} from "./router.js";
export {
  createTaskChainManager,
  MAX_DELEGATION_DEPTH,
  type TaskChain,
  type TaskChainManager,
  type TaskChainNode,
} from "./task-chain.js";
