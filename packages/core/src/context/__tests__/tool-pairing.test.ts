/**
 * Tests for Tool Pairing Analyzer
 *
 * @module @vellum/core/context/tool-pairing.test
 */

import { describe, expect, it } from "vitest";
import {
  analyzeToolPairs,
  areInSameToolPair,
  extractToolResultBlocks,
  extractToolUseBlocks,
  getLinkedIndices,
  hasToolBlocks,
} from "../tool-pairing.js";
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
// extractToolUseBlocks
// ============================================================================

describe("extractToolUseBlocks", () => {
  it("should return empty array for string content", () => {
    const message: ContextMessage = {
      id: "1",
      role: "assistant",
      content: "Hello world",
      priority: MessagePriority.NORMAL,
    };
    expect(extractToolUseBlocks(message)).toEqual([]);
  });

  it("should return empty array for content with no tool_use blocks", () => {
    const message: ContextMessage = {
      id: "1",
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
      priority: MessagePriority.NORMAL,
    };
    expect(extractToolUseBlocks(message)).toEqual([]);
  });

  it("should extract single tool_use block", () => {
    const message = createToolUseMessage("1", "tool-1", "read_file");
    const blocks = extractToolUseBlocks(message);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.id).toBe("tool-1");
    expect(blocks[0]?.name).toBe("read_file");
  });

  it("should extract multiple tool_use blocks", () => {
    const message: ContextMessage = {
      id: "1",
      role: "assistant",
      content: [
        { type: "text", text: "I will read two files" },
        { type: "tool_use", id: "tool-1", name: "read_file", input: { path: "a.ts" } },
        { type: "tool_use", id: "tool-2", name: "read_file", input: { path: "b.ts" } },
      ],
      priority: MessagePriority.TOOL_PAIR,
    };
    const blocks = extractToolUseBlocks(message);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.id).toBe("tool-1");
    expect(blocks[1]?.id).toBe("tool-2");
  });
});

// ============================================================================
// extractToolResultBlocks
// ============================================================================

describe("extractToolResultBlocks", () => {
  it("should return empty array for string content", () => {
    const message: ContextMessage = {
      id: "1",
      role: "user",
      content: "Hello world",
      priority: MessagePriority.NORMAL,
    };
    expect(extractToolResultBlocks(message)).toEqual([]);
  });

  it("should return empty array for content with no tool_result blocks", () => {
    const message: ContextMessage = {
      id: "1",
      role: "user",
      content: [{ type: "text", text: "Hello" }],
      priority: MessagePriority.NORMAL,
    };
    expect(extractToolResultBlocks(message)).toEqual([]);
  });

  it("should extract single tool_result block", () => {
    const message = createToolResultMessage("1", "tool-1", "file contents");
    const blocks = extractToolResultBlocks(message);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.tool_use_id).toBe("tool-1");
    expect(blocks[0]?.content).toBe("file contents");
  });

  it("should extract multiple tool_result blocks", () => {
    const message: ContextMessage = {
      id: "1",
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "tool-1", content: "result 1" },
        { type: "tool_result", tool_use_id: "tool-2", content: "result 2" },
      ],
      priority: MessagePriority.TOOL_PAIR,
    };
    const blocks = extractToolResultBlocks(message);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.tool_use_id).toBe("tool-1");
    expect(blocks[1]?.tool_use_id).toBe("tool-2");
  });
});

// ============================================================================
// hasToolBlocks
// ============================================================================

describe("hasToolBlocks", () => {
  it("should return false for string content", () => {
    expect(hasToolBlocks("Hello world")).toBe(false);
  });

  it("should return false for empty array", () => {
    expect(hasToolBlocks([])).toBe(false);
  });

  it("should return false for text-only content", () => {
    expect(hasToolBlocks([{ type: "text", text: "Hello" }])).toBe(false);
  });

  it("should return true for tool_use block", () => {
    expect(hasToolBlocks([{ type: "tool_use", id: "x", name: "test", input: {} }])).toBe(true);
  });

  it("should return true for tool_result block", () => {
    expect(hasToolBlocks([{ type: "tool_result", tool_use_id: "x", content: "result" }])).toBe(
      true
    );
  });

  it("should return true for mixed content with tool blocks", () => {
    expect(
      hasToolBlocks([
        { type: "text", text: "Hello" },
        { type: "tool_use", id: "x", name: "test", input: {} },
      ])
    ).toBe(true);
  });
});

// ============================================================================
// analyzeToolPairs - Basic Cases
// ============================================================================

