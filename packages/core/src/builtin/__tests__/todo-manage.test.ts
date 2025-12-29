/**
 * Tests for todo_manage tool
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { todoManageTool } from "../todo-manage.js";

describe("todoManageTool", () => {
  let ctx: ToolContext;
  let testDir: string;
  let todoFilePath: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), `.test-todo-${Date.now()}`);
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
      expect(todoManageTool.definition.name).toBe("todo_manage");
      expect(todoManageTool.definition.kind).toBe("write");
      expect(todoManageTool.definition.category).toBe("productivity");
    });

    it("should require confirmation for destructive actions", () => {
      expect(todoManageTool.shouldConfirm?.({ action: "clear", filter: "all" }, ctx)).toBe(true);
      expect(todoManageTool.shouldConfirm?.({ action: "delete", id: 1, filter: "all" }, ctx)).toBe(
        true
      );
      expect(
        todoManageTool.shouldConfirm?.({ action: "add", text: "test", filter: "all" }, ctx)
      ).toBe(false);
      expect(todoManageTool.shouldConfirm?.({ action: "list", filter: "all" }, ctx)).toBe(false);
      expect(
        todoManageTool.shouldConfirm?.({ action: "complete", id: 1, filter: "all" }, ctx)
      ).toBe(false);
    });
  });

  describe("add action", () => {
    it("should add a new todo", async () => {
      const result = await todoManageTool.execute(
        { action: "add", text: "Test TODO item", filter: "all" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.action).toBe("add");
        expect(result.output.todos).toHaveLength(1);
        expect(result.output.todos[0]?.text).toBe("Test TODO item");
        expect(result.output.todos[0]?.completed).toBe(false);
        expect(result.output.todos[0]?.id).toBe(1);
      }
    });

    it("should assign incrementing IDs", async () => {
      await todoManageTool.execute({ action: "add", text: "First", filter: "all" }, ctx);
      const result = await todoManageTool.execute(
        { action: "add", text: "Second", filter: "all" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.todos).toHaveLength(2);
        expect(result.output.todos[0]?.id).toBe(1);
        expect(result.output.todos[1]?.id).toBe(2);
      }
    });

    it("should fail when text is missing", async () => {
      const result = await todoManageTool.execute({ action: "add", filter: "all" }, ctx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Text is required");
      }
    });

    it("should fail when text is empty", async () => {
      const result = await todoManageTool.execute(
        { action: "add", text: "   ", filter: "all" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Text is required");
      }
    });
  });

  describe("list action", () => {
    beforeEach(async () => {
      // Pre-populate some todos
      const storage = {
        nextId: 4,
        items: [
          { id: 1, text: "Pending 1", completed: false, createdAt: "2025-01-01T00:00:00Z" },
          {
            id: 2,
            text: "Completed 1",
            completed: true,
            createdAt: "2025-01-01T00:00:00Z",
            completedAt: "2025-01-02T00:00:00Z",
          },
          { id: 3, text: "Pending 2", completed: false, createdAt: "2025-01-01T00:00:00Z" },
        ],
      };
      await writeFile(todoFilePath, JSON.stringify(storage));
    });

    it("should list all todos by default", async () => {
      const result = await todoManageTool.execute({ action: "list", filter: "all" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.action).toBe("list");
        expect(result.output.todos).toHaveLength(3);
      }
    });

    it("should filter pending todos", async () => {
      const result = await todoManageTool.execute({ action: "list", filter: "pending" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.todos).toHaveLength(2);
        expect(result.output.todos.every((t) => !t.completed)).toBe(true);
      }
    });

    it("should filter completed todos", async () => {
      const result = await todoManageTool.execute({ action: "list", filter: "completed" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.todos).toHaveLength(1);
        expect(result.output.todos[0]?.completed).toBe(true);
      }
    });

    it("should return empty array when no todos exist", async () => {
      await rm(todoFilePath, { force: true });

      const result = await todoManageTool.execute({ action: "list", filter: "all" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.todos).toHaveLength(0);
      }
    });
  });

  describe("complete action", () => {
    beforeEach(async () => {
      const storage = {
        nextId: 2,
        items: [{ id: 1, text: "Test TODO", completed: false, createdAt: "2025-01-01T00:00:00Z" }],
      };
      await writeFile(todoFilePath, JSON.stringify(storage));
    });

    it("should mark todo as completed", async () => {
      const result = await todoManageTool.execute(
        { action: "complete", id: 1, filter: "all" },
        ctx
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.action).toBe("complete");
        expect(result.output.todos[0]?.completed).toBe(true);
        expect(result.output.todos[0]?.completedAt).toBeDefined();
      }
    });

    it("should fail when id is missing", async () => {
      const result = await todoManageTool.execute({ action: "complete", filter: "all" }, ctx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("ID is required");
      }
    });

    it("should fail when todo not found", async () => {
      const result = await todoManageTool.execute(
        { action: "complete", id: 999, filter: "all" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });

    it("should fail when todo already completed", async () => {
      await todoManageTool.execute({ action: "complete", id: 1, filter: "all" }, ctx);
      const result = await todoManageTool.execute(
        { action: "complete", id: 1, filter: "all" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("already completed");
      }
    });
  });

  describe("delete action", () => {
    beforeEach(async () => {
      const storage = {
        nextId: 3,
        items: [
          { id: 1, text: "First", completed: false, createdAt: "2025-01-01T00:00:00Z" },
          { id: 2, text: "Second", completed: false, createdAt: "2025-01-01T00:00:00Z" },
        ],
      };
      await writeFile(todoFilePath, JSON.stringify(storage));
    });

    it("should delete a todo", async () => {
      const result = await todoManageTool.execute({ action: "delete", id: 1, filter: "all" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.action).toBe("delete");
        expect(result.output.todos).toHaveLength(1);
        expect(result.output.todos[0]?.id).toBe(2);
      }
    });

    it("should fail when id is missing", async () => {
      const result = await todoManageTool.execute({ action: "delete", filter: "all" }, ctx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("ID is required");
      }
    });

    it("should fail when todo not found", async () => {
      const result = await todoManageTool.execute(
        { action: "delete", id: 999, filter: "all" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("not found");
      }
    });
  });

  describe("clear action", () => {
    beforeEach(async () => {
      const storage = {
        nextId: 4,
        items: [
          { id: 1, text: "First", completed: false, createdAt: "2025-01-01T00:00:00Z" },
          { id: 2, text: "Second", completed: true, createdAt: "2025-01-01T00:00:00Z" },
          { id: 3, text: "Third", completed: false, createdAt: "2025-01-01T00:00:00Z" },
        ],
      };
      await writeFile(todoFilePath, JSON.stringify(storage));
    });

    it("should clear all todos", async () => {
      const result = await todoManageTool.execute({ action: "clear", filter: "all" }, ctx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.action).toBe("clear");
        expect(result.output.todos).toHaveLength(0);
      }
    });

    it("should reset nextId counter", async () => {
      await todoManageTool.execute({ action: "clear", filter: "all" }, ctx);
      const addResult = await todoManageTool.execute(
        { action: "add", text: "New after clear", filter: "all" },
        ctx
      );

      expect(addResult.success).toBe(true);
      if (addResult.success) {
        expect(addResult.output.todos[0]?.id).toBe(1);
      }
    });
  });

  describe("permission checks", () => {
    it("should check write permission for add action", async () => {
      await todoManageTool.execute({ action: "add", text: "test", filter: "all" }, ctx);

      expect(ctx.checkPermission).toHaveBeenCalledWith(
        "write",
        expect.stringContaining("todos.json")
      );
    });

    it("should not check permission for list action", async () => {
      await todoManageTool.execute({ action: "list", filter: "all" }, ctx);

      expect(ctx.checkPermission).not.toHaveBeenCalled();
    });

    it("should fail when permission denied", async () => {
      ctx.checkPermission = vi.fn().mockResolvedValue(false);

      const result = await todoManageTool.execute(
        { action: "add", text: "test", filter: "all" },
        ctx
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });
  });

  describe("cancellation", () => {
    it("should return error when cancelled", async () => {
      const controller = new AbortController();
      controller.abort();
      ctx.abortSignal = controller.signal;

      const result = await todoManageTool.execute({ action: "list", filter: "all" }, ctx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });
});
