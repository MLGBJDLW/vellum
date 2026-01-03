/**
 * Markdown todo parser and serializer
 *
 * Provides parsing and serialization utilities for todo items in markdown format.
 * Supports GitHub-style checkboxes and comma-separated fallback format.
 */

import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import type { TodoItem, TodoStatus } from "./types.js";

// =============================================================================
// Regex Patterns
// =============================================================================

/**
 * Matches GitHub-style checkbox lines:
 * - [ ] pending task
 * - [x] done task (lowercase)
 * - [X] done task (uppercase)
 * - [-] skipped task
 * - [~] skipped task
 */
const CHECKBOX_REGEX = /^-\s*\[([xX\s\-~])\]\s*(.+)$/;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Maps checkbox marker to TodoStatus
 *
 * @param marker - The character inside the checkbox brackets
 * @returns The corresponding TodoStatus
 */
function markerToStatus(marker: string): TodoStatus {
  switch (marker.toLowerCase()) {
    case "x":
      return "done";
    case "-":
    case "~":
      return "skipped";
    default:
      return "pending";
  }
}

/**
 * Maps TodoStatus to checkbox marker
 *
 * @param status - The todo status
 * @returns The checkbox marker character
 */
function statusToMarker(status: TodoStatus): string {
  switch (status) {
    case "done":
      return "x";
    case "skipped":
      return "-";
    default:
      return " ";
  }
}

/**
 * Generates a stable content-based hash ID from the title
 *
 * Uses MD5 to create a deterministic 8-character hex ID from the title.
 * This enables idempotent operations where the same title always produces
 * the same ID.
 *
 * @param title - The task title to hash
 * @returns 8-character hex string derived from MD5 hash
 */
function generateContentHash(title: string): string {
  return createHash("md5").update(title).digest("hex").slice(0, 8);
}

/** Options for todo item creation */
export interface CreateTodoOptions {
  /** Use content-based MD5 hash instead of random nanoid for ID generation */
  useContentHash?: boolean;
}

/**
 * Creates a new TodoItem with generated ID and timestamps
 *
 * @param title - The task title/description
 * @param status - The initial status (default: pending)
 * @param options - Optional configuration for ID generation
 * @returns A new TodoItem
 */
function createTodoItem(
  title: string,
  status: TodoStatus = "pending",
  options?: CreateTodoOptions
): TodoItem {
  const now = new Date().toISOString();
  const trimmedTitle = title.trim();
  const id = options?.useContentHash ? generateContentHash(trimmedTitle) : nanoid(8);
  return {
    id,
    title: trimmedTitle,
    status,
    createdAt: now,
    completedAt: status !== "pending" ? now : undefined,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Parse markdown content containing GitHub-style checkboxes into TodoItems
 *
 * Supports the following checkbox formats:
 * - `- [ ]` → pending
 * - `- [x]` or `- [X]` → done
 * - `- [-]` or `- [~]` → skipped
 *
 * @param markdown - Markdown string containing checkbox items
 * @returns Array of parsed TodoItems
 *
 * @example
 * ```typescript
 * const markdown = `
 * - [ ] Pending task
 * - [x] Done task
 * - [-] Skipped task
 * `;
 * const todos = parseMarkdownTodos(markdown);
 * // [
 * //   { id: "abc12345", title: "Pending task", status: "pending", ... },
 * //   { id: "def67890", title: "Done task", status: "done", ... },
 * //   { id: "ghi11111", title: "Skipped task", status: "skipped", ... }
 * // ]
 * ```
 */
export function parseMarkdownTodos(markdown: string, options?: CreateTodoOptions): TodoItem[] {
  const lines = markdown.split("\n");
  const todos: TodoItem[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    const match = CHECKBOX_REGEX.exec(trimmedLine);

    if (match && match[1] !== undefined && match[2] !== undefined) {
      const marker = match[1];
      const title = match[2];
      const status = markerToStatus(marker);
      todos.push(createTodoItem(title, status, options));
    }
  }

  return todos;
}

/**
 * Serialize TodoItems back to markdown checkbox format
 *
 * @param todos - Array of TodoItems to serialize
 * @returns Markdown string with checkbox items
 *
 * @example
 * ```typescript
 * const todos = [
 *   { id: "1", title: "Task 1", status: "pending", createdAt: "..." },
 *   { id: "2", title: "Task 2", status: "done", createdAt: "..." }
 * ];
 * const markdown = todosToMarkdown(todos);
 * // "- [ ] Task 1\n- [x] Task 2"
 * ```
 */
export function todosToMarkdown(todos: TodoItem[]): string {
  return todos.map((todo) => `- [${statusToMarker(todo.status)}] ${todo.title}`).join("\n");
}

/**
 * Parse comma-separated task list as fallback when no checkboxes found
 *
 * All items parsed from comma-separated format start with "pending" status.
 *
 * @param input - Comma-separated string of task titles
 * @returns Array of TodoItems with pending status
 *
 * @example
 * ```typescript
 * const input = "Buy groceries, Call mom, Finish report";
 * const todos = parseCommaSeparated(input);
 * // [
 * //   { id: "...", title: "Buy groceries", status: "pending", ... },
 * //   { id: "...", title: "Call mom", status: "pending", ... },
 * //   { id: "...", title: "Finish report", status: "pending", ... }
 * // ]
 * ```
 */
export function parseCommaSeparated(input: string, options?: CreateTodoOptions): TodoItem[] {
  if (!input.trim()) {
    return [];
  }

  return input
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((title) => createTodoItem(title, "pending", options));
}
