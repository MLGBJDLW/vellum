/**
 * Progress Command (REQ-022)
 * @module cli/commands/progress
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

/** Path to the TODO storage file relative to working directory */
const TODO_FILE_PATH = ".vellum/todos.json";

/** Single TODO item */
interface TodoItem {
  id: number;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
}

/** Internal TODO storage structure */
interface TodoStorage {
  nextId: number;
  items: TodoItem[];
}

/**
 * Load TODOs from storage file
 */
async function loadTodos(filePath: string): Promise<TodoStorage> {
  try {
    const content = await readFile(filePath, { encoding: "utf-8" });
    const data = JSON.parse(content) as TodoStorage;
    if (typeof data.nextId !== "number" || !Array.isArray(data.items)) {
      return { nextId: 1, items: [] };
    }
    return data;
  } catch {
    return { nextId: 1, items: [] };
  }
}

/**
 * Progress command
 */
export const progressCommand: SlashCommand = {
  name: "progress",
  description: "Show task progress",
  kind: "builtin",
  category: "workflow",
  aliases: ["tasks", "todos"],
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    try {
      const todoFilePath = join(ctx.session.cwd, TODO_FILE_PATH);
      const storage = await loadTodos(todoFilePath);
      const todos = storage.items;

      if (!todos.length) {
        return success("📋 No tasks tracked. Use /plan or /spec to create tasks.");
      }

      const completed = todos.filter((t) => t.completed).length;
      const pending = todos.filter((t) => !t.completed).length;

      let output = `📊 Task Progress: ${completed}/${todos.length} completed\n\n`;

      for (const todo of todos) {
        const icon = todo.completed ? "✅" : "⬜";
        output += `${icon} ${todo.text}\n`;
      }

      if (pending > 0) {
        output += `\n📝 ${pending} task${pending > 1 ? "s" : ""} remaining`;
      }

      return success(output);
    } catch (err) {
      return error(
        "INTERNAL_ERROR",
        `Failed to get progress: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  },
};
