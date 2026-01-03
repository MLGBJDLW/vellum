/**
 * Integration tests for updateTodoListTool (REQ-001)
 *
 * Tests all 5 operations: add, update, remove, list, clear
 * with edge cases and error handling scenarios.
 */

import type { ToolContext } from "@vellum/core";
import { beforeEach, describe, expect, it } from "vitest";
import { updateTodoListTool } from "../update-todo-list.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a mock ToolContext for testing
 *
 * @param sessionData - Optional initial session data
 * @returns A minimal ToolContext suitable for integration tests
 */
function createMockContext(sessionData?: Record<string, unknown>): ToolContext {
  return { sessionData: sessionData ?? {} } as ToolContext;
}

// =============================================================================
// Integration Tests
// =============================================================================

describe("updateTodoListTool", () => {
  let ctx: ToolContext;

  beforeEach(() => {
    ctx = createMockContext();
  });

  // ===========================================================================
  // add operation (AC-001-1)
  // ===========================================================================

  describe("add operation", () => {
    it("adds items from markdown checkbox format", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] First task\n- [ ] Second task",
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.output.operation).toBe("add");
      expect(result.output.todos).toHaveLength(2);
      expect(result.output.todos[0]?.title).toBe("First task");
      expect(result.output.todos[0]?.status).toBe("pending");
      expect(result.output.todos[1]?.title).toBe("Second task");
      expect(result.output.todos[1]?.status).toBe("pending");
      expect(result.output.summary).toEqual({
        total: 2,
        pending: 2,
        done: 0,
        skipped: 0,
      });
      expect(result.output.message).toBe("Added 2 item(s)");
    });

    it("rejects plain text without markdown format", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "Task A, Task B, Task C",
        },
        ctx
      );

      // Plain comma-separated text is not valid markdown checkbox format
      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain("No valid todo items found");
    });

    it("creates unique IDs for each item", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3",
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      const ids = result.output.todos.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it("handles empty input (EC-001)", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "",
        },
        ctx
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain("'items' parameter is required");
    });

    it("handles whitespace-only input", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "   \n\t  ",
        },
        ctx
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain("'items' parameter is required");
    });

    it("handles missing items parameter", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "add",
        },
        ctx
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain("'items' parameter is required");
    });

    it("adds multiple items in single call (EC-007)", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] Item 1\n- [ ] Item 2\n- [ ] Item 3\n- [ ] Item 4\n- [ ] Item 5",
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.output.todos).toHaveLength(5);
      expect(result.output.summary.pending).toBe(5);
      expect(result.output.message).toBe("Added 5 item(s)");
    });

    it("accumulates items across multiple add operations", async () => {
      // First add
      await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] First batch",
        },
        ctx
      );

      // Second add
      const result = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] Second batch",
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.output.todos).toHaveLength(2);
      expect(result.output.todos[0]?.title).toBe("First batch");
      expect(result.output.todos[1]?.title).toBe("Second batch");
    });
  });

  // ===========================================================================
  // update operation (AC-001-2)
  // ===========================================================================

  describe("update operation", () => {
    it("updates item status to done", async () => {
      // Add an item first
      const addResult = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] Task to complete",
        },
        ctx
      );

      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const todoId = addResult.output.todos[0]?.id;

      // Update to done
      const updateResult = await updateTodoListTool.execute(
        {
          operation: "update",
          id: todoId,
          status: "done",
        },
        ctx
      );

      expect(updateResult.success).toBe(true);
      if (!updateResult.success) return;

      expect(updateResult.output.operation).toBe("update");
      expect(updateResult.output.todos[0]?.status).toBe("done");
      expect(updateResult.output.todos[0]?.completedAt).toBeDefined();
      expect(updateResult.output.summary.done).toBe(1);
      expect(updateResult.output.summary.pending).toBe(0);
    });

    it("updates item status to skipped", async () => {
      const addResult = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] Task to skip",
        },
        ctx
      );

      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const todoId = addResult.output.todos[0]?.id;

      const updateResult = await updateTodoListTool.execute(
        {
          operation: "update",
          id: todoId,
          status: "skipped",
        },
        ctx
      );

      expect(updateResult.success).toBe(true);
      if (!updateResult.success) return;

      expect(updateResult.output.todos[0]?.status).toBe("skipped");
      expect(updateResult.output.todos[0]?.completedAt).toBeDefined();
      expect(updateResult.output.summary.skipped).toBe(1);
    });

    it("clears completedAt when reverting to pending", async () => {
      const addResult = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] Task to revert",
        },
        ctx
      );

      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const todoId = addResult.output.todos[0]?.id;

      // Mark as done
      await updateTodoListTool.execute(
        {
          operation: "update",
          id: todoId,
          status: "done",
        },
        ctx
      );

      // Revert to pending
      const revertResult = await updateTodoListTool.execute(
        {
          operation: "update",
          id: todoId,
          status: "pending",
        },
        ctx
      );

      expect(revertResult.success).toBe(true);
      if (!revertResult.success) return;

      expect(revertResult.output.todos[0]?.status).toBe("pending");
      expect(revertResult.output.todos[0]?.completedAt).toBeUndefined();
    });

    it("returns error for non-existent ID (EC-008)", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "update",
          id: "non-existent-id",
          status: "done",
        },
        ctx
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain("not found");
    });

    it("returns error when id parameter is missing", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "update",
          status: "done",
        },
        ctx
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain("'id' parameter is required");
    });

    it("returns error when status parameter is missing", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "update",
          id: "some-id",
        },
        ctx
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain("'status' parameter is required");
    });
  });

  // ===========================================================================
  // remove operation (AC-001-3)
  // ===========================================================================

  describe("remove operation", () => {
    it("removes item by ID", async () => {
      // Add two items
      const addResult = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] Task 1\n- [ ] Task 2",
        },
        ctx
      );

      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const todoId = addResult.output.todos[0]?.id;

      // Remove first item
      const removeResult = await updateTodoListTool.execute(
        {
          operation: "remove",
          id: todoId,
        },
        ctx
      );

      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      expect(removeResult.output.operation).toBe("remove");
      expect(removeResult.output.todos).toHaveLength(1);
      expect(removeResult.output.todos[0]?.title).toBe("Task 2");
      expect(removeResult.output.message).toContain("Removed");
    });

    it("returns error for non-existent ID", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "remove",
          id: "non-existent-id",
        },
        ctx
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain("not found");
    });

    it("returns error when id parameter is missing", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "remove",
        },
        ctx
      );

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.error).toContain("'id' parameter is required");
    });
  });

  // ===========================================================================
  // list operation (AC-001-4)
  // ===========================================================================

  describe("list operation", () => {
    it("returns empty list when no items exist", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "list",
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.output.operation).toBe("list");
      expect(result.output.todos).toHaveLength(0);
      expect(result.output.summary).toEqual({
        total: 0,
        pending: 0,
        done: 0,
        skipped: 0,
      });
      expect(result.output.message).toBe("Todo list is empty");
    });

    it("returns all items with summary counts", async () => {
      // Add items
      const addResult = await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3",
        },
        ctx
      );

      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      // Update one to done
      await updateTodoListTool.execute(
        {
          operation: "update",
          id: addResult.output.todos[0]?.id,
          status: "done",
        },
        ctx
      );

      // Update one to skipped
      await updateTodoListTool.execute(
        {
          operation: "update",
          id: addResult.output.todos[1]?.id,
          status: "skipped",
        },
        ctx
      );

      // List all
      const listResult = await updateTodoListTool.execute(
        {
          operation: "list",
        },
        ctx
      );

      expect(listResult.success).toBe(true);
      if (!listResult.success) return;

      expect(listResult.output.todos).toHaveLength(3);
      expect(listResult.output.summary).toEqual({
        total: 3,
        pending: 1,
        done: 1,
        skipped: 1,
      });
      expect(listResult.output.message).toBe("Found 3 item(s)");
    });
  });

  // ===========================================================================
  // clear operation (AC-001-5)
  // ===========================================================================

  describe("clear operation", () => {
    it("removes all items", async () => {
      // Add items
      await updateTodoListTool.execute(
        {
          operation: "add",
          items: "- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3",
        },
        ctx
      );

      // Clear all
      const clearResult = await updateTodoListTool.execute(
        {
          operation: "clear",
        },
        ctx
      );

      expect(clearResult.success).toBe(true);
      if (!clearResult.success) return;

      expect(clearResult.output.operation).toBe("clear");
      expect(clearResult.output.todos).toHaveLength(0);
      expect(clearResult.output.summary).toEqual({
        total: 0,
        pending: 0,
        done: 0,
        skipped: 0,
      });
      expect(clearResult.output.message).toBe("Todo list cleared");
    });

    it("clears already empty list without error", async () => {
      const result = await updateTodoListTool.execute(
        {
          operation: "clear",
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.output.todos).toHaveLength(0);
      expect(result.output.message).toBe("Todo list cleared");
    });

    it("requires confirmation for clear operation", () => {
      const shouldConfirm = updateTodoListTool.shouldConfirm?.(
        {
          operation: "clear",
        },
        ctx
      );

      expect(shouldConfirm).toBe(true);
    });

    it("does not require confirmation for non-destructive operations", () => {
      expect(updateTodoListTool.shouldConfirm?.({ operation: "add" }, ctx)).toBe(false);
      expect(updateTodoListTool.shouldConfirm?.({ operation: "list" }, ctx)).toBe(false);
      expect(updateTodoListTool.shouldConfirm?.({ operation: "update" }, ctx)).toBe(false);
      expect(updateTodoListTool.shouldConfirm?.({ operation: "remove" }, ctx)).toBe(false);
    });
  });

  // ===========================================================================
  // Tool Definition Validation
  // ===========================================================================

  describe("tool definition", () => {
    it("has correct name and metadata", () => {
      expect(updateTodoListTool.definition.name).toBe("update_todo_list");
      expect(updateTodoListTool.definition.kind).toBe("task");
      expect(updateTodoListTool.definition.category).toBe("todo");
      expect(updateTodoListTool.definition.enabled).toBe(true);
    });

    it("has description mentioning all operations", () => {
      const description = updateTodoListTool.definition.description;
      expect(description).toContain("add");
      expect(description).toContain("update");
      expect(description).toContain("remove");
      expect(description).toContain("list");
      expect(description).toContain("clear");
    });
  });
});