describe("analyzeToolPairs", () => {
  describe("basic cases", () => {
    it("should return empty analysis for empty messages", () => {
      const analysis = analyzeToolPairs([]);
      expect(analysis.pairs).toEqual([]);
      expect(analysis.orphanedUses).toEqual([]);
      expect(analysis.orphanedResults).toEqual([]);
      expect(analysis.pairedMessageIndices.size).toBe(0);
    });

    it("should return empty analysis for messages without tools", () => {
      const messages = [
        createTextMessage("1", "user", "Hello"),
        createTextMessage("2", "assistant", "Hi there"),
      ];
      const analysis = analyzeToolPairs(messages);
      expect(analysis.pairs).toEqual([]);
      expect(analysis.orphanedUses).toEqual([]);
      expect(analysis.orphanedResults).toEqual([]);
    });

    it("should identify a single complete tool pair", () => {
      const messages = [
        createToolUseMessage("1", "tool-1", "read_file"),
        createToolResultMessage("2", "tool-1", "file contents"),
      ];
      const analysis = analyzeToolPairs(messages);

      expect(analysis.pairs).toHaveLength(1);
      const pair = analysis.pairs[0]!;
      expect(pair.toolId).toBe("tool-1");
      expect(pair.useMessageIndex).toBe(0);
      expect(pair.useBlockIndex).toBe(0);
      expect(pair.resultMessageIndex).toBe(1);
      expect(pair.resultBlockIndex).toBe(0);
      expect(pair.toolName).toBe("read_file");
      expect(pair.isComplete).toBe(true);

      expect(analysis.orphanedUses).toEqual([]);
      expect(analysis.orphanedResults).toEqual([]);
      expect(analysis.pairedMessageIndices.has(0)).toBe(true);
      expect(analysis.pairedMessageIndices.has(1)).toBe(true);
    });
  });

  describe("orphaned blocks", () => {
    it("should detect orphaned tool_use (no result)", () => {
      const messages = [
        createToolUseMessage("1", "tool-1", "read_file"),
        createTextMessage("2", "user", "Never mind"),
      ];
      const analysis = analyzeToolPairs(messages);

      expect(analysis.pairs).toEqual([]);
      expect(analysis.orphanedUses).toHaveLength(1);
      expect(analysis.orphanedUses[0]).toEqual({
        messageIndex: 0,
        blockIndex: 0,
        toolId: "tool-1",
      });
      expect(analysis.orphanedResults).toEqual([]);
    });

    it("should detect orphaned tool_result (no matching use)", () => {
      const messages = [createToolResultMessage("1", "tool-orphan", "result")];
      const analysis = analyzeToolPairs(messages);

      expect(analysis.pairs).toEqual([]);
      expect(analysis.orphanedUses).toEqual([]);
      expect(analysis.orphanedResults).toHaveLength(1);
      expect(analysis.orphanedResults[0]).toEqual({
        messageIndex: 0,
        blockIndex: 0,
        toolId: "tool-orphan",
      });
    });
  });

  describe("multiple tool pairs", () => {
    it("should identify multiple tool pairs in sequence", () => {
      const messages = [
        createToolUseMessage("1", "tool-1", "read_file"),
        createToolResultMessage("2", "tool-1", "contents 1"),
        createToolUseMessage("3", "tool-2", "write_file"),
        createToolResultMessage("4", "tool-2", "success"),
      ];
      const analysis = analyzeToolPairs(messages);

      expect(analysis.pairs).toHaveLength(2);
      expect(analysis.pairs[0]?.toolId).toBe("tool-1");
      expect(analysis.pairs[1]?.toolId).toBe("tool-2");
      expect(analysis.orphanedUses).toEqual([]);
      expect(analysis.orphanedResults).toEqual([]);
    });

    it("should handle multiple tool_use blocks in one message", () => {
      const message: ContextMessage = {
        id: "1",
        role: "assistant",
        content: [
          { type: "tool_use", id: "tool-1", name: "read_file", input: { path: "a.ts" } },
          { type: "tool_use", id: "tool-2", name: "read_file", input: { path: "b.ts" } },
        ],
        priority: MessagePriority.TOOL_PAIR,
      };
      const resultMessage: ContextMessage = {
        id: "2",
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tool-1", content: "contents a" },
          { type: "tool_result", tool_use_id: "tool-2", content: "contents b" },
        ],
        priority: MessagePriority.TOOL_PAIR,
      };
      const messages = [message, resultMessage];
      const analysis = analyzeToolPairs(messages);

      expect(analysis.pairs).toHaveLength(2);

      // Both pairs should reference the same message indices
      expect(analysis.pairs[0]?.useMessageIndex).toBe(0);
      expect(analysis.pairs[0]?.resultMessageIndex).toBe(1);
      expect(analysis.pairs[1]?.useMessageIndex).toBe(0);
      expect(analysis.pairs[1]?.resultMessageIndex).toBe(1);

      // But different block indices
      expect(analysis.pairs[0]?.useBlockIndex).toBe(0);
      expect(analysis.pairs[0]?.resultBlockIndex).toBe(0);
      expect(analysis.pairs[1]?.useBlockIndex).toBe(1);
      expect(analysis.pairs[1]?.resultBlockIndex).toBe(1);
    });

    it("should handle non-adjacent tool pairs", () => {
      const messages = [
        createToolUseMessage("1", "tool-1", "read_file"),
        createTextMessage("2", "user", "some text"),
        createTextMessage("3", "assistant", "more text"),
        createToolResultMessage("4", "tool-1", "contents"),
      ];
      const analysis = analyzeToolPairs(messages);

      expect(analysis.pairs).toHaveLength(1);
      expect(analysis.pairs[0]?.useMessageIndex).toBe(0);
      expect(analysis.pairs[0]?.resultMessageIndex).toBe(3);
    });
  });

  describe("mixed content", () => {
    it("should handle message with text and tool_use", () => {
      const message: ContextMessage = {
        id: "1",
        role: "assistant",
        content: [
          { type: "text", text: "Let me read the file" },
          { type: "tool_use", id: "tool-1", name: "read_file", input: {} },
        ],
        priority: MessagePriority.TOOL_PAIR,
      };
      const result = createToolResultMessage("2", "tool-1", "file contents");
      const analysis = analyzeToolPairs([message, result]);

      expect(analysis.pairs).toHaveLength(1);
      expect(analysis.pairs[0]?.useBlockIndex).toBe(1); // tool_use is at index 1
    });
  });
});

