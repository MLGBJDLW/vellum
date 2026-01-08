import { todoManageTool } from "../../builtin/todo-manage.js";
import type { ToolContext } from "../../types/tool.js";
import type { ProgressEvent, ProgressReporter } from "./progress-reporter.js";

export interface ParsedTask {
  id: string;
  title: string;
  hasTests?: boolean;
}

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

export interface TaskResult {
  task: ParsedTask;
  status: TaskStatus;
  error?: string;
}

export interface ExecutionResult {
  results: TaskResult[];
  success: boolean;
}

interface TaskState {
  task: ParsedTask;
  todoId: number;
  status: TaskStatus;
}

export class TaskExecutor {
  private taskStates: Map<string, TaskState> = new Map();
  private progressReporter?: ProgressReporter;

  constructor(
    private toolContext: ToolContext,
    progressReporter?: ProgressReporter
  ) {
    this.progressReporter = progressReporter;
  }

  async executeAllTasks(tasks: ParsedTask[]): Promise<ExecutionResult> {
    const results: TaskResult[] = [];

    for (const task of tasks) {
      const todoId = await this.addTaskToTodo(task);
      this.taskStates.set(task.id, {
        task,
        todoId,
        status: "pending",
      });
    }

    for (const task of tasks) {
      const state = this.taskStates.get(task.id);
      if (!state) {
        continue;
      }

      state.status = "in_progress";
      this.reportProgress(state, tasks.length);

      const completeResult = await todoManageTool.execute(
        {
          action: "complete",
          id: state.todoId,
          filter: "all",
        },
        this.toolContext
      );

      if (!completeResult.success) {
        state.status = "failed";
        results.push({ task, status: "failed", error: completeResult.error });
        this.reportProgress(state, tasks.length);
        continue;
      }

      state.status = "completed";
      results.push({ task, status: "completed" });
      this.reportProgress(state, tasks.length);
    }

    return {
      results,
      success: results.every((result) => result.status === "completed"),
    };
  }

  private async addTaskToTodo(task: ParsedTask): Promise<number> {
    const addResult = await todoManageTool.execute(
      {
        action: "add",
        text: `[${task.id}] ${task.title}`,
        filter: "all",
      },
      this.toolContext
    );

    if (!addResult.success) {
      return this.taskStates.size + 1;
    }

    const lastTodo = addResult.output.todos[addResult.output.todos.length - 1];
    return lastTodo?.id ?? this.taskStates.size + 1;
  }

  private reportProgress(state: TaskState, totalTasks: number): void {
    if (!this.progressReporter) {
      return;
    }

    const completed = Array.from(this.taskStates.values()).filter(
      (task) => task.status === "completed"
    ).length;

    const event: ProgressEvent = {
      completed,
      total: totalTasks,
      current: {
        title: state.task.title,
        status: state.status,
      },
    };

    this.progressReporter.emitProgress(event);
  }
}
