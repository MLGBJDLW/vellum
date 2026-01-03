// ============================================
// Spec Executors - Barrel Export
// ============================================

/**
 * Phase executors for the spec workflow.
 *
 * Provides the base interface and utilities for creating
 * phase-specific executors, plus concrete implementations
 * for each spec phase.
 *
 * @module @vellum/core/spec/executors
 */

// Base interface and utilities
export type { PhaseContext, PhaseExecutor, PhaseExecutorFactory } from "./base.js";
export {
  createPhaseExecutor,
  createPhaseExecutorWithHooks,
  isPhaseExecutor,
} from "./base.js";
export type { DesignAgentOutput } from "./design.js";
export { DesignExecutor } from "./design.js";

export { RequirementsExecutor } from "./requirements.js";
export type { AgentSpawner, AgentSpawnResult } from "./research.js";
// Phase executors
export { ResearchExecutor } from "./research.js";

export { TasksExecutor } from "./tasks.js";
export type { CommandExecutor, CommandOptions, CommandResult } from "./validation.js";
export { ValidationExecutor } from "./validation.js";
