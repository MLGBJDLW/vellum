/**
 * Sidebar panel data loaders.
 *
 * The MemoryPanel and TodoPanel are presentational components; the data is loaded
 * by the app shell. This hook provides:
 * - initial loading
 * - refresh on panel open
 * - refresh after relevant tool executions
 */

import type { MemoryEntry } from "@vellum/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TodoItemData } from "../components/TodoItem.js";
import type { ToolExecution } from "../context/ToolsContext.js";

export type SidebarContent = "todo" | "memory" | "tools" | "mcp" | "help" | "snapshots" | "lsp";

export type SidebarPanelDataOptions = {
  readonly sidebarVisible: boolean;
  readonly sidebarContent: SidebarContent;
  readonly executions: readonly ToolExecution[];

  readonly loadTodos: () => Promise<readonly TodoItemData[]>;
  readonly loadMemories: () => Promise<readonly MemoryEntry[]>;
};

export type SidebarPanelData = {
  readonly todoItems: readonly TodoItemData[];
  readonly memoryEntries: readonly MemoryEntry[];
  readonly refreshTodos: () => void;
  readonly refreshMemories: () => void;
};

export function getLastCompletedToolExecutionId(
  executions: readonly ToolExecution[]
): string | undefined {
  for (let i = executions.length - 1; i >= 0; i -= 1) {
    const exec = executions[i];
    if (exec?.status === "complete") return exec.id;
  }
  return undefined;
}

export function shouldRefreshFromToolExecution(execution: ToolExecution | undefined): {
  readonly refreshTodos: boolean;
  readonly refreshMemories: boolean;
} {
  const toolName = execution?.toolName;
  if (!toolName) return { refreshTodos: false, refreshMemories: false };

  return {
    refreshTodos: toolName === "todo_manage",
    refreshMemories: toolName === "save_memory" || toolName === "recall_memory",
  };
}

export function useSidebarPanelData(options: SidebarPanelDataOptions): SidebarPanelData {
  const { sidebarVisible, sidebarContent, executions, loadTodos, loadMemories } = options;

  const [todoItems, setTodoItems] = useState<readonly TodoItemData[]>([]);
  const [memoryEntries, setMemoryEntries] = useState<readonly MemoryEntry[]>([]);

  const refreshTodos = useCallback(() => {
    void loadTodos()
      .then(setTodoItems)
      .catch(() => {
        setTodoItems([]);
      });
  }, [loadTodos]);

  const refreshMemories = useCallback(() => {
    void loadMemories()
      .then(setMemoryEntries)
      .catch(() => {
        setMemoryEntries([]);
      });
  }, [loadMemories]);

  // Initial load (best-effort).
  useEffect(() => {
    refreshTodos();
    refreshMemories();
  }, [refreshMemories, refreshTodos]);

  // Refresh when the relevant panel is opened.
  useEffect(() => {
    if (!sidebarVisible) return;

    if (sidebarContent === "todo") {
      refreshTodos();
    }

    if (sidebarContent === "memory") {
      refreshMemories();
    }
  }, [refreshMemories, refreshTodos, sidebarContent, sidebarVisible]);

  // Refresh when relevant tool executions complete.
  const lastHandledExecutionIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const executionId = getLastCompletedToolExecutionId(executions);
    if (!executionId || executionId === lastHandledExecutionIdRef.current) return;

    const execution = executions.find((e) => e.id === executionId);
    const decision = shouldRefreshFromToolExecution(execution);

    if (decision.refreshTodos) refreshTodos();
    if (decision.refreshMemories) refreshMemories();

    lastHandledExecutionIdRef.current = executionId;
  }, [executions, refreshMemories, refreshTodos]);

  return useMemo(
    () => ({ todoItems, memoryEntries, refreshTodos, refreshMemories }),
    [todoItems, memoryEntries, refreshTodos, refreshMemories]
  );
}
