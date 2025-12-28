/**
 * Context Management Integration for Agent Loop
 *
 * This module provides utilities for integrating AutoContextManager
 * into the agent loop, handling conversion between SessionMessage
 * and ContextMessage formats.
 *
 * @module @vellum/core/agent/context-integration
 */

import {
  AutoContextManager,
  type AutoContextManagerConfig,
  type AutoManageResult,
  type CompressionLLMClient,
  type ContextMessage,
  type ContextState,
  createDefaultConfig,
  getEffectiveApiHistory,
  MessagePriority,
} from "../context/index.js";
import type { Logger } from "../logger/logger.js";
import type { SessionMessage } from "../session/index.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of context management operation
 */
export interface ContextManageResult {
  /** Managed session messages ready for API */
  messages: SessionMessage[];
  /** Current context state */
  state: ContextState;
  /** Actions taken during management */
  actions: string[];
  /** Whether context was modified */
  modified: boolean;
}

/**
 * Context integration configuration
 */
export interface ContextIntegrationConfig {
  /** Model identifier for token calculation */
  model: string;
  /** Optional LLM client for compression */
  compressionClient?: CompressionLLMClient;
  /** Logger for state change logging */
  logger?: Logger;
  /** Whether context management is enabled */
  enabled?: boolean;
  /** Custom configuration overrides */
  configOverrides?: Partial<AutoContextManagerConfig>;
}

/**
 * Context integration interface for agent loop
 */
export interface ContextIntegration {
  /** The underlying context manager */
  readonly manager: AutoContextManager | null;

  /** Whether context management is enabled */
  readonly enabled: boolean;

  /**
   * Manage context before API call
   * Returns managed messages and state information
   */
  beforeApiCall(messages: SessionMessage[]): Promise<ContextManageResult>;

  /**
   * Get messages formatted for API (excludes compressed originals)
   */
  getApiMessages(messages: SessionMessage[]): SessionMessage[];

  /**
   * Get current context state
   */
  getState(): ContextState | null;

  /**
   * Reset the context manager
   */
  reset(): void;
}

// ============================================================================
// Message Conversion
// ============================================================================

/**
 * Convert SessionMessage to ContextMessage format
 */
export function sessionToContext(message: SessionMessage): ContextMessage {
  // Extract text content from parts
  const content = extractContentFromParts(message.parts);

  // Map role - SessionMessage uses 'user' | 'assistant', ContextMessage uses same
  const role = message.role as "user" | "assistant";

  // Determine priority based on role and recency (basic heuristic)
  // Use RECENT for user messages, NORMAL for assistant
  const priority = message.role === "user" ? MessagePriority.RECENT : MessagePriority.NORMAL;

  return {
    id: message.id,
    role,
    content,
    priority,
    tokens: message.metadata.tokens
      ? message.metadata.tokens.input + message.metadata.tokens.output
      : undefined,
    createdAt: message.metadata.createdAt,
    metadata: message.metadata.extra,
  };
}

/**
 * Convert ContextMessage back to SessionMessage format
 * Note: Some metadata may be lost in round-trip conversion
 */
export function contextToSession(
  message: ContextMessage,
  original?: SessionMessage
): SessionMessage {
  // Use original parts if available and content hasn't changed
  const content = typeof message.content === "string" ? message.content : "";

  return {
    id: message.id,
    role: message.role,
    parts: original?.parts ?? [{ type: "text", text: content }],
    metadata: {
      createdAt: message.createdAt ?? Date.now(),
      ...original?.metadata,
      extra: {
        ...original?.metadata?.extra,
        ...message.metadata,
        // Mark context management metadata
        _contextManaged: true,
        _contextState: message.isSummary ? "summary" : "original",
      },
    },
  };
}

/**
 * Extract text content from session message parts
 */
function extractContentFromParts(
  parts: SessionMessage["parts"]
): string | ContextMessage["content"] {
  // For simple text-only messages, return string
  const textParts = parts.filter((p) => p.type === "text");
  const toolParts = parts.filter((p) => p.type === "tool" || p.type === "tool_result");

  if (toolParts.length === 0 && textParts.length > 0) {
    return textParts.map((p) => (p as { text: string }).text).join("\n");
  }

  // For complex messages with tool calls, convert to content blocks
  return parts.map((part) => {
    switch (part.type) {
      case "text":
        return { type: "text" as const, text: (part as { text: string }).text };
      case "tool":
        return {
          type: "tool_use" as const,
          id: (part as { id: string }).id,
          name: (part as { name: string }).name,
          input: (part as { input: Record<string, unknown> }).input,
        };
      case "tool_result":
        return {
          type: "tool_result" as const,
          tool_use_id: (part as { toolId: string }).toolId,
          content: String((part as { content: unknown }).content ?? ""),
          is_error: (part as { isError?: boolean }).isError ?? false,
        };
      default:
        return { type: "text" as const, text: JSON.stringify(part) };
    }
  });
}

