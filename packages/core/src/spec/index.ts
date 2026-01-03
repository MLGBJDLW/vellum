// ============================================
// Spec Module - Barrel Export
// ============================================

/**
 * Spec workflow module for managing specification phases.
 *
 * Provides types, state machine, checkpoint persistence,
 * template loading, and workflow orchestration for the spec system.
 *
 * @module @vellum/core/spec
 */

export type { Checkpoint, CheckpointReason } from "./checkpoint-manager.js";
// =============================================================================
// Checkpoint Manager
// =============================================================================
export {
  CHECKPOINT_DIR,
  CheckpointManager,
  DEFAULT_KEEP_COUNT,
} from "./checkpoint-manager.js";
// =============================================================================
// Phase Executors
// =============================================================================
export * from "./executors/index.js";
export type { ImplementationResult, SpecHandoffPacket } from "./handoff-executor.js";
// =============================================================================
// Handoff Executor
// =============================================================================
export { HandoffExecutor } from "./handoff-executor.js";
// =============================================================================
// Session Integration
// =============================================================================
export type { SpecSessionMetadata } from "./session-integration.js";
export { SpecSessionIntegration, WORKFLOW_METADATA_KEY } from "./session-integration.js";
// =============================================================================
// State Machine
// =============================================================================
export {
  PHASE_EXECUTION_MODE,
  PHASE_TRANSITIONS,
  SKIPPABLE_PHASES,
  StateMachine,
} from "./state-machine.js";
// =============================================================================
// Template Loader
// =============================================================================
export {
  PHASE_TEMPLATES,
  TEMPLATE_SEARCH_PATHS,
  TemplateLoader,
} from "./template-loader.js";
// =============================================================================
// Types
// =============================================================================
export * from "./types.js";
export type { WorkflowEvents } from "./workflow-engine.js";
// =============================================================================
// Workflow Engine
// =============================================================================
export { SpecWorkflowEngine } from "./workflow-engine.js";
