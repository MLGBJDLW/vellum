// ============================================
// Spec Workflow Engine
// ============================================

/**
 * Main orchestration engine for the spec workflow.
 *
 * Manages the execution of spec phases, checkpointing, template loading,
 * and handoff to implementation. Provides event-driven architecture
 * for workflow monitoring.
 *
 * @module @vellum/core/spec/workflow-engine
 */

import { EventEmitter } from "node:events";
import type { Checkpoint, CheckpointReason } from "./checkpoint-manager.js";
import { CheckpointManager } from "./checkpoint-manager.js";
import type { PhaseContext, PhaseExecutor } from "./executors/base.js";
import type { ImplementationResult, SpecHandoffPacket } from "./handoff-executor.js";
import { HandoffExecutor } from "./handoff-executor.js";
import { StateMachine } from "./state-machine.js";
import { TemplateLoader } from "./template-loader.js";
import type {
  PhaseResult,
  SpecPhase,
  SpecWorkflowEngineConfig,
  SpecWorkflowState,
  SpecWorkflowStatus,
  WorkflowResult,
} from "./types.js";
import { SPEC_PHASES } from "./types.js";

// =============================================================================
// Event Types
// =============================================================================

/**
 * Events emitted by the SpecWorkflowEngine.
 *
 * Subscribe to these events to monitor workflow progress.
 */
export interface WorkflowEvents {
  /** Emitted when workflow starts */
  "workflow:start": (state: SpecWorkflowState) => void;
  /** Emitted when workflow completes successfully */
  "workflow:complete": (result: WorkflowResult) => void;
  /** Emitted when workflow encounters an error */
  "workflow:error": (error: Error, state: SpecWorkflowState) => void;
  /** Emitted when a phase starts executing */
  "phase:start": (phase: SpecPhase, state: SpecWorkflowState) => void;
  /** Emitted when a phase completes */
  "phase:complete": (result: PhaseResult, state: SpecWorkflowState) => void;
  /** Emitted when a phase encounters an error */
  "phase:error": (phase: SpecPhase, error: Error) => void;
  /** Emitted when a checkpoint is saved */
  "checkpoint:saved": (checkpointId: string) => void;
  /** Emitted when handing off to implementation */
  "handoff:implementation": (packet: SpecHandoffPacket) => void;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Default maximum retries for phase execution.
 */
const DEFAULT_MAX_RETRIES = 3;

// =============================================================================
// Workflow Engine Class
// =============================================================================

/**
 * Main orchestration engine for spec workflows.
 *
 * The SpecWorkflowEngine is the central coordinator for spec creation.
 * It manages:
 * - Phase execution in sequence
 * - Checkpoint creation and recovery
 * - Template loading and validation
 * - Handoff to implementation and callback handling
 *
 * @example
 * ```typescript
 * const engine = new SpecWorkflowEngine({
 *   specDir: '/path/to/specs/my-feature'
 * });
 *
 * // Listen for events
 * engine.on('phase:complete', (result, state) => {
 *   console.log(`Phase ${result.phase} completed`);
 * });
 *
 * // Start the workflow
 * const result = await engine.start('My Feature', 'Implement new feature X');
 *
 * // Or resume from checkpoint
 * const result = await engine.resume();
 * ```
 */
export class SpecWorkflowEngine extends EventEmitter {
  private readonly stateMachine: StateMachine;
  private readonly checkpointManager: CheckpointManager;
  private readonly templateLoader: TemplateLoader;
  private readonly handoffExecutor: HandoffExecutor;
  private readonly executors: Map<SpecPhase, PhaseExecutor>;
  private readonly config: SpecWorkflowEngineConfig;
  private readonly skipPhases: Set<SpecPhase>;
  private phaseResults: PhaseResult[];
  private startTime: number;
  private isRunning: boolean;

