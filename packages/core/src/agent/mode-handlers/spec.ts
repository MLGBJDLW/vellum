// ============================================
// SpecModeHandler - 6-phase structured workflow mode
// ============================================
// T024: Implement SpecModeHandler class
// T025: Implement getPhaseToolAccess() method
// T026: Implement validatePhaseCompletion() method
// T030: Wire SpecWorkflowEngine for workflow orchestration
// ============================================

import type {
  SpecWorkflowEngineConfig,
  SpecWorkflowStatus,
  WorkflowResult,
} from "../../spec/index.js";
import { SpecWorkflowEngine } from "../../spec/index.js";
import { BUILT_IN_AGENTS } from "../agent-config.js";
import type { CodingModeConfig, SpecPhase, SpecPhaseToolAccess } from "../coding-modes.js";
import { SPEC_PHASE_CONFIG, SPEC_PHASES } from "../coding-modes.js";
import type { AgentLevel } from "../level.js";
import { BaseModeHandler } from "./base.js";
import type { HandlerResult, ToolAccessConfig, UserMessage } from "./types.js";

/**
 * Current state of the Spec mode workflow.
 */
export interface SpecModeState {
  /** Current phase in the 6-phase workflow */
  currentPhase: SpecPhase;
  /** Phase number (1-6) */
  phaseNumber: number;
  /** Phases that have been completed */
  completedPhases: SpecPhase[];
  /** Deliverables that have been validated */
  validatedDeliverables: string[];
  /** Whether the current phase is validated */
  currentPhaseValidated: boolean;
}

/**
 * Result of validating phase completion.
 */
export interface PhaseValidationResult {
  /** Whether the phase is complete */
  isComplete: boolean;
  /** Missing deliverables (if any) */
  missingDeliverables: string[];
  /** Validated deliverables */
  validatedDeliverables: string[];
  /** Human-readable message */
  message: string;
}

/**
 * Mode handler for Spec mode - 6-phase structured workflow.
 *
 * Spec mode provides a rigorous 6-phase development workflow:
 * 1. **Research** - Gather project context (read-only)
 * 2. **Requirements** - Define EARS requirements (read-only)
 * 3. **Design** - Create architecture decisions (read-only)
 * 4. **Tasks** - Break down into actionable items (read-only)
 * 5. **Implementation** - Execute tasks (full access)
 * 6. **Validation** - Verify deliverables (read + test)
 *
 * This mode operates at the orchestrator level and can spawn
 * specialized sub-agents for different phases.
 *
 * @example
 * ```typescript
 * import { SpecModeHandler } from './spec';
 * import { SPEC_MODE } from '../coding-modes';
 *
 * const handler = new SpecModeHandler(SPEC_MODE);
 *
 * // Initially in research phase
 * console.log(handler.currentPhase); // 'research'
 * console.log(handler.phaseNumber);  // 1
 *
 * // Validate and advance through phases
 * const validation = await handler.validatePhaseCompletion();
 * if (validation.isComplete) {
 *   handler.advancePhase();
 *   console.log(handler.currentPhase); // 'requirements'
 * }
 * ```
 */
export class SpecModeHandler extends BaseModeHandler {
  /**
   * Current phase of the spec mode workflow.
   */
  private _currentPhase: SpecPhase = "research";

  /**
   * Phases that have been completed.
   */
  private _completedPhases: SpecPhase[] = [];

  /**
   * Deliverables that have been validated.
   */
  private _validatedDeliverables: string[] = [];

  /**
   * Whether the current phase has been validated.
   */
  private _currentPhaseValidated = false;

  /**
   * File checker function for deliverable validation.
   * Can be injected for testing.
   */
  private _fileChecker: (path: string) => Promise<boolean>;

  /**
   * The workflow engine for orchestrating spec phases.
   * Lazily instantiated when workflow operations are invoked.
   */
  private _workflowEngine: SpecWorkflowEngine | null = null;

  /**
   * Configuration for the workflow engine.
   * Set via setWorkflowConfig() before starting workflow.
   */
  private _workflowConfig: SpecWorkflowEngineConfig | null = null;

  /**
   * Create a new SpecModeHandler.
   *
   * @param config - The coding mode configuration (should be SPEC_MODE)
   * @param fileChecker - Optional function to check if files exist
   */
  constructor(config: CodingModeConfig, fileChecker?: (path: string) => Promise<boolean>) {
    super(config);
    // Default file checker always returns true (for testing/mocking)
    this._fileChecker = fileChecker ?? (async () => true);
  }

