// ============================================
// Vellum Event Definitions
// Type-safe event definitions for the agent system
// ============================================

import { z } from "zod";
import { circuitClose, circuitHalfOpen, circuitOpen } from "../errors/circuit-breaker/index.js";
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
// T034 - Credential Events
// ============================================

/**
 * Emitted when a credential is successfully resolved.
 */
export const credentialResolved = defineEvent(
  "credential:resolved",
  z.object({
    /** Provider name (e.g., 'anthropic', 'openai') */
    provider: z.string(),
    /** Optional key identifier */
    key: z.string().optional(),
    /** Source where the credential was resolved from */
    source: z.enum(["env", "keychain", "encrypted_file", "config"]),
  })
);

/**
 * Emitted when a credential is stored.
 */
export const credentialStored = defineEvent(
  "credential:stored",
  z.object({
    /** Provider name (e.g., 'anthropic', 'openai') */
    provider: z.string(),
    /** Store where the credential was saved */
    store: z.enum(["env", "keychain", "encrypted_file", "config"]),
  })
);

/**
 * Emitted when a credential is rotated (old replaced with new).
 */
export const credentialRotated = defineEvent(
  "credential:rotated",
  z.object({
    /** Provider name (e.g., 'anthropic', 'openai') */
    provider: z.string(),
    /** Optional key identifier */
    key: z.string().optional(),
    /** Store where the rotation occurred */
    store: z.enum(["env", "keychain", "encrypted_file", "config"]),
  })
);

/**
 * Emitted when a credential lookup fails (not found in any store).
 */
export const credentialNotFound = defineEvent(
  "credential:notFound",
  z.object({
    /** Provider name that was searched */
    provider: z.string(),
    /** Optional key identifier that was searched */
    key: z.string().optional(),
    /** List of stores that were searched */
    searchedStores: z.array(z.enum(["env", "keychain", "encrypted_file", "config"])),
  })
);

// ============================================
// T029 - Agent Loop Events
// ============================================

/**
 * Agent state values for state change events.
 */
const AgentStateEnum = z.enum([
  "idle",
  "streaming",
  "tool_executing",
  "wait_permission",
  "wait_input",
  "paused",
  "recovering",
  "retry",
  "terminated",
  "shutdown",
]);

/**
 * Termination reason values.
 */
const TerminationReasonEnum = z.enum([
  "max_steps",
  "max_tokens",
  "max_time",
  "natural_stop",
  "text_only",
  "doom_loop",
  "llm_stuck",
  "cancelled",
  "error",
]);

/**
 * Emitted when the agent loop state changes.
 */
export const agentStateChange = defineEvent(
  "agent:stateChange",
  z.object({
    /** Previous state */
    from: AgentStateEnum,
    /** New state */
    to: AgentStateEnum,
    /** Session identifier */
    sessionId: z.string(),
    /** Timestamp of the transition */
    timestamp: z.number(),
  })
);

/**
 * Emitted when text is streamed from the LLM.
 */
export const agentText = defineEvent(
  "agent:text",
  z.object({
    /** Session identifier */
    sessionId: z.string(),
    /** The text chunk received */
    text: z.string(),
  })
);

/**
 * Emitted when thinking/reasoning content is streamed from the LLM.
 */
export const agentThinking = defineEvent(
  "agent:thinking",
  z.object({
    /** Session identifier */
    sessionId: z.string(),
    /** The thinking content received */
    text: z.string(),
  })
);

/**
 * Emitted when a tool execution starts in the agent loop.
 */
export const agentToolStart = defineEvent(
  "agent:toolStart",
  z.object({
    /** Session identifier */
    sessionId: z.string(),
    /** Unique identifier for this tool call */
    callId: z.string(),
    /** Name of the tool being executed */
    name: z.string(),
    /** Input parameters passed to the tool */
    input: z.record(z.unknown()),
  })
);

/**
 * Emitted when a tool execution completes in the agent loop.
 */
export const agentToolEnd = defineEvent(
  "agent:toolEnd",
  z.object({
    /** Session identifier */
    sessionId: z.string(),
    /** Unique identifier for this tool call */
    callId: z.string(),
    /** Name of the tool that was executed */
    name: z.string(),
    /** Whether the tool execution succeeded */
    success: z.boolean(),
    /** Duration of execution in milliseconds */
    durationMs: z.number().optional(),
  })
);

/**
 * Emitted when the agent loop is terminated.
 */
export const agentTerminated = defineEvent(
  "agent:terminated",
  z.object({
    /** Session identifier */
    sessionId: z.string(),
    /** Reason for termination */
    reason: TerminationReasonEnum,
    /** Number of steps executed */
    stepsExecuted: z.number().optional(),
    /** Total tokens consumed */
    tokensConsumed: z.number().optional(),
    /** Execution time in milliseconds */
    elapsedMs: z.number().optional(),
  })
);

/**
 * Emitted when graceful shutdown completes.
 */
export const agentShutdownComplete = defineEvent(
  "agent:shutdownComplete",
  z.object({
    /** Session identifier */
    sessionId: z.string(),
    /** Whether state was successfully persisted */
    stateSaved: z.boolean(),
    /** The signal that triggered shutdown (if any) */
    signal: z.enum(["SIGINT", "SIGTERM", "SIGQUIT"]).optional(),
    /** Exit code */
    exitCode: z.number(),
  })
);

// ============================================
// T010 - Git Snapshot Events
// ============================================

/**
 * Emitted when a git snapshot is created.
 */
export const gitSnapshotCreated = defineEvent(
  "git:snapshotCreated",
  z.object({
    /** The commit hash of the snapshot */
    hash: z.string(),
    /** Working directory where snapshot was created */
    workDir: z.string(),
    /** Number of files included in the snapshot */
    fileCount: z.number().optional(),
    /** Trigger that caused the snapshot (e.g., "auto", "manual", "tool") */
    trigger: z.string().optional(),
  })
);

/**
 * Emitted when a git snapshot is restored.
 */
export const gitSnapshotRestored = defineEvent(
  "git:snapshotRestored",
  z.object({
    /** The commit hash that was restored */
    hash: z.string(),
    /** Working directory where snapshot was restored */
    workDir: z.string(),
    /** Number of files affected by the restore */
    fileCount: z.number().optional(),
  })
);

/**
 * Emitted when a git snapshot is reverted (undo operation).
 */
export const gitSnapshotReverted = defineEvent(
  "git:snapshotReverted",
  z.object({
    /** The commit hash that was reverted */
    hash: z.string(),
    /** List of files that were reverted */
    files: z.array(z.string()),
    /** Working directory where revert occurred */
    workDir: z.string().optional(),
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

  // Credential events (T034)
  credentialResolved,
  credentialStored,
  credentialRotated,
  credentialNotFound,

  // Agent loop events (T029)
  agentStateChange,
  agentText,
  agentThinking,
  agentToolStart,
  agentToolEnd,
  agentTerminated,
  agentShutdownComplete,

  // Git snapshot events (T010)
  gitSnapshotCreated,
  gitSnapshotRestored,
  gitSnapshotReverted,

  // Circuit breaker events (T038)
  circuitOpen,
  circuitClose,
  circuitHalfOpen,
} as const;

/** Type helper for accessing event payload types */
export type EventPayload<T extends keyof typeof Events> = z.infer<(typeof Events)[T]["schema"]>;
