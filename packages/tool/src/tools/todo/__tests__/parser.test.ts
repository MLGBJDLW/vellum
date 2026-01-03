/**
 * Parser unit tests
 *
 * Tests for markdown todo parsing and serialization functions.
 * Covers REQ-002: Markdown checkbox parsing.
 */

import { describe, expect, it } from "vitest";
import { parseCommaSeparated, parseMarkdownTodos, todosToMarkdown } from "../parser.js";

// =============================================================================
// parseMarkdownTodos Tests
// =============================================================================

describe("parseMarkdownTodos", () => {
  it("parses pending checkbox", () => {
    const markdown = "- [ ] Pending task";
    const todos = parseMarkdownTodos(markdown);

    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({
      title: "Pending task",
      status: "pending",
    });
    expect(todos[0]!.id).toBeDefined();
    expect(todos[0]!.createdAt).toBeDefined();
    expect(todos[0]!.completedAt).toBeUndefined();
  });

  it("parses done checkbox (lowercase x)", () => {
    const markdown = "- [x] Done task";
    const todos = parseMarkdownTodos(markdown);

    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({
      title: "Done task",
      status: "done",
    });
    expect(todos[0]!.completedAt).toBeDefined();
  });

  it("parses done checkbox (uppercase X)", () => {
    const markdown = "- [X] Done task uppercase";
    const todos = parseMarkdownTodos(markdown);

    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({
      title: "Done task uppercase",
      status: "done",
    });
    expect(todos[0]!.completedAt).toBeDefined();
  });

  it("parses skipped checkbox (dash)", () => {
    const markdown = "- [-] Skipped task dash";
    const todos = parseMarkdownTodos(markdown);

    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({
      title: "Skipped task dash",
      status: "skipped",
    });
    expect(todos[0]!.completedAt).toBeDefined();
  });

  it("parses skipped checkbox (tilde)", () => {
    const markdown = "- [~] Skipped task tilde";
    const todos = parseMarkdownTodos(markdown);

    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({
      title: "Skipped task tilde",
      status: "skipped",
    });
    expect(todos[0]!.completedAt).toBeDefined();
  });

  it("handles multiple checkboxes", () => {
    const markdown = `
- [ ] First pending
- [x] Second done
- [-] Third skipped
- [X] Fourth done uppercase
- [~] Fifth skipped tilde
    `.trim();

    const todos = parseMarkdownTodos(markdown);

    expect(todos).toHaveLength(5);
    expect(todos[0]).toMatchObject({ title: "First pending", status: "pending" });
    expect(todos[1]).toMatchObject({ title: "Second done", status: "done" });
    expect(todos[2]).toMatchObject({ title: "Third skipped", status: "skipped" });
    expect(todos[3]).toMatchObject({ title: "Fourth done uppercase", status: "done" });
    expect(todos[4]).toMatchObject({ title: "Fifth skipped tilde", status: "skipped" });
  });

  it("handles empty input", () => {
    const todos = parseMarkdownTodos("");
    expect(todos).toHaveLength(0);
  });

  it("handles input with no checkboxes", () => {
    const markdown = "Just some text\nNo checkboxes here";
    const todos = parseMarkdownTodos(markdown);
    expect(todos).toHaveLength(0);
  });

  it("ignores malformed checkboxes", () => {
    const markdown = `
- [] Missing content in checkbox brackets
- [z] Unknown marker not in allowed set
- [ ] Valid task
    `.trim();

    const todos = parseMarkdownTodos(markdown);

    // Only the valid task should be parsed
    // - [] has no valid marker character inside brackets
    // - [z] marker 'z' is not in allowed set [xX\s\-~]
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ title: "Valid task", status: "pending" });
  });

  it("parses checkbox without space after dash", () => {
    // The regex uses \s* so zero spaces after dash is allowed
    const markdown = "-[ ] Task without space after dash";
    const todos = parseMarkdownTodos(markdown);

    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ title: "Task without space after dash", status: "pending" });
  });

  it("trims whitespace from titles", () => {
    const markdown = "- [ ]   Title with extra spaces   ";
    const todos = parseMarkdownTodos(markdown);

    expect(todos).toHaveLength(1);
    expect(todos[0]!.title).toBe("Title with extra spaces");
  });

  it("handles mixed content with non-checkbox lines", () => {
    const markdown = `
# Task List

Some description text.

- [ ] Task one
- Regular list item (no checkbox)
- [x] Task two

More text at the end.
    `.trim();

    const todos = parseMarkdownTodos(markdown);

    expect(todos).toHaveLength(2);
    expect(todos[0]).toMatchObject({ title: "Task one", status: "pending" });
    expect(todos[1]).toMatchObject({ title: "Task two", status: "done" });
  });

  it("generates unique IDs for each todo", () => {
    const markdown = `
- [ ] Task one
- [ ] Task two
- [ ] Task three
    `.trim();

    const todos = parseMarkdownTodos(markdown);
    const ids = todos.map((t) => t.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(todos.length);
  });

  describe("useContentHash option", () => {
    it("generates stable MD5-based IDs when useContentHash is true", () => {
      const markdown = "- [ ] Buy groceries";

      // Parse twice with content hash
      const todos1 = parseMarkdownTodos(markdown, { useContentHash: true });
      const todos2 = parseMarkdownTodos(markdown, { useContentHash: true });

      // Same content should produce same ID (idempotent)
      expect(todos1[0]!.id).toBe(todos2[0]!.id);
    });

    it("generates different IDs for different content", () => {
      const markdown1 = "- [ ] Buy groceries";
      const markdown2 = "- [ ] Call mom";

      const todos1 = parseMarkdownTodos(markdown1, { useContentHash: true });
      const todos2 = parseMarkdownTodos(markdown2, { useContentHash: true });

      expect(todos1[0]!.id).not.toBe(todos2[0]!.id);
    });

    it("generates 8-character hex IDs", () => {
      const markdown = "- [ ] Test task";
      const todos = parseMarkdownTodos(markdown, { useContentHash: true });

      expect(todos[0]!.id).toMatch(/^[a-f0-9]{8}$/);
    });

    it("uses random nanoid when useContentHash is false or not provided", () => {
      const markdown = "- [ ] Buy groceries";

      // Parse without content hash option
      const todos1 = parseMarkdownTodos(markdown);
      const todos2 = parseMarkdownTodos(markdown);

      // Random IDs should be different
      expect(todos1[0]!.id).not.toBe(todos2[0]!.id);
    });

    it("handles multiple todos with content hash", () => {
      const markdown = `
- [ ] Task one
- [x] Task two
- [-] Task three
      `.trim();

      const todos = parseMarkdownTodos(markdown, { useContentHash: true });

      // All IDs should be unique (different content)
      const ids = new Set(todos.map((t) => t.id));
      expect(ids.size).toBe(3);

      // All IDs should be 8-char hex
      todos.forEach((todo) => {
        expect(todo.id).toMatch(/^[a-f0-9]{8}$/);
      });
    });
  });
});

