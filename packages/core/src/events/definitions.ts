// ============================================
// Vellum Event Definitions
// Type-safe event definitions for the agent system
// ============================================

import { z } from "zod";
import { MessageContentSchema, MessageSchema, ToolStateSchema } from "../types/message.js";
import { defineEvent } from "./bus.js";

// ============================================
// T051 - Message Events
// ============================================

/**
 * Emitted when a new message is created in the conversation.
 */
export const messageCreated = defineEvent(
  "message:created",
  z.object({
    /** The newly created message */
    message: MessageSchema,
  })
);

/**
 * Emitted when an existing message is updated (e.g., streaming content).
 */
export const messageUpdated = defineEvent(
  "message:updated",
  z.object({
    /** The updated message with new content */
    message: MessageSchema,
    /** Previous content before the update (for diffing) */
    previousContent: MessageContentSchema.array().optional(),
  })
);

// ============================================
// T052 - Tool Events
// ============================================

/**
 * Emitted when a tool execution begins.
 */
export const toolStart = defineEvent(
  "tool:start",
  z.object({
    /** Unique identifier for this tool call */
    callId: z.string(),
    /** Name of the tool being executed */
    name: z.string(),
    /** Input parameters passed to the tool */
    input: z.unknown(),
  })
);

/**
 * Emitted when a tool's execution state changes.
 */
export const toolStateChange = defineEvent(
  "tool:stateChange",
  z.object({
    /** Unique identifier for this tool call */
    callId: z.string(),
    /** New state of the tool execution */
    state: ToolStateSchema,
  })
);

/**
 * Emitted when a tool execution completes (success or failure).
 */
export const toolEnd = defineEvent(
  "tool:end",
  z.object({
    /** Unique identifier for this tool call */
    callId: z.string(),
    /** Result from the tool execution */
    result: z.unknown(),
    /** Duration of execution in milliseconds */
    durationMs: z.number(),
  })
);

// ============================================
// T053 - Stream Events
// ============================================

/**
 * Emitted for each token received during streaming.
 */
export const streamToken = defineEvent(
  "stream:token",
  z.object({
    /** ID of the message being streamed */
    messageId: z.string(),
    /** The token/chunk received */
    token: z.string(),
  })
);

/**
 * Emitted when streaming ends.
 */
export const streamEnd = defineEvent(
  "stream:end",
  z.object({
    /** ID of the message that was being streamed */
    messageId: z.string(),
    /** Reason the stream ended */
    reason: z.enum(["complete", "cancelled", "error"]),
  })
);

// ============================================
// T054 - Session and Error Events
// ============================================

/**
 * Emitted when a new agent session starts.
 */
export const sessionStart = defineEvent(
  "session:start",
  z.object({
    /** Unique identifier for the session */
    sessionId: z.string(),
    /** ISO timestamp when the session started */
    startedAt: z.string(),
  })
);

/**
 * Emitted when an agent session ends.
 */
export const sessionEnd = defineEvent(
  "session:end",
  z.object({
    /** Unique identifier for the session */
    sessionId: z.string(),
    /** ISO timestamp when the session ended */
    endedAt: z.string(),
    /** Reason the session ended */
    reason: z.enum(["complete", "cancelled", "error"]),
  })
);

/**
 * Emitted when an error occurs in the agent system.
 */
export const errorEvent = defineEvent(
  "error",
  z.object({
    /** The error that occurred */
    error: z.instanceof(Error),
    /** Additional context about where/why the error occurred */
    context: z.record(z.unknown()).optional(),
  })
);

// ============================================
// Events Object - Unified Export
// ============================================

/**
 * All event definitions for the Vellum agent system.
 *
 * @example
 * ```typescript
 * import { Events } from '@vellum/core/events';
 *
 * bus.on(Events.messageCreated, (payload) => {
 *   console.log('New message:', payload.message.id);
 * });
 *
 * bus.emit(Events.toolStart, {
 *   callId: 'call_123',
 *   name: 'read_file',
 *   input: { path: '/example.txt' }
 * });
 * ```
 */
export const Events = {
  // Message events
  messageCreated,
  messageUpdated,

  // Tool events
  toolStart,
  toolStateChange,
  toolEnd,

  // Stream events
  streamToken,
  streamEnd,

  // Session events
  sessionStart,
  sessionEnd,

  // Error events
  error: errorEvent,
} as const;

/** Type helper for accessing event payload types */
export type EventPayload<T extends keyof typeof Events> = z.infer<(typeof Events)[T]["schema"]>;
