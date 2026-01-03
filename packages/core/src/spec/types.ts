// ============================================
// Spec Workflow Type Definitions
// ============================================

/**
 * Core type definitions for the spec workflow system.
 *
 * Provides types for phases, states, results, and configuration
 * used throughout the spec workflow engine.
 *
 * @module @vellum/core/spec/types
 */

import { z } from "zod";

// =============================================================================
// Phase and Status Enums
// =============================================================================

/**
 * Status of a single phase in the workflow.
 *
 * - `pending`: Phase has not started
 * - `running`: Phase is currently executing
 * - `completed`: Phase finished successfully
 * - `failed`: Phase encountered an error
 * - `skipped`: Phase was intentionally skipped
 */
export const PhaseStatusSchema = z.enum(["pending", "running", "completed", "failed", "skipped"]);

export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;

/**
 * Status of the overall workflow.
 *
 * - `idle`: Workflow has not been started
 * - `running`: Workflow is actively executing
 * - `paused`: Workflow is paused (can be resumed)
 * - `completed`: All phases finished successfully
 * - `failed`: Workflow encountered a fatal error
 */
export const WorkflowStatusSchema = z.enum(["idle", "running", "paused", "completed", "failed"]);

export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

// =============================================================================
// Spec Phase Definition
// =============================================================================

/**
 * The 6 phases of the spec workflow.
 *
 * Phases execute sequentially:
 * 1. `research` - Project analysis and discovery
 * 2. `requirements` - EARS requirements gathering
 * 3. `design` - Architecture and design decisions
 * 4. `tasks` - Task breakdown and planning
 * 5. `implementation` - Code implementation (skippable)
 * 6. `validation` - Spec validation and finalization
 */
export const SpecPhaseSchema = z.enum([
  "research",
  "requirements",
  "design",
  "tasks",
  "implementation",
  "validation",
]);

export type SpecPhase = z.infer<typeof SpecPhaseSchema>;

/**
 * Ordered array of all spec phases for iteration.
 */
export const SPEC_PHASES: readonly SpecPhase[] = [
  "research",
  "requirements",
  "design",
  "tasks",
  "implementation",
  "validation",
] as const;

// =============================================================================
// Phase State Schema
// =============================================================================

/**
 * State tracking for a single phase.
 *
 * Tracks execution status, timing, and output for each phase.
 */
export const PhaseStateSchema = z.object({
  /** The phase this state represents */
  phase: SpecPhaseSchema,
  /** Current status of the phase */
  status: PhaseStatusSchema,
  /** When the phase started executing */
  startedAt: z.coerce.date().optional(),
  /** When the phase completed (success or failure) */
  completedAt: z.coerce.date().optional(),
  /** Error message if phase failed */
  error: z.string().optional(),
  /** Path to the output file produced by this phase */
  outputFile: z.string().optional(),
});

export type PhaseState = z.infer<typeof PhaseStateSchema>;

// =============================================================================
// Workflow State Schema
// =============================================================================

/**
 * Complete state of a spec workflow.
 *
 * Contains all information needed to track, persist, and resume
 * a spec workflow execution.
 */
export const SpecWorkflowStateSchema = z.object({
  /** Unique workflow identifier */
  id: z.string(),
  /** Human-readable workflow name */
  name: z.string(),
  /** Description of what this spec is for */
  description: z.string(),
  /** Directory where spec files are stored */
  specDir: z.string(),
  /** Currently active phase */
  currentPhase: SpecPhaseSchema,
  /** State of each phase */
  phases: z.record(SpecPhaseSchema, PhaseStateSchema),
  /** When the workflow was created */
  createdAt: z.coerce.date(),
  /** When the workflow was last updated */
  updatedAt: z.coerce.date(),
});

export type SpecWorkflowState = z.infer<typeof SpecWorkflowStateSchema>;

// =============================================================================
// Phase Result Schema
// =============================================================================

/**
 * Result of executing a single phase.
 *
 * Returned by phase executors after completion.
 */
export const PhaseResultSchema = z.object({
  /** The phase that was executed */
  phase: SpecPhaseSchema,
  /** Whether the phase completed successfully */
  success: z.boolean(),
  /** Path to the output file (if produced) */
  outputFile: z.string().optional(),
  /** Error message if phase failed */
  error: z.string().optional(),
  /** Execution duration in milliseconds */
  duration: z.number().nonnegative(),
});

export type PhaseResult = z.infer<typeof PhaseResultSchema>;

// =============================================================================
// Workflow Result Schema
// =============================================================================

/**
 * Result of executing the complete workflow.
 *
 * Contains results from all executed phases and overall status.
 */
export const WorkflowResultSchema = z.object({
  /** The workflow that was executed */
  workflowId: z.string(),
  /** Results from each executed phase */
  phases: z.array(PhaseResultSchema),
  /** Whether all phases completed successfully */
  success: z.boolean(),
  /** Error message if workflow failed */
  error: z.string().optional(),
  /** Total execution duration in milliseconds */
  totalDuration: z.number().nonnegative(),
});

export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;

// =============================================================================
// Engine Configuration Schema
// =============================================================================

/**
 * Configuration for the spec workflow engine.
 *
 * Controls workflow execution behavior including checkpoints,
 * templates, and phase selection.
 */
export const SpecWorkflowEngineConfigSchema = z.object({
  /** Directory where spec files will be stored */
  specDir: z.string(),
  /** Directory for checkpoint files (defaults to specDir/.checkpoints) */
  checkpointDir: z.string().optional(),
  /** Additional directories to search for templates */
  templateDirs: z.array(z.string()).optional(),
  /** Phases to skip during execution */
  skipPhases: z.array(SpecPhaseSchema).optional(),
  /** Phase to start execution from (resume) */
  startFromPhase: SpecPhaseSchema.optional(),
});

export type SpecWorkflowEngineConfig = z.infer<typeof SpecWorkflowEngineConfigSchema>;

// =============================================================================
// Status Query Result Schema
// =============================================================================

/**
 * Progress information for the workflow.
 */
export const WorkflowProgressSchema = z.object({
  /** Number of completed phases */
  completed: z.number().int().nonnegative(),
  /** Total number of phases */
  total: z.number().int().positive(),
  /** Completion percentage (0-100) */
  percentage: z.number().min(0).max(100),
});

export type WorkflowProgress = z.infer<typeof WorkflowProgressSchema>;

/**
 * Complete status of a spec workflow.
 *
 * Used for querying current workflow state and progress.
 */
export const SpecWorkflowStatusSchema = z.object({
  /** Current workflow state */
  state: SpecWorkflowStateSchema,
  /** Progress through the workflow */
  progress: WorkflowProgressSchema,
  /** State of the currently active phase */
  currentPhaseInfo: PhaseStateSchema,
});

export type SpecWorkflowStatus = z.infer<typeof SpecWorkflowStatusSchema>;

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Creates a default PhaseState for a given phase.
 *
 * @param phase - The phase to create state for
 * @returns Initial phase state with pending status
 */
export function createPhaseState(phase: SpecPhase): PhaseState {
  return {
    phase,
    status: "pending",
  };
}

/**
 * Creates initial phase states for all phases.
 *
 * @returns Record of all phases with pending status
 */
export function createInitialPhaseStates(): Record<SpecPhase, PhaseState> {
  return SPEC_PHASES.reduce(
    (acc, phase) => {
      acc[phase] = createPhaseState(phase);
      return acc;
    },
    {} as Record<SpecPhase, PhaseState>
  );
}
