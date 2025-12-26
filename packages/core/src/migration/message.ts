/**
 * Message Migration Helpers
 *
 * Provides utilities for migrating legacy message formats to the
 * new Vellum Message type system with typed content parts.
 *
 * @module migration/message
 */

import type { Message, MessageContent, Role } from "../types/index.js";
import { createMessage, Parts, ToolStates } from "../types/index.js";

// =============================================================================
// T115: Legacy Message Types
// =============================================================================

/**
 * Legacy content part structure (pre-Vellum format)
 *
 * Represents the various content types from older API formats
 * like OpenAI's function calling or legacy tool_call format.
 */
export interface LegacyContentPart {
  /** Type discriminator for the content part */
  type: string;
  /** Text content (for type: "text") */
  text?: string;
  /** Tool call ID (for type: "tool_call" or "tool_use") */
  id?: string;
  /** Tool name (for type: "tool_call" or "tool_use") */
  name?: string;
  /** Tool function details (OpenAI format) */
  function?: {
    name: string;
    arguments: string;
  };
  /** Tool input (Anthropic format) */
  input?: unknown;
  /** Tool call ID reference (for type: "tool_result") */
  tool_call_id?: string;
  /** Tool result content */
  content?: string | unknown;
  /** Image URL (for image content) */
  image_url?: {
    url: string;
  };
}

/**
 * Legacy message structure (pre-Vellum format)
 *
 * Represents message formats from older APIs including:
 * - OpenAI ChatCompletion format
 * - Anthropic Messages API format
 * - Legacy function calling format
 */
export interface LegacyMessage {
  /** Message role (system/user/assistant/function/tool) */
  role: string;
  /** Content - either string or array of content parts */
  content: string | LegacyContentPart[] | null;
  /** Optional function call (OpenAI legacy format) */
  function_call?: {
    name: string;
    arguments: string;
  };
  /** Optional tool calls array (OpenAI format) */
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  /** Tool call ID (for tool/function result messages) */
  tool_call_id?: string;
  /** Function name (for function result messages) */
  name?: string;
}

// =============================================================================
// T115: Migration Functions
// =============================================================================

/**
 * Normalize legacy role to Vellum Role type
 *
 * Maps various legacy role names to the standard system/user/assistant roles.
 *
 * @param legacyRole - The role string from the legacy message
 * @returns Normalized Role type
 */
function normalizeRole(legacyRole: string): Role {
  switch (legacyRole.toLowerCase()) {
    case "system":
      return "system";
    case "user":
    case "human":
      return "user";
    case "assistant":
    case "ai":
    case "bot":
    case "function":
    case "tool":
      return "assistant";
    default:
      return "user";
  }
}

/**
 * Parse tool arguments from string to object
 *
 * Safely parses JSON arguments, returning empty object on failure.
 *
 * @param args - JSON string of arguments
 * @returns Parsed object or empty object
 */
function parseToolArguments(args: string): unknown {
  try {
    return JSON.parse(args);
  } catch {
    return { raw: args };
  }
}

/**
 * Migrate a legacy content part to Vellum MessageContent
 *
 * @param part - Legacy content part
 * @returns Vellum MessageContent
 */
function migrateContentPart(part: LegacyContentPart): MessageContent {
  switch (part.type) {
    case "text":
      return Parts.text(part.text ?? "");

    case "tool_call":
    case "tool_use": {
      // Anthropic style: { type: "tool_use", id, name, input }
      const toolName = part.name ?? part.function?.name ?? "unknown";
      const toolCallId = part.id ?? crypto.randomUUID();
      const input =
        part.input ?? (part.function ? parseToolArguments(part.function.arguments) : {});
      return Parts.tool(toolName, toolCallId, input, ToolStates.pending());
    }

    case "tool_result": {
      // { type: "tool_result", tool_call_id, content }
      const toolCallId = part.tool_call_id ?? part.id ?? "";
      const output = part.content ?? "";
      // Check if it looks like an error
      const isError =
        typeof part.content === "string" &&
        (part.content.toLowerCase().includes("error") ||
          part.content.toLowerCase().includes("failed"));
      return Parts.toolResult(toolCallId, output, isError);
    }

    case "image_url":
    case "image": {
      const url = part.image_url?.url ?? "";
      const mimeType = inferImageMimeType(url);
      return Parts.image(url, undefined, mimeType);
    }

    default:
      // Unknown type, convert to text
      return Parts.text(JSON.stringify(part));
  }
}

/**
 * Infer image MIME type from URL
 *
 * @param url - Image URL or data URI
 * @returns MIME type string
 */
function inferImageMimeType(url: string): string {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+)/);
    return match?.[1] ?? "image/png";
  }
  const ext = url.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

