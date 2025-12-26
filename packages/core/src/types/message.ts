/**
 * Message-related type definitions and schemas
 *
 * Defines the core message structure including roles and part types
 * used throughout the agent loop.
 */

import { z } from "zod";

/**
 * Schema for message roles in a conversation
 *
 * - system: System-level instructions and context
 * - user: Human user messages
 * - assistant: AI assistant responses
 */
export const RoleSchema = z.enum(["system", "user", "assistant"]);

/** Inferred type for message roles */
export type Role = z.infer<typeof RoleSchema>;

/**
 * Base schema for all message parts
 *
 * Every part type extends this base with additional fields.
 * The `type` field acts as a discriminator for union types.
 */
export const PartBaseSchema = z.object({
  /** Discriminator field identifying the part type */
  type: z.string(),
  /** Optional unique identifier for the part */
  id: z.string().optional(),
});

/** Inferred type for the base part structure */
export type PartBase = z.infer<typeof PartBaseSchema>;

// =============================================================================
// T003: Tool State Schema (Discriminated Union)
// =============================================================================

/**
 * Schema for pending tool state - tool call queued, not yet started
 */
export const ToolStatePendingSchema = z.object({
  status: z.literal("pending"),
});

/**
 * Schema for running tool state - tool is currently executing
 */
export const ToolStateRunningSchema = z.object({
  status: z.literal("running"),
  /** Timestamp when tool execution started */
  startedAt: z.number(),
});

/**
 * Schema for completed tool state - tool finished successfully
 */
export const ToolStateCompletedSchema = z.object({
  status: z.literal("completed"),
  /** Timestamp when tool execution completed */
  completedAt: z.number(),
});

/**
 * Schema for error tool state - tool execution failed
 */
export const ToolStateErrorSchema = z.object({
  status: z.literal("error"),
  /** Error message describing the failure */
  error: z.string(),
  /** Timestamp when tool execution failed */
  failedAt: z.number(),
});

/**
 * Discriminated union schema for tool execution states
 *
 * Represents the lifecycle of a tool call:
 * - pending: queued but not started
 * - running: currently executing
 * - completed: finished successfully
 * - error: execution failed
 */
export const ToolStateSchema = z.discriminatedUnion("status", [
  ToolStatePendingSchema,
  ToolStateRunningSchema,
  ToolStateCompletedSchema,
  ToolStateErrorSchema,
]);

/** Inferred type for tool state */
export type ToolState = z.infer<typeof ToolStateSchema>;

// =============================================================================
// T004: Text Part and Tool Part Schemas
// =============================================================================

/**
 * Schema for text content parts
 *
 * Represents plain text content in a message.
 */
export const TextPartSchema = z.object({
  /** Discriminator identifying this as a text part */
  type: z.literal("text"),
  /** Optional unique identifier for the part */
  id: z.string().optional(),
  /** The text content */
  content: z.string(),
});

/** Inferred type for text parts */
export type TextPart = z.infer<typeof TextPartSchema>;

/**
 * Schema for tool call parts
 *
 * Represents a tool invocation request from the assistant.
 */
export const ToolPartSchema = z.object({
  /** Discriminator identifying this as a tool part */
  type: z.literal("tool"),
  /** Optional unique identifier for the part */
  id: z.string().optional(),
  /** Name of the tool being called */
  toolName: z.string(),
  /** Unique identifier for this tool call (for matching with results) */
  toolCallId: z.string(),
  /** Input parameters passed to the tool */
  input: z.unknown(),
  /** Current execution state of the tool */
  state: ToolStateSchema,
});

/** Inferred type for tool parts */
export type ToolPart = z.infer<typeof ToolPartSchema>;

// =============================================================================
// T005: Tool Result Part and Reasoning Part Schemas
// =============================================================================

/**
 * Schema for tool result parts
 *
 * Represents the output from a completed tool execution.
 */
