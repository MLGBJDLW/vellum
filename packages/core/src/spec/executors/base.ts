// ============================================
// Spec Phase Executor Base Interface
// ============================================

/**
 * Base interface and utilities for phase executors.
 *
 * Defines the common interface that all phase executors must implement,
 * along with factory functions for creating executors.
 *
 * @module @vellum/core/spec/executors/base
 */

import type { PhaseResult, SpecPhase, SpecWorkflowState } from "../types.js";

// =============================================================================
// Phase Context
// =============================================================================

/**
 * Context provided to phase executors.
 *
 * Contains all information needed to execute a phase,
 * including workflow state and template content.
 */
export interface PhaseContext {
  /** Current workflow state */
  workflowState: SpecWorkflowState;
  /** Directory containing spec files */
  specDir: string;
  /** Template content for the phase (if available) */
  templateContent?: string;
  /** Output from the previous phase (if available) */
  previousPhaseOutput?: string;
}

// =============================================================================
// Phase Executor Interface
// =============================================================================

/**
 * Interface for phase executors.
 *
 * Each phase in the spec workflow has an executor that handles
 * the actual execution logic. Executors can optionally define
 * pre and post hooks for setup and cleanup.
 *
 * @example
 * ```typescript
 * class ResearchExecutor implements PhaseExecutor {
 *   readonly phase: SpecPhase = 'research';
 *
 *   async execute(context: PhaseContext): Promise<PhaseResult> {
 *     // Perform research phase logic
 *     return {
 *       phase: 'research',
 *       success: true,
 *       duration: 1234,
 *       outputFile: '/path/to/research.md'
 *     };
 *   }
 *
 *   async beforeExecute(context: PhaseContext): Promise<void> {
 *     // Setup logic
 *   }
 * }
 * ```
 */
export interface PhaseExecutor {
  /** The phase this executor handles */
  readonly phase: SpecPhase;

  /**
   * Executes the phase logic.
   *
   * @param context - Execution context with workflow state and template
   * @returns Result of the phase execution
   */
  execute(context: PhaseContext): Promise<PhaseResult>;

  /**
   * Optional hook called before execute.
   *
   * Use for setup, validation, or logging before execution.
   *
   * @param context - Execution context
   */
  beforeExecute?(context: PhaseContext): Promise<void>;

  /**
   * Optional hook called after execute.
   *
   * Use for cleanup, notification, or post-processing.
   *
   * @param context - Execution context
   * @param result - Result from execute()
   */
  afterExecute?(context: PhaseContext, result: PhaseResult): Promise<void>;
}

// =============================================================================
// Factory Types
// =============================================================================

/**
 * Factory function type for creating phase executors.
 *
 * Used to dynamically create executors based on the phase.
 *
 * @param phase - The phase to create an executor for
 * @returns The phase executor
 */
export type PhaseExecutorFactory = (phase: SpecPhase) => PhaseExecutor;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Creates a simple phase executor from a function.
 *
 * Utility for creating executors without defining a full class.
 *
 * @param phase - The phase this executor handles
 * @param executeFn - The execution function
 * @returns A phase executor
 *
 * @example
 * ```typescript
 * const researchExecutor = createPhaseExecutor(
 *   'research',
 *   async (ctx) => {
 *     // Research logic
 *     return {
 *       phase: 'research',
 *       success: true,
 *       duration: 1000
 *     };
 *   }
 * );
 * ```
 */
export function createPhaseExecutor(
  phase: SpecPhase,
  executeFn: (ctx: PhaseContext) => Promise<PhaseResult>
): PhaseExecutor {
  return {
    phase,
    execute: executeFn,
  };
}

/**
 * Creates a phase executor with hooks.
 *
 * Extended utility that also supports before/after hooks.
 *
 * @param phase - The phase this executor handles
 * @param options - Executor options including hooks
 * @returns A phase executor with hooks
 *
 * @example
 * ```typescript
 * const executor = createPhaseExecutorWithHooks('design', {
 *   execute: async (ctx) => { ... },
 *   beforeExecute: async (ctx) => { console.log('Starting design'); },
 *   afterExecute: async (ctx, result) => { console.log('Finished:', result.success); }
 * });
 * ```
 */
export function createPhaseExecutorWithHooks(
  phase: SpecPhase,
  options: {
    execute: (ctx: PhaseContext) => Promise<PhaseResult>;
    beforeExecute?: (ctx: PhaseContext) => Promise<void>;
    afterExecute?: (ctx: PhaseContext, result: PhaseResult) => Promise<void>;
  }
): PhaseExecutor {
  return {
    phase,
    execute: options.execute,
    beforeExecute: options.beforeExecute,
    afterExecute: options.afterExecute,
  };
}

/**
 * Validates that an object implements the PhaseExecutor interface.
 *
 * @param obj - Object to validate
 * @returns True if the object is a valid PhaseExecutor
 */
export function isPhaseExecutor(obj: unknown): obj is PhaseExecutor {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  return typeof candidate.phase === "string" && typeof candidate.execute === "function";
}
