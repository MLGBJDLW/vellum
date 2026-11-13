/**
 * Todo Manage Tool
 *
 * Manages the active session's TODO list.
 * Supports adding, listing, completing, deleting, and clearing tasks.
 *
 * @module builtin/todo-manage
 */

import { z } from "zod";
import { defineTool, fail, ok } from "../types/index.js";
import {
  getSessionTodoPath,
  type StoredSessionTodo,
  saveSessionTodos,
  withSessionTodoMutation,
} from "./todo-storage.js";

/**
 * Schema for todo_manage tool parameters
 */
export const todoManageParamsSchema = z.object({
  /** Action to perform on the TODO list */
  action: z
    .enum(["add", "list", "complete", "delete", "clear"])
    .describe("Action to perform: add, list, complete, delete, or clear"),
  /** TODO text (required for 'add' action) */
  text: z.string().optional().describe("TODO text (required for 'add' action)"),
  /** TODO ID (required for 'complete' and 'delete' actions) */
  id: z
    .union([z.number().int().positive(), z.string().min(1)])
    .optional()
    .describe("TODO ID (for complete/delete actions)"),
  /** Filter for listing (default: 'all') */
  filter: z
    .enum(["all", "pending", "completed"])
    .optional()
    .default("all")
    .describe("Filter for list action: all, pending, or completed"),
});

/** Inferred type for todo_manage parameters */
export type TodoManageParams = z.infer<typeof todoManageParamsSchema>;

/** Single TODO item */
export interface TodoItem {
  /** Unique identifier for the TODO */
  id: string | number;
  /** TODO text/description */
  text: string;
  /** Whether the TODO is completed */
  completed: boolean;
  /** ISO timestamp when TODO was created */
  createdAt: string;
  /** ISO timestamp when TODO was completed (if applicable) */
  completedAt?: string;
}

/** Output type for todo_manage tool */
export interface TodoManageOutput {
  /** Action that was performed */
  action: string;
  /** Message describing the result */
  message: string;
  /** Current TODO items (after action) */
  todos: TodoItem[];
  /** Number of items affected by the action */
  affected?: number;
}

function toManageItems(items: StoredSessionTodo[]): TodoItem[] {
  return items.map((item) => ({
    id: item.id,
    text: item.title,
    completed: item.status === "completed",
    createdAt: item.createdAt,
    completedAt: item.completedAt,
  }));
}

/**
 * Filter TODO items based on filter parameter
 */
function filterTodos(
  items: StoredSessionTodo[],
  filter: "all" | "pending" | "completed"
): StoredSessionTodo[] {
  switch (filter) {
    case "pending":
      return items.filter((item) => item.status !== "completed");
    case "completed":
      return items.filter((item) => item.status === "completed");
    default:
      return items;
  }
}

/**
 * Todo manage tool implementation
 *
 * Manages a TODO list scoped to the active session and workspace.
 * Provides add, list, complete, delete, and clear operations.
 *
 * @example
 * ```typescript
 * // Add a new TODO
 * const result = await todoManageTool.execute(
 *   { action: "add", text: "Implement feature X" },
 *   ctx
 * );
 *
 * // List pending TODOs
 * const result = await todoManageTool.execute(
 *   { action: "list", filter: "pending" },
 *   ctx
 * );
 *
 * // Complete a TODO
 * const result = await todoManageTool.execute(
 *   { action: "complete", id: 1 },
 *   ctx
 * );
 * ```
 */
export const todoManageTool = defineTool({
  name: "todo_manage",
  description:
    "Manage the current session's TODO list. Supports adding tasks, listing (with filters), marking complete, deleting, and clearing all. Other sessions keep separate plans.",
  parameters: todoManageParamsSchema,
  kind: "write",
  category: "productivity",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const { action, text, id, filter = "all" } = input;

    // Resolve file path
    const todoFilePath = getSessionTodoPath(ctx.workingDir, ctx.sessionId);

    // Check permission for write operations
    if (action !== "list") {
      const hasPermission = await ctx.checkPermission("write", todoFilePath);
      if (!hasPermission) {
        return fail(`Permission denied: cannot modify TODO list`);
      }
    }

    try {
      return await withSessionTodoMutation(ctx.workingDir, ctx.sessionId, async (storage) => {
        if (ctx.abortSignal.aborted) return fail("Operation was cancelled");
        switch (action) {
          case "add": {
            if (!text || text.trim().length === 0) {
              return fail("Text is required for 'add' action");
            }

            const now = new Date().toISOString();
            const newTodo: StoredSessionTodo = {
              id: storage.nextId++,
              title: text.trim(),
              status: "pending",
              createdAt: now,
              updatedAt: now,
            };

            storage.items.push(newTodo);
            await saveSessionTodos(ctx.workingDir, ctx.sessionId, storage);

            return ok({
              action: "add",
              message: `Added TODO #${newTodo.id}: "${newTodo.title}"`,
              todos: toManageItems(storage.items),
              affected: 1,
            });
          }

          case "list": {
            const filteredItems = filterTodos(storage.items, filter);

            return ok({
              action: "list",
              message: `Found ${filteredItems.length} ${filter === "all" ? "" : `${filter} `}TODO(s)`,
              todos: toManageItems(filteredItems),
            });
          }

          case "complete": {
            if (id === undefined) {
              return fail("ID is required for 'complete' action");
            }

            const todoIndex = storage.items.findIndex((item) => String(item.id) === String(id));
            if (todoIndex === -1) {
              return fail(`TODO #${id} not found`);
            }

            const todo = storage.items[todoIndex];
            if (!todo) {
              return fail(`TODO #${id} not found`);
            }
            if (todo.status === "completed") {
              return fail(`TODO #${id} is already completed`);
            }

            todo.status = "completed";
            todo.completedAt = new Date().toISOString();
            todo.updatedAt = todo.completedAt;
            await saveSessionTodos(ctx.workingDir, ctx.sessionId, storage);

            return ok({
              action: "complete",
              message: `Completed TODO #${id}: "${todo.title}"`,
              todos: toManageItems(storage.items),
              affected: 1,
            });
          }

          case "delete": {
            if (id === undefined) {
              return fail("ID is required for 'delete' action");
            }

            const deleteIndex = storage.items.findIndex((item) => String(item.id) === String(id));
            if (deleteIndex === -1) {
              return fail(`TODO #${id} not found`);
            }

            const deletedTodo = storage.items[deleteIndex];
            if (!deletedTodo) {
              return fail(`TODO #${id} not found`);
            }
            storage.items.splice(deleteIndex, 1);
            await saveSessionTodos(ctx.workingDir, ctx.sessionId, storage);

            return ok({
              action: "delete",
              message: `Deleted TODO #${id}: "${deletedTodo.title}"`,
              todos: toManageItems(storage.items),
              affected: 1,
            });
          }

          case "clear": {
            const count = storage.items.length;
            storage.items = [];
            storage.nextId = 1;
            await saveSessionTodos(ctx.workingDir, ctx.sessionId, storage);

            return ok({
              action: "clear",
              message: `Cleared ${count} TODO(s)`,
              todos: [],
              affected: count,
            });
          }

          default:
            return fail(`Unknown action: ${action}`);
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        return fail(`Failed to manage TODOs: ${error.message}`);
      }
      return fail("Unknown error while managing TODOs");
    }
  },

  shouldConfirm(input, _ctx) {
    // Destructive actions should require confirmation
    return input.action === "clear" || input.action === "delete";
  },
});
