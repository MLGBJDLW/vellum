// ============================================
// Session Types and Schemas
// ============================================

/**
 * Session type definitions and Zod schemas for session management.
 *
 * Provides comprehensive types for session state, metadata, and checkpoints
 * to enable persistent session storage and restoration.
 *
 * @module @vellum/core/session/types
 */

import { createId } from "@vellum/shared";
import { z } from "zod";
import { type SessionMessage, SessionMessageSchema } from "./message.js";

// =============================================================================
// Session Status Enum
// =============================================================================

/**
 * Status of a session lifecycle
 *
 * - `active`: Session is currently in use
 * - `paused`: Session is temporarily suspended
 * - `completed`: Session has finished normally
 * - `archived`: Session is stored for reference but not active
 */
export const SessionStatusSchema = z.enum(["active", "paused", "completed", "archived"]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

// =============================================================================
// Session Mode Enum
// =============================================================================

/**
 * Operating mode of a session
 *
 * - `chat`: General conversation mode
 * - `code`: Code generation and editing mode
 * - `plan`: Planning and task breakdown mode
 * - `debug`: Debugging and troubleshooting mode
 * - `draft`: Draft/preview mode for reviewing changes
 */
export const SessionModeSchema = z.enum(["chat", "code", "plan", "debug", "draft"]);

export type SessionMode = z.infer<typeof SessionModeSchema>;

// =============================================================================
// Session Metadata Schema
// =============================================================================

/**
 * Metadata for a session
 *
 * Contains all the descriptive and tracking information about a session
 * without the actual message content.
 */
export const SessionMetadataSchema = z.object({
  /** Unique session identifier (UUID) */
  id: z.string().uuid(),
  /** Human-readable session title */
  title: z.string(),
  /** Timestamp when session was created */
  createdAt: z.coerce.date(),
  /** Timestamp when session was last modified */
  updatedAt: z.coerce.date(),
  /** Timestamp of last user activity */
  lastActive: z.coerce.date(),
  /** Current session status */
  status: SessionStatusSchema,
  /** Current operating mode */
  mode: SessionModeSchema,
  /** User-defined tags for categorization */
  tags: z.array(z.string()),
  /** Working directory path for the session */
  workingDirectory: z.string(),
  /** Total token count across all messages */
  tokenCount: z.number().int().nonnegative(),
  /** Total number of messages in session */
  messageCount: z.number().int().nonnegative(),
  /** Optional AI-generated summary of the session */
  summary: z.string().optional(),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

// =============================================================================
// Session Checkpoint Schema
// =============================================================================

/**
 * Checkpoint for session state restoration
 *
 * Represents a snapshot point in the session that can be used
 * for rollback or branching. May include a git snapshot hash
 * for full workspace state restoration.
 */
export const SessionCheckpointSchema = z.object({
  /** Unique checkpoint identifier */
  id: z.string(),
  /** Parent session identifier */
  sessionId: z.string().uuid(),
  /** Index of the message at this checkpoint */
  messageIndex: z.number().int().nonnegative(),
  /** Git snapshot hash for workspace state (T026) */
  snapshotHash: z.string().optional(),
  /** Timestamp when checkpoint was created */
  createdAt: z.coerce.date(),
  /** Optional description of what this checkpoint represents */
  description: z.string().optional(),
});

export type SessionCheckpoint = z.infer<typeof SessionCheckpointSchema>;

// =============================================================================
// Session Schema
// =============================================================================

/**
 * Complete session data structure
 *
 * Contains all session information including metadata, messages,
 * and checkpoints for full session state management.
 */
export const SessionSchema = z.object({
  /** Session metadata */
  metadata: SessionMetadataSchema,
  /** Array of session messages */
  messages: z.array(SessionMessageSchema),
  /** Array of session checkpoints for restoration */
  checkpoints: z.array(SessionCheckpointSchema),
});

export type Session = z.infer<typeof SessionSchema>;

// =============================================================================
// Factory Function Options
// =============================================================================

/**
 * Options for creating a new session
 */
export interface CreateSessionOptions {
  /** Optional session ID (auto-generated if not provided) */
  id?: string;
  /** Session title (defaults to "New Session") */
  title?: string;
  /** Initial session mode (defaults to "chat") */
  mode?: SessionMode;
  /** Working directory path (defaults to current directory) */
  workingDirectory?: string;
  /** Initial tags */
  tags?: string[];
  /** Initial messages to include */
  messages?: SessionMessage[];
}

/**
 * Options for creating a checkpoint
 */
export interface CreateCheckpointOptions {
  /** Optional checkpoint ID (auto-generated if not provided) */
  id?: string;
  /** Git snapshot hash */
  snapshotHash?: string;
  /** Checkpoint description */
  description?: string;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Creates a new session with sensible defaults
 *
 * @param options - Optional configuration for the new session
 * @returns A new Session object with initialized metadata
 *
 * @example
 * ```typescript
 * const session = createSession({
 *   title: "Code Review",
 *   mode: "code",
 *   workingDirectory: "/path/to/project"
 * });
 * ```
 */
export function createSession(options: CreateSessionOptions = {}): Session {
  const now = new Date();
  const id = options.id ?? createId();
  const messages = options.messages ?? [];

  return {
    metadata: {
      id,
      title: options.title ?? "New Session",
      createdAt: now,
      updatedAt: now,
      lastActive: now,
      status: "active",
      mode: options.mode ?? "chat",
      tags: options.tags ?? [],
      workingDirectory: options.workingDirectory ?? process.cwd(),
      tokenCount: 0,
      messageCount: messages.length,
      summary: undefined,
    },
    messages,
    checkpoints: [],
  };
}

/**
 * Creates a checkpoint for the given session
 *
 * @param session - The session to create a checkpoint for
 * @param options - Optional configuration for the checkpoint
 * @returns A new SessionCheckpoint object
 *
 * @example
 * ```typescript
 * const checkpoint = createCheckpoint(session, {
 *   description: "Before refactoring",
 *   snapshotHash: "abc123"
 * });
 * ```
 */
export function createCheckpoint(
  session: Session,
  options: CreateCheckpointOptions = {}
): SessionCheckpoint {
  return {
    id: options.id ?? createId(),
    sessionId: session.metadata.id,
    messageIndex: session.messages.length,
    snapshotHash: options.snapshotHash,
    createdAt: new Date(),
    description: options.description,
  };
}

/**
 * Adds a checkpoint to a session (immutably)
 *
 * @param session - The session to add the checkpoint to
 * @param checkpoint - The checkpoint to add
 * @returns A new Session with the checkpoint added
 */
export function addCheckpoint(session: Session, checkpoint: SessionCheckpoint): Session {
  return {
    ...session,
    metadata: {
      ...session.metadata,
      updatedAt: new Date(),
    },
    checkpoints: [...session.checkpoints, checkpoint],
  };
}

/**
 * Updates session metadata (immutably)
 *
 * @param session - The session to update
 * @param updates - Partial metadata updates
 * @returns A new Session with updated metadata
 */
export function updateSessionMetadata(
  session: Session,
  updates: Partial<Omit<SessionMetadata, "id" | "createdAt">>
): Session {
  return {
    ...session,
    metadata: {
      ...session.metadata,
      ...updates,
      updatedAt: new Date(),
    },
  };
}

/**
 * Adds a message to a session (immutably)
 *
 * @param session - The session to add the message to
 * @param message - The message to add
 * @returns A new Session with the message added and counts updated
 */
export function addMessage(session: Session, message: SessionMessage): Session {
  const tokenCount =
    session.metadata.tokenCount +
    (message.metadata.tokens?.input ?? 0) +
    (message.metadata.tokens?.output ?? 0);

  return {
    ...session,
    metadata: {
      ...session.metadata,
      updatedAt: new Date(),
      lastActive: new Date(),
      tokenCount,
      messageCount: session.messages.length + 1,
    },
    messages: [...session.messages, message],
  };
}
