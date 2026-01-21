/**
 * Todo Write Tool
 *
 * Writes/updates the TODO list with optional merge functionality.
 * Follows the Cursor pattern where `merge=true` preserves existing items
 * while updating/adding specific ones.
 *
 * @module builtin/todo-write
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { defineTool, fail, ok } from "../types/index.js";

/** Path to the TODO storage file relative to working directory */
const TODO_FILE_PATH = ".vellum/todos.json";

/**
 * Status values for todo items (matches Cursor pattern)
 */
export const TodoStatusSchema = z.enum(["pending", "in-progress", "completed"]);

/** Inferred type for todo status */
export type TodoStatus = z.infer<typeof TodoStatusSchema>;

/**
 * Individual todo item schema
 */
export const TodoWriteItemSchema = z.object({
  /** Unique identifier for the todo item */
  id: z.union([z.string(), z.number()]).describe("Unique identifier for the todo item"),
  /** Task title/description */
  title: z.string().describe("Task title or description"),
  /** Current status of the task */
  status: TodoStatusSchema.describe("Current status: pending, in-progress, or completed"),
  /** Optional detailed description */
  description: z.string().optional().describe("Optional detailed description of the task"),
});

/** Inferred type for todo write item */
export type TodoWriteItem = z.infer<typeof TodoWriteItemSchema>;

/**
 * Schema for todo_write tool parameters
 */
export const todoWriteParamsSchema = z.object({
  /** Array of todos to write */
  todos: z.array(TodoWriteItemSchema).describe("Array of todo items to write"),
  /** When true, merge with existing todos instead of replacing */
  merge: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "When true, merge incoming todos with existing ones (update by ID, preserve others). When false, replace entire list."
    ),
});

/** Inferred type for todo_write parameters (after defaults applied) */
export type TodoWriteParams = z.infer<typeof todoWriteParamsSchema>;

/** Input type for todo_write parameters (before defaults applied) */
export type TodoWriteInput = z.input<typeof todoWriteParamsSchema>;

/**
 * Internal storage format for todo items
 * Extends TodoWriteItem with timestamps
 */
export interface StoredTodoItem extends TodoWriteItem {
  /** ISO timestamp when the todo was created */
  createdAt: string;
  /** ISO timestamp when the todo was last updated */
  updatedAt: string;
  /** ISO timestamp when the todo was completed (if applicable) */
  completedAt?: string;
}

/** Internal TODO storage structure */
interface TodoStorage {
  /** Array of stored TODO items */
  items: StoredTodoItem[];
}

/** Output type for todo_write tool */
export interface TodoWriteOutput {
  /** Number of items added */
  added: number;
  /** Number of items updated */
  updated: number;
  /** Total items in the list after operation */
  total: number;
  /** Current TODO items (after operation) */
  todos: StoredTodoItem[];
  /** Whether merge mode was used */
  merged: boolean;
}

/**
 * Load TODOs from storage file
 */
