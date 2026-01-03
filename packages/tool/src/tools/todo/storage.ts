/**
 * Todo session storage utilities
 *
 * Provides functions for persisting todo data within the session context.
 * Uses the ToolContext.sessionData mechanism for storage.
 */

import type { ToolContext } from "@vellum/core";
import type { SessionTodoData } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Storage key for todo data in session storage
 */
const TODO_STORAGE_KEY = "vellum:todos";

// =============================================================================
// Public API
// =============================================================================

/**
 * Get todo data from session storage
 *
 * Retrieves the current todo list from the session context.
 * Returns an empty list if no data exists.
 *
 * @param ctx - Tool execution context with session data
 * @returns The session todo data (initialized empty if not present)
 *
 * @example
 * ```typescript
 * const data = getTodoData(ctx);
 * console.log(data.todos); // Array of TodoItems or empty array
 * ```
 */
export function getTodoData(ctx: ToolContext): SessionTodoData {
  if (!ctx.sessionData) {
    return { todos: [] };
  }

  const data = ctx.sessionData[TODO_STORAGE_KEY];
  if (!data || typeof data !== "object") {
    return { todos: [] };
  }

  // Type guard: ensure it has a todos array
  const sessionData = data as Record<string, unknown>;
  if (!Array.isArray(sessionData.todos)) {
    return { todos: [] };
  }

  return { todos: sessionData.todos } as SessionTodoData;
}

/**
 * Save todo data to session storage
 *
 * Persists the provided todo data to the session context.
 * Creates the sessionData object if it doesn't exist.
 *
 * @param ctx - Tool execution context with session data
 * @param data - The todo data to persist
 *
 * @example
 * ```typescript
 * const data = getTodoData(ctx);
 * data.todos.push(newTodo);
 * saveTodoData(ctx, data);
 * ```
 */
export function saveTodoData(ctx: ToolContext, data: SessionTodoData): void {
  if (!ctx.sessionData) {
    ctx.sessionData = {};
  }

  ctx.sessionData[TODO_STORAGE_KEY] = data;
}

/**
 * Clear all todo data from session storage
 *
 * Removes all todos by setting an empty list.
 *
 * @param ctx - Tool execution context with session data
 *
 * @example
 * ```typescript
 * clearTodoData(ctx);
 * const data = getTodoData(ctx); // { todos: [] }
 * ```
 */
export function clearTodoData(ctx: ToolContext): void {
  saveTodoData(ctx, { todos: [] });
}