// =============================================================================
// parseCommaSeparated Tests
// =============================================================================

describe("parseCommaSeparated", () => {
  it("splits by comma when no checkboxes", () => {
    const input = "Buy groceries, Call mom, Finish report";
    const todos = parseCommaSeparated(input);

    expect(todos).toHaveLength(3);
    expect(todos[0]).toMatchObject({ title: "Buy groceries", status: "pending" });
    expect(todos[1]).toMatchObject({ title: "Call mom", status: "pending" });
    expect(todos[2]).toMatchObject({ title: "Finish report", status: "pending" });
  });

  it("trims whitespace from each item", () => {
    const input = "  Task one  ,   Task two   ,Task three";
    const todos = parseCommaSeparated(input);

    expect(todos).toHaveLength(3);
    expect(todos[0]!.title).toBe("Task one");
    expect(todos[1]!.title).toBe("Task two");
    expect(todos[2]!.title).toBe("Task three");
  });

  it("handles empty input", () => {
    const todos = parseCommaSeparated("");
    expect(todos).toHaveLength(0);
  });

  it("handles whitespace-only input", () => {
    const todos = parseCommaSeparated("   ");
    expect(todos).toHaveLength(0);
  });

  it("filters out empty segments", () => {
    const input = "Task one, , Task two, ,, Task three";
    const todos = parseCommaSeparated(input);

    expect(todos).toHaveLength(3);
    expect(todos[0]!.title).toBe("Task one");
    expect(todos[1]!.title).toBe("Task two");
    expect(todos[2]!.title).toBe("Task three");
  });

  it("handles single item without comma", () => {
    const input = "Single task";
    const todos = parseCommaSeparated(input);

    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ title: "Single task", status: "pending" });
  });

  it("all items default to pending status", () => {
    const input = "Task one, Task two, Task three";
    const todos = parseCommaSeparated(input);

    todos.forEach((todo) => {
      expect(todo.status).toBe("pending");
      expect(todo.completedAt).toBeUndefined();
    });
  });

  it("generates unique IDs for each todo", () => {
    const input = "Task one, Task two, Task three";
    const todos = parseCommaSeparated(input);
    const ids = todos.map((t) => t.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(todos.length);
  });

  describe("useContentHash option", () => {
    it("generates stable MD5-based IDs when useContentHash is true", () => {
      const input = "Buy groceries, Call mom";

      const todos1 = parseCommaSeparated(input, { useContentHash: true });
      const todos2 = parseCommaSeparated(input, { useContentHash: true });

      // Same content should produce same IDs
      expect(todos1[0]!.id).toBe(todos2[0]!.id);
      expect(todos1[1]!.id).toBe(todos2[1]!.id);
    });

    it("generates 8-character hex IDs", () => {
      const input = "Test task";
      const todos = parseCommaSeparated(input, { useContentHash: true });

      expect(todos[0]!.id).toMatch(/^[a-f0-9]{8}$/);
    });
  });
});