async function loadTodos(filePath: string): Promise<TodoStorage> {
  try {
    const content = await readFile(filePath, { encoding: "utf-8" });
    const data = JSON.parse(content) as TodoStorage;
    // Validate structure
    if (!Array.isArray(data.items)) {
      return { items: [] };
    }
    return data;
  } catch {
    // File doesn't exist or is invalid - return empty storage
    return { items: [] };
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
 * Normalize ID to string for consistent comparison
 */
function normalizeId(id: string | number): string {
  return String(id);
}

/**
 * Merge incoming todos with existing ones
 *
 * Rules:
 * 1. If ID exists in both: update the existing item
 * 2. If ID only in incoming: add as new item
 * 3. If ID only in existing: preserve it
 * 4. Sort by ID after merge
 */
function mergeTodos(
  existing: StoredTodoItem[],
  incoming: TodoWriteItem[]
): { items: StoredTodoItem[]; added: number; updated: number } {
  const now = new Date().toISOString();
  const existingMap = new Map<string, StoredTodoItem>();
  let added = 0;
  let updated = 0;

  // Build map of existing items
  for (const item of existing) {
    existingMap.set(normalizeId(item.id), item);
  }

  // Process incoming items
  for (const item of incoming) {
    const id = normalizeId(item.id);
    const existingItem = existingMap.get(id);

    if (existingItem) {
      // Update existing item
      const wasCompleted = existingItem.status === "completed";
      const nowCompleted = item.status === "completed";

      existingMap.set(id, {
        ...existingItem,
        title: item.title,
        status: item.status,
        description: item.description,
        updatedAt: now,
        // Set completedAt if transitioning to completed
        completedAt: nowCompleted && !wasCompleted ? now : existingItem.completedAt,
      });
      updated++;
    } else {
      // Add new item
      existingMap.set(id, {
        id: item.id,
        title: item.title,
        status: item.status,
        description: item.description,
        createdAt: now,
        updatedAt: now,
        completedAt: item.status === "completed" ? now : undefined,
      });
      added++;
    }
  }

  // Convert back to array and sort by ID
  const items = Array.from(existingMap.values()).sort((a, b) => {
    const idA = normalizeId(a.id);
    const idB = normalizeId(b.id);
    // Try numeric sort first
    const numA = Number(idA);
    const numB = Number(idB);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return numA - numB;
    }
    // Fall back to string sort
    return idA.localeCompare(idB);
  });

  return { items, added, updated };
}

/**
 * Replace all todos with incoming list
 */
function replaceTodos(incoming: TodoWriteItem[]): StoredTodoItem[] {
  const now = new Date().toISOString();

  return incoming.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    description: item.description,
    createdAt: now,
    updatedAt: now,
    completedAt: item.status === "completed" ? now : undefined,
  }));
}

/**
 * Todo write tool implementation
 *
 * Writes/updates the TODO list with optional merge functionality.
 * When merge=true, preserves existing items while updating/adding specific ones.
 * When merge=false (default), replaces the entire list.
 *
 * @example
 * ```typescript
 * // Replace entire list
 * const result = await todoWriteTool.execute(
 *   {
 *     todos: [
 *       { id: "1", title: "Task 1", status: "pending" },
 *       { id: "2", title: "Task 2", status: "completed" },
 *     ],
 *   },
 *   ctx
 * );
 *
 * // Merge with existing (update task 1, add task 3)
 * const result = await todoWriteTool.execute(
 *   {
 *     todos: [
 *       { id: "1", title: "Task 1 updated", status: "completed" },
 *       { id: "3", title: "Task 3", status: "pending" },
 *     ],
 *     merge: true,
 *   },
 *   ctx
 * );
 * ```
 */
export const todoWriteTool = defineTool({
  name: "todo_write",
  description: `Write or update the TODO list. Use merge=true to incrementally update (mark tasks complete, add new tasks) while preserving existing items. Use merge=false (default) to replace the entire list.

Best Practice (Cursor pattern):
- Before starting new work, use todo_write(merge=true) to mark completed tasks and add new ones
- This maintains task history and allows tracking progress across sessions`,
  parameters: todoWriteParamsSchema,
  kind: "write",
  category: "productivity",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const { todos, merge = false } = input;

    // Resolve file path
    const todoFilePath = join(ctx.workingDir, TODO_FILE_PATH);

    // Check permission
    const hasPermission = await ctx.checkPermission("write", todoFilePath);
    if (!hasPermission) {
      return fail(`Permission denied: cannot modify TODO list`);
    }

    try {
      let result: { items: StoredTodoItem[]; added: number; updated: number };

      if (merge) {
        // Merge mode: load existing and merge
        const storage = await loadTodos(todoFilePath);
        result = mergeTodos(storage.items, todos);
      } else {
        // Replace mode: just convert incoming todos
        const items = replaceTodos(todos);
        result = { items, added: items.length, updated: 0 };
      }

      // Save the result
      await saveTodos(todoFilePath, { items: result.items });

      return ok({
        added: result.added,
        updated: result.updated,
        total: result.items.length,
        todos: result.items,
        merged: merge,
      });
    } catch (error) {
      if (error instanceof Error) {
        return fail(`Failed to write TODOs: ${error.message}`);
      }
      return fail("Unknown error while writing TODOs");
    }
  },

  shouldConfirm(input, _ctx) {
    // Non-merge mode replaces everything, so should confirm
    return !input.merge;
  },
});
