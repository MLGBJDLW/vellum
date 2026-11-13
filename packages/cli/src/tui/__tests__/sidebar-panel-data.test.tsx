/**
 * Sidebar panel data refresh tests
 *
 * Verifies the data loader hook that backs MemoryPanel and TodoPanel:
 * - initial load
 * - refresh on panel open
 * - refresh after relevant tool execution completion
 */

import type { MemoryEntry } from "@vellum/core";
import { Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import type { TodoItemData } from "../components/TodoItem.js";
import type { ToolExecution } from "../context/ToolsContext.js";
import {
  getLastCompletedToolExecutionId,
  shouldRefreshFromToolExecution,
  useSidebarPanelData,
} from "../hooks/useSidebarPanelData.js";

function Harness(props: {
  readonly scopeKey?: string;
  readonly sidebarVisible: boolean;
  readonly sidebarContent: "todo" | "memory" | "tools" | "mcp";
  readonly executions: readonly ToolExecution[];
  readonly loadTodos: () => Promise<readonly TodoItemData[]>;
  readonly loadMemories: () => Promise<readonly MemoryEntry[]>;
}): React.JSX.Element {
  const { todoItems, memoryEntries } = useSidebarPanelData({
    scopeKey: props.scopeKey,
    sidebarVisible: props.sidebarVisible,
    sidebarContent: props.sidebarContent,
    executions: props.executions,
    loadTodos: props.loadTodos,
    loadMemories: props.loadMemories,
  });

  return <Text>{`todos:${todoItems.length} memories:${memoryEntries.length}`}</Text>;
}

describe("sidebar panel data", () => {
  it("clears the old plan as soon as another session is selected", async () => {
    const loadMemories = vi.fn().mockResolvedValue([]);
    const loadOld = vi
      .fn()
      .mockResolvedValue([
        { id: 1, title: "Old plan", status: "pending", createdAt: "2026-01-01T00:00:00Z" },
      ]);
    let finishNew!: (items: readonly TodoItemData[]) => void;
    const loadNew = () =>
      new Promise<readonly TodoItemData[]>((resolve) => {
        finishNew = resolve;
      });
    const props = {
      sidebarVisible: false,
      sidebarContent: "tools" as const,
      executions: [],
      loadMemories,
    };
    const { lastFrame, rerender, unmount } = render(
      <Harness {...props} scopeKey="old" loadTodos={loadOld} />
    );
    await vi.waitFor(() => expect(lastFrame()).toContain("todos:1"));
    rerender(<Harness {...props} scopeKey="new" loadTodos={loadNew} />);
    await vi.waitFor(() => expect(lastFrame()).toContain("todos:0"));
    finishNew([]);
    unmount();
  });

  it("ignores a previous session's late task refresh", async () => {
    let finishOld!: (items: readonly TodoItemData[]) => void;
    const loadOld = () =>
      new Promise<readonly TodoItemData[]>((resolve) => {
        finishOld = resolve;
      });
    const loadNew = vi.fn().mockResolvedValue([]);
    const props = {
      sidebarVisible: false,
      sidebarContent: "tools" as const,
      executions: [],
      loadMemories: vi.fn().mockResolvedValue([]),
    };
    const { lastFrame, rerender, unmount } = render(
      <Harness {...props} scopeKey="old" loadTodos={loadOld} />
    );
    rerender(<Harness {...props} scopeKey="new" loadTodos={loadNew} />);
    await vi.waitFor(() => expect(loadNew).toHaveBeenCalled());
    finishOld([{ id: 1, title: "Old plan", status: "pending", createdAt: "2026-01-01T00:00:00Z" }]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(lastFrame()).toContain("todos:0");
    unmount();
  });

  it("should identify the last completed tool execution id", () => {
    const executions: ToolExecution[] = [
      { id: "1", toolName: "read_file", params: {}, status: "running" },
      { id: "2", toolName: "todo_manage", params: {}, status: "complete" },
      { id: "3", toolName: "save_memory", params: {}, status: "pending" },
      { id: "4", toolName: "todo_manage", params: {}, status: "complete" },
    ];

    expect(getLastCompletedToolExecutionId(executions)).toBe("4");
  });

  it("should decide which panels to refresh from a tool execution", () => {
    const todoExec: ToolExecution = {
      id: "1",
      toolName: "todo_manage",
      params: {},
      status: "complete",
    };

    const memoryExec: ToolExecution = {
      id: "2",
      toolName: "save_memory",
      params: {},
      status: "complete",
    };

    expect(shouldRefreshFromToolExecution(todoExec)).toEqual({
      refreshTodos: true,
      refreshMemories: false,
    });

    expect(shouldRefreshFromToolExecution(memoryExec)).toEqual({
      refreshTodos: false,
      refreshMemories: true,
    });
  });

  it("should refresh on panel open and after relevant tool completion", async () => {
    const loadTodos = vi.fn<() => Promise<readonly TodoItemData[]>>().mockResolvedValue([
      {
        id: 1,
        title: "Task A",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
    ]);

    const loadMemories = vi.fn<() => Promise<readonly MemoryEntry[]>>().mockResolvedValue([
      {
        key: "k1",
        type: "context",
        content: "c1",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        metadata: { tags: [], importance: 0.5 },
      },
    ]);

    const { lastFrame, rerender } = render(
      <Harness
        sidebarVisible={false}
        sidebarContent="tools"
        executions={[]}
        loadTodos={loadTodos}
        loadMemories={loadMemories}
      />
    );

    // Initial load is best-effort; allow microtasks to flush.
    await Promise.resolve();

    expect(loadTodos).toHaveBeenCalledTimes(1);
    expect(loadMemories).toHaveBeenCalledTimes(1);

    // Opening the todo panel should trigger a refresh.
    rerender(
      <Harness
        sidebarVisible={true}
        sidebarContent="todo"
        executions={[]}
        loadTodos={loadTodos}
        loadMemories={loadMemories}
      />
    );
    await Promise.resolve();
    expect(loadTodos).toHaveBeenCalledTimes(2);

    // Completing todo_manage should trigger a refresh.
    rerender(
      <Harness
        sidebarVisible={true}
        sidebarContent="todo"
        executions={[{ id: "e1", toolName: "todo_manage", params: {}, status: "complete" }]}
        loadTodos={loadTodos}
        loadMemories={loadMemories}
      />
    );
    await Promise.resolve();

    expect(loadTodos).toHaveBeenCalledTimes(3);

    // Should have rendered counts at least once.
    const frame = lastFrame() ?? "";
    expect(frame).toContain("todos:");
    expect(frame).toContain("memories:");
  });
});
