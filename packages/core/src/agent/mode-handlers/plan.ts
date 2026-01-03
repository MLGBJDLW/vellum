// ============================================
// PlanModeHandler - Plan-then-execute coding mode
// ============================================
// T022: Implement PlanModeHandler class
// ============================================

import type { AgentLevel } from "../level.js";
import { BaseModeHandler } from "./base.js";
import type { HandlerResult, ToolAccessConfig, UserMessage } from "./types.js";

/**
 * Plan mode phases.
 *
 * - `planning`: Read-only phase for analysis and planning
 * - `executing`: Write-enabled phase after user approval
 */
export type PlanPhase = "planning" | "executing";

/**
 * Mode handler for Plan mode - plan-then-execute workflow.
 *
 * Plan mode provides a two-phase workflow:
 * 1. **Planning Phase**: Read-only tools, analyze and create a plan
 * 2. **Executing Phase**: Write tools enabled after user approval
 *
 * This mode operates at the workflow level and requires one checkpoint
 * between planning and execution phases.
 *
 * @example
 * ```typescript
 * import { PlanModeHandler } from './plan';
 * import { PLAN_MODE } from '../coding-modes';
 *
 * const handler = new PlanModeHandler(PLAN_MODE);
 *
 * // Initially in planning phase (read-only)
 * console.log(handler.currentPhase); // 'planning'
 * const access = handler.getToolAccess();
 * console.log(access.groups); // ['read']
 *
 * // After approval, transition to executing
 * handler.approveExecution();
 * console.log(handler.currentPhase); // 'executing'
 * const newAccess = handler.getToolAccess();
 * console.log(newAccess.groups); // ['read', 'write', 'execute']
 * ```
 */
export class PlanModeHandler extends BaseModeHandler {
  /**
   * Current phase of the plan mode workflow.
   */
  private _currentPhase: PlanPhase = "planning";

  /**
   * Flag indicating if execution has been approved.
   */
  private _executionApproved = false;

  /**
   * Process an incoming user message.
   *
   * In planning phase, messages trigger plan generation.
   * When plan is complete, a checkpoint is required before execution.
   * In executing phase, messages are processed with full tool access.
   *
   * @param message - The user message to process
   * @returns HandlerResult with checkpoint requirement if transitioning
   */
  async processMessage(message: UserMessage): Promise<HandlerResult> {
    if (this._currentPhase === "planning") {
      // Check if this is an approval message
      if (this.isApprovalMessage(message)) {
        this.approveExecution();
        return {
          shouldContinue: true,
          modifiedMessage: {
            ...message,
            content: `[Execution approved] ${message.content}`,
            metadata: {
              ...message.metadata,
              phaseTransition: "planning-to-executing",
            },
          },
        };
      }

      // Still in planning - check if plan is ready for approval
      if (this.isPlanComplete(message)) {
        return this.requireCheckpoint(message);
      }

      // Normal planning pass-through
      return this.passThrough(message);
    }

    // Executing phase - pass through with full access
    return this.passThrough(message);
  }

  /**
   * Get the tool access configuration based on current phase.
   *
   * - Planning: Read-only tools
   * - Executing: Read, write, and execute tools
   *
   * @returns ToolAccessConfig for current phase
   */
  getToolAccess(): ToolAccessConfig {
    if (this._currentPhase === "planning") {
      return this.createReadOnlyAccess();
    }
    return this.createReadWriteExecuteAccess();
  }

  /**
   * Called when entering Plan mode.
   *
   * Resets state to planning phase.
   */
  async onEnter(): Promise<void> {
    this._currentPhase = "planning";
    this._executionApproved = false;
  }

  /**
   * Called when exiting Plan mode.
   *
   * Cleans up phase state.
   */
  async onExit(): Promise<void> {
    this._currentPhase = "planning";
    this._executionApproved = false;
  }

  // ============================================
  // Phase Management
  // ============================================

  /**
   * Get the current phase of the plan mode workflow.
   */
  get currentPhase(): PlanPhase {
    return this._currentPhase;
  }

  /**
   * Check if execution has been approved.
   */
  get isExecutionApproved(): boolean {
    return this._executionApproved;
  }

  /**
   * Approve execution and transition to executing phase.
   *
   * This method is called when the user approves the plan.
   * After approval, write tools become available.
   *
   * @throws Error if not in planning phase
   */
  approveExecution(): void {
    if (this._currentPhase !== "planning") {
      throw new Error("Cannot approve execution: not in planning phase");
    }
    this._executionApproved = true;
    this._currentPhase = "executing";
  }

  /**
   * Reset to planning phase.
   *
   * Use this to restart the plan-execute cycle.
   */
  resetToPlanning(): void {
    this._currentPhase = "planning";
    this._executionApproved = false;
  }

  // ============================================
  // Plan Mode Properties
  // ============================================

  /**
   * Get the agent level for Plan mode.
   *
   * @returns AgentLevel.workflow
   */
  get agentLevel(): AgentLevel {
    return this.config.level;
  }

  /**
   * Check if checkpoints are required in Plan mode.
   *
   * @returns true - Plan mode requires one checkpoint
   */
  get requiresCheckpoints(): boolean {
    return this.config.checkpointsRequired;
  }

  /**
   * Get the checkpoint count for Plan mode.
   *
   * @returns 1 - Plan mode has one checkpoint
   */
  get checkpointCount(): number {
    return this.config.checkpointCount;
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Check if a message is an approval to proceed with execution.
   *
   * @param message - The message to check
   * @returns true if the message indicates approval
   */
  private isApprovalMessage(message: UserMessage): boolean {
    const content = message.content.toLowerCase().trim();
    const approvalPatterns = [
      "yes",
      "y",
      "approve",
      "approved",
      "proceed",
      "go ahead",
      "execute",
      "do it",
      "looks good",
      "lgtm",
      "ok",
      "okay",
    ];
    return approvalPatterns.some(
      (pattern) => content === pattern || content.startsWith(`${pattern} `)
    );
  }

  /**
   * Check if a message indicates the plan is complete and ready for approval.
   *
   * This is a heuristic check - in practice, the agent would signal
   * plan completion through structured output.
   *
   * @param message - The message to check
   * @returns true if the plan appears complete
   */
  private isPlanComplete(message: UserMessage): boolean {
    // Check metadata for plan completion signal
    if (message.metadata?.planComplete === true) {
      return true;
    }

    // Check content for plan completion indicators
    const content = message.content.toLowerCase();
    const completionPatterns = [
      "plan complete",
      "ready to execute",
      "awaiting approval",
      "please approve",
      "shall i proceed",
      "ready to implement",
    ];
    return completionPatterns.some((pattern) => content.includes(pattern));
  }
}