export const ToolResultPartSchema = z.object({
  /** Discriminator identifying this as a tool result part */
  type: z.literal("tool-result"),
  /** Optional unique identifier for the part */
  id: z.string().optional(),
  /** ID of the tool call this result corresponds to */
  toolCallId: z.string(),
  /** Output data from the tool execution */
  output: z.unknown(),
  /** Whether the output represents an error condition */
  isError: z.boolean().optional(),
});

/** Inferred type for tool result parts */
export type ToolResultPart = z.infer<typeof ToolResultPartSchema>;

/**
 * Schema for reasoning parts
 *
 * Represents the assistant's chain-of-thought reasoning.
 */
export const ReasoningPartSchema = z.object({
  /** Discriminator identifying this as a reasoning part */
  type: z.literal("reasoning"),
  /** Optional unique identifier for the part */
  id: z.string().optional(),
  /** The reasoning content */
  content: z.string(),
});

/** Inferred type for reasoning parts */
export type ReasoningPart = z.infer<typeof ReasoningPartSchema>;

// =============================================================================
// T006: File Part and Image Part Schemas
// =============================================================================

/**
 * Schema for file parts
 *
 * Represents a file reference or inline file content in a message.
 */
export const FilePartSchema = z.object({
  /** Discriminator identifying this as a file part */
  type: z.literal("file"),
  /** Optional unique identifier for the part */
  id: z.string().optional(),
  /** Path to the file */
  path: z.string(),
  /** MIME type of the file content */
  mimeType: z.string().optional(),
  /** Inline file content (if loaded) */
  content: z.string().optional(),
});

/** Inferred type for file parts */
export type FilePart = z.infer<typeof FilePartSchema>;

/**
 * Schema for image parts
 *
 * Represents an image in a message, either by URL or base64-encoded data.
 */
export const ImagePartSchema = z.object({
  /** Discriminator identifying this as an image part */
  type: z.literal("image"),
  /** Optional unique identifier for the part */
  id: z.string().optional(),
  /** URL to the image (if externally hosted) */
  url: z.string().optional(),
  /** Base64-encoded image data (if inline) */
  base64: z.string().optional(),
  /** MIME type of the image (e.g., 'image/png', 'image/jpeg') */
  mimeType: z.string(),
});

/** Inferred type for image parts */
export type ImagePart = z.infer<typeof ImagePartSchema>;

// =============================================================================
// T007: MessageContentSchema Discriminated Union
// =============================================================================

/**
 * Discriminated union schema for all message content part types
 *
 * Uses the 'type' field as discriminator to identify which part schema applies.
 * Supports: text, tool, tool-result, reasoning, file, image
 */
export const MessageContentSchema = z.discriminatedUnion("type", [
  TextPartSchema,
  ToolPartSchema,
  ToolResultPartSchema,
  ReasoningPartSchema,
  FilePartSchema,
  ImagePartSchema,
]);

/** Inferred union type for message content */
export type MessageContent = z.infer<typeof MessageContentSchema>;

// =============================================================================
// T008: MessageSchema and createMessage Factory
// =============================================================================

/**
 * Schema for a complete message in the conversation
 *
 * Messages are the atomic units of conversation, containing one or more
 * content parts and metadata about the message.
 */
export const MessageSchema = z.object({
  /** Unique identifier for the message */
  id: z.string(),
  /** Role of the message sender */
  role: RoleSchema,
  /** Array of content parts making up the message */
  content: z.array(MessageContentSchema),
  /** ISO timestamp when the message was created */
  createdAt: z.string(),
  /** Optional arbitrary metadata */
  metadata: z.record(z.unknown()).optional(),
});

/** Inferred type for messages */
export type Message = z.infer<typeof MessageSchema>;

/**
 * Factory function to create a validated Message object
 *
 * Automatically generates a unique ID and timestamp.
 *
 * @param role - The role of the message sender
 * @param content - Array of message content parts
 * @param metadata - Optional arbitrary metadata
 * @returns A validated Message object
 */
export function createMessage(
  role: Role,
  content: MessageContent[],
  metadata?: Record<string, unknown>
): Message {
  const message: Message = {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...(metadata !== undefined && { metadata }),
  };
  return MessageSchema.parse(message);
}

