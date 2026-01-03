/**
 * Update Todo List Tool (REQ-001)
 *
 * Manages a session-scoped todo list with add, update, remove, list, and clear operations.
 * Todos persist within the session context and support markdown checkbox format.
 */

import type { Tool, ToolContext, ToolResult } from "@vellum/core";
import { fail, ok } from "@vellum/core";
import { z } from "zod";
import { parseMarkdownTodos } from "./parser.js";
import { clearTodoData, getTodoData, saveTodoData } from "./storage.js";
import { type TodoItem, type TodoOperation, TodoOperationSchema } from "./types.js";

// =============================================================================
// Schemas
// =============================================================================

/**
 * Parameters schema for update_todo_list tool
 */
const UpdateTodoListParamsSchema = z.object({
  /** The operation to perform on the todo list */
  operation: TodoOperationSchema,
  /** For add: markdown or comma-separated items to add */
  items: z.string().optional(),
  /** For update/remove: ID of the item to modify */
  id: z.string().optional(),
  /** For update: new status to set */
  status: z.enum(["pending", "done", "skipped"]).optional(),
});

/** Inferred type for parameters */
type UpdateTodoListParams = z.infer<typeof UpdateTodoListParamsSchema>;

// =============================================================================
// Response Types
// =============================================================================

/**
 * Summary of todo list state
 */
interface TodoSummary {
  /** Total number of items */
  total: number;
  /** Number of pending items */
  pending: number;
  /** Number of completed items */
  done: number;
  /** Number of skipped items */
  skipped: number;
}

/**
 * Output structure for update_todo_list operations
 */
