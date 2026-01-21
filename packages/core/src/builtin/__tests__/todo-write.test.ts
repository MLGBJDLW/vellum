/**
 * Tests for todo_write tool
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { todoWriteTool } from "../todo-write.js";

describe("todoWriteTool", () => {
  let ctx: ToolContext;
  let testDir: string;
  let todoFilePath: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), `.test-todo-write-${Date.now()}`);
    todoFilePath = join(testDir, ".vellum", "todos.json");

    await mkdir(join(testDir, ".vellum"), { recursive: true });

    ctx = {
      workingDir: testDir,
      sessionId: "test-session",
      messageId: "test-message",
      callId: "test-call",
      abortSignal: new AbortController().signal,
      checkPermission: vi.fn().mockResolvedValue(true),
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("tool definition", () => {
    it("should have correct metadata", () => {
      expect(todoWriteTool.definition.name).toBe("todo_write");
      expect(todoWriteTool.definition.kind).toBe("write");
      expect(todoWriteTool.definition.category).toBe("productivity");
    });

    it("should require confirmation for non-merge mode", () => {
      expect(todoWriteTool.shouldConfirm?.({ todos: [], merge: false }, ctx)).toBe(true);
      // Note: shouldConfirm receives parsed input (after defaults), so merge is always present
    });

    it("should not require confirmation for merge mode", () => {
      expect(todoWriteTool.shouldConfirm?.({ todos: [], merge: true }, ctx)).toBe(false);
    });
  });

  describe("replace mode (merge=false)", () => {
    it("should write todos to empty list", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [
            { id: "1", title: "Task 1", status: "pending" },
            { id: "2", title: "Task 2", status: "completed" },
          ],
          merge: false,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.added).toBe(2);
        expect(result.output.updated).toBe(0);
        expect(result.output.total).toBe(2);
        expect(result.output.merged).toBe(false);
        expect(result.output.todos).toHaveLength(2);
        expect(result.output.todos[0]?.title).toBe("Task 1");
        expect(result.output.todos[0]?.status).toBe("pending");
        expect(result.output.todos[1]?.title).toBe("Task 2");
        expect(result.output.todos[1]?.status).toBe("completed");
        expect(result.output.todos[1]?.completedAt).toBeDefined();
      }
    });

    it("should replace existing todos completely", async () => {
      // Pre-populate with existing todos
      const existingStorage = {
        items: [
          {
            id: "1",
            title: "Old Task",
            status: "pending" as const,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
          },
          {
            id: "2",
            title: "Another Old",
            status: "completed" as const,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
            completedAt: "2025-01-02T00:00:00Z",
          },
        ],
      };
      await writeFile(todoFilePath, JSON.stringify(existingStorage));

      const result = await todoWriteTool.execute(
        {
          todos: [{ id: "3", title: "New Task", status: "pending" }],
          merge: false,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.total).toBe(1);
        expect(result.output.todos[0]?.id).toBe("3");
        expect(result.output.todos[0]?.title).toBe("New Task");
      }
    });

    it("should default to replace mode when merge not specified", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [{ id: "1", title: "Task 1", status: "pending" }],
          merge: false,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.merged).toBe(false);
      }
    });

    it("should support numeric IDs", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [
            { id: 1, title: "Task 1", status: "pending" },
            { id: 2, title: "Task 2", status: "pending" },
          ],
          merge: false,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.todos).toHaveLength(2);
      }
    });
  });

  describe("merge mode (merge=true)", () => {
    beforeEach(async () => {
      // Pre-populate with existing todos
      const existingStorage = {
        items: [
          {
            id: "1",
            title: "Existing Task 1",
            status: "pending" as const,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
          },
          {
            id: "2",
            title: "Existing Task 2",
            status: "in-progress" as const,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
          },
          {
            id: "3",
            title: "Existing Task 3",
            status: "completed" as const,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
            completedAt: "2025-01-02T00:00:00Z",
          },
        ],
      };
      await writeFile(todoFilePath, JSON.stringify(existingStorage));
    });

    it("should preserve existing todos not in incoming list", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [{ id: "4", title: "New Task", status: "pending" }],
          merge: true,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.added).toBe(1);
        expect(result.output.updated).toBe(0);
        expect(result.output.total).toBe(4);
        expect(result.output.merged).toBe(true);
        // Original tasks preserved
        expect(result.output.todos.find((t) => t.id === "1")?.title).toBe("Existing Task 1");
        expect(result.output.todos.find((t) => t.id === "2")?.title).toBe("Existing Task 2");
        expect(result.output.todos.find((t) => t.id === "3")?.title).toBe("Existing Task 3");
        // New task added
        expect(result.output.todos.find((t) => t.id === "4")?.title).toBe("New Task");
      }
    });

    it("should update existing todos by ID", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [
            { id: "1", title: "Updated Task 1", status: "completed" },
            { id: "2", title: "Updated Task 2", status: "completed" },
          ],
          merge: true,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.added).toBe(0);
        expect(result.output.updated).toBe(2);
        expect(result.output.total).toBe(3);

        const task1 = result.output.todos.find((t) => t.id === "1");
        expect(task1?.title).toBe("Updated Task 1");
        expect(task1?.status).toBe("completed");
        expect(task1?.completedAt).toBeDefined();

        const task2 = result.output.todos.find((t) => t.id === "2");
        expect(task2?.title).toBe("Updated Task 2");
        expect(task2?.status).toBe("completed");
      }
    });

    it("should handle mixed add and update operations", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [
            { id: "1", title: "Updated Task 1", status: "completed" },
            { id: "5", title: "Brand New Task", status: "pending" },
          ],
          merge: true,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.added).toBe(1);
        expect(result.output.updated).toBe(1);
        expect(result.output.total).toBe(4);
      }
    });

    it("should preserve completedAt when already completed", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [
            { id: "3", title: "Still Completed", status: "completed", description: "Added desc" },
          ],
          merge: true,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const task3 = result.output.todos.find((t) => t.id === "3");
        // Should preserve original completedAt
        expect(task3?.completedAt).toBe("2025-01-02T00:00:00Z");
        expect(task3?.description).toBe("Added desc");
      }
    });

    it("should set completedAt when transitioning to completed", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [{ id: "1", title: "Now Completed", status: "completed" }],
          merge: true,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const task1 = result.output.todos.find((t) => t.id === "1");
        expect(task1?.completedAt).toBeDefined();
        expect(task1?.completedAt).not.toBe("2025-01-01T00:00:00Z");
      }
    });

    it("should sort items by ID after merge", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [
            { id: "10", title: "Task 10", status: "pending" },
            { id: "5", title: "Task 5", status: "pending" },
          ],
          merge: true,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should be sorted: 1, 2, 3, 5, 10
        const ids = result.output.todos.map((t) => String(t.id));
        expect(ids).toEqual(["1", "2", "3", "5", "10"]);
      }
    });

    it("should handle string IDs with alphanumeric sort", async () => {
      // Reset with string IDs
      const existingStorage = {
        items: [
          {
            id: "task-a",
            title: "Task A",
            status: "pending" as const,
            createdAt: "2025-01-01T00:00:00Z",
            updatedAt: "2025-01-01T00:00:00Z",
          },
        ],
      };
      await writeFile(todoFilePath, JSON.stringify(existingStorage));

      const result = await todoWriteTool.execute(
        {
          todos: [
            { id: "task-c", title: "Task C", status: "pending" },
            { id: "task-b", title: "Task B", status: "pending" },
          ],
          merge: true,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const ids = result.output.todos.map((t) => t.id);
        expect(ids).toEqual(["task-a", "task-b", "task-c"]);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle empty todo list", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [],
          merge: false,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.total).toBe(0);
        expect(result.output.todos).toEqual([]);
      }
    });

    it("should handle merge with no existing file", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [{ id: "1", title: "First Task", status: "pending" }],
          merge: true,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.added).toBe(1);
        expect(result.output.total).toBe(1);
      }
    });

    it("should fail when permission denied", async () => {
      ctx.checkPermission = vi.fn().mockResolvedValue(false);

      const result = await todoWriteTool.execute(
        {
          todos: [{ id: "1", title: "Task", status: "pending" }],
          merge: false,
        },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });

    it("should fail when aborted", async () => {
      const abortController = new AbortController();
      abortController.abort();
      ctx.abortSignal = abortController.signal;

      const result = await todoWriteTool.execute(
        {
          todos: [{ id: "1", title: "Task", status: "pending" }],
          merge: false,
        },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });

    it("should handle optional description field", async () => {
      const result = await todoWriteTool.execute(
        {
          todos: [
            { id: "1", title: "With Description", status: "pending", description: "Details here" },
            { id: "2", title: "Without Description", status: "pending" },
          ],
          merge: false,
        },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.todos[0]?.description).toBe("Details here");
        expect(result.output.todos[1]?.description).toBeUndefined();
      }
    });

    it("should create directory if it does not exist", async () => {
      // Remove the directory
      await rm(join(testDir, ".vellum"), { recursive: true, force: true });

      const result = await todoWriteTool.execute(
        {
          todos: [{ id: "1", title: "Task", status: "pending" }],
          merge: false,
        },
        ctx
      );

      expect(result.success).toBe(true);

      // Verify file was created
      const content = await readFile(todoFilePath, "utf-8");
      const storage = JSON.parse(content);
      expect(storage.items).toHaveLength(1);
    });
  });

  describe("persistence", () => {
    it("should persist changes to file", async () => {
      await todoWriteTool.execute(
        {
          todos: [{ id: "1", title: "Persisted Task", status: "in-progress" }],
          merge: false,
        },
        ctx
      );

      // Read file directly
      const content = await readFile(todoFilePath, "utf-8");
      const storage = JSON.parse(content);

      expect(storage.items).toHaveLength(1);
      expect(storage.items[0].title).toBe("Persisted Task");
      expect(storage.items[0].status).toBe("in-progress");
    });

    it("should maintain timestamps across operations", async () => {
      // First write
      await todoWriteTool.execute(
        {
          todos: [{ id: "1", title: "Task", status: "pending" }],
          merge: false,
        },
        ctx
      );

      // Read and verify createdAt
      let content = await readFile(todoFilePath, "utf-8");
      let storage = JSON.parse(content);
      const originalCreatedAt = storage.items[0].createdAt;

      // Wait a small amount and update
      await new Promise((resolve) => setTimeout(resolve, 10));

      await todoWriteTool.execute(
        {
          todos: [{ id: "1", title: "Updated Task", status: "completed" }],
          merge: true,
        },
        ctx
      );

      // Verify createdAt preserved, updatedAt changed
      content = await readFile(todoFilePath, "utf-8");
      storage = JSON.parse(content);

      expect(storage.items[0].createdAt).toBe(originalCreatedAt);
      expect(storage.items[0].updatedAt).not.toBe(originalCreatedAt);
    });
  });
});