// =============================================================================
// T009: Parts Factory Object
// =============================================================================

/**
 * Factory object for creating message content parts
 *
 * Provides convenience methods for creating each part type with
 * automatic ID generation.
 */
export const Parts = {
  /**
   * Create a text content part
   * @param content - The text content
   * @returns A validated TextPart
   */
  text(content: string): TextPart {
    return TextPartSchema.parse({
      type: "text",
      id: crypto.randomUUID(),
      content,
    });
  },

  /**
   * Create a tool call part
   * @param toolName - Name of the tool being called
   * @param toolCallId - Unique ID for the tool call
   * @param input - Input parameters for the tool
   * @param state - Optional tool state (defaults to pending)
   * @returns A validated ToolPart
   */
  tool(toolName: string, toolCallId: string, input: unknown, state?: ToolState): ToolPart {
    return ToolPartSchema.parse({
      type: "tool",
      id: crypto.randomUUID(),
      toolName,
      toolCallId,
      input,
      state: state ?? ToolStates.pending(),
    });
  },

  /**
   * Create a tool result part
   * @param toolCallId - ID of the tool call this result corresponds to
   * @param output - Output data from the tool
   * @param isError - Whether the output represents an error
   * @returns A validated ToolResultPart
   */
  toolResult(toolCallId: string, output: unknown, isError?: boolean): ToolResultPart {
    return ToolResultPartSchema.parse({
      type: "tool-result",
      id: crypto.randomUUID(),
      toolCallId,
      output,
      ...(isError !== undefined && { isError }),
    });
  },

  /**
   * Create a reasoning part
   * @param content - The reasoning content
   * @returns A validated ReasoningPart
   */
  reasoning(content: string): ReasoningPart {
    return ReasoningPartSchema.parse({
      type: "reasoning",
      id: crypto.randomUUID(),
      content,
    });
  },

  /**
   * Create a file part
   * @param path - Path to the file
   * @param mimeType - Optional MIME type
   * @param content - Optional inline file content
   * @returns A validated FilePart
   */
  file(path: string, mimeType?: string, content?: string): FilePart {
    return FilePartSchema.parse({
      type: "file",
      id: crypto.randomUUID(),
      path,
      ...(mimeType !== undefined && { mimeType }),
      ...(content !== undefined && { content }),
    });
  },

  /**
   * Create an image part
   * @param url - Optional URL to the image
   * @param base64 - Optional base64-encoded image data
   * @param mimeType - MIME type of the image
   * @returns A validated ImagePart
   */
  image(url: string | undefined, base64: string | undefined, mimeType: string): ImagePart {
    return ImagePartSchema.parse({
      type: "image",
      id: crypto.randomUUID(),
      ...(url !== undefined && { url }),
      ...(base64 !== undefined && { base64 }),
      mimeType,
    });
  },
};

// =============================================================================
// T010: ToolStates Helper Object
// =============================================================================

/**
 * Helper object for creating tool state objects
 *
 * Provides factory methods for each tool state with automatic timestamp generation.
 */
export const ToolStates = {
  /**
   * Create a pending tool state
   * @returns A pending ToolState
   */
  pending(): ToolState {
    return ToolStatePendingSchema.parse({ status: "pending" });
  },

  /**
   * Create a running tool state with current timestamp
   * @returns A running ToolState with startedAt set to now
   */
  running(): ToolState {
    return ToolStateRunningSchema.parse({
      status: "running",
      startedAt: Date.now(),
    });
  },

  /**
   * Create a completed tool state with current timestamp
   * @returns A completed ToolState with completedAt set to now
   */
  completed(): ToolState {
    return ToolStateCompletedSchema.parse({
      status: "completed",
      completedAt: Date.now(),
    });
  },

  /**
   * Create an error tool state with message and current timestamp
   * @param message - Error message describing the failure
   * @returns An error ToolState with error and failedAt set
   */
  error(message: string): ToolState {
    return ToolStateErrorSchema.parse({
      status: "error",
      error: message,
      failedAt: Date.now(),
    });
  },
};
