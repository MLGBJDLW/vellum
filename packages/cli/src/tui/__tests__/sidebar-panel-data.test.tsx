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
  readonly sidebarVisible: boolean;
  readonly sidebarContent: "todo" | "memory" | "tools" | "mcp";
  readonly executions: readonly ToolExecution[];
  readonly loadTodos: () => Promise<readonly TodoItemData[]>;
  readonly loadMemories: () => Promise<readonly MemoryEntry[]>;
}): React.JSX.Element {
  const { todoItems, memoryEntries } = useSidebarPanelData({
    sidebarVisible: props.sidebarVisible,
    sidebarContent: props.sidebarContent,
    executions: props.executions,
    loadTodos: props.loadTodos,
    loadMemories: props.loadMemories,
  });

  return <Text>{`todos:${todoItems.length} memories:${memoryEntries.length}`}</Text>;
}

describe("sidebar panel data", () => {
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