/**
 * Migrate OpenAI-style tool calls from message to content parts
 *
 * @param toolCalls - Array of OpenAI tool call objects
 * @returns Array of ToolPart content
 */
function migrateToolCalls(toolCalls: NonNullable<LegacyMessage["tool_calls"]>): MessageContent[] {
  return toolCalls.map((tc) =>
    Parts.tool(
      tc.function.name,
      tc.id,
      parseToolArguments(tc.function.arguments),
      ToolStates.pending()
    )
  );
}

/**
 * Migrate a legacy message to Vellum Message format
 *
 * Handles various legacy formats:
 * - String content → TextPart array
 * - Array content → Mapped to appropriate part types
 * - OpenAI tool_calls → ToolPart array
 * - OpenAI function_call → ToolPart
 * - Tool result messages → ToolResultPart
 *
 * @param legacy - The legacy message to migrate
 * @returns A new Message in Vellum format
 *
 * @example
 * ```typescript
 * // String content
 * const msg = migrateMessage({ role: "user", content: "Hello" });
 * // → Message with [TextPart("Hello")]
 *
 * // Tool call
 * const msg = migrateMessage({
 *   role: "assistant",
 *   content: null,
 *   tool_calls: [{ id: "1", type: "function", function: { name: "read_file", arguments: '{"path":"/a.txt"}' } }]
 * });
 * // → Message with [ToolPart]
 * ```
 */
export function migrateMessage(legacy: LegacyMessage): Message {
  const role = normalizeRole(legacy.role);
  const content: MessageContent[] = [];

  // Check if this is a tool result message (role: "tool" or "function")
  // These messages have special handling and the content should not be duplicated as text
  const isToolResultMessage =
    (legacy.tool_call_id && legacy.role === "tool") || (legacy.role === "function" && legacy.name);

  // Handle string content (but not for tool result messages where content is the output)
  if (typeof legacy.content === "string" && legacy.content.length > 0 && !isToolResultMessage) {
    content.push(Parts.text(legacy.content));
  }

  // Handle array content
  if (Array.isArray(legacy.content)) {
    for (const part of legacy.content) {
      content.push(migrateContentPart(part));
    }
  }

  // Handle OpenAI tool_calls array
  if (legacy.tool_calls && legacy.tool_calls.length > 0) {
    content.push(...migrateToolCalls(legacy.tool_calls));
  }

  // Handle OpenAI function_call (legacy format)
  if (legacy.function_call) {
    const toolCallId = crypto.randomUUID();
    const input = parseToolArguments(legacy.function_call.arguments);
    content.push(Parts.tool(legacy.function_call.name, toolCallId, input, ToolStates.pending()));
  }

  // Handle tool result message (role: "tool" or has tool_call_id)
  if (legacy.tool_call_id && legacy.role === "tool") {
    const output = legacy.content ?? "";
    content.push(Parts.toolResult(legacy.tool_call_id, output));
  }

  // Handle function result message (legacy role: "function")
  if (legacy.role === "function" && legacy.name) {
    const toolCallId = legacy.tool_call_id ?? legacy.name;
    const output = legacy.content ?? "";
    content.push(Parts.toolResult(toolCallId, output));
  }

  // Ensure at least one content part exists
  if (content.length === 0) {
    content.push(Parts.text(""));
  }

  return createMessage(role, content);
}

/**
 * Batch migrate multiple legacy messages
 *
 * @param legacyMessages - Array of legacy messages
 * @returns Array of Vellum Messages
 */
export function migrateMessages(legacyMessages: LegacyMessage[]): Message[] {
  return legacyMessages.map(migrateMessage);
}

/**
 * Check if a message appears to be in legacy format
 *
 * @param message - Unknown message object
 * @returns True if the message looks like a legacy format
 */
export function isLegacyMessage(message: unknown): message is LegacyMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;

  // Must have role
  if (typeof msg.role !== "string") {
    return false;
  }

  // Legacy format indicators:
  // - content is string or array (not our MessageContent structure)
  // - has tool_calls, function_call, or tool_call_id
  if (
    typeof msg.content === "string" ||
    msg.tool_calls !== undefined ||
    msg.function_call !== undefined ||
    msg.tool_call_id !== undefined
  ) {
    return true;
  }

  // Check if content array has legacy structure (type: "text" with "text" property)
  if (Array.isArray(msg.content) && msg.content.length > 0) {
    const firstPart = msg.content[0] as Record<string, unknown>;
    // Legacy format has { type: "text", text: "..." }
    // Our format has { type: "text", content: "..." }
    if (firstPart.type === "text" && "text" in firstPart && !("content" in firstPart)) {
      return true;
    }
  }

  return false;
}