interface UpdateTodoListOutput {
  /** The operation that was performed */
  operation: TodoOperation;
  /** Current state of todos after operation */
  todos: TodoItem[];
  /** Summary counts */
  summary: TodoSummary;
  /** Optional message for the user */
  message?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate summary statistics for a list of todos
 *
 * @param todos - Array of todo items
 * @returns Summary with total and per-status counts
 */
function calculateSummary(todos: TodoItem[]): TodoSummary {
  return {
    total: todos.length,
    pending: todos.filter((t) => t.status === "pending").length,
    done: todos.filter((t) => t.status === "done").length,
    skipped: todos.filter((t) => t.status === "skipped").length,
  };
}

// =============================================================================
// Operation Handlers
// =============================================================================

/**
 * Handle 'add' operation - create new todo items
 *
 * AC-001-1: Creates items with unique IDs and status "pending"
 *
 * @param params - Tool parameters
 * @param ctx - Tool context
 * @returns Result with updated todos
 */
function handleAdd(
  params: UpdateTodoListParams,
  ctx: ToolContext
): ToolResult<UpdateTodoListOutput> {
  if (!params.items || params.items.trim() === "") {
    return fail("'items' parameter is required for add operation");
  }

  // Parse markdown todos (already creates unique IDs and proper status)
  const newTodos = parseMarkdownTodos(params.items);

  if (newTodos.length === 0) {
    return fail("No valid todo items found in input. Use markdown checkbox format: - [ ] Task");
  }

  // Get existing todos and merge
  const data = getTodoData(ctx);
  data.todos = [...data.todos, ...newTodos];
  saveTodoData(ctx, data);

  return ok({
    operation: "add" as TodoOperation,
    todos: data.todos,
    summary: calculateSummary(data.todos),
    message: `Added ${newTodos.length} item(s)`,
  });
}

/**
 * Handle 'update' operation - modify item status by ID
 *
 * AC-001-2: Modifies item status by ID
 *
 * @param params - Tool parameters
 * @param ctx - Tool context
 * @returns Result with updated todos
 */
function handleUpdate(
  params: UpdateTodoListParams,
  ctx: ToolContext
): ToolResult<UpdateTodoListOutput> {
  if (!params.id) {
    return fail("'id' parameter is required for update operation");
  }

  if (!params.status) {
    return fail("'status' parameter is required for update operation");
  }

  const data = getTodoData(ctx);
  const index = data.todos.findIndex((t) => t.id === params.id);

  if (index === -1) {
    return fail(`Todo item with id '${params.id}' not found`);
  }

  // Update the item
  const todo = data.todos[index];
  if (todo) {
    todo.status = params.status;
    // Set completedAt if status is done or skipped
    if (params.status === "done" || params.status === "skipped") {
      todo.completedAt = new Date().toISOString();
    } else {
      // Clear completedAt if reverting to pending
      todo.completedAt = undefined;
    }
  }

  saveTodoData(ctx, data);

  return ok({
    operation: "update" as TodoOperation,
    todos: data.todos,
    summary: calculateSummary(data.todos),
    message: `Updated item '${params.id}' to status '${params.status}'`,
  });
}

/**
 * Handle 'remove' operation - delete item by ID
 *
 * AC-001-3: Deletes item by ID
 *
 * @param params - Tool parameters
 * @param ctx - Tool context
 * @returns Result with updated todos
 */
function handleRemove(
  params: UpdateTodoListParams,
  ctx: ToolContext
): ToolResult<UpdateTodoListOutput> {
  if (!params.id) {
    return fail("'id' parameter is required for remove operation");
  }

  const data = getTodoData(ctx);
  const initialLength = data.todos.length;
  data.todos = data.todos.filter((t) => t.id !== params.id);

  if (data.todos.length === initialLength) {
    return fail(`Todo item with id '${params.id}' not found`);
  }

  saveTodoData(ctx, data);

  return ok({
    operation: "remove" as TodoOperation,
    todos: data.todos,
    summary: calculateSummary(data.todos),
    message: `Removed item '${params.id}'`,
  });
}

/**
 * Handle 'list' operation - return all items with summary
 *
 * AC-001-4: Returns all items with summary counts
 *
 * @param ctx - Tool context
 * @returns Result with all todos
 */
function handleList(ctx: ToolContext): ToolResult<UpdateTodoListOutput> {
  const data = getTodoData(ctx);

  return ok({
    operation: "list" as TodoOperation,
    todos: data.todos,
    summary: calculateSummary(data.todos),
    message: data.todos.length === 0 ? "Todo list is empty" : `Found ${data.todos.length} item(s)`,
  });
}

/**
 * Handle 'clear' operation - remove all items
 *
 * AC-001-5: Removes all items
 *
 * @param ctx - Tool context
 * @returns Result with empty todos
 */
function handleClear(ctx: ToolContext): ToolResult<UpdateTodoListOutput> {
  clearTodoData(ctx);

  return ok({
    operation: "clear" as TodoOperation,
    todos: [],
    summary: { total: 0, pending: 0, done: 0, skipped: 0 },
    message: "Todo list cleared",
  });
}

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * The update_todo_list tool for managing session-scoped todos
 *
 * Operations:
 * - add: Create new todo items from markdown checkbox format
 * - update: Modify an existing item's status by ID
 * - remove: Delete an item by ID
 * - list: Retrieve all items with summary counts
 * - clear: Remove all items
 *
 * @example
 * ```typescript
 * // Add items
 * await updateTodoListTool.execute({
 *   operation: "add",
 *   items: "- [ ] First task\n- [ ] Second task"
 * }, ctx);
 *
 * // Update item status
 * await updateTodoListTool.execute({
 *   operation: "update",
 *   id: "abc12345",
 *   status: "done"
 * }, ctx);
 *
 * // List all items
 * await updateTodoListTool.execute({
 *   operation: "list"
 * }, ctx);
 * ```
 */
export const updateTodoListTool: Tool<typeof UpdateTodoListParamsSchema, UpdateTodoListOutput> = {
  definition: {
    name: "update_todo_list",
    description:
      "Manage a session-scoped todo list. Operations: " +
      "'add' creates items from markdown (- [ ] task), " +
      "'update' modifies status by ID, " +
      "'remove' deletes by ID, " +
      "'list' returns all items with counts, " +
      "'clear' removes all items.",
    parameters: UpdateTodoListParamsSchema,
    kind: "task",
    category: "todo",
    enabled: true,
  },

  /**
   * Execute the update_todo_list tool
   *
   * Routes to appropriate handler based on operation.
   *
   * @param input - Validated input parameters
   * @param ctx - Tool execution context
   * @returns Promise resolving to the tool result
   */
  async execute(
    input: UpdateTodoListParams,
    ctx: ToolContext
  ): Promise<ToolResult<UpdateTodoListOutput>> {
    switch (input.operation) {
      case "add":
        return handleAdd(input, ctx);
      case "update":
        return handleUpdate(input, ctx);
      case "remove":
        return handleRemove(input, ctx);
      case "list":
        return handleList(ctx);
      case "clear":
        return handleClear(ctx);
      default:
        // AC-001-6: Invalid operation returns error
        return fail(`Invalid operation: ${String(input.operation)}`);
    }
  },

  /**
   * Check if this tool call requires user confirmation
   *
   * Clear operation requires confirmation as it's destructive.
   *
   * @param input - The input parameters
   * @param _ctx - Tool context (unused)
   * @returns Whether confirmation is required
   */
  shouldConfirm(input: UpdateTodoListParams, _ctx: ToolContext): boolean {
    // Clear operation is destructive, require confirmation
    return input.operation === "clear";
  },
};
