/**
 * Tests for Tool Output Trimming Module
 *
 * Verifies protected tools functionality per REQ-012:
 * - Protected tools are skipped during truncation
 * - Non-protected tools are truncated normally
 * - Empty protected list allows all tools to be truncated
 *
 * @module @vellum/core/context/__tests__/tool-trimming.test
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROTECTED_TOOLS,
  DEFAULT_TRUNCATION_MARKER,
  getToolNameForResult,
  getToolResultLength,
  isProtectedTool,
  pruneToolOutputs,
  trimToolResult,
} from "../tool-trimming.js";
import type { ContentBlock, ContextMessage, ToolResultBlock, ToolUseBlock } from "../types.js";
import { MessagePriority } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test message with tool_use blocks.
 */
function createToolUseMessage(tools: Array<{ id: string; name: string }>): ContextMessage {
  const content: ToolUseBlock[] = tools.map((tool) => ({
    type: "tool_use" as const,
    id: tool.id,
    name: tool.name,
    input: {},
  }));

  return {
    id: `msg-tool-use-${Date.now()}`,
    role: "assistant",
    content,
    priority: MessagePriority.TOOL_PAIR,
    createdAt: Date.now(),
  };
}

/**
 * Create a test message with tool_result blocks.
 */
function createToolResultMessage(
  results: Array<{ toolUseId: string; content: string }>
): ContextMessage {
  const content: ToolResultBlock[] = results.map((result) => ({
    type: "tool_result" as const,
    tool_use_id: result.toolUseId,
    content: result.content,
  }));

  return {
    id: `msg-tool-result-${Date.now()}`,
    role: "user",
    content,
    priority: MessagePriority.TOOL_PAIR,
    createdAt: Date.now(),
  };
}

// ============================================================================
// isProtectedTool Tests
// ============================================================================

describe("isProtectedTool", () => {
  it("should return true for protected tools", () => {
    expect(isProtectedTool("skill", DEFAULT_PROTECTED_TOOLS)).toBe(true);
    expect(isProtectedTool("memory_search", DEFAULT_PROTECTED_TOOLS)).toBe(true);
    expect(isProtectedTool("code_review", DEFAULT_PROTECTED_TOOLS)).toBe(true);
  });

  it("should be case-insensitive", () => {
    expect(isProtectedTool("SKILL", DEFAULT_PROTECTED_TOOLS)).toBe(true);
    expect(isProtectedTool("Memory_Search", DEFAULT_PROTECTED_TOOLS)).toBe(true);
    expect(isProtectedTool("CODE_REVIEW", DEFAULT_PROTECTED_TOOLS)).toBe(true);
  });

  it("should return false for non-protected tools", () => {
    expect(isProtectedTool("read_file", DEFAULT_PROTECTED_TOOLS)).toBe(false);
    expect(isProtectedTool("write_file", DEFAULT_PROTECTED_TOOLS)).toBe(false);
    expect(isProtectedTool("execute_command", DEFAULT_PROTECTED_TOOLS)).toBe(false);
  });

  it("should return false with empty protected list", () => {
    expect(isProtectedTool("skill", [])).toBe(false);
    expect(isProtectedTool("memory_search", [])).toBe(false);
  });

  it("should handle custom protected tools", () => {
    const customProtected = ["custom_tool", "important_data"];
    expect(isProtectedTool("custom_tool", customProtected)).toBe(true);
    expect(isProtectedTool("important_data", customProtected)).toBe(true);
    expect(isProtectedTool("skill", customProtected)).toBe(false);
  });
});

// ============================================================================
// getToolNameForResult Tests
// ============================================================================

describe("getToolNameForResult", () => {
  it("should find tool name from previous tool_use block", () => {
    const messages: ContextMessage[] = [
      createToolUseMessage([{ id: "tool-123", name: "read_file" }]),
      createToolResultMessage([{ toolUseId: "tool-123", content: "file contents" }]),
    ];

    expect(getToolNameForResult("tool-123", messages)).toBe("read_file");
  });

  it("should return undefined for unknown tool_use_id", () => {
    const messages: ContextMessage[] = [
      createToolUseMessage([{ id: "tool-123", name: "read_file" }]),
    ];

    expect(getToolNameForResult("unknown-id", messages)).toBeUndefined();
  });

  it("should handle multiple tools in same message", () => {
    const messages: ContextMessage[] = [
      createToolUseMessage([
        { id: "tool-1", name: "read_file" },
        { id: "tool-2", name: "write_file" },
        { id: "tool-3", name: "skill" },
      ]),
    ];

    expect(getToolNameForResult("tool-1", messages)).toBe("read_file");
    expect(getToolNameForResult("tool-2", messages)).toBe("write_file");
    expect(getToolNameForResult("tool-3", messages)).toBe("skill");
  });
});

// ============================================================================
// getToolResultLength Tests
// ============================================================================