  // ============================================
  // SpecWorkflowEngine Integration (T030)
  // ============================================

  /**
   * Set the workflow engine configuration.
   * Must be called before startWorkflow() or getWorkflowStatus().
   *
   * @param config - Configuration for SpecWorkflowEngine
   */
  setWorkflowConfig(config: SpecWorkflowEngineConfig): void {
    this._workflowConfig = config;
    // Reset engine if config changes
    this._workflowEngine = null;
  }

  /**
   * Get or create the workflow engine instance.
   * Lazily instantiated to allow config injection.
   *
   * @returns SpecWorkflowEngine instance
   * @throws Error if workflow config not set
   */
  private getWorkflowEngine(): SpecWorkflowEngine {
    if (!this._workflowConfig) {
      throw new Error(
        "Workflow configuration not set. Call setWorkflowConfig() before using workflow operations."
      );
    }

    if (!this._workflowEngine) {
      this._workflowEngine = new SpecWorkflowEngine(this._workflowConfig);

      // Forward workflow events for checkpoint UI
      this._workflowEngine.on("phase:start", (phase) => {
        this._currentPhase = phase;
        this._currentPhaseValidated = false;
      });

      this._workflowEngine.on("phase:complete", (result) => {
        if (result.success) {
          this._completedPhases.push(result.phase);
          this._currentPhaseValidated = true;
        }
      });
    }

    return this._workflowEngine;
  }

  /**
   * Start a new spec workflow via the engine.
   *
   * Delegates to SpecWorkflowEngine.start() and syncs state.
   *
   * @param name - Human-readable workflow name
   * @param description - Description of the spec
   * @returns Result of the complete workflow
   */
  async startWorkflow(name: string, description: string): Promise<WorkflowResult> {
    const engine = this.getWorkflowEngine();
    return await engine.start(name, description);
  }

  /**
   * Resume a workflow from checkpoint.
   *
   * Delegates to SpecWorkflowEngine.resume().
   *
   * @param checkpointId - Optional checkpoint ID to resume from
   * @returns Result of the remaining workflow
   */
  async resumeWorkflow(checkpointId?: string): Promise<WorkflowResult> {
    const engine = this.getWorkflowEngine();
    return await engine.resume(checkpointId);
  }

  /**
   * Get the current workflow status from the engine.
   *
   * @returns Current workflow status including phase progress
   */
  getWorkflowStatus(): SpecWorkflowStatus {
    const engine = this.getWorkflowEngine();
    return engine.getStatus();
  }

  /**
   * Get the underlying workflow engine.
   * Useful for subscribing to events or advanced operations.
   *
   * @returns The SpecWorkflowEngine instance (or null if not configured)
   */
  getEngine(): SpecWorkflowEngine | null {
    if (!this._workflowConfig) {
      return null;
    }
    return this.getWorkflowEngine();
  }

  /**
   * Process an incoming user message.
   *
   * In Spec mode, messages are processed based on the current phase.
   * Phase transitions require checkpoint approval.
   *
   * @param message - The user message to process
   * @returns HandlerResult with checkpoint requirement at phase boundaries
   */
  async processMessage(message: UserMessage): Promise<HandlerResult> {
    // Check for phase advancement approval
    if (this.isPhaseAdvanceApproval(message)) {
      if (this._currentPhaseValidated) {
        this.advancePhase();
        return {
          shouldContinue: true,
          modifiedMessage: {
            ...message,
            content: `[Phase ${this.phaseNumber}] ${message.content}`,
            metadata: {
              ...message.metadata,
              phase: this._currentPhase,
              phaseNumber: this.phaseNumber,
            },
          },
        };
      }
      // Phase not validated - cannot advance
      return {
        shouldContinue: false,
        modifiedMessage: message,
        requiresCheckpoint: true,
      };
    }

    // Check for validation request
    if (this.isValidationRequest(message)) {
      const validation = await this.validatePhaseCompletion();
      if (validation.isComplete) {
        this._currentPhaseValidated = true;
        return this.requireCheckpoint(message);
      }
      // Validation failed - continue in current phase
      return {
        shouldContinue: true,
        modifiedMessage: {
          ...message,
          metadata: {
            ...message.metadata,
            validationResult: validation,
          },
        },
      };
    }

    // Normal message processing with phase context
    return {
      shouldContinue: true,
      modifiedMessage: {
        ...message,
        metadata: {
          ...message.metadata,
          phase: this._currentPhase,
          phaseNumber: this.phaseNumber,
        },
      },
    };
  }

