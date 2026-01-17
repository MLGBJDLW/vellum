/**
 * Message Adapter for Session ↔ UI Message Conversion
 *
 * Provides bidirectional conversion between @vellum/core SessionMessage
 * and TUI Message types for seamless integration between the agent loop
 * and the user interface.
 *
 * @module tui/adapters/message-adapter
 */

import type {
  SessionMessage,
  SessionMessagePart,
  SessionRole,
  SessionTextPart,
  SessionToolPart,
  SessionToolResultPart,
} from "@vellum/core";
import { createId } from "@vellum/shared";
import type { Message, MessageRole, ToolCallInfo } from "../context/MessagesContext.js";

// =============================================================================
// Role Mapping
// =============================================================================

/**
 * Map from session role to UI message role
 */
const SESSION_TO_UI_ROLE: Record<SessionRole, MessageRole> = {
  user: "user",
  assistant: "assistant",
  system: "system",
  tool_result: "tool",
};

/**
 * Map from UI message role to session role
 */
const UI_TO_SESSION_ROLE: Record<MessageRole, SessionRole> = {
  user: "user",
  assistant: "assistant",
  system: "system",
  tool: "tool_result",
  tool_group: "tool_result", // tool_group maps to tool_result for session storage
};

// =============================================================================
// Content Extraction Helpers
// =============================================================================

/**
 * Extract text content from session message parts
 *
 * @param parts - Array of session message parts
 * @returns Combined text content
 */
