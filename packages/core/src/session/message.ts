// ============================================
// Session Message Types for LLM Format
// ============================================

/**
 * Session-specific message types and converters for the agent loop.
 *
 * These types build upon the core message types but add session-specific
 * functionality like conversion to provider format.
 *
 * @module @vellum/core/session/message
 */

import type {
  CompletionMessage,
  ContentPart,
  TextContentPart,
  ToolResultContentPart,
  ToolUseContentPart,
} from "@vellum/provider";
import { createId } from "@vellum/shared";
import { z } from "zod";

// =============================================================================
// Session Message Part Schemas (Session-specific)
// =============================================================================

/**
 * Session text content part
 */
export const SessionTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export type SessionTextPart = z.infer<typeof SessionTextPartSchema>;

/**
 * Session tool call part
 */
export const SessionToolPartSchema = z.object({
  type: z.literal("tool"),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});

export type SessionToolPart = z.infer<typeof SessionToolPartSchema>;

/**
 * Session tool result part
 */
export const SessionToolResultPartSchema = z.object({
  type: z.literal("tool_result"),
  toolId: z.string(),
  content: z.union([z.string(), z.unknown()]),
  isError: z.boolean().optional(),
});

export type SessionToolResultPart = z.infer<typeof SessionToolResultPartSchema>;

/**
 * Session reasoning/thinking content part
 */
export const SessionReasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
});

export type SessionReasoningPart = z.infer<typeof SessionReasoningPartSchema>;

/**
 * Session file attachment part
 */