describe("getToolResultLength", () => {
  it("should calculate length for string content", () => {
    const block: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "test",
      content: "Hello, World!",
    };
    expect(getToolResultLength(block)).toBe(13);
  });

  it("should calculate length for content block array", () => {
    const block: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "test",
      content: [
        { type: "text", text: "First part" },
        { type: "text", text: "Second part" },
      ] as ContentBlock[],
    };
    expect(getToolResultLength(block)).toBe(21); // 10 + 11
  });
});

// ============================================================================
// trimToolResult Tests
// ============================================================================

describe("trimToolResult", () => {
  it("should not trim content within limit", () => {
    const block: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "test",
      content: "Short content",
    };

    const result = trimToolResult(block, 100, DEFAULT_TRUNCATION_MARKER, false);

    expect(result.trimmed).toBe(false);
    expect(result.charsRemoved).toBe(0);
    expect(result.block).toBe(block); // Same reference when not trimmed
  });

  it("should trim content exceeding limit", () => {
    const longContent = "x".repeat(200);
    const block: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "test",
      content: longContent,
    };

    const result = trimToolResult(block, 100, DEFAULT_TRUNCATION_MARKER, false);

    expect(result.trimmed).toBe(true);
    expect(result.charsRemoved).toBe(100);
    expect((result.block.content as string).endsWith(DEFAULT_TRUNCATION_MARKER)).toBe(true);
    expect((result.block.content as string).length).toBe(100);
  });

  it("should add compactedAt when tracking enabled", () => {
    const longContent = "x".repeat(200);
    const block: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "test",
      content: longContent,
    };

    const before = Date.now();
    const result = trimToolResult(block, 100, DEFAULT_TRUNCATION_MARKER, true);
    const after = Date.now();

    expect(result.trimmed).toBe(true);
    expect(result.block.compactedAt).toBeDefined();
    expect(result.block.compactedAt).toBeGreaterThanOrEqual(before);
    expect(result.block.compactedAt).toBeLessThanOrEqual(after);
  });
});

// ============================================================================
// pruneToolOutputs Tests - Protected Tools (REQ-012)
// ============================================================================

