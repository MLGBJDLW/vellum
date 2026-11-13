import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/tool.js";
import { todoManageTool } from "../todo-manage.js";
import { getSessionTodoPath } from "../todo-storage.js";
import { todoWriteTool } from "../todo-write.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

describe("session task plans", () => {
  let workspace: string;
  let context: ToolContext;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "vellum-session-todos-"));
    context = {
      workingDir: workspace,
      sessionId: "session-a",
      messageId: "message",
      callId: "call",
      abortSignal: new AbortController().signal,
      checkPermission: vi.fn().mockResolvedValue(true),
    };
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("starts a fresh session empty and restores the original session plan", async () => {
    await todoManageTool.execute({ action: "add", text: "Original plan", filter: "all" }, context);
    const fresh = await todoManageTool.execute(
      { action: "list", filter: "all" },
      { ...context, sessionId: "session-b" }
    );
    expect(fresh.success && fresh.output.todos).toEqual([]);
    const restored = await todoManageTool.execute({ action: "list", filter: "all" }, context);
    expect(restored.success && restored.output.todos.map((todo) => todo.text)).toEqual([
      "Original plan",
    ]);
  });

  it("does not adopt an unowned workspace plan into a new session", async () => {
    await mkdir(join(workspace, ".vellum"));
    await writeFile(
      join(workspace, ".vellum", "todos.json"),
      JSON.stringify({ nextId: 2, items: [{ id: 1, text: "Old plan", completed: false }] })
    );
    const result = await todoManageTool.execute({ action: "list", filter: "all" }, context);
    expect(result.success && result.output.todos).toEqual([]);
  });

  it("shares one plan between both task tools without erasing progress", async () => {
    await todoWriteTool.execute(
      { todos: [{ id: 1, title: "Active step", status: "in-progress" }], merge: false },
      context
    );
    const listed = await todoManageTool.execute({ action: "list", filter: "all" }, context);
    expect(listed.success && listed.output.todos.map((todo) => todo.text)).toEqual(["Active step"]);
    await todoManageTool.execute({ action: "add", text: "Next step", filter: "all" }, context);
    const merged = await todoWriteTool.execute({ todos: [], merge: true }, context);
    expect(merged.success && merged.output.todos.map((todo) => [todo.title, todo.status])).toEqual([
      ["Active step", "in-progress"],
      ["Next step", "pending"],
    ]);
    const fresh = await todoWriteTool.execute(
      { todos: [], merge: true },
      { ...context, sessionId: "session-b" }
    );
    expect(fresh.success && fresh.output.todos).toEqual([]);
  });

  it("preserves simultaneous additions and merges in the same session", async () => {
    await todoManageTool.execute({ action: "add", text: "Original plan", filter: "all" }, context);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) => [
        todoManageTool.execute({ action: "add", text: `Added ${index}`, filter: "all" }, context),
        todoWriteTool.execute(
          {
            todos: [{ id: `merge-${index}`, title: `Merged ${index}`, status: "pending" }],
            merge: true,
          },
          context
        ),
      ]).flat()
    );
    expect(results.every((result) => result.success)).toBe(true);
    const listed = await todoManageTool.execute({ action: "list", filter: "all" }, context);
    expect(listed.success && listed.output.todos).toHaveLength(13);
    if (listed.success)
      expect(new Set(listed.output.todos.map((todo) => String(todo.id))).size).toBe(13);
  });

  it.each([
    '{"items": [incomplete',
    JSON.stringify({ items: [{ id: 1, title: "Recoverable plan", status: "invalid" }] }),
  ])("preserves corrupt storage instead of treating it as a fresh plan", async (content) => {
    await todoManageTool.execute({ action: "add", text: "Original plan", filter: "all" }, context);
    const filePath = getSessionTodoPath(workspace, context.sessionId);
    await writeFile(filePath, content);

    const added = await todoManageTool.execute(
      { action: "add", text: "Next", filter: "all" },
      context
    );
    const merged = await todoWriteTool.execute(
      { todos: [{ id: 2, title: "Next", status: "pending" }], merge: true },
      context
    );
    expect(added.success).toBe(false);
    expect(merged.success).toBe(false);
    expect(await readFile(filePath, "utf-8")).toBe(content);
  });

  it("preserves the previous plan on failed publication and releases the mutation queue", async () => {
    await todoManageTool.execute({ action: "add", text: "Original plan", filter: "all" }, context);
    const filePath = getSessionTodoPath(workspace, context.sessionId);
    const original = await readFile(filePath, "utf-8");
    vi.mocked(rename).mockRejectedValueOnce(new Error("Destination temporarily unavailable"));

    const failed = await todoManageTool.execute(
      { action: "add", text: "Failed", filter: "all" },
      context
    );
    expect(failed.success).toBe(false);
    expect(await readFile(filePath, "utf-8")).toBe(original);
    expect(await readdir(dirname(filePath))).toEqual([basename(filePath)]);

    const next = await todoManageTool.execute(
      { action: "add", text: "Next", filter: "all" },
      context
    );
    expect(next.success && next.output.todos.map((todo) => todo.text)).toEqual([
      "Original plan",
      "Next",
    ]);
  });
});