// ============================================================================
// areInSameToolPair
// ============================================================================

describe("areInSameToolPair", () => {
  it("should return false for empty analysis", () => {
    const analysis = analyzeToolPairs([]);
    expect(areInSameToolPair(analysis, 0, 1)).toBe(false);
  });

  it("should return true for paired messages", () => {
    const messages = [
      createToolUseMessage("1", "tool-1", "read_file"),
      createToolResultMessage("2", "tool-1", "contents"),
    ];
    const analysis = analyzeToolPairs(messages);

    expect(areInSameToolPair(analysis, 0, 1)).toBe(true);
    expect(areInSameToolPair(analysis, 1, 0)).toBe(true); // Order shouldn't matter
  });

  it("should return false for unpaired messages", () => {
    const messages = [
      createTextMessage("1", "user", "Hello"),
      createToolUseMessage("2", "tool-1", "read_file"),
      createToolResultMessage("3", "tool-1", "contents"),
    ];
    const analysis = analyzeToolPairs(messages);

    expect(areInSameToolPair(analysis, 0, 1)).toBe(false);
    expect(areInSameToolPair(analysis, 0, 2)).toBe(false);
    expect(areInSameToolPair(analysis, 1, 2)).toBe(true);
  });

  it("should return false for messages in different tool pairs", () => {
    const messages = [
      createToolUseMessage("1", "tool-1", "read_file"),
      createToolResultMessage("2", "tool-1", "contents 1"),
      createToolUseMessage("3", "tool-2", "write_file"),
      createToolResultMessage("4", "tool-2", "success"),
    ];
    const analysis = analyzeToolPairs(messages);

    expect(areInSameToolPair(analysis, 0, 1)).toBe(true);
    expect(areInSameToolPair(analysis, 2, 3)).toBe(true);
    expect(areInSameToolPair(analysis, 0, 2)).toBe(false);
    expect(areInSameToolPair(analysis, 1, 3)).toBe(false);
  });
});

// ============================================================================
// getLinkedIndices
// ============================================================================

describe("getLinkedIndices", () => {
  it("should return empty array for message not in any pair", () => {
    const messages = [createTextMessage("1", "user", "Hello")];
    const analysis = analyzeToolPairs(messages);
    expect(getLinkedIndices(analysis, 0)).toEqual([]);
  });

  it("should return both indices for paired message", () => {
    const messages = [
      createToolUseMessage("1", "tool-1", "read_file"),
      createToolResultMessage("2", "tool-1", "contents"),
    ];
    const analysis = analyzeToolPairs(messages);

    expect(getLinkedIndices(analysis, 0)).toEqual([0, 1]);
    expect(getLinkedIndices(analysis, 1)).toEqual([0, 1]);
  });

  it("should return sorted indices", () => {
    const messages = [
      createToolUseMessage("1", "tool-1", "read_file"),
      createTextMessage("2", "user", "text"),
      createToolResultMessage("3", "tool-1", "contents"),
    ];
    const analysis = analyzeToolPairs(messages);

    // Indices should be sorted [0, 2] not [2, 0]
    expect(getLinkedIndices(analysis, 0)).toEqual([0, 2]);
    expect(getLinkedIndices(analysis, 2)).toEqual([0, 2]);
  });

  it("should handle message with multiple tool pairs", () => {
    // Single assistant message with multiple tool_use blocks
    const useMessage: ContextMessage = {
      id: "1",
      role: "assistant",
      content: [
        { type: "tool_use", id: "tool-1", name: "read_file", input: {} },
        { type: "tool_use", id: "tool-2", name: "read_file", input: {} },
      ],
      priority: MessagePriority.TOOL_PAIR,
    };
    const result1 = createToolResultMessage("2", "tool-1", "contents 1");
    const result2 = createToolResultMessage("3", "tool-2", "contents 2");
    const messages = [useMessage, result1, result2];
    const analysis = analyzeToolPairs(messages);

    // Message 0 links to both 1 and 2
    expect(getLinkedIndices(analysis, 0).sort()).toEqual([0, 1, 2]);
  });

  it("should return empty for non-existent index", () => {
    const messages = [
      createToolUseMessage("1", "tool-1", "read_file"),
      createToolResultMessage("2", "tool-1", "contents"),
    ];
    const analysis = analyzeToolPairs(messages);

    expect(getLinkedIndices(analysis, 99)).toEqual([]);
  });
});
