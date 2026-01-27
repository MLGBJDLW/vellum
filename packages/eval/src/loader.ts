/**
 * TaskLoader - Load and validate task definitions
 * @module @vellum/eval
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { EvalTask, TaskFilter } from "./types.js";

// ============================================
// Zod Schemas for Validation
// ============================================

const TaskCategorySchema = z.enum([
  "coding:bugfix",
  "coding:feature",
  "coding:refactor",
  "file:create",
  "file:edit",
  "file:delete",
  "search:find",
  "search:explain",
]);

const DifficultySchema = z.enum(["easy", "medium", "hard"]);

const TaskFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const LLMJudgeConfigSchema = z.object({
  rubric: z.string().min(1),
  passingScore: z.number().min(0).max(1).optional(),
  judgeModel: z.string().optional(),
});

const ExpectedFileSchema = z.object({
  path: z.string().min(1),
  match: z.enum(["exact", "contains", "regex"]),
  content: z.string(),
  weight: z.number().min(0).optional(),
});

const ExpectedOutputSchema = z.object({
  files: z.array(ExpectedFileSchema).optional(),
  stdout: z.array(z.string()).optional(),
  testCommand: z.string().optional(),
  llmJudge: LLMJudgeConfigSchema.optional(),
});

const MockScriptSchema = z.object({
  responses: z.array(
    z.object({
      content: z.string(),
      toolCalls: z
        .array(
          z.object({
            name: z.string(),
            arguments: z.record(z.unknown()),
          })
        )
        .optional(),
    })
  ),
});

const EvalTaskSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: TaskCategorySchema,
  difficulty: DifficultySchema,
  description: z.string(),
  prompt: z.string().min(1),
  files: z.array(TaskFileSchema),
  expected: ExpectedOutputSchema,
  timeout: z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
  mockScript: MockScriptSchema.optional(),
  passingThreshold: z.number().min(0).max(1).optional(),
});

// ============================================
// TaskLoader Class
// ============================================

export interface TaskLoaderOptions {
  /** Base directory for tasks (default: ./tasks) */
  tasksDir?: string;
}

export class TaskLoader {
  private tasksDir: string;
  private cache: Map<string, EvalTask> = new Map();

  constructor(options: TaskLoaderOptions = {}) {
    this.tasksDir = options.tasksDir ?? "./tasks";
  }

  /**
   * Load a single task by ID
   * @param taskId - Task identifier (e.g., "coding-bugfix-001")
   */
  async loadTask(taskId: string): Promise<EvalTask> {
    // Check cache first
    if (this.cache.has(taskId)) {
      return this.cache.get(taskId)!;
    }

    // Search for task file
    const taskPath = await this.findTaskFile(taskId);
    if (!taskPath) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const task = await this.loadTaskFromFile(taskPath);
    this.cache.set(taskId, task);
    return task;
  }

  /**
   * Load all tasks matching filter
   * @param filter - Optional filter criteria
   */
  async loadAll(filter?: TaskFilter): Promise<EvalTask[]> {
    const tasks: EvalTask[] = [];
    const taskFiles = await this.findAllTaskFiles();

    for (const filePath of taskFiles) {
      try {
        const task = await this.loadTaskFromFile(filePath);

        if (this.matchesFilter(task, filter)) {
          tasks.push(task);
          this.cache.set(task.id, task);
        }
      } catch (error) {
        console.warn(`Failed to load task from ${filePath}:`, error);
      }
    }

    return tasks;
  }

  /**
   * List all available task IDs
   */
  async listTaskIds(): Promise<string[]> {
    const taskFiles = await this.findAllTaskFiles();
    const ids: string[] = [];

    for (const filePath of taskFiles) {
      try {
        const content = await readFile(filePath, "utf-8");
        const data = JSON.parse(content);
        if (data.id) {
          ids.push(data.id);
        }
      } catch {
        // Skip invalid files
      }
    }

    return ids;
  }

  /**
   * Validate a task definition
   * @param task - Task object to validate
   * @throws ZodError if validation fails
   */
  validate(task: unknown): EvalTask {
    return EvalTaskSchema.parse(task);
  }

  /**
   * Clear the task cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ============================================
  // Private Methods
  // ============================================

  private async loadTaskFromFile(filePath: string): Promise<EvalTask> {
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content);
    return this.validate(data);
  }

  private async findTaskFile(taskId: string): Promise<string | null> {
    const taskFiles = await this.findAllTaskFiles();

    for (const filePath of taskFiles) {
      try {
        const content = await readFile(filePath, "utf-8");
        const data = JSON.parse(content);
        if (data.id === taskId) {
          return filePath;
        }
      } catch {
        // Skip invalid files
      }
    }

    return null;
  }

  private async findAllTaskFiles(): Promise<string[]> {
    const files: string[] = [];

    const scan = async (dir: string): Promise<void> => {
      try {
        const entries = await readdir(dir);

        for (const entry of entries) {
          const fullPath = join(dir, entry);
          const stats = await stat(fullPath);

          if (stats.isDirectory()) {
            await scan(fullPath);
          } else if (entry.endsWith(".json")) {
            files.push(fullPath);
          }
        }
      } catch {
        // Directory doesn't exist or not accessible
      }
    };

    await scan(this.tasksDir);
    return files;
  }

  private matchesFilter(task: EvalTask, filter?: TaskFilter): boolean {
    if (!filter) return true;

    // Filter by IDs
    if (filter.ids && filter.ids.length > 0) {
      if (!filter.ids.includes(task.id)) {
        return false;
      }
    }

    // Filter by category (supports glob pattern like "coding:*")
    if (filter.category) {
      if (filter.category.endsWith("*")) {
        const prefix = filter.category.slice(0, -1);
        if (!task.category.startsWith(prefix)) {
          return false;
        }
      } else if (task.category !== filter.category) {
        return false;
      }
    }

    // Filter by difficulty
    if (filter.difficulty && task.difficulty !== filter.difficulty) {
      return false;
    }

    // Filter by tags (match any)
    if (filter.tags && filter.tags.length > 0) {
      const taskTags = task.tags ?? [];
      const hasMatchingTag = filter.tags.some((tag) => taskTags.includes(tag));
      if (!hasMatchingTag) {
        return false;
      }
    }

    return true;
  }
}

// Export schema for external validation
export { EvalTaskSchema };
