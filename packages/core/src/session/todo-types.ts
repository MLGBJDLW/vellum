/**
 * Session Todo Types (migrated from @vellum/tool)
 *
 * Types for session-based task management. These differ from the builtin
 * TodoItem type in that they use a status enum instead of a boolean.
 *
 * @module session/todo-types
 */

import { z } from "zod";

// =============================================================================
// TodoStatusSchema - Status values for todo items
// =============================================================================

/**
 * Schema for todo item status
 *
 * - pending: Task is waiting to be done
 * - done: Task has been completed
 * - skipped: Task was skipped/cancelled
 */
export const SessionTodoStatusSchema = z.enum(["pending", "done", "skipped"]);

/** Inferred type for todo status */
export type SessionTodoStatus = z.infer<typeof SessionTodoStatusSchema>;

// =============================================================================
// TodoItemSchema - Individual todo item
// =============================================================================

/**
 * Schema for a session todo item
 *
 * Validates the structure of individual task entries.
 * Note: This differs from the builtin TodoItem which uses `completed: boolean`
 * and `text: string`. This type uses `status` enum and `title`.
 */
export const SessionTodoItemSchema = z.object({
  /** Unique identifier for the todo item */
  id: z.string(),
  /** Task description/title */
  title: z.string(),
  /** Current status of the task */
  status: SessionTodoStatusSchema,
  /** ISO timestamp when the task was created */
  createdAt: z.string().datetime(),
  /** ISO timestamp when the task was completed or skipped */
  completedAt: z.string().datetime().optional(),
});

/** Inferred type for session todo item */
export type SessionTodoItem = z.infer<typeof SessionTodoItemSchema>;

// =============================================================================
// SessionTodoData - Session storage structure
// =============================================================================

/**
 * Interface for session-scoped todo data storage
 *
 * Used with ToolContext.sessionData for persisting todos across tool calls.
 */
export interface SessionTodoData {
  /** Array of todo items in the session */
  todos: SessionTodoItem[];
}

// =============================================================================
// TodoOperationSchema - Available operations
// =============================================================================

/**
 * Schema for todo operations
 *
 * - add: Create a new todo item
 * - update: Modify an existing todo item's status
 * - remove: Delete a todo item
 * - list: Retrieve all todo items
 * - clear: Remove all todo items
 */
export const SessionTodoOperationSchema = z.enum(["add", "update", "remove", "list", "clear"]);

/** Inferred type for todo operations */
export type SessionTodoOperation = z.infer<typeof SessionTodoOperationSchema>;
