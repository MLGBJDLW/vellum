// ============================================
// VibeModeHandler - Fast autonomous coding mode
// ============================================
// T020: Implement VibeModeHandler class
// ============================================

import { BUILT_IN_AGENTS } from "../agent-config.js";
import type { AgentLevel } from "../level.js";
import { BaseModeHandler } from "./base.js";
import type { HandlerResult, ToolAccessConfig, UserMessage } from "./types.js";

/**
 * Mode handler for Vibe mode - fast autonomous coding.
 *
 * Vibe mode provides:
 * - Full tool access (all tools enabled)
 * - No checkpoints (immediate execution)
 * - Worker-level agent hierarchy
 * - Pass-through message processing
 *
 * This is the default mode for quick fixes and simple tasks
 * where the agent operates autonomously without approval gates.
 *
 * @example
 * ```typescript
 * import { VibeModeHandler } from './vibe';
 * import { VIBE_MODE } from '../coding-modes';
 *
 * const handler = new VibeModeHandler(VIBE_MODE);
 *
 * // Get tool access (full access)
 * const access = handler.getToolAccess();
 * console.log(access.groups); // ['all']
 *
 * // Process message (pass-through)
 * const result = await handler.processMessage({ content: 'Fix the bug' });
 * console.log(result.shouldContinue); // true
 * console.log(result.requiresCheckpoint); // undefined
 * ```
 */
export class VibeModeHandler extends BaseModeHandler {
  /**
   * Process an incoming user message.
   *
   * In Vibe mode, messages pass through unchanged without checkpoints.
   * The handler simply validates the message and returns a continuation result.
   *
   * @param message - The user message to process
   * @returns HandlerResult with shouldContinue: true
   */
  async processMessage(message: UserMessage): Promise<HandlerResult> {
    // Vibe mode: pass-through without modification or checkpoints
    return this.passThrough(message);
  }

  /**
   * Get the tool access configuration for Vibe mode.
   *
   * Vibe mode has full access to all tools - no restrictions.
   *
   * @returns ToolAccessConfig with 'all' group enabled
   */
  getToolAccess(): ToolAccessConfig {
    return this.createFullAccess();
  }

  /**
   * Called when entering Vibe mode.
   *
   * Vibe mode requires no special initialization.
   */
  async onEnter(): Promise<void> {
    // No special initialization needed for vibe mode
  }

  /**
   * Called when exiting Vibe mode.
   *
   * Vibe mode requires no special cleanup.
   */
  async onExit(): Promise<void> {
    // No special cleanup needed for vibe mode
  }

  // ============================================
  // Vibe Mode Properties
  // ============================================

  /**
   * Get the agent level for Vibe mode.
   *
   * Vibe mode operates at the worker level (leaf executor).
   * Level is looked up from the agent config via agentName.
   *
   * @returns AgentLevel.worker
   */
  get agentLevel(): AgentLevel {
    const agentName = this.config.agentName;
    if (agentName && agentName in BUILT_IN_AGENTS) {
      return BUILT_IN_AGENTS[agentName as keyof typeof BUILT_IN_AGENTS].level;
    }
    // Default to worker level for vibe mode
    return 2 as AgentLevel;
  }

  /**
   * Check if checkpoints are required in Vibe mode.
   *
   * @returns false - Vibe mode has no checkpoints
   */
  get requiresCheckpoints(): boolean {
    return this.config.checkpointsRequired;
  }

  /**
   * Get the checkpoint count for Vibe mode.
   *
   * @returns 0 - Vibe mode has no checkpoints
   */
  get checkpointCount(): number {
    return this.config.checkpointCount;
  }

  /**
   * Check if this mode can spawn other agents.
   *
   * @returns false - Vibe mode (worker level) cannot spawn agents
   */
  get canSpawnAgents(): boolean {
    const agentName = this.config.agentName;
    if (agentName && agentName in BUILT_IN_AGENTS) {
      return BUILT_IN_AGENTS[agentName as keyof typeof BUILT_IN_AGENTS].canSpawnAgents;
    }
    return false;
  }
}
