/**
 * Todo tool type definitions and schemas
 *
 * Defines the core types for task management including status,
 * todo items, and operations.
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
export const TodoStatusSchema = z.enum(["pending", "done", "skipped"]);

/** Inferred type for todo status */
export type TodoStatus = z.infer<typeof TodoStatusSchema>;

// =============================================================================
// TodoItemSchema - Individual todo item
// =============================================================================

/**
 * Schema for a todo item
 *
 * Validates the structure of individual task entries.
 */
export const TodoItemSchema = z.object({
  /** Unique identifier for the todo item */
  id: z.string(),
  /** Task description/title */
  title: z.string(),
  /** Current status of the task */
  status: TodoStatusSchema,
  /** ISO timestamp when the task was created */
  createdAt: z.string().datetime(),
  /** ISO timestamp when the task was completed or skipped */
  completedAt: z.string().datetime().optional(),
});

/** Inferred type for todo item */
export type TodoItem = z.infer<typeof TodoItemSchema>;

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
  todos: TodoItem[];
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
export const TodoOperationSchema = z.enum(["add", "update", "remove", "list", "clear"]);

/** Inferred type for todo operations */
export type TodoOperation = z.infer<typeof TodoOperationSchema>;
