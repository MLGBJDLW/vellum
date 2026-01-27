/**
 * Context Manager for Agent Loop
 *
 * Extracted from AgentLoop to handle context management operations
 * including compaction, state retrieval, and enable/disable checks.
 *
 * @module @vellum/core/agent/context-manager
 */

import type { ContextState } from "../context/types.js";
import type { Logger } from "../logger/logger.js";
import type { SessionMessage } from "../session/index.js";
import type { ContextIntegration, ContextManageResult } from "./context-integration.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for AgentContextManager
 */
export interface AgentContextManagerConfig {
  /** Whether context management is enabled */
  contextManagementEnabled?: boolean;
}

/**
 * Event emitted when context is compacted
 */
export interface ContextCompactedEvent {
  /** Original message count before compaction */
  originalCount: number;
  /** New message count after compaction */
  newCount: number;
  /** Context state after compaction */
  state: ContextState;
  /** Actions taken during compaction */
  actions: string[];
}

/**
 * Dependencies for AgentContextManager
 */
export interface AgentContextManagerDeps {
  /** Context integration instance (may be undefined if disabled) */
  contextIntegration?: ContextIntegration;
  /** Logger for debugging */
  logger?: Logger;
  /** Get current messages */
  getMessages: () => SessionMessage[];
  /** Set messages after compaction */
  setMessages: (messages: SessionMessage[]) => void;
  /** Emit context managed event */
  emitContextManaged: (result: ContextManageResult) => void;
}

// ============================================================================
// AgentContextManager
// ============================================================================

/**
 * Manages context operations for the agent loop.
 *
 * This class encapsulates context management logic including:
 * - Manual context compaction via /condense command
 * - Context state retrieval
 * - Enable/disable status checks
 *
 * @example
 * ```typescript
 * const contextManager = new AgentContextManager({
 *   contextIntegration,
 *   logger,
 *   getMessages: () => this.messages,
 *   setMessages: (msgs) => { this.messages = msgs; },
 *   emitContextManaged: (result) => this.emit("contextManaged", result),
 * });
 *
 * // Manual compaction
 * const result = await contextManager.compactContext();
 *
 * // Check state
 * const state = contextManager.getContextState();
 * const enabled = contextManager.isContextManagementEnabled();
 * ```
 */
export class AgentContextManager {
  private readonly contextIntegration?: ContextIntegration;
  private readonly logger?: Logger;
  private readonly getMessages: () => SessionMessage[];
  private readonly setMessages: (messages: SessionMessage[]) => void;
  private readonly emitContextManaged: (result: ContextManageResult) => void;

  constructor(deps: AgentContextManagerDeps) {
    this.contextIntegration = deps.contextIntegration;
    this.logger = deps.logger;
    this.getMessages = deps.getMessages;
    this.setMessages = deps.setMessages;
    this.emitContextManaged = deps.emitContextManaged;
  }

  /**
   * Manually compact/condense the context (T403).
   *
   * This can be triggered via /condense command to force context
   * window optimization without waiting for automatic triggers.
   *
   * @returns Result of the context management operation, or null if not enabled
   */
  async compactContext(): Promise<ContextManageResult | null> {
    if (!this.contextIntegration?.enabled) {
      this.logger?.debug("Context compaction requested but context management is disabled");
      return null;
    }

    const messages = this.getMessages();
    this.logger?.debug("Manual context compaction requested", {
      currentMessageCount: messages.length,
    });

    const result = await this.contextIntegration.beforeApiCall(messages);

    if (result.modified) {
      // Update internal messages with compacted version
      this.setMessages(result.messages);
      this.emitContextManaged(result);

      this.logger?.info("Context compacted successfully", {
        originalCount: messages.length,
        newCount: result.messages.length,
        state: result.state,
        actions: result.actions,
      });
    } else {
      this.logger?.debug("Context compaction: no changes needed", {
        state: result.state,
      });
    }

    return result;
  }

  /**
   * Get the current context state (T403).
   *
   * @returns Current context state or null if context management is disabled
   */
  getContextState(): ContextState | null {
    return this.contextIntegration?.getState() ?? null;
  }

  /**
   * Check if context management is enabled (T403).
   *
   * @returns true if context management is enabled and active
   */
  isContextManagementEnabled(): boolean {
    return this.contextIntegration?.enabled ?? false;
  }

  /**
   * Get the underlying context integration instance.
   *
   * @returns The context integration or undefined if not configured
   */
  getContextIntegration(): ContextIntegration | undefined {
    return this.contextIntegration;
  }
}