describe("pruneToolOutputs - Protected Tools", () => {
  it("should skip protected tools during truncation", () => {
    const largeContent = "x".repeat(20000); // Exceeds default limit

    const messages: ContextMessage[] = [
      createToolUseMessage([
        { id: "tool-1", name: "skill" }, // Protected
        { id: "tool-2", name: "read_file" }, // Not protected
      ]),
      createToolResultMessage([
        { toolUseId: "tool-1", content: largeContent },
        { toolUseId: "tool-2", content: largeContent },
      ]),
    ];

    const result = pruneToolOutputs(messages, {
      maxOutputChars: 5000,
      protectedTools: DEFAULT_PROTECTED_TOOLS,
    });

    // Should only trim read_file, not skill
    expect(result.trimmedCount).toBe(1);
    expect(result.trimmedTools).toEqual(["read_file"]);

    // Verify skill content is preserved
    const toolResultMsg = result.messages[1];
    const content = toolResultMsg?.content as ToolResultBlock[];
    const skillBlock = content?.find((b) => b.tool_use_id === "tool-1");
    const readFileBlock = content?.find((b) => b.tool_use_id === "tool-2");

    expect((skillBlock?.content as string).length).toBe(20000); // Unchanged
    expect((readFileBlock?.content as string).length).toBe(5000); // Trimmed
  });

  it("should truncate all tools when protected list is empty", () => {
    const largeContent = "x".repeat(20000);

    const messages: ContextMessage[] = [
      createToolUseMessage([
        { id: "tool-1", name: "skill" },
        { id: "tool-2", name: "memory_search" },
      ]),
      createToolResultMessage([
        { toolUseId: "tool-1", content: largeContent },
        { toolUseId: "tool-2", content: largeContent },
      ]),
    ];

    const result = pruneToolOutputs(messages, {
      maxOutputChars: 5000,
      protectedTools: [], // Empty list
    });

    // Both should be trimmed
    expect(result.trimmedCount).toBe(2);
    expect(result.trimmedTools.sort()).toEqual(["memory_search", "skill"]);
  });

  it("should not modify messages when all tools are protected", () => {
    const largeContent = "x".repeat(20000);

    const messages: ContextMessage[] = [
      createToolUseMessage([
        { id: "tool-1", name: "skill" },
        { id: "tool-2", name: "code_review" },
      ]),
      createToolResultMessage([
        { toolUseId: "tool-1", content: largeContent },
        { toolUseId: "tool-2", content: largeContent },
      ]),
    ];

    const result = pruneToolOutputs(messages, {
      maxOutputChars: 5000,
      protectedTools: DEFAULT_PROTECTED_TOOLS,
    });

    expect(result.trimmedCount).toBe(0);
    expect(result.charsRemoved).toBe(0);
    expect(result.trimmedTools).toEqual([]);
  });

  it("should handle custom protected tools list", () => {
    const largeContent = "x".repeat(20000);

    const messages: ContextMessage[] = [
      createToolUseMessage([
        { id: "tool-1", name: "important_data" },
        { id: "tool-2", name: "read_file" },
        { id: "tool-3", name: "skill" }, // Default protected, but not in custom list
      ]),
      createToolResultMessage([
        { toolUseId: "tool-1", content: largeContent },
        { toolUseId: "tool-2", content: largeContent },
        { toolUseId: "tool-3", content: largeContent },
      ]),
    ];

    const result = pruneToolOutputs(messages, {
      maxOutputChars: 5000,
      protectedTools: ["important_data"], // Custom list, skill NOT protected
    });

    // Should trim read_file and skill, but not important_data
    expect(result.trimmedCount).toBe(2);
    expect(result.trimmedTools.sort()).toEqual(["read_file", "skill"]);
  });

  it("should handle mixed content types", () => {
    // Message with string content (not tool results)
    const textMessage: ContextMessage = {
      id: "msg-text",
      role: "user",
      content: "This is a regular text message",
      priority: MessagePriority.NORMAL,
    };

    const largeContent = "x".repeat(20000);
    const messages: ContextMessage[] = [
      textMessage,
      createToolUseMessage([{ id: "tool-1", name: "read_file" }]),
      createToolResultMessage([{ toolUseId: "tool-1", content: largeContent }]),
    ];

    const result = pruneToolOutputs(messages, {
      maxOutputChars: 5000,
      protectedTools: DEFAULT_PROTECTED_TOOLS,
    });

    expect(result.trimmedCount).toBe(1);
    expect(result.messages[0]).toBe(textMessage); // Text message unchanged
  });

  it("should preserve original messages (immutability)", () => {
    const largeContent = "x".repeat(20000);

    const originalMessages: ContextMessage[] = [
      createToolUseMessage([{ id: "tool-1", name: "read_file" }]),
      createToolResultMessage([{ toolUseId: "tool-1", content: largeContent }]),
    ];

    // Store original content reference
    const originalContent = (
      (originalMessages[1]?.content as ToolResultBlock[])[0] as ToolResultBlock
    ).content;

    const result = pruneToolOutputs(originalMessages, {
      maxOutputChars: 5000,
      protectedTools: DEFAULT_PROTECTED_TOOLS,
    });

    // Original should be unchanged
    expect(
      ((originalMessages[1]?.content as ToolResultBlock[])[0] as ToolResultBlock).content
    ).toBe(originalContent);
    expect((originalContent as string).length).toBe(20000);

    // Result should have trimmed content
    const resultContent = ((result.messages[1]?.content as ToolResultBlock[])[0] as ToolResultBlock)
      .content;
    expect((resultContent as string).length).toBe(5000);
  });

  it("should handle case-insensitive tool name matching for protection", () => {
    const largeContent = "x".repeat(20000);

    const messages: ContextMessage[] = [
      createToolUseMessage([
        { id: "tool-1", name: "SKILL" }, // Uppercase
        { id: "tool-2", name: "Memory_Search" }, // Mixed case
      ]),
      createToolResultMessage([
        { toolUseId: "tool-1", content: largeContent },
        { toolUseId: "tool-2", content: largeContent },
      ]),
    ];

    const result = pruneToolOutputs(messages, {
      maxOutputChars: 5000,
      protectedTools: DEFAULT_PROTECTED_TOOLS,
    });

    // Both should be protected despite case differences
    expect(result.trimmedCount).toBe(0);
    expect(result.charsRemoved).toBe(0);
  });
});

// ============================================================================
// pruneToolOutputs Tests - Metrics
// ============================================================================

describe("pruneToolOutputs - Metrics", () => {
  it("should calculate correct characters removed", () => {
    const largeContent = "x".repeat(20000);

    const messages: ContextMessage[] = [
      createToolUseMessage([{ id: "tool-1", name: "read_file" }]),
      createToolResultMessage([{ toolUseId: "tool-1", content: largeContent }]),
    ];

    const result = pruneToolOutputs(messages, {
      maxOutputChars: 5000,
      protectedTools: DEFAULT_PROTECTED_TOOLS,
    });

    // Should remove 15000 chars (20000 - 5000)
    expect(result.charsRemoved).toBe(15000);
  });

  it("should estimate tokens saved correctly", () => {
    const largeContent = "x".repeat(20000);

    const messages: ContextMessage[] = [
      createToolUseMessage([{ id: "tool-1", name: "read_file" }]),
      createToolResultMessage([{ toolUseId: "tool-1", content: largeContent }]),
    ];

    const result = pruneToolOutputs(messages, {
      maxOutputChars: 5000,
      protectedTools: DEFAULT_PROTECTED_TOOLS,
    });

    // ~4 chars per token, so 15000 / 4 = 3750
    expect(result.tokensSaved).toBe(3750);
  });
});