// =============================================================================
// todosToMarkdown Tests
// =============================================================================

describe("todosToMarkdown", () => {
  const now = new Date().toISOString();

  it("serializes pending as [ ]", () => {
    const todos = [{ id: "1", title: "Pending task", status: "pending" as const, createdAt: now }];

    const markdown = todosToMarkdown(todos);

    expect(markdown).toBe("- [ ] Pending task");
  });

  it("serializes done as [x]", () => {
    const todos = [
      { id: "1", title: "Done task", status: "done" as const, createdAt: now, completedAt: now },
    ];

    const markdown = todosToMarkdown(todos);

    expect(markdown).toBe("- [x] Done task");
  });

  it("serializes skipped as [-]", () => {
    const todos = [
      {
        id: "1",
        title: "Skipped task",
        status: "skipped" as const,
        createdAt: now,
        completedAt: now,
      },
    ];

    const markdown = todosToMarkdown(todos);

    expect(markdown).toBe("- [-] Skipped task");
  });

  it("serializes multiple todos with newlines", () => {
    const todos = [
      { id: "1", title: "First", status: "pending" as const, createdAt: now },
      { id: "2", title: "Second", status: "done" as const, createdAt: now, completedAt: now },
      { id: "3", title: "Third", status: "skipped" as const, createdAt: now, completedAt: now },
    ];

    const markdown = todosToMarkdown(todos);

    expect(markdown).toBe("- [ ] First\n- [x] Second\n- [-] Third");
  });

  it("handles empty array", () => {
    const markdown = todosToMarkdown([]);
    expect(markdown).toBe("");
  });

  it("round-trips through parse and serialize", () => {
    const originalMarkdown = `- [ ] Pending task
- [x] Done task
- [-] Skipped task`;

    const todos = parseMarkdownTodos(originalMarkdown);
    const serialized = todosToMarkdown(todos);

    // Should produce equivalent output (note: uppercase X becomes lowercase x)
    expect(serialized).toBe(originalMarkdown);
  });
});
