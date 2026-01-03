// ============================================
// Mode Handler Types - Shared types for handlers
// ============================================
// T018: ModeHandler interface types
// ============================================

import type { CodingModeConfig } from "../coding-modes.js";

/**
 * Tool group categories for access control.
 *
 * Tool groups define categories of tools that can be enabled/disabled together:
 * - `read`: File reading, listing, searching operations
 * - `write`: File creation, modification, deletion operations
 * - `execute`: Shell/command execution operations
 * - `spawn`: Agent spawning operations (for orchestrators)
 * - `all`: All available tools
 */
export type ToolGroup = "read" | "write" | "execute" | "spawn" | "all";

/**
 * Configuration for tool access in a mode handler.
 *
 * Defines which tools are enabled, disabled, or grouped by category.
 *
 * @example
 * ```typescript
 * // Read-only access
 * const readOnly: ToolAccessConfig = {
 *   enabled: ['read_file', 'list_dir', 'search'],
 *   disabled: ['edit_file', 'write_file', 'delete_file'],
 *   groups: ['read'],
 * };
 *
 * // Full access
 * const fullAccess: ToolAccessConfig = {
 *   enabled: [],
 *   disabled: [],
 *   groups: ['all'],
 * };
 * ```
 */
export interface ToolAccessConfig {
  /** Tool names that are explicitly enabled */
  enabled: string[];
  /** Tool names that are explicitly disabled */
  disabled: string[];
  /** Tool group categories that are enabled */
  groups: ToolGroup[];
}

/**
 * Represents a user message input to a mode handler.
 *
 * @example
 * ```typescript
 * const message: UserMessage = {
 *   content: 'Create a new file called foo.ts',
 *   timestamp: Date.now(),
 * };
 * ```
 */
export interface UserMessage {
  /** The message content */
  content: string;
  /** Timestamp when the message was sent */
  timestamp?: number;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result from processing a message through a mode handler.
 *
 * @example
 * ```typescript
 * // Continue processing
 * const result: HandlerResult = {
 *   shouldContinue: true,
 *   modifiedMessage: message,
 * };
 *
 * // Require checkpoint approval
 * const checkpointResult: HandlerResult = {
 *   shouldContinue: false,
 *   requiresCheckpoint: true,
 * };
 * ```
 */
export interface HandlerResult {
  /** Whether processing should continue after this result */
  shouldContinue: boolean;
  /** Optionally modified message for downstream processing */
  modifiedMessage?: UserMessage;
  /** Whether a checkpoint approval is required before continuing */
  requiresCheckpoint?: boolean;
}

/**
 * Interface for mode handler implementations.
 *
 * Mode handlers encapsulate the behavior of coding modes (vibe, plan, spec).
 * Each handler manages:
 * - Message processing and transformation
 * - Tool access configuration
 * - Lifecycle hooks for mode entry/exit
 *
 * @example
 * ```typescript
 * class CustomModeHandler implements ModeHandler {
 *   readonly config: CodingModeConfig;
 *
 *   constructor(config: CodingModeConfig) {
 *     this.config = config;
 *   }
 *
 *   async processMessage(message: UserMessage): Promise<HandlerResult> {
 *     return { shouldContinue: true, modifiedMessage: message };
 *   }
 *
 *   getToolAccess(): ToolAccessConfig {
 *     return { enabled: [], disabled: [], groups: ['all'] };
 *   }
 *
 *   async onEnter(): Promise<void> { }
 *   async onExit(): Promise<void> { }
 * }
 * ```
 */
export interface ModeHandler {
  /** The configuration for this mode handler */
  readonly config: CodingModeConfig;

  /**
   * Process an incoming user message.
   *
   * Handlers can transform messages, request checkpoints, or pass through unchanged.
   *
   * @param message - The user message to process
   * @returns Processing result with continuation flag and optional modifications
   */
  processMessage(message: UserMessage): Promise<HandlerResult>;

  /**
   * Get the current tool access configuration.
   *
   * Returns which tools are enabled/disabled for the current mode state.
   * May change based on internal state (e.g., phase in spec mode).
   *
   * @returns Tool access configuration
   */
  getToolAccess(): ToolAccessConfig;

  /**
   * Called when entering this mode.
   *
   * Use for initialization, state setup, or resource acquisition.
   */
  onEnter(): Promise<void>;

  /**
   * Called when exiting this mode.
   *
   * Use for cleanup, state persistence, or resource release.
   */
  onExit(): Promise<void>;
}