  /**
   * Get the tool access configuration for the current phase.
   *
   * Tool access varies by phase:
   * - Phases 1-4: Read-only
   * - Phase 5 (Implementation): Full access
   * - Phase 6 (Validation): Read + test
   *
   * @returns ToolAccessConfig for current phase
   */
  getToolAccess(): ToolAccessConfig {
    return this.getPhaseToolAccess(this._currentPhase);
  }

  /**
   * Get the tool access configuration for a specific phase (T025).
   *
   * @param phase - The phase to get tool access for
   * @returns ToolAccessConfig for the specified phase
   */
  getPhaseToolAccess(phase: SpecPhase): ToolAccessConfig {
    const phaseConfig = SPEC_PHASE_CONFIG[phase];
    const toolAccess = phaseConfig.toolAccess;

    return this.toolAccessToConfig(toolAccess);
  }

  /**
   * Called when entering Spec mode.
   *
   * Resets state to the research phase.
   */
  async onEnter(): Promise<void> {
    this._currentPhase = "research";
    this._completedPhases = [];
    this._validatedDeliverables = [];
    this._currentPhaseValidated = false;
  }

  /**
   * Called when exiting Spec mode.
   *
   * Cleans up phase state.
   */
  async onExit(): Promise<void> {
    // Preserve completed phases for potential resume
    // Reset current phase validation
    this._currentPhaseValidated = false;
  }

  // ============================================
  // Phase Management
  // ============================================

  /**
   * Get the current phase of the spec mode workflow.
   */
  get currentPhase(): SpecPhase {
    return this._currentPhase;
  }

  /**
   * Get the current phase number (1-6).
   */
  get phaseNumber(): number {
    return SPEC_PHASE_CONFIG[this._currentPhase].phaseNumber;
  }

  /**
   * Get the completed phases.
   */
  get completedPhases(): readonly SpecPhase[] {
    return [...this._completedPhases];
  }

  /**
   * Get the current state of the spec mode workflow.
   */
  getState(): SpecModeState {
    return {
      currentPhase: this._currentPhase,
      phaseNumber: this.phaseNumber,
      completedPhases: [...this._completedPhases],
      validatedDeliverables: [...this._validatedDeliverables],
      currentPhaseValidated: this._currentPhaseValidated,
    };
  }

  /**
   * Validate phase completion by checking deliverables (T026).
   *
   * Checks that all required deliverable files for the current phase exist.
   *
   * @returns PhaseValidationResult with completion status and details
   */
  async validatePhaseCompletion(): Promise<PhaseValidationResult> {
    const phaseConfig = SPEC_PHASE_CONFIG[this._currentPhase];
    const deliverables = phaseConfig.deliverables;

    // Implementation phase has dynamic deliverables
    if (this._currentPhase === "implementation") {
      return {
        isComplete: true,
        missingDeliverables: [],
        validatedDeliverables: [],
        message: "Implementation phase validated (dynamic deliverables)",
      };
    }

    const missingDeliverables: string[] = [];
    const validatedDeliverables: string[] = [];

    for (const deliverable of deliverables) {
      const exists = await this._fileChecker(deliverable);
      if (exists) {
        validatedDeliverables.push(deliverable);
      } else {
        missingDeliverables.push(deliverable);
      }
    }

    const isComplete = missingDeliverables.length === 0;
    const phaseName = phaseConfig.name;

    let message: string;
    if (isComplete) {
      message = `${phaseName} phase complete. All deliverables validated.`;
      this._validatedDeliverables.push(...validatedDeliverables);
    } else {
      message = `${phaseName} phase incomplete. Missing: ${missingDeliverables.join(", ")}`;
    }

    return {
      isComplete,
      missingDeliverables,
      validatedDeliverables,
      message,
    };
  }