export const SessionFilePartSchema = z.object({
  type: z.literal("file"),
  url: z.string(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
});

export type SessionFilePart = z.infer<typeof SessionFilePartSchema>;

/**
 * Session image content part
 */
export const SessionImagePartSchema = z.object({
  type: z.literal("image"),
  source: z.string(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
});

export type SessionImagePart = z.infer<typeof SessionImagePartSchema>;

/**
 * Union of all session message part types
 */
export const SessionMessagePartSchema = z.discriminatedUnion("type", [
  SessionTextPartSchema,
  SessionToolPartSchema,
  SessionToolResultPartSchema,
  SessionReasoningPartSchema,
  SessionFilePartSchema,
  SessionImagePartSchema,
]);

export type SessionMessagePart = z.infer<typeof SessionMessagePartSchema>;

// =============================================================================
// Session Message Schemas
// =============================================================================

/**
 * Role of the message sender
 */
export const SessionRoleSchema = z.enum(["user", "assistant", "system", "tool_result"]);
export type SessionRole = z.infer<typeof SessionRoleSchema>;

/**
 * Session message metadata
 */
export const SessionMessageMetadataSchema = z.object({
  /** Session ID this message belongs to */
  sessionId: z.string().optional(),
  /** Timestamp when message was created */
  createdAt: z.number(),
  /** Timestamp when message was completed (for streaming) */
  completedAt: z.number().optional(),
  /** Model used for generation (assistant messages) */
  model: z.string().optional(),
  /** Provider used for generation */
  provider: z.string().optional(),
  /** Token usage statistics */
  tokens: z
    .object({
      input: z.number(),
      output: z.number(),
      reasoning: z.number().optional(),
      cacheRead: z.number().optional(),
      cacheWrite: z.number().optional(),
    })
    .optional(),
  /** Cost in USD */
  cost: z.number().optional(),
  /** Additional metadata */
  extra: z.record(z.unknown()).optional(),
});

export type SessionMessageMetadata = z.infer<typeof SessionMessageMetadataSchema>;

/**
 * Session message schema with part-based content
 */
export const SessionMessageSchema = z.object({
  /** Unique message identifier */
  id: z.string(),
  /** Role of the message sender */
  role: SessionRoleSchema,
  /** Array of content parts */
  parts: z.array(SessionMessagePartSchema),
  /** Message metadata */
  metadata: SessionMessageMetadataSchema,
  /** T026: Git snapshot hash taken before tool execution (if any) */
  preToolSnapshot: z.string().optional(),
  /** T026: List of files changed by tool execution (if any) */
  changedFiles: z.array(z.string()).optional(),
});

export type SessionMessage = z.infer<typeof SessionMessageSchema>;

// =============================================================================
// Part Constructors
// =============================================================================

/**
 * Part constructors for convenient message building
 */
export const SessionParts = {
  /**
   * Create a text part
   */
  text(text: string): SessionTextPart {
    return { type: "text", text };
  },

  /**
   * Create a tool call part
   */
  tool(id: string, name: string, input: Record<string, unknown>): SessionToolPart {
    return { type: "tool", id, name, input };
  },

  /**
   * Create a tool result part
   */
  toolResult(toolId: string, content: string | unknown, isError?: boolean): SessionToolResultPart {
    return { type: "tool_result", toolId, content, isError };
  },

  /**
   * Create a reasoning part
   */
  reasoning(text: string, startedAt?: number, completedAt?: number): SessionReasoningPart {
    return { type: "reasoning", text, startedAt, completedAt };
  },

  /**
   * Create a file part
   */
  file(url: string, filename?: string, mimeType?: string): SessionFilePart {
    return { type: "file", url, filename, mimeType };
  },

  /**
   * Create an image part
   */
  image(source: string, mimeType: SessionImagePart["mimeType"]): SessionImagePart {
    return { type: "image", source, mimeType };
  },
} as const;

// =============================================================================
// Message Constructors
// =============================================================================

/**
 * Create a user message
 *
 * @param parts - Content parts for the message
 * @param metadata - Optional additional metadata
 * @returns User message object
 *
 * @example
 * ```typescript
 * const msg = createUserMessage([SessionParts.text('Hello!')]);
 * ```
 */
export function createUserMessage(
  parts: SessionMessagePart[],
  metadata?: Partial<Omit<SessionMessageMetadata, "createdAt">>
): SessionMessage {
  return {
    id: createId(),
    role: "user",
    parts,
    metadata: {
      ...metadata,
      createdAt: Date.now(),
    },
  };
}

/**
 * Create an assistant message
 *
 * @param parts - Content parts for the message
 * @param metadata - Optional additional metadata (model, tokens, etc.)
 * @returns Assistant message object
 *
 * @example
 * ```typescript
 * const msg = createAssistantMessage(
 *   [SessionParts.text('Hello! How can I help?')],
 *   { model: 'claude-sonnet-4-20250514', tokens: { input: 10, output: 8 } }
 * );
 * ```
 */
export function createAssistantMessage(
  parts: SessionMessagePart[],
  metadata?: Partial<Omit<SessionMessageMetadata, "createdAt">>
): SessionMessage {
  return {
    id: createId(),
    role: "assistant",
    parts,
    metadata: {
      ...metadata,
      createdAt: Date.now(),
    },
  };
}

/**
 * Create a system message
 *
 * @param text - System prompt text
 * @returns System message object
 */
export function createSystemMessage(text: string): SessionMessage {
  return {
    id: createId(),
    role: "system",
    parts: [SessionParts.text(text)],
    metadata: {
      createdAt: Date.now(),
    },
  };
}

/**
 * Create a tool result message
 *
 * @param toolId - ID of the tool call this responds to
 * @param content - Result content
 * @param isError - Whether the result is an error
 * @returns Tool result message object
 */
export function createToolResultMessage(
  toolId: string,
  content: string | unknown,
  isError?: boolean
): SessionMessage {
  return {
    id: createId(),
    role: "tool_result",
    parts: [SessionParts.toolResult(toolId, content, isError)],
    metadata: {
      createdAt: Date.now(),
    },
  };
}

// =============================================================================
// Message Converters
// =============================================================================

/**
 * Convert a SessionMessagePart to provider ContentPart format
 *
 * @param part - Message part to convert
 * @returns Provider content part or undefined if not convertible
 */
function partToContentPart(part: SessionMessagePart): ContentPart | undefined {
  switch (part.type) {
    case "text":
      return {
        type: "text",
        text: part.text,
      } satisfies TextContentPart;

    case "tool":
      return {
        type: "tool_use",
        id: part.id,
        name: part.name,
        input: part.input,
      } satisfies ToolUseContentPart;

    case "tool_result":
      return {
        type: "tool_result",
        toolUseId: part.toolId,
        content: typeof part.content === "string" ? part.content : JSON.stringify(part.content),
        isError: part.isError,
      } satisfies ToolResultContentPart;

    case "image":
      return {
        type: "image",
        source: part.source,
        mimeType: part.mimeType,
      };

    // Reasoning and file parts are not directly convertible to provider format
    case "reasoning":
    case "file":
      return undefined;
  }
}

/**
 * Convert a SessionMessage to provider CompletionMessage format
 *
 * @param message - Message to convert
 * @returns Provider completion message
 */
function messageToCompletionMessage(message: SessionMessage): CompletionMessage {
  // Handle tool_result role specially - convert to user message
  const role = message.role === "tool_result" ? "user" : message.role;

  // Convert parts, filtering out non-convertible ones
  const contentParts = message.parts
    .map(partToContentPart)
    .filter((p): p is ContentPart => p !== undefined);

  // If only one text part, use simple string content
  const firstPart = contentParts[0];
  if (contentParts.length === 1 && firstPart && firstPart.type === "text") {
    return {
      role,
      content: firstPart.text,
    };
  }

  // Use array content for multi-part messages
  return {
    role,
    content: contentParts,
  };
}

/**
 * Convert an array of SessionMessages to provider CompletionMessage format
 *
 * Handles:
 * - Role normalization (tool_result -> user)
 * - Part filtering (removes non-convertible parts)
 * - Content simplification (single text -> string)
 *
 * @param messages - Messages to convert
 * @returns Array of provider completion messages
 *
 * @example
 * ```typescript
 * const messages = [
 *   createUserMessage([SessionParts.text('Hello!')]),
 *   createAssistantMessage([SessionParts.text('Hi there!')]),
 * ];
 *
 * const providerMessages = toModelMessages(messages);
 * // [
 * //   { role: 'user', content: 'Hello!' },
 * //   { role: 'assistant', content: 'Hi there!' },
 * // ]
 * ```
 */
export function toModelMessages(messages: SessionMessage[]): CompletionMessage[] {
  return messages.map(messageToCompletionMessage);
}

/**
 * Extract text content from a message
 *
 * @param message - Message to extract from
 * @returns Concatenated text content
 */
export function getTextContent(message: SessionMessage): string {
  return message.parts
    .filter((p): p is SessionTextPart => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/**
 * Extract tool calls from a message
 *
 * @param message - Message to extract from
 * @returns Array of tool parts
 */
export function getToolCalls(message: SessionMessage): SessionToolPart[] {
  return message.parts.filter((p): p is SessionToolPart => p.type === "tool");
}

/**
 * Extract reasoning content from a message
 *
 * @param message - Message to extract from
 * @returns Concatenated reasoning content or undefined
 */
export function getReasoningContent(message: SessionMessage): string | undefined {
  const reasoningParts = message.parts.filter(
    (p): p is SessionReasoningPart => p.type === "reasoning"
  );
  if (reasoningParts.length === 0) {
    return undefined;
  }
  return reasoningParts.map((p) => p.text).join("");
}

/**
 * Check if a message has any tool calls
 *
 * @param message - Message to check
 * @returns True if message contains tool calls
 */
export function hasToolCalls(message: SessionMessage): boolean {
  return message.parts.some((p) => p.type === "tool");
}

/**
 * Check if a message has any tool results
 *
 * @param message - Message to check
 * @returns True if message contains tool results
 */
export function hasToolResults(message: SessionMessage): boolean {
  return message.parts.some((p) => p.type === "tool_result");
}
