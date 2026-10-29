/**
 * Context Management Integration for Agent Loop
 *
 * This module provides utilities for integrating AutoContextManager
 * into the agent loop, handling conversion between SessionMessage
 * and ContextMessage formats.
 *
 * @module @vellum/core/agent/context-integration
 */

import { getContextWindow } from "@vellum/provider";
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
import type { SessionMessage, SessionMessagePart } from "../session/index.js";

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
  providerType?: string;
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
  /** Reconfigure the same integration for a newly selected model. */
  updateModel?(model: string, providerType?: string): void;
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
  const role = message.role === "tool_result" ? "user" : message.role;
  const state = message.metadata.extra?._context;
  const saved = state && typeof state === "object" ? (state as Record<string, unknown>) : {};

  // Determine priority based on role and recency (basic heuristic)
  // Use RECENT for user messages, NORMAL for assistant
  const priority = message.role === "user" ? MessagePriority.RECENT : MessagePriority.NORMAL;

  return {
    id: message.id,
    role,
    content,
    priority,
    // API input usage measures the whole request, not the size of this message.
    // Let the existing content tokenizer estimate the retained message instead.
    isSummary: saved.isSummary === true,
    condenseId: typeof saved.condenseId === "string" ? saved.condenseId : undefined,
    condenseParent: typeof saved.condenseParent === "string" ? saved.condenseParent : undefined,
    truncationParent:
      typeof saved.truncationParent === "string" ? saved.truncationParent : undefined,
    reasoningContent:
      message.parts
        .filter((part) => part.type === "reasoning")
        .map((part) => part.text)
        .join("\n") || undefined,
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
  const originalContent = original ? extractContentFromParts(original.parts) : undefined;
  const unchanged = original && JSON.stringify(message.content) === JSON.stringify(originalContent);
  const parts: SessionMessagePart[] = unchanged
    ? original.parts
    : typeof message.content === "string"
      ? [{ type: "text", text: message.content }]
      : message.content.map((block): SessionMessagePart => {
          switch (block.type) {
            case "text":
              return { type: "text", text: block.text };
            case "tool_use":
              return {
                type: "tool",
                id: block.id,
                name: block.name,
                input:
                  block.input && typeof block.input === "object"
                    ? (block.input as Record<string, unknown>)
                    : {},
              };
            case "tool_result":
              return {
                type: "tool_result",
                toolId: block.tool_use_id,
                content: block.content,
                isError: block.is_error,
              };
            case "image": {
              const prior = original?.parts.find(
                (part) => part.type === "image" && part.source === block.source.data
              );
              if (prior) return prior;
              const mimeType = block.mediaType;
              if (
                mimeType === "image/png" ||
                mimeType === "image/jpeg" ||
                mimeType === "image/gif" ||
                mimeType === "image/webp"
              ) {
                return { type: "image", source: block.source.data, mimeType };
              }
              return { type: "text", text: "[Image omitted: unsupported media type]" };
            }
          }
          throw new Error("Unsupported context message block");
        });
  if (!unchanged && message.reasoningContent)
    parts.unshift({ type: "reasoning", text: message.reasoningContent });

  return {
    id: message.id,
    role: message.isSummary ? message.role : (original?.role ?? message.role),
    parts,
    metadata: {
      createdAt: message.createdAt ?? Date.now(),
      ...(message.isSummary ? undefined : original?.metadata),
      ...(original?.metadata.providerMetadata?.provider === "google" && !unchanged
        ? { providerMetadata: undefined }
        : {}),
      extra: {
        ...original?.metadata?.extra,
        ...message.metadata,
        // Mark context management metadata
        _contextManaged: true,
        _contextState: message.isSummary ? "summary" : "original",
        _context: {
          isSummary: message.isSummary,
          condenseId: message.condenseId,
          condenseParent: message.condenseParent,
          truncationParent: message.truncationParent,
        },
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

  if (toolParts.length === 0 && textParts.length === parts.length) {
    return textParts.map((p) => (p as { text: string }).text).join("\n");
  }

  // For complex messages with tool calls, convert to content blocks
  return parts
    .filter((part) => part.type !== "reasoning")
    .map((part) => {
      switch (part.type) {
        case "text":
          return { type: "text" as const, text: (part as { text: string }).text };
        case "image":
          return {
            type: "image" as const,
            source: { type: "base64", data: part.source },
            mediaType: part.mimeType,
          };
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
  const {
    model,
    providerType,
    compressionClient,
    logger,
    enabled = true,
    configOverrides,
  } = config;
  const modelConfig = (selectedModel: string, selectedProvider?: string) => ({
    ...createDefaultConfig(selectedModel, compressionClient),
    ...(selectedProvider
      ? { contextWindow: getContextWindow(selectedProvider, selectedModel) }
      : {}),
    ...configOverrides,
  });

  // Create manager only if enabled
  let manager: AutoContextManager | null = null;
  let currentState: ContextState = "healthy";

  if (enabled) {
    manager = new AutoContextManager(modelConfig(model, providerType));
  }

  return {
    get manager() {
      return manager;
    },

    get enabled() {
      return enabled && manager !== null;
    },

    updateModel(nextModel: string, nextProvider?: string): void {
      if (!enabled) return;
      manager = new AutoContextManager(modelConfig(nextModel, nextProvider));
      currentState = "healthy";
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
        const contextMessages = getEffectiveApiHistory(sessionsToContexts(messages)).messages;

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
        const managedMessages = contextsToSessions(
          getEffectiveApiHistory(result.messages).messages,
          messages
        );

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
  logger?: Logger,
  providerType?: string
): ContextIntegration {
  return createContextIntegration({
    model,
    providerType,
    enabled: config?.enabled ?? false,
    compressionClient: config?.compressionClient,
    configOverrides: config?.configOverrides,
    logger,
  });
}