function extractTextContent(parts: readonly SessionMessagePart[]): string {
  return parts
    .filter((part): part is SessionTextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/**
 * Extract tool calls from session message parts
 *
 * @param parts - Array of session message parts
 * @returns Array of tool call info objects
 */
function extractToolCalls(parts: readonly SessionMessagePart[]): readonly ToolCallInfo[] {
  return parts
    .filter((part): part is SessionToolPart => part.type === "tool")
    .map((part) => ({
      id: part.id,
      name: part.name,
      arguments: part.input,
      status: "completed" as const,
    }));
}

/**
 * Extract tool results from session message parts
 *
 * @param parts - Array of session message parts
 * @returns Array of tool call info with results
 */
function extractToolResults(parts: readonly SessionMessagePart[]): readonly ToolCallInfo[] {
  return parts
    .filter((part): part is SessionToolResultPart => part.type === "tool_result")
    .map((part) => ({
      id: part.toolId,
      name: "tool_result",
      arguments: {},
      result: part.content,
      status: part.isError ? ("error" as const) : ("completed" as const),
    }));
}

// =============================================================================
// Session → UI Conversion
// =============================================================================

/**
 * Convert a single session message to UI message format
 *
 * @param sessionMessage - Message from session/core
 * @returns UI message for display
 *
 * @example
 * ```typescript
 * const sessionMsg = createUserMessage([SessionParts.text("Hello")]);
 * const uiMsg = toUIMessage(sessionMsg);
 * // { id: "...", role: "user", content: "Hello", timestamp: Date, ... }
 * ```
 */
export function toUIMessage(sessionMessage: SessionMessage): Message {
  const textContent = extractTextContent(sessionMessage.parts);
  const toolCalls = extractToolCalls(sessionMessage.parts);
  const toolResults = extractToolResults(sessionMessage.parts);

  // Combine tool calls and tool results
  const allToolCalls = [...toolCalls, ...toolResults];

  // Build content - for tool_result messages, stringify the result if no text
  let content = textContent;
  if (!content && sessionMessage.role === "tool_result" && toolResults.length > 0) {
    content = toolResults
      .map((tr) => (typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result, null, 2)))
      .join("\n");
  }

  return {
    id: sessionMessage.id,
    role: SESSION_TO_UI_ROLE[sessionMessage.role],
    content,
    timestamp: new Date(sessionMessage.metadata.createdAt),
    isStreaming: false,
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
  };
}

/**
 * Convert an array of session messages to UI messages
 *
 * @param sessionMessages - Array of session messages
 * @returns Array of UI messages
 *
 * @example
 * ```typescript
 * const session = { messages: [...] };
 * const uiMessages = toUIMessages(session.messages);
 * ```
 */
export function toUIMessages(sessionMessages: readonly SessionMessage[]): readonly Message[] {
  return sessionMessages.map(toUIMessage);
}

// =============================================================================
// UI → Session Conversion
// =============================================================================

/**
 * Convert a UI message to session message format
 *
 * @param uiMessage - UI message from MessagesContext
 * @returns Session message for core/agent loop
 *
 * @example
 * ```typescript
 * const uiMsg = { id: "1", role: "user", content: "Hello", timestamp: new Date() };
 * const sessionMsg = toSessionMessage(uiMsg);
 * ```
 */
export function toSessionMessage(uiMessage: Message): SessionMessage {
  const parts: SessionMessagePart[] = [];

  // Add text content if present
  if (uiMessage.content) {
    parts.push({
      type: "text",
      text: uiMessage.content,
    });
  }

  // Add tool calls if present (for assistant messages)
  if (uiMessage.toolCalls && uiMessage.role === "assistant") {
    for (const toolCall of uiMessage.toolCalls) {
      parts.push({
        type: "tool",
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.arguments,
      });
    }
  }

  // Add tool results if present (for tool messages)
  if (uiMessage.toolCalls && uiMessage.role === "tool") {
    for (const toolCall of uiMessage.toolCalls) {
      parts.push({
        type: "tool_result",
        toolId: toolCall.id,
        content: toolCall.result ?? "",
        isError: toolCall.status === "error",
      });
    }
  }

  return {
    id: uiMessage.id,
    role: UI_TO_SESSION_ROLE[uiMessage.role],
    parts,
    metadata: {
      createdAt: uiMessage.timestamp.getTime(),
      completedAt: uiMessage.isStreaming ? undefined : uiMessage.timestamp.getTime(),
    },
  };
}

/**
 * Convert an array of UI messages to session messages
 *
 * @param uiMessages - Array of UI messages
 * @returns Array of session messages
 *
 * @example
 * ```typescript
 * const chatHistory = messagesState.messages;
 * const sessionMsgs = toSessionMessages(chatHistory);
 * ```
 */
export function toSessionMessages(uiMessages: readonly Message[]): readonly SessionMessage[] {
  return uiMessages.map(toSessionMessage);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Create a new UI message with generated ID and timestamp
 *
 * @param role - Message role
 * @param content - Message content
 * @param options - Optional additional properties
 * @returns New UI message
 */
export function createUIMessage(
  role: MessageRole,
  content: string,
  options: Partial<Omit<Message, "id" | "role" | "content" | "timestamp">> = {}
): Message {
  return {
    id: createId(),
    role,
    content,
    timestamp: new Date(),
    ...options,
  };
}

/**
 * Check if a session message contains tool calls
 *
 * @param sessionMessage - Session message to check
 * @returns True if message has tool calls
 */
export function sessionHasToolCalls(sessionMessage: SessionMessage): boolean {
  return sessionMessage.parts.some((part) => part.type === "tool");
}

/**
 * Check if a session message contains tool results
 *
 * @param sessionMessage - Session message to check
 * @returns True if message has tool results
 */
export function sessionHasToolResults(sessionMessage: SessionMessage): boolean {
  return sessionMessage.parts.some((part) => part.type === "tool_result");
}

/**
 * Get all tool IDs from a session message
 *
 * @param sessionMessage - Session message to extract from
 * @returns Array of tool call IDs
 */
export function getSessionToolIds(sessionMessage: SessionMessage): readonly string[] {
  return sessionMessage.parts
    .filter((part): part is SessionToolPart => part.type === "tool")
    .map((part) => part.id);
}
