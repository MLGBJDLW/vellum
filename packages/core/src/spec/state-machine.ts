// ============================================
// Spec Workflow State Machine
// ============================================

/**
 * State machine for managing spec workflow phase transitions.
 *
 * Enforces valid phase transitions and maintains workflow state
 * throughout the spec workflow lifecycle.
 *
 * @module @vellum/core/spec/state-machine
 */

import { createId } from "@vellum/shared";
import {
  createInitialPhaseStates,
  type PhaseStatus,
  SPEC_PHASES,
  type SpecPhase,
  type SpecWorkflowState,
} from "./types.js";

// =============================================================================
// Phase Transition Constants
// =============================================================================

/**
 * Valid phase transitions.
 *
 * Each phase can only transition to specific next phases.
 * The workflow follows a sequential path:
 * research → requirements → design → tasks → implementation → validation
 */
export const PHASE_TRANSITIONS: Readonly<Record<SpecPhase, readonly SpecPhase[]>> = {
  research: ["requirements"],
  requirements: ["design"],
  design: ["tasks"],
  tasks: ["implementation", "validation"], // Can skip implementation
  implementation: ["validation"],
  validation: [], // Terminal phase
} as const;

/**
 * Phases that can be skipped during workflow execution.
 *
 * Only the implementation phase is skippable - all other phases
 * are required for a complete spec.
 */
export const SKIPPABLE_PHASES: readonly SpecPhase[] = ["implementation"] as const;

/**
 * Execution mode for each phase.
 *
 * All phases execute sequentially (one at a time).
 */
export const PHASE_EXECUTION_MODE: Readonly<Record<SpecPhase, "sequential">> = {
  research: "sequential",
  requirements: "sequential",
  design: "sequential",
  tasks: "sequential",
  implementation: "sequential",
  validation: "sequential",
} as const;

// =============================================================================
// State Machine Class
// =============================================================================

/**
 * State machine for managing spec workflow state and transitions.
 *
 * Provides controlled state management with:
 * - Valid phase transition enforcement
 * - Phase status tracking
 * - State initialization and restoration
 *
 * @example
 * ```typescript
 * const machine = new StateMachine();
 * machine.initialize("my-spec", "A new feature", "/path/to/specs");
 *
 * // Transition through phases
 * if (machine.canTransition("requirements")) {
 *   machine.transition("requirements");
 *   machine.setPhaseStatus("requirements", "running");
 * }
 * ```
 */
export class StateMachine {
  private state: SpecWorkflowState;

  /**
   * Creates a new StateMachine instance.
   *
   * @param initialState - Optional initial state to use
   */
  constructor(initialState?: SpecWorkflowState) {
    this.state = initialState ?? this.createEmptyState();
  }

  /**
   * Creates an empty workflow state.
   *
   * @returns Empty workflow state with all phases pending
   */
  private createEmptyState(): SpecWorkflowState {
    const now = new Date();
    return {
      id: "",
      name: "",
      description: "",
      specDir: "",
      currentPhase: "research",
      phases: createInitialPhaseStates(),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Initializes the state machine with a new workflow.
   *
   * Creates fresh state with the provided metadata and
   * sets all phases to pending status.
   *
   * @param name - Human-readable workflow name
   * @param description - Description of the spec
   * @param specDir - Directory for spec files
   */
  initialize(name: string, description: string, specDir: string): void {
    const now = new Date();
    this.state = {
      id: createId(),
      name,
      description,
      specDir,
      currentPhase: "research",
      phases: createInitialPhaseStates(),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Attempts to transition to a new phase.
   *
   * Validates that the transition is allowed from the current phase.
   * If valid, updates the current phase and timestamps.
   *
   * @param toPhase - The phase to transition to
   * @returns `true` if transition succeeded, `false` if invalid
   */
  transition(toPhase: SpecPhase): boolean {
    if (!this.canTransition(toPhase)) {
      return false;
    }

    this.state.currentPhase = toPhase;
    this.state.updatedAt = new Date();
    return true;
  }

  /**
   * Checks if a transition to the specified phase is valid.
   *
   * A transition is valid if:
   * 1. The target phase is in the allowed transitions list
   * 2. OR the current phase is completed/skipped and target is next in sequence
   *
   * @param toPhase - The phase to check
   * @returns `true` if transition is valid, `false` otherwise
   */
  canTransition(toPhase: SpecPhase): boolean {
    const currentPhase = this.state.currentPhase;
    const allowedTransitions = PHASE_TRANSITIONS[currentPhase];

    // Direct transition allowed
    if (allowedTransitions.includes(toPhase)) {
      return true;
    }

    // Check if we're transitioning to the same phase (no-op)
    if (currentPhase === toPhase) {
      return true;
    }

    return false;
  }

  /**
   * Updates the status of a specific phase.
   *
   * Also updates timestamps based on the new status:
   * - `running`: Sets startedAt
   * - `completed`, `failed`, `skipped`: Sets completedAt
   *
   * @param phase - The phase to update
   * @param status - The new status
   * @param error - Optional error message (for failed status)
   */
  setPhaseStatus(phase: SpecPhase, status: PhaseStatus, error?: string): void {
    const phaseState = this.state.phases[phase];
    if (!phaseState) {
      return;
    }

    const now = new Date();
    phaseState.status = status;

    if (status === "running") {
      phaseState.startedAt = now;
      phaseState.completedAt = undefined;
      phaseState.error = undefined;
    } else if (status === "completed" || status === "failed" || status === "skipped") {
      phaseState.completedAt = now;
      if (error) {
        phaseState.error = error;
      }
    }

    this.state.updatedAt = now;
  }

  /**
   * Sets the output file path for a phase.
   *
   * @param phase - The phase to update
   * @param outputFile - Path to the output file
   */
  setPhaseOutput(phase: SpecPhase, outputFile: string): void {
    const phaseState = this.state.phases[phase];
    if (phaseState) {
      phaseState.outputFile = outputFile;
      this.state.updatedAt = new Date();
    }
  }

  /**
   * Restores the state machine from a saved state.
   *
   * Used for resuming workflows from checkpoints.
   *
   * @param state - The state to restore
   */
  restore(state: SpecWorkflowState): void {
    this.state = { ...state };
  }

  /**
   * Gets the current workflow state.
   *
   * @returns A copy of the current state
   */
  getState(): SpecWorkflowState {
    return { ...this.state };
  }

  /**
   * Gets the index of a phase in the execution order.
   *
   * @param phase - The phase to find
   * @returns The 0-based index of the phase
   */
  getPhaseIndex(phase: SpecPhase): number {
    return SPEC_PHASES.indexOf(phase);
  }

  /**
   * Gets the next phase in sequence.
   *
   * @param phase - The current phase
   * @returns The next phase, or null if at the end
   */
  getNextPhase(phase: SpecPhase): SpecPhase | null {
    const index = this.getPhaseIndex(phase);
    if (index < 0 || index >= SPEC_PHASES.length - 1) {
      return null;
    }
    return SPEC_PHASES[index + 1] ?? null;
  }

  /**
   * Checks if a phase can be skipped.
   *
   * @param phase - The phase to check
   * @returns `true` if the phase is skippable
   */
  isSkippable(phase: SpecPhase): boolean {
    return SKIPPABLE_PHASES.includes(phase);
  }
}
