// ============================================
// BaseModeHandler - Abstract base class for mode handlers
// ============================================
// T019: BaseModeHandler abstract class
// ============================================

import type { CodingModeConfig } from "../coding-modes.js";
import type { HandlerResult, ModeHandler, ToolAccessConfig, UserMessage } from "./types.js";

/**
 * Abstract base class for mode handlers.
 *
 * Provides default implementations for lifecycle hooks and common utilities.
 * Concrete handlers should extend this class and implement:
 * - `processMessage()` for message handling logic
 * - `getToolAccess()` for tool configuration
 *
 * @example
 * ```typescript
 * class MyModeHandler extends BaseModeHandler {
 *   async processMessage(message: UserMessage): Promise<HandlerResult> {
 *     // Custom processing logic
 *     return { shouldContinue: true, modifiedMessage: message };
 *   }
 *
 *   getToolAccess(): ToolAccessConfig {
 *     return this.createFullAccess();
 *   }
 * }
 * ```
 */
export abstract class BaseModeHandler implements ModeHandler {
  /**
   * Create a new BaseModeHandler.
   *
   * @param config - The coding mode configuration for this handler
   */
  constructor(public readonly config: CodingModeConfig) {}

  /**
   * Process an incoming user message.
   *
   * Must be implemented by concrete handlers.
   *
   * @param message - The user message to process
   * @returns Processing result
   */
  abstract processMessage(message: UserMessage): Promise<HandlerResult>;

  /**
   * Get the current tool access configuration.
   *
   * Must be implemented by concrete handlers.
   *
   * @returns Tool access configuration
   */
  abstract getToolAccess(): ToolAccessConfig;

  /**
   * Called when entering this mode.
   *
   * Default implementation is a no-op. Override for custom initialization.
   */
  async onEnter(): Promise<void> {
    // Default no-op implementation
  }

  /**
   * Called when exiting this mode.
   *
   * Default implementation is a no-op. Override for custom cleanup.
   */
  async onExit(): Promise<void> {
    // Default no-op implementation
  }

  // ============================================
  // Protected Helper Methods
  // ============================================

  /**
   * Create a tool access config with all tools enabled.
   *
   * @returns ToolAccessConfig with 'all' group enabled
   */
  protected createFullAccess(): ToolAccessConfig {
    return {
      enabled: [],
      disabled: [],
      groups: ["all"],
    };
  }

  /**
   * Create a tool access config with read-only access.
   *
   * @returns ToolAccessConfig with only 'read' group enabled
   */
  protected createReadOnlyAccess(): ToolAccessConfig {
    return {
      enabled: [],
      disabled: [],
      groups: ["read"],
    };
  }

  /**
   * Create a tool access config with read and write access.
   *
   * @returns ToolAccessConfig with 'read' and 'write' groups enabled
   */
  protected createReadWriteAccess(): ToolAccessConfig {
    return {
      enabled: [],
      disabled: [],
      groups: ["read", "write"],
    };
  }

  /**
   * Create a tool access config with read, write, and execute access.
   *
   * @returns ToolAccessConfig with 'read', 'write', and 'execute' groups enabled
   */
  protected createReadWriteExecuteAccess(): ToolAccessConfig {
    return {
      enabled: [],
      disabled: [],
      groups: ["read", "write", "execute"],
    };
  }

  /**
   * Create a tool access config with read and test execution access.
   *
   * @returns ToolAccessConfig with 'read' group and test-related tools enabled
   */
  protected createReadTestAccess(): ToolAccessConfig {
    return {
      enabled: ["bash", "shell"],
      disabled: [],
      groups: ["read"],
    };
  }

  /**
   * Create a pass-through result that continues processing unchanged.
   *
   * @param message - The original message
   * @returns HandlerResult that continues with the original message
   */
  protected passThrough(message: UserMessage): HandlerResult {
    return {
      shouldContinue: true,
      modifiedMessage: message,
    };
  }

  /**
   * Create a result that requires checkpoint approval.
   *
   * @param message - The message requiring checkpoint
   * @returns HandlerResult indicating checkpoint is required
   */
  protected requireCheckpoint(message?: UserMessage): HandlerResult {
    return {
      shouldContinue: false,
      modifiedMessage: message,
      requiresCheckpoint: true,
    };
  }
}