  /**
   * Creates a new SpecWorkflowEngine instance.
   *
   * @param config - Engine configuration
   */
  constructor(config: SpecWorkflowEngineConfig) {
    super();
    this.config = config;
    this.stateMachine = new StateMachine();
    this.checkpointManager = new CheckpointManager(config.specDir);
    this.templateLoader = new TemplateLoader(config.templateDirs);
    this.handoffExecutor = new HandoffExecutor(config.specDir);
    this.executors = new Map();
    this.skipPhases = new Set(config.skipPhases ?? []);
    this.phaseResults = [];
    this.startTime = 0;
    this.isRunning = false;

    // Forward handoff events
    this.handoffExecutor.on("handoff", (packet: SpecHandoffPacket) => {
      this.emit("handoff:implementation", packet);
    });
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Starts a new workflow.
   *
   * Initializes the state machine and executes all phases in sequence.
   * Creates checkpoints after each phase for recovery.
   *
   * @param name - Human-readable workflow name
   * @param description - Description of the spec
   * @returns Result of the complete workflow
   */
  async start(name: string, description: string): Promise<WorkflowResult> {
    if (this.isRunning) {
      throw new Error("Workflow is already running");
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.phaseResults = [];

    // Initialize state machine
    this.stateMachine.initialize(name, description, this.config.specDir);
    const state = this.stateMachine.getState();

    this.emit("workflow:start", state);

    try {
      // Execute phases starting from configured phase or first
      const startPhase = this.config.startFromPhase ?? "research";
      return await this.runPhases(startPhase);
    } catch (error) {
      return this.handleWorkflowError(error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Resumes a workflow from a checkpoint.
   *
   * Loads the specified checkpoint (or latest if not specified)
   * and continues execution from the saved phase.
   *
   * @param checkpointId - Optional checkpoint ID to resume from
   * @returns Result of the complete workflow
   */
  async resume(checkpointId?: string): Promise<WorkflowResult> {
    if (this.isRunning) {
      throw new Error("Workflow is already running");
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.phaseResults = [];

    try {
      // Load checkpoint
      let checkpoint: Checkpoint | null;
      if (checkpointId) {
        // Find checkpoint by ID in the list
        const checkpoints = await this.checkpointManager.list();
        checkpoint = checkpoints.find((cp) => cp.id === checkpointId) ?? null;
      } else {
        checkpoint = await this.checkpointManager.loadLatest();
      }

      if (!checkpoint) {
        throw new Error("No checkpoint found to resume from");
      }

      // Restore state
      this.stateMachine.restore(checkpoint.workflowState);
      const state = this.stateMachine.getState();

      this.emit("workflow:start", state);

      // Determine next phase
      const currentPhase = state.currentPhase;
      const phaseState = state.phases[currentPhase];
      const startPhase =
        phaseState?.status === "completed"
          ? (this.stateMachine.getNextPhase(currentPhase) ?? currentPhase)
          : currentPhase;

      return await this.runPhases(startPhase);
    } catch (error) {
      return this.handleWorkflowError(error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Executes a single phase.
   *
   * Useful for testing or manual phase execution.
   *
   * @param phase - The phase to execute
   * @returns Result of the phase execution
   */
  async executePhase(phase: SpecPhase): Promise<PhaseResult> {
    const executor = this.executors.get(phase);
    if (!executor) {
      return {
        phase,
        success: false,
        error: `No executor registered for phase: ${phase}`,
        duration: 0,
      };
    }

    const state = this.stateMachine.getState();
    const template = await this.loadTemplate(phase);

    const context: PhaseContext = {
      workflowState: state,
      specDir: this.config.specDir,
      templateContent: template,
      previousPhaseOutput: this.getPreviousPhaseOutput(phase),
    };

    const startTime = Date.now();

    try {
      // Run pre-hook
      if (executor.beforeExecute) {
        await executor.beforeExecute(context);
      }

      // Execute phase
      const result = await executor.execute(context);

      // Run post-hook
      if (executor.afterExecute) {
        await executor.afterExecute(context, result);
      }

      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        phase,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Gets the current workflow status.
   *
   * @returns Complete status information
   */
  getStatus(): SpecWorkflowStatus {
    const state = this.stateMachine.getState();
    const completed = SPEC_PHASES.filter(
      (p) => state.phases[p]?.status === "completed" || state.phases[p]?.status === "skipped"
    ).length;

    return {
      state,
      progress: {
        completed,
        total: SPEC_PHASES.length,
        percentage: Math.round((completed / SPEC_PHASES.length) * 100),
      },
      currentPhaseInfo: state.phases[state.currentPhase] ?? {
        phase: state.currentPhase,
        status: "pending",
      },
    };
  }

  /**
   * Called by orchestrator after implementation completes.
   *
   * Receives the implementation result and continues to
   * the validation phase.
   *
   * @param result - Implementation result from orchestrator
   * @returns Result of the remaining workflow
   */
  async resumeAfterImplementation(result: ImplementationResult): Promise<WorkflowResult> {
    // Send result to handoff executor
    this.handoffExecutor.receiveResult(result);

    // Update state based on result
    if (result.success) {
      this.stateMachine.setPhaseStatus("implementation", "completed");

      // Continue to validation
      if (this.stateMachine.canTransition("validation")) {
        this.stateMachine.transition("validation");
        return await this.runPhases("validation");
      }
    } else {
      this.stateMachine.setPhaseStatus("implementation", "failed", result.error);
      return this.buildWorkflowResult(false, result.error);
    }

    return this.buildWorkflowResult(true);
  }

  /**
   * Registers a phase executor.
   *
   * @param executor - The executor to register
   */
  registerExecutor(executor: PhaseExecutor): void {
    this.executors.set(executor.phase, executor);
  }

  /**
   * Registers multiple phase executors.
   *
   * @param executors - Array of executors to register
   */
  registerExecutors(executors: PhaseExecutor[]): void {
    for (const executor of executors) {
      this.registerExecutor(executor);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Runs phases starting from a given phase.
   */
  private async runPhases(startPhase: SpecPhase): Promise<WorkflowResult> {
    const startIndex = SPEC_PHASES.indexOf(startPhase);
    if (startIndex < 0) {
      throw new Error(`Invalid phase: ${startPhase}`);
    }

    for (let i = startIndex; i < SPEC_PHASES.length; i++) {
      const phase = SPEC_PHASES[i];
      if (!phase) continue;

      const phaseResult = await this.processPhase(phase);
      if (phaseResult) {
        return phaseResult;
      }
    }

    // All phases complete
    const finalResult = this.buildWorkflowResult(true);
    this.emit("workflow:complete", finalResult);
    return finalResult;
  }

  /**
   * Processes a single phase, handling skip, handoff, and execution.
   * @returns WorkflowResult if workflow should stop, undefined to continue
   */
  private async processPhase(phase: SpecPhase): Promise<WorkflowResult | undefined> {
    // Check if phase should be skipped
    if (this.shouldSkipPhase(phase)) {
      this.handleSkippedPhase(phase);
      return undefined;
    }

    // Handle implementation phase handoff
    if (phase === "implementation") {
      const handoffResult = await this.handleImplementationHandoff();
      if (!handoffResult.success) {
        return this.buildWorkflowResult(false, handoffResult.error);
      }
      return undefined;
    }

    // Execute phase with retry
    return await this.executeAndHandlePhase(phase);
  }

  /**
   * Checks if a phase should be skipped.
   */
  private shouldSkipPhase(phase: SpecPhase): boolean {
    return this.skipPhases.has(phase) && this.stateMachine.isSkippable(phase);
  }

  /**
   * Handles a skipped phase by updating state and transitioning.
   */
  private handleSkippedPhase(phase: SpecPhase): void {
    this.stateMachine.setPhaseStatus(phase, "skipped");
    const nextPhase = this.stateMachine.getNextPhase(phase);
    if (nextPhase && this.stateMachine.canTransition(nextPhase)) {
      this.stateMachine.transition(nextPhase);
    }
  }

  /**
   * Executes a phase and handles the result.
   * @returns WorkflowResult if workflow should stop, undefined to continue
   */
  private async executeAndHandlePhase(phase: SpecPhase): Promise<WorkflowResult | undefined> {
    const result = await this.runPhaseWithRetry(phase);
    this.phaseResults.push(result);

    if (!result.success) {
      return this.buildWorkflowResult(false, result.error);
    }

    // Update state and checkpoint
    this.stateMachine.setPhaseStatus(phase, "completed");
    if (result.outputFile) {
      this.stateMachine.setPhaseOutput(phase, result.outputFile);
    }
    await this.createCheckpoint("phase_complete");

    // Transition to next phase
    const nextPhase = this.stateMachine.getNextPhase(phase);
    if (nextPhase && this.stateMachine.canTransition(nextPhase)) {
      this.stateMachine.transition(nextPhase);
    }

    return undefined;
  }

  /**
   * Runs a phase with retry logic.
   */
  private async runPhaseWithRetry(
    phase: SpecPhase,
    maxRetries = DEFAULT_MAX_RETRIES
  ): Promise<PhaseResult> {
    const state = this.stateMachine.getState();

    this.stateMachine.setPhaseStatus(phase, "running");
    this.emit("phase:start", phase, state);

    let lastError: string | undefined;
    let lastResult: PhaseResult | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.executePhase(phase);

        if (result.success) {
          // Validate output if there's an output file
          if (result.outputFile) {
            const validation = await this.validatePhaseOutput(phase, result.outputFile);
            if (!validation.valid) {
              lastError = `Validation failed: ${validation.feedback}`;
              lastResult = result;
              continue; // Retry
            }
          }

          this.emit("phase:complete", result, this.stateMachine.getState());
          return result;
        }

        lastError = result.error;
        lastResult = result;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.emit("phase:error", phase, error instanceof Error ? error : new Error(lastError));
      }
    }

    // All retries exhausted
    const failedResult: PhaseResult = {
      phase,
      success: false,
      error: lastError ?? "Max retries exceeded",
      duration: lastResult?.duration ?? 0,
    };

    this.stateMachine.setPhaseStatus(phase, "failed", failedResult.error);

    // Save checkpoint for recovery
    await this.createCheckpoint("error_recovery");

    return failedResult;
  }

  /**
   * Handles the implementation phase handoff.
   */
  private async handleImplementationHandoff(): Promise<ImplementationResult> {
    // Create checkpoint before handoff
    const checkpoint = await this.createCheckpoint("handoff");

    // Build and emit handoff packet
    const state = this.stateMachine.getState();
    const packet = this.handoffExecutor.buildPacket(state.id, checkpoint);

    this.emit("handoff:implementation", packet);
    this.handoffExecutor.emitHandoff(packet);

    // Wait for implementation to complete
    return await this.handoffExecutor.awaitResume();
  }

  /**
   * Creates a checkpoint with the current state.
   */
  private async createCheckpoint(reason: CheckpointReason): Promise<string> {
    const state = this.stateMachine.getState();
    const checkpoint = await this.checkpointManager.save(state, reason);
    this.emit("checkpoint:saved", checkpoint.id);
    return checkpoint.id;
  }

  /**
   * Loads a template for a phase.
   */
  private async loadTemplate(phase: SpecPhase): Promise<string> {
    try {
      const template = await this.templateLoader.loadForPhase(phase);
      return template.content;
    } catch {
      // Template not found is not fatal
      return "";
    }
  }

  /**
   * Validates phase output against template requirements.
   */
  private async validatePhaseOutput(
    phase: SpecPhase,
    outputFile: string
  ): Promise<{ valid: boolean; feedback: string }> {
    try {
      const template = await this.templateLoader.loadForPhase(phase);
      const { readFile } = await import("node:fs/promises");
      const output = await readFile(outputFile, "utf-8");

      const result = this.templateLoader.validateOutput(
        output,
        template.frontmatter.required_fields
      );

      if (result.valid) {
        return { valid: true, feedback: "" };
      }

      return {
        valid: false,
        feedback: `Missing required fields: ${result.missing.join(", ")}`,
      };
    } catch {
      // If template not found, consider output valid
      return { valid: true, feedback: "" };
    }
  }

  /**
   * Gets output from the previous phase.
   */
  private getPreviousPhaseOutput(phase: SpecPhase): string | undefined {
    const index = SPEC_PHASES.indexOf(phase);
    if (index <= 0) return undefined;

    const prevPhase = SPEC_PHASES[index - 1];
    if (!prevPhase) return undefined;

    const state = this.stateMachine.getState();
    return state.phases[prevPhase]?.outputFile;
  }

  /**
   * Handles workflow-level errors.
   */
  private handleWorkflowError(error: unknown): WorkflowResult {
    const state = this.stateMachine.getState();
    const err = error instanceof Error ? error : new Error(String(error));

    this.emit("workflow:error", err, state);

    // Try to save error checkpoint
    this.createCheckpoint("error_recovery").catch(() => {
      // Ignore checkpoint errors during error handling
    });

    return this.buildWorkflowResult(false, err.message);
  }

  /**
   * Builds the final workflow result.
   */
  private buildWorkflowResult(success: boolean, error?: string): WorkflowResult {
    const state = this.stateMachine.getState();

    return {
      workflowId: state.id,
      phases: this.phaseResults,
      success,
      error,
      totalDuration: Date.now() - this.startTime,
    };
  }
}

// =============================================================================
// Type-safe Event Emitter Augmentation
// =============================================================================

// Note: Declaration merging for type-safe events is intentionally omitted
// to avoid lint issues. Use the standard EventEmitter methods with event name
// strings from WorkflowEvents keys.
