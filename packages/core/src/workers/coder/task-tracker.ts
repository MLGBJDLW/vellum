import { todoManageTool } from "../../builtin/todo-manage.js";
import type { ToolContext } from "../../types/tool.js";

export interface ParsedTask {
  id: string;
  title: string;
}

export class CoderTaskTracker {
  constructor(private toolContext: ToolContext) {}

  async syncTasksToTodo(tasks: ParsedTask[]): Promise<void> {
    for (const task of tasks) {
      await todoManageTool.execute(
        {
          action: "add",
          text: `[${task.id}] ${task.title}`,
          filter: "all",
        },
        this.toolContext
      );
    }
  }

  async completeTask(todoId: number): Promise<void> {
    await todoManageTool.execute(
      {
        action: "complete",
        id: todoId,
        filter: "all",
      },
      this.toolContext
    );
  }

  async getProgress(): Promise<{ completed: number; total: number }> {
    const result = await todoManageTool.execute(
      {
        action: "list",
        filter: "all",
      },
      this.toolContext
    );

    if (!result.success) {
      return { completed: 0, total: 0 };
    }

    const todos = result.output.todos;
    return {
      completed: todos.filter((todo) => todo.completed).length,
      total: todos.length,
    };
  }
}