/**
 * Convert array of SessionMessages to ContextMessages
 */
export function sessionsToContexts(messages: SessionMessage[]): ContextMessage[] {
  return messages.map(sessionToContext);
}

/**
 * Convert array of ContextMessages back to SessionMessages
 * Preserves original metadata where possible
 */
export function contextsToSessions(
  contextMessages: ContextMessage[],
  originalMessages: SessionMessage[]
): SessionMessage[] {
  // Create lookup map for original messages
  const originalMap = new Map(originalMessages.map((m) => [m.id, m]));

  return contextMessages.map((cm) => contextToSession(cm, originalMap.get(cm.id)));
}

// ============================================================================
// Context Integration Factory
// ============================================================================

/**
 * Create a context integration instance for the agent loop
 *
 * @example
 * ```typescript
 * const integration = createContextIntegration({
 *   model: 'claude-sonnet-4-20250514',
 *   enabled: true,
 *   logger: myLogger,
 * });
 *
 * // In agent loop before API call:
 * const result = await integration.beforeApiCall(messages);
 * const apiMessages = result.messages;
 * ```
 */
export function createContextIntegration(config: ContextIntegrationConfig): ContextIntegration {
  const { model, compressionClient, logger, enabled = true, configOverrides } = config;

  // Create manager only if enabled
  let manager: AutoContextManager | null = null;
  let currentState: ContextState = "healthy";

  if (enabled) {
    const managerConfig = createDefaultConfig(model, compressionClient);
    // Apply any config overrides
    const finalConfig = configOverrides ? { ...managerConfig, ...configOverrides } : managerConfig;
    manager = new AutoContextManager(finalConfig);
  }

  return {
    get manager() {
      return manager;
    },

    get enabled() {
      return enabled && manager !== null;
    },

    async beforeApiCall(messages: SessionMessage[]): Promise<ContextManageResult> {
      // If disabled, return messages as-is
      if (!manager) {
        return {
          messages,
          state: "healthy",
          actions: [],
          modified: false,
        };
      }

      try {
        // Convert to context messages
        const contextMessages = sessionsToContexts(messages);

        // Run context management
        const result: AutoManageResult = await manager.manage(contextMessages);

        // Update current state
        currentState = result.state;

        // Log state changes
        if (result.state !== "healthy" && logger) {
          logger.debug("Context management state change", {
            state: result.state,
            actions: [...result.actions],
            tokenCount: result.tokenCount,
            budgetUsed: result.budgetUsed,
          });
        }

        // Convert back to session messages
        const managedMessages = contextsToSessions(result.messages, messages);

        return {
          messages: managedMessages,
          state: result.state,
          actions: [...result.actions],
          modified: result.actions.length > 0,
        };
      } catch (error) {
        // On error, return original messages and log
        logger?.error("Context management failed", { error });
        return {
          messages,
          state: "healthy",
          actions: [],
          modified: false,
        };
      }
    },

    getApiMessages(messages: SessionMessage[]): SessionMessage[] {
      if (!manager) {
        return messages;
      }

      // Convert, filter, convert back
      const contextMessages = sessionsToContexts(messages);
      const filtered = getEffectiveApiHistory(contextMessages);
      return contextsToSessions(filtered.messages, messages);
    },

    getState(): ContextState | null {
      return manager ? currentState : null;
    },

    reset(): void {
      currentState = "healthy";
      // Note: AutoContextManager may need a reset method
    },
  };
}

// ============================================================================
// AgentLoop Integration Helpers
// ============================================================================

/**
 * Configuration extension for AgentLoopConfig
 */
export interface ContextManagerConfig {
  /** Enable context management */
  contextManagement?: {
    enabled: boolean;
    compressionClient?: CompressionLLMClient;
    configOverrides?: Partial<AutoContextManagerConfig>;
  };
}

/**
 * Create context integration from agent loop config
 */
export function createContextIntegrationFromLoopConfig(
  model: string,
  config?: ContextManagerConfig["contextManagement"],
  logger?: Logger
): ContextIntegration {
  return createContextIntegration({
    model,
    enabled: config?.enabled ?? false,
    compressionClient: config?.compressionClient,
    configOverrides: config?.configOverrides,
    logger,
  });
}
