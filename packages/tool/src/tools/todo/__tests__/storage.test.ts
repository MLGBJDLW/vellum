/**
 * Storage unit tests
 *
 * Tests for todo session storage utilities.
 * Covers REQ-004: Session storage operations.
 */

import type { ToolContext } from "@vellum/core";
import { describe, expect, it } from "vitest";
import { clearTodoData, getTodoData, saveTodoData } from "../storage.js";
import type { TodoItem } from "../types.js";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a mock ToolContext for testing
 *
 * @param sessionData - Optional initial session data
 * @returns A minimal ToolContext suitable for storage tests
 */
function createMockContext(sessionData?: Record<string, unknown>): ToolContext {
  return { sessionData: sessionData ?? {} } as ToolContext;
}

/**
 * Creates a test TodoItem
 *
 * @param overrides - Optional property overrides
 * @returns A valid TodoItem for testing
 */
function createTestTodo(overrides?: Partial<TodoItem>): TodoItem {
  const now = new Date().toISOString();
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "Test task",
    status: "pending",
    createdAt: now,
    ...overrides,
  };
}

// =============================================================================
// getTodoData Tests
// =============================================================================

describe("getTodoData", () => {
  it("returns empty todos when no data exists", () => {
    const ctx = createMockContext();
    const data = getTodoData(ctx);

    expect(data).toEqual({ todos: [] });
  });

  it("returns empty todos when sessionData is undefined", () => {
    const ctx = { sessionData: undefined } as unknown as ToolContext;
    const data = getTodoData(ctx);

    expect(data).toEqual({ todos: [] });
  });

  it("returns empty todos when storage key is missing", () => {
    const ctx = createMockContext({ otherKey: "value" });
    const data = getTodoData(ctx);

    expect(data).toEqual({ todos: [] });
  });

  it("returns empty todos when stored data is not an object", () => {
    const ctx = createMockContext({ "vellum:todos": "invalid" });
    const data = getTodoData(ctx);

    expect(data).toEqual({ todos: [] });
  });

  it("returns empty todos when todos property is not an array", () => {
    const ctx = createMockContext({ "vellum:todos": { todos: "not an array" } });
    const data = getTodoData(ctx);

    expect(data).toEqual({ todos: [] });
  });

  it("returns stored todos when valid data exists", () => {
    const testTodo = createTestTodo({ title: "Stored task" });
    const ctx = createMockContext({
      "vellum:todos": { todos: [testTodo] },
    });

    const data = getTodoData(ctx);

    expect(data.todos).toHaveLength(1);
    expect(data.todos[0]).toEqual(testTodo);
  });

  it("returns multiple stored todos", () => {
    const todos = [
      createTestTodo({ id: "1", title: "First task" }),
      createTestTodo({ id: "2", title: "Second task", status: "done" }),
      createTestTodo({ id: "3", title: "Third task", status: "skipped" }),
    ];
    const ctx = createMockContext({ "vellum:todos": { todos } });

    const data = getTodoData(ctx);

    expect(data.todos).toHaveLength(3);
    expect(data.todos).toEqual(todos);
  });
});

// =============================================================================
// saveTodoData Tests
// =============================================================================

describe("saveTodoData", () => {
  it("saves todos to session storage", () => {
    const ctx = createMockContext();
    const testTodo = createTestTodo({ title: "New task" });

    saveTodoData(ctx, { todos: [testTodo] });

    expect(ctx.sessionData).toBeDefined();
    expect(ctx.sessionData!["vellum:todos"]).toEqual({ todos: [testTodo] });
  });

  it("creates sessionData if it does not exist", () => {
    const ctx = { sessionData: undefined } as unknown as ToolContext;
    const testTodo = createTestTodo();

    saveTodoData(ctx, { todos: [testTodo] });

    expect(ctx.sessionData).toBeDefined();
    expect(ctx.sessionData!["vellum:todos"]).toEqual({ todos: [testTodo] });
  });

  it("overwrites existing todo data", () => {
    const oldTodo = createTestTodo({ id: "old", title: "Old task" });
    const newTodo = createTestTodo({ id: "new", title: "New task" });
    const ctx = createMockContext({ "vellum:todos": { todos: [oldTodo] } });

    saveTodoData(ctx, { todos: [newTodo] });

    const data = getTodoData(ctx);
    expect(data.todos).toHaveLength(1);
    expect(data.todos[0]!.id).toBe("new");
    expect(data.todos[0]!.title).toBe("New task");
  });

  it("preserves other session data", () => {
    const ctx = createMockContext({ otherKey: "preserved value" });
    const testTodo = createTestTodo();

    saveTodoData(ctx, { todos: [testTodo] });

    expect(ctx.sessionData!["otherKey"]).toBe("preserved value");
  });

  it("allows saving empty todos array", () => {
    const ctx = createMockContext();

    saveTodoData(ctx, { todos: [] });

    expect(ctx.sessionData!["vellum:todos"]).toEqual({ todos: [] });
  });
});

// =============================================================================
// clearTodoData Tests
// =============================================================================

describe("clearTodoData", () => {
  it("clears all todos", () => {
    const todos = [
      createTestTodo({ id: "1", title: "First" }),
      createTestTodo({ id: "2", title: "Second" }),
    ];
    const ctx = createMockContext({ "vellum:todos": { todos } });

    clearTodoData(ctx);

    const data = getTodoData(ctx);
    expect(data.todos).toHaveLength(0);
  });

  it("works when no todos exist", () => {
    const ctx = createMockContext();

    // Should not throw
    expect(() => clearTodoData(ctx)).not.toThrow();

    const data = getTodoData(ctx);
    expect(data.todos).toHaveLength(0);
  });

  it("preserves other session data when clearing", () => {
    const ctx = createMockContext({
      "vellum:todos": { todos: [createTestTodo()] },
      otherKey: "should remain",
    });

    clearTodoData(ctx);

    expect(ctx.sessionData!["otherKey"]).toBe("should remain");
    expect(getTodoData(ctx).todos).toHaveLength(0);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("storage integration", () => {
  it("round-trips through save and get", () => {
    const ctx = createMockContext();
    const todos = [
      createTestTodo({ id: "a", title: "Task A", status: "pending" }),
      createTestTodo({ id: "b", title: "Task B", status: "done" }),
      createTestTodo({ id: "c", title: "Task C", status: "skipped" }),
    ];

    saveTodoData(ctx, { todos });
    const retrieved = getTodoData(ctx);

    expect(retrieved.todos).toEqual(todos);
  });

  it("supports multiple save/clear cycles", () => {
    const ctx = createMockContext();

    // First cycle
    saveTodoData(ctx, { todos: [createTestTodo({ title: "First batch" })] });
    expect(getTodoData(ctx).todos).toHaveLength(1);

    // Clear
    clearTodoData(ctx);
    expect(getTodoData(ctx).todos).toHaveLength(0);

    // Second cycle
    saveTodoData(ctx, {
      todos: [
        createTestTodo({ title: "Second batch 1" }),
        createTestTodo({ title: "Second batch 2" }),
      ],
    });
    expect(getTodoData(ctx).todos).toHaveLength(2);
  });
});
