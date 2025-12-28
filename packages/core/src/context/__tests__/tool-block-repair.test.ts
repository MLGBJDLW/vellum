/**
 * Tests for Tool Block Repair Module
 *
 * @module @vellum/core/context/tool-block-repair.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlaceholderToolUse,
  fixMismatchedToolBlocks,
  getToolBlockHealthSummary,
  hasToolBlockIssues,
  reorderToolResult,
  validateToolBlockPairing,
} from "../tool-block-repair.js";
import type { ContextMessage } from "../types.js";
import { MessagePriority } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createToolUseMessage(id: string, toolId: string, toolName: string): ContextMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "tool_use", id: toolId, name: toolName, input: {} }],
    priority: MessagePriority.TOOL_PAIR,
  };
}

function createToolResultMessage(
  id: string,
  toolUseId: string,
  content: string = "result"
): ContextMessage {
  return {
    id,
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
    priority: MessagePriority.TOOL_PAIR,
  };
}

function createTextMessage(id: string, role: "user" | "assistant", text: string): ContextMessage {
  return {
    id,
    role,
    content: text,
    priority: MessagePriority.NORMAL,
  };
}

// ============================================================================
// fixMismatchedToolBlocks
// ============================================================================

describe("fixMismatchedToolBlocks", () => {
  describe("empty input handling", () => {
    it("should return empty result for empty messages", () => {
      const result = fixMismatchedToolBlocks([]);

      expect(result.messages).toEqual([]);
      expect(result.repaired).toBe(false);
      expect(result.repairs).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe("no issues", () => {
    it("should return unchanged messages when no issues exist", () => {
      const messages: ContextMessage[] = [
        createToolUseMessage("m1", "tool-1", "read_file"),
        createToolResultMessage("m2", "tool-1", "file content"),
      ];

      const result = fixMismatchedToolBlocks(messages);

      expect(result.repaired).toBe(false);
      expect(result.repairs).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.messages).toHaveLength(2);
    });

    it("should handle messages with no tool blocks", () => {
      const messages: ContextMessage[] = [
        createTextMessage("m1", "user", "Hello"),
        createTextMessage("m2", "assistant", "Hi there"),
      ];

      const result = fixMismatchedToolBlocks(messages);

      expect(result.repaired).toBe(false);
      expect(result.messages).toHaveLength(2);
    });
  });

  describe("reordering", () => {
    it("should reorder tool_result appearing before tool_use", () => {
      const messages: ContextMessage[] = [
        createToolResultMessage("m1", "tool-1", "result"),
        createToolUseMessage("m2", "tool-1", "read_file"),
      ];

      const result = fixMismatchedToolBlocks(messages);

      expect(result.repaired).toBe(true);
      expect(result.repairs).toHaveLength(1);
      expect(result.repairs[0]?.type).toBe("reorder");
      expect(result.repairs[0]?.toolId).toBe("tool-1");

      // Check order is fixed
      const content0 = result.messages[0]?.content;
      const content1 = result.messages[1]?.content;
      expect(Array.isArray(content0) && content0[0]?.type).toBe("tool_use");
      expect(Array.isArray(content1) && content1[0]?.type).toBe("tool_result");
    });

    it("should handle multiple reorder issues", () => {
      const messages: ContextMessage[] = [
        createToolResultMessage("m1", "tool-1", "result1"),
        createToolResultMessage("m2", "tool-2", "result2"),
        createToolUseMessage("m3", "tool-1", "read_file"),
        createToolUseMessage("m4", "tool-2", "write_file"),
      ];

      const result = fixMismatchedToolBlocks(messages);

      expect(result.repaired).toBe(true);
      expect(result.repairs.filter((r) => r.type === "reorder").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("orphaned tool_use handling", () => {
    it("should warn about orphaned tool_use by default", () => {
      const messages: ContextMessage[] = [
        createToolUseMessage("m1", "tool-1", "read_file"),
        createTextMessage("m2", "user", "Hello"),
      ];

      const result = fixMismatchedToolBlocks(messages);

      expect(result.repaired).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("tool-1");
      expect(result.warnings[0]).toContain("Orphaned");
    });

    it("should remove orphaned tool_use when removeOrphanedUses is true", () => {
      const messages: ContextMessage[] = [
        createToolUseMessage("m1", "tool-1", "read_file"),
        createTextMessage("m2", "user", "Hello"),
      ];

      const result = fixMismatchedToolBlocks(messages, {
        removeOrphanedUses: true,
      });

      expect(result.repaired).toBe(true);
      expect(result.repairs).toHaveLength(1);
      expect(result.repairs[0]?.type).toBe("remove_orphan_use");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.id).toBe("m2");
    });
  });

  describe("orphaned tool_result handling", () => {
    it("should add placeholder for orphaned tool_result by default", () => {
      const messages: ContextMessage[] = [
        createTextMessage("m1", "user", "Hello"),
        createToolResultMessage("m2", "tool-1", "result"),
      ];

      const result = fixMismatchedToolBlocks(messages);

      expect(result.repaired).toBe(true);
      expect(result.repairs).toHaveLength(1);
      expect(result.repairs[0]?.type).toBe("add_placeholder");
      expect(result.messages).toHaveLength(3);

      // Placeholder should be before result
      const placeholder = result.messages[1];
      expect(placeholder?.id).toContain("placeholder");
      expect(Array.isArray(placeholder?.content)).toBe(true);
    });

    it("should warn about orphaned tool_result when addPlaceholderUses is false", () => {
      const messages: ContextMessage[] = [
        createTextMessage("m1", "user", "Hello"),
        createToolResultMessage("m2", "tool-1", "result"),
      ];

      const result = fixMismatchedToolBlocks(messages, {
        addPlaceholderUses: false,
      });

      expect(result.repaired).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("tool-1");
      expect(result.messages).toHaveLength(2);
    });
  });

  describe("verbose logging", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it("should log repairs when verbose is true", () => {
      const messages: ContextMessage[] = [
        createToolResultMessage("m1", "tool-1", "result"),
        createToolUseMessage("m2", "tool-1", "read_file"),
      ];

      fixMismatchedToolBlocks(messages, { verbose: true });

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleLogSpy.mock.calls[0]?.[0]).toContain("reorder");
    });

    it("should log warnings when verbose is true", () => {
      const messages: ContextMessage[] = [createToolUseMessage("m1", "tool-1", "read_file")];

      fixMismatchedToolBlocks(messages, { verbose: true });

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain("Warning");
    });
  });

  describe("immutability", () => {
    it("should not mutate original messages", () => {
      const messages: ContextMessage[] = [
        createToolResultMessage("m1", "tool-1", "result"),
        createToolUseMessage("m2", "tool-1", "read_file"),
      ];
      const originalJson = JSON.stringify(messages);

      fixMismatchedToolBlocks(messages);

      expect(JSON.stringify(messages)).toBe(originalJson);
    });
  });
});

// ============================================================================
// validateToolBlockPairing
// ============================================================================

describe("validateToolBlockPairing", () => {
  it("should return empty array for empty messages", () => {
    const errors = validateToolBlockPairing([]);
    expect(errors).toEqual([]);
  });

  it("should return empty array for valid pairing", () => {
    const messages: ContextMessage[] = [
      createToolUseMessage("m1", "tool-1", "read_file"),
      createToolResultMessage("m2", "tool-1", "content"),
    ];

    const errors = validateToolBlockPairing(messages);
    expect(errors).toHaveLength(0);
  });

  it("should detect wrong order", () => {
    const messages: ContextMessage[] = [
      createToolResultMessage("m1", "tool-1", "result"),
      createToolUseMessage("m2", "tool-1", "read_file"),
    ];

    const errors = validateToolBlockPairing(messages);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.type).toBe("wrong_order");
    expect(errors[0]?.toolId).toBe("tool-1");
    expect(errors[0]?.messageIndex).toBe(0);
  });

  it("should detect orphaned tool_use", () => {
    const messages: ContextMessage[] = [createToolUseMessage("m1", "tool-1", "read_file")];

    const errors = validateToolBlockPairing(messages);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.type).toBe("orphan_use");
    expect(errors[0]?.toolId).toBe("tool-1");
  });

  it("should detect orphaned tool_result", () => {
    const messages: ContextMessage[] = [createToolResultMessage("m1", "tool-1", "result")];

    const errors = validateToolBlockPairing(messages);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.type).toBe("orphan_result");
    expect(errors[0]?.toolId).toBe("tool-1");
  });

  it("should detect multiple issues", () => {
    const messages: ContextMessage[] = [
      createToolResultMessage("m1", "tool-1", "result1"),
      createToolUseMessage("m2", "tool-2", "write_file"),
      createToolResultMessage("m3", "tool-3", "result3"),
    ];

    const errors = validateToolBlockPairing(messages);

    expect(errors.length).toBeGreaterThanOrEqual(2);
    const types = errors.map((e) => e.type);
    expect(types).toContain("orphan_result");
    expect(types).toContain("orphan_use");
  });
});

// ============================================================================
// hasToolBlockIssues
// ============================================================================

describe("hasToolBlockIssues", () => {
  it("should return false for empty messages", () => {
    expect(hasToolBlockIssues([])).toBe(false);
  });

  it("should return false for valid messages", () => {
    const messages: ContextMessage[] = [
      createToolUseMessage("m1", "tool-1", "read_file"),
      createToolResultMessage("m2", "tool-1", "content"),
    ];

    expect(hasToolBlockIssues(messages)).toBe(false);
  });

  it("should return true for messages with issues", () => {
    const messages: ContextMessage[] = [
      createToolResultMessage("m1", "tool-1", "result"),
      createToolUseMessage("m2", "tool-1", "read_file"),
    ];

    expect(hasToolBlockIssues(messages)).toBe(true);
  });

  it("should return true for orphaned blocks", () => {
    const messages: ContextMessage[] = [createToolUseMessage("m1", "tool-1", "read_file")];

    expect(hasToolBlockIssues(messages)).toBe(true);
  });
});

// ============================================================================
// reorderToolResult
// ============================================================================

describe("reorderToolResult", () => {
  it("should handle invalid indices gracefully", () => {
    const messages: ContextMessage[] = [createTextMessage("m1", "user", "Hello")];

    const result = reorderToolResult(messages, -1, 0);
    expect(result).toHaveLength(1);

    const result2 = reorderToolResult(messages, 0, 5);
    expect(result2).toHaveLength(1);
  });

  it("should not reorder if result is already after use", () => {
    const messages: ContextMessage[] = [
      createToolUseMessage("m1", "tool-1", "read_file"),
      createToolResultMessage("m2", "tool-1", "content"),
    ];

    const result = reorderToolResult(messages, 1, 0);

    expect(result[0]?.id).toBe("m1");
    expect(result[1]?.id).toBe("m2");
  });

  it("should move result after use", () => {
    const messages: ContextMessage[] = [
      createToolResultMessage("m1", "tool-1", "result"),
      createTextMessage("m2", "user", "text"),
      createToolUseMessage("m3", "tool-1", "read_file"),
    ];

    const result = reorderToolResult(messages, 0, 2);

    // Order should be: m2, m3, m1
    expect(result[0]?.id).toBe("m2");
    expect(result[1]?.id).toBe("m3");
    expect(result[2]?.id).toBe("m1");
  });

  it("should handle adjacent messages", () => {
    const messages: ContextMessage[] = [
      createToolResultMessage("m1", "tool-1", "result"),
      createToolUseMessage("m2", "tool-1", "read_file"),
    ];

    const result = reorderToolResult(messages, 0, 1);

    expect(result[0]?.id).toBe("m2");
    expect(result[1]?.id).toBe("m1");
  });

  it("should not mutate original array", () => {
    const messages: ContextMessage[] = [
      createToolResultMessage("m1", "tool-1", "result"),
      createToolUseMessage("m2", "tool-1", "read_file"),
    ];
    const originalOrder = messages.map((m) => m.id);

    reorderToolResult(messages, 0, 1);

    expect(messages.map((m) => m.id)).toEqual(originalOrder);
  });
});

// ============================================================================
// createPlaceholderToolUse
// ============================================================================

describe("createPlaceholderToolUse", () => {
  it("should create placeholder with correct toolId", () => {
    const placeholder = createPlaceholderToolUse("tool-123");

    expect(placeholder.role).toBe("assistant");
    expect(placeholder.priority).toBe(MessagePriority.TOOL_PAIR);

    // Check content contains tool_use block with correct id
    const content = placeholder.content as Array<{ type: string; id?: string }>;
    const toolUseBlock = content.find((b) => b.type === "tool_use");
    expect(toolUseBlock?.id).toBe("tool-123");
  });

  it("should use default tool name if not provided", () => {
    const placeholder = createPlaceholderToolUse("tool-123");

    const content = placeholder.content as Array<{ type: string; name?: string }>;
    const toolUseBlock = content.find((b) => b.type === "tool_use");
    expect(toolUseBlock?.name).toBe("unknown_tool");
  });

  it("should use provided tool name", () => {
    const placeholder = createPlaceholderToolUse("tool-123", "read_file");

    const content = placeholder.content as Array<{ type: string; name?: string }>;
    const toolUseBlock = content.find((b) => b.type === "tool_use");
    expect(toolUseBlock?.name).toBe("read_file");
  });

  it("should include explanatory text", () => {
    const placeholder = createPlaceholderToolUse("tool-123");

    const content = placeholder.content as Array<{ type: string; text?: string }>;
    const textBlock = content.find((b) => b.type === "text");
    expect(textBlock?.text).toContain("Placeholder");
  });

  it("should generate unique ID", () => {
    const placeholder1 = createPlaceholderToolUse("tool-1");
    const placeholder2 = createPlaceholderToolUse("tool-2");

    expect(placeholder1.id).not.toBe(placeholder2.id);
    expect(placeholder1.id).toContain("placeholder");
    expect(placeholder2.id).toContain("placeholder");
  });
});

// ============================================================================
// getToolBlockHealthSummary
// ============================================================================

describe("getToolBlockHealthSummary", () => {
  it("should return zeros for empty messages", () => {
    const health = getToolBlockHealthSummary([]);

    expect(health.totalPairs).toBe(0);
    expect(health.completePairs).toBe(0);
    expect(health.orphanedUses).toBe(0);
    expect(health.orphanedResults).toBe(0);
    expect(health.orderIssues).toBe(0);
  });

  it("should count complete pairs", () => {
    const messages: ContextMessage[] = [
      createToolUseMessage("m1", "tool-1", "read_file"),
      createToolResultMessage("m2", "tool-1", "content"),
      createToolUseMessage("m3", "tool-2", "write_file"),
      createToolResultMessage("m4", "tool-2", "written"),
    ];

    const health = getToolBlockHealthSummary(messages);

    expect(health.totalPairs).toBe(2);
    expect(health.completePairs).toBe(2);
    expect(health.orphanedUses).toBe(0);
    expect(health.orphanedResults).toBe(0);
    expect(health.orderIssues).toBe(0);
  });

  it("should count orphaned uses", () => {
    const messages: ContextMessage[] = [
      createToolUseMessage("m1", "tool-1", "read_file"),
      createToolUseMessage("m2", "tool-2", "write_file"),
    ];

    const health = getToolBlockHealthSummary(messages);

    expect(health.totalPairs).toBe(2);
    expect(health.completePairs).toBe(0);
    expect(health.orphanedUses).toBe(2);
    expect(health.orphanedResults).toBe(0);
  });

  it("should count orphaned results", () => {
    const messages: ContextMessage[] = [
      createToolResultMessage("m1", "tool-1", "result1"),
      createToolResultMessage("m2", "tool-2", "result2"),
    ];

    const health = getToolBlockHealthSummary(messages);

    expect(health.totalPairs).toBe(2);
    expect(health.completePairs).toBe(0);
    expect(health.orphanedUses).toBe(0);
    expect(health.orphanedResults).toBe(2);
  });

  it("should count order issues", () => {
    const messages: ContextMessage[] = [
      createToolResultMessage("m1", "tool-1", "result"),
      createToolUseMessage("m2", "tool-1", "read_file"),
    ];

    const health = getToolBlockHealthSummary(messages);

    expect(health.completePairs).toBe(1);
    expect(health.orderIssues).toBe(1);
  });

  it("should handle mixed issues", () => {
    const messages: ContextMessage[] = [
      createToolResultMessage("m1", "tool-1", "result"), // wrong order
      createToolUseMessage("m2", "tool-1", "read_file"),
      createToolUseMessage("m3", "tool-2", "write_file"), // orphaned use
      createToolResultMessage("m4", "tool-3", "result3"), // orphaned result
    ];

    const health = getToolBlockHealthSummary(messages);

    expect(health.totalPairs).toBe(3); // 1 complete + 1 orphan use + 1 orphan result
    expect(health.completePairs).toBe(1);
    expect(health.orphanedUses).toBe(1);
    expect(health.orphanedResults).toBe(1);
    expect(health.orderIssues).toBe(1);
  });
});