  /**
   * Advance to the next phase in the workflow.
   *
   * @throws Error if current phase is not validated
   * @throws Error if already at the last phase
   */
  advancePhase(): void {
    if (!this._currentPhaseValidated) {
      throw new Error(`Cannot advance: phase "${this._currentPhase}" not validated`);
    }

    const phaseIndex = SPEC_PHASES.indexOf(this._currentPhase);
    if (phaseIndex >= SPEC_PHASES.length - 1) {
      throw new Error("Cannot advance: already at final phase");
    }

    const nextPhase = SPEC_PHASES[phaseIndex + 1];
    if (!nextPhase) {
      throw new Error("Cannot advance: next phase not found");
    }

    this._completedPhases.push(this._currentPhase);
    this._currentPhase = nextPhase;
    this._currentPhaseValidated = false;
  }

  /**
   * Set a specific phase (for recovery/resume scenarios).
   *
   * @param phase - The phase to set
   * @param validated - Whether the phase is already validated
   */
  setPhase(phase: SpecPhase, validated = false): void {
    this._currentPhase = phase;
    this._currentPhaseValidated = validated;
  }

  /**
   * Set the file checker function (for testing).
   *
   * @param checker - Function that checks if a file exists
   */
  setFileChecker(checker: (path: string) => Promise<boolean>): void {
    this._fileChecker = checker;
  }

  // ============================================
  // Spec Mode Properties
  // ============================================

  /**
   * Get the agent level for Spec mode.
   * Level is looked up from the agent config via agentName.
   *
   * @returns AgentLevel.orchestrator
   */
  get agentLevel(): AgentLevel {
    const agentName = this.config.agentName;
    if (agentName && agentName in BUILT_IN_AGENTS) {
      return BUILT_IN_AGENTS[agentName as keyof typeof BUILT_IN_AGENTS].level;
    }
    // Default to orchestrator level for spec mode
    return 0 as AgentLevel;
  }

  /**
   * Check if checkpoints are required in Spec mode.
   *
   * @returns true - Spec mode requires 6 checkpoints
   */
  get requiresCheckpoints(): boolean {
    return this.config.checkpointsRequired;
  }

  /**
   * Get the checkpoint count for Spec mode.
   *
   * @returns 6 - Spec mode has 6 checkpoints
   */
  get checkpointCount(): number {
    return this.config.checkpointCount;
  }

  /**
   * Check if this mode can spawn other agents.
   * Looks up from the agent config via agentName.
   *
   * @returns true - Spec mode can spawn specialized agents
   */
  get canSpawnAgents(): boolean {
    const agentName = this.config.agentName;
    if (agentName && agentName in BUILT_IN_AGENTS) {
      return BUILT_IN_AGENTS[agentName as keyof typeof BUILT_IN_AGENTS].canSpawnAgents;
    }
    return false;
  }

  /**
   * Get the list of agents this mode can spawn.
   * Note: The specific agent list is now managed at the orchestrator level,
   * not in the mode config.
   *
   * @returns Array of agent slugs (empty for now, managed externally)
   */
  get spawnableAgents(): string[] {
    // Spawnable agents are now managed at the orchestrator/registry level
    // Return empty array - orchestrator determines what can be spawned
    return [];
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Convert SpecPhaseToolAccess to ToolAccessConfig.
   */
  private toolAccessToConfig(toolAccess: SpecPhaseToolAccess): ToolAccessConfig {
    switch (toolAccess) {
      case "read-only":
        return this.createReadOnlyAccess();
      case "read-write":
        return this.createReadWriteAccess();
      case "full":
        return this.createFullAccess();
      case "read-test":
        return this.createReadTestAccess();
    }
  }

  /**
   * Check if a message is requesting phase validation.
   */
  private isValidationRequest(message: UserMessage): boolean {
    const content = message.content.toLowerCase().trim();
    const validationPatterns = [
      "validate",
      "check phase",
      "verify",
      "phase complete",
      "done with phase",
      "ready to advance",
    ];
    return validationPatterns.some((pattern) => content.includes(pattern));
  }

  /**
   * Check if a message is approving phase advancement.
   */
  private isPhaseAdvanceApproval(message: UserMessage): boolean {
    if (message.metadata?.advancePhase === true) {
      return true;
    }

    const content = message.content.toLowerCase().trim();
    const approvalPatterns = [
      "next phase",
      "advance",
      "proceed to next",
      "move to next",
      "yes",
      "y",
      "approved",
    ];

    // Only check for approval patterns if we're validated
    if (this._currentPhaseValidated) {
      return approvalPatterns.some(
        (pattern) => content === pattern || content.startsWith(`${pattern} `)
      );
    }

    // Explicit advance commands
    return content === "next phase" || content === "advance";
  }
}
