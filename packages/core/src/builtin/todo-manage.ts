/**
 * Todo Manage Tool
 *
 * Manages a simple TODO list stored in .vellum/todos.json.
 * Supports adding, listing, completing, deleting, and clearing tasks.
 *
 * @module builtin/todo-manage
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { defineTool, fail, ok } from "../types/index.js";

/** Path to the TODO storage file relative to working directory */
const TODO_FILE_PATH = ".vellum/todos.json";

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
  id: z.number().int().positive().optional().describe("TODO ID (for complete/delete actions)"),
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
  id: number;
  /** TODO text/description */
  text: string;
  /** Whether the TODO is completed */
  completed: boolean;
  /** ISO timestamp when TODO was created */
  createdAt: string;
  /** ISO timestamp when TODO was completed (if applicable) */
  completedAt?: string;
}

/** Internal TODO storage structure */
interface TodoStorage {
  /** Next ID to assign */
  nextId: number;
  /** Array of TODO items */
  items: TodoItem[];
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

/**
 * Load TODOs from storage file
 */
async function loadTodos(filePath: string): Promise<TodoStorage> {
  try {
    const content = await readFile(filePath, { encoding: "utf-8" });
    const data = JSON.parse(content) as TodoStorage;
    // Validate structure
    if (typeof data.nextId !== "number" || !Array.isArray(data.items)) {
      return { nextId: 1, items: [] };
    }
    return data;
  } catch {
    // File doesn't exist or is invalid - return empty storage
    return { nextId: 1, items: [] };
  }
}

/**
 * Save TODOs to storage file
 */
async function saveTodos(filePath: string, storage: TodoStorage): Promise<void> {
  // Ensure directory exists
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  // Write with pretty formatting for readability
  await writeFile(filePath, JSON.stringify(storage, null, 2), { encoding: "utf-8" });
}

/**
 * Filter TODO items based on filter parameter
 */
function filterTodos(items: TodoItem[], filter: "all" | "pending" | "completed"): TodoItem[] {
  switch (filter) {
    case "pending":
      return items.filter((item) => !item.completed);
    case "completed":
      return items.filter((item) => item.completed);
    default:
      return items;
  }
}

/**
 * Todo manage tool implementation
 *
 * Manages a TODO list stored in .vellum/todos.json.
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
    "Manage a TODO list. Supports adding tasks, listing (with filters), marking complete, deleting, and clearing all. TODOs are stored in .vellum/todos.json.",
  parameters: todoManageParamsSchema,
  kind: "write",
  category: "productivity",

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Todo operations require comprehensive action handling
  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const { action, text, id, filter = "all" } = input;

    // Resolve file path
    const todoFilePath = join(ctx.workingDir, TODO_FILE_PATH);

    // Check permission for write operations
    if (action !== "list") {
      const hasPermission = await ctx.checkPermission("write", todoFilePath);
      if (!hasPermission) {
        return fail(`Permission denied: cannot modify TODO list`);
      }
    }

    // Load current TODOs
    const storage = await loadTodos(todoFilePath);

    try {
      switch (action) {
        case "add": {
          if (!text || text.trim().length === 0) {
            return fail("Text is required for 'add' action");
          }

          const newTodo: TodoItem = {
            id: storage.nextId++,
            text: text.trim(),
            completed: false,
            createdAt: new Date().toISOString(),
          };

          storage.items.push(newTodo);
          await saveTodos(todoFilePath, storage);

          return ok({
            action: "add",
            message: `Added TODO #${newTodo.id}: "${newTodo.text}"`,
            todos: storage.items,
            affected: 1,
          });
        }

        case "list": {
          const filteredItems = filterTodos(storage.items, filter);

          return ok({
            action: "list",
            message: `Found ${filteredItems.length} ${filter === "all" ? "" : `${filter} `}TODO(s)`,
            todos: filteredItems,
          });
        }

        case "complete": {
          if (id === undefined) {
            return fail("ID is required for 'complete' action");
          }

          const todoIndex = storage.items.findIndex((item) => item.id === id);
          if (todoIndex === -1) {
            return fail(`TODO #${id} not found`);
          }

          const todo = storage.items[todoIndex];
          if (!todo) {
            return fail(`TODO #${id} not found`);
          }
          if (todo.completed) {
            return fail(`TODO #${id} is already completed`);
          }

          todo.completed = true;
          todo.completedAt = new Date().toISOString();
          await saveTodos(todoFilePath, storage);

          return ok({
            action: "complete",
            message: `Completed TODO #${id}: "${todo.text}"`,
            todos: storage.items,
            affected: 1,
          });
        }

        case "delete": {
          if (id === undefined) {
            return fail("ID is required for 'delete' action");
          }

          const deleteIndex = storage.items.findIndex((item) => item.id === id);
          if (deleteIndex === -1) {
            return fail(`TODO #${id} not found`);
          }

          const deletedTodo = storage.items[deleteIndex];
          if (!deletedTodo) {
            return fail(`TODO #${id} not found`);
          }
          storage.items.splice(deleteIndex, 1);
          await saveTodos(todoFilePath, storage);

          return ok({
            action: "delete",
            message: `Deleted TODO #${id}: "${deletedTodo.text}"`,
            todos: storage.items,
            affected: 1,
          });
        }

        case "clear": {
          const count = storage.items.length;
          storage.items = [];
          storage.nextId = 1;
          await saveTodos(todoFilePath, storage);

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
