/**
 * Tests for Compaction Timestamp Tracking Module
 *
 * @module @vellum/core/context/__tests__/compaction-timestamp.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBlocksCompaction,
  clearCompactionTimestamp,
  findCompactedBlocks,
  formatDuration,
  getCompactionAge,
  getCompactionStats,
  getCompactionStatus,
  isCompacted,
  markAsCompacted,
  markBlocksAsCompacted,
} from "../compaction-timestamp.js";
import type { ContentBlock, ContextMessage, ToolResultBlock } from "../types.js";
import { MessagePriority } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a tool result block for testing.
 */
function createToolResultBlock(
  toolUseId: string,
  content: string,
  compactedAt?: number
): ToolResultBlock {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
    ...(compactedAt !== undefined ? { compactedAt } : {}),
  };
}

/**
 * Create a context message with tool result blocks.
 */
function createMessageWithToolResults(id: string, toolResults: ToolResultBlock[]): ContextMessage {
  return {
    id,
    role: "user",
    content: toolResults as ContentBlock[],
    priority: MessagePriority.TOOL_PAIR,
  };
}

/**
 * Create a simple text message.
 */
function createTextMessage(id: string, text: string): ContextMessage {
  return {
    id,
    role: "user",
    content: text,
    priority: MessagePriority.NORMAL,
  };
}

// ============================================================================
// formatDuration Tests
// ============================================================================

describe("formatDuration", () => {
  it('should return "just now" for less than 1 second', () => {
    expect(formatDuration(0)).toBe("just now");
    expect(formatDuration(500)).toBe("just now");
    expect(formatDuration(999)).toBe("just now");
  });

  it("should format seconds correctly", () => {
    expect(formatDuration(1000)).toBe("1 second ago");
    expect(formatDuration(1500)).toBe("1 second ago");
    expect(formatDuration(5000)).toBe("5 seconds ago");
    expect(formatDuration(59000)).toBe("59 seconds ago");
  });

  it("should format minutes correctly", () => {
    expect(formatDuration(60_000)).toBe("1 minute ago");
    expect(formatDuration(120_000)).toBe("2 minutes ago");
    expect(formatDuration(300_000)).toBe("5 minutes ago");
    expect(formatDuration(3_540_000)).toBe("59 minutes ago");
  });

  it("should format hours correctly", () => {
    expect(formatDuration(3_600_000)).toBe("1 hour ago");
    expect(formatDuration(7_200_000)).toBe("2 hours ago");
    expect(formatDuration(43_200_000)).toBe("12 hours ago");
  });

  it("should format days correctly", () => {
    expect(formatDuration(86_400_000)).toBe("1 day ago");
    expect(formatDuration(172_800_000)).toBe("2 days ago");
    expect(formatDuration(604_800_000)).toBe("7 days ago");
  });

  it("should handle negative values", () => {
    expect(formatDuration(-1000)).toBe("in the future");
    expect(formatDuration(-100_000)).toBe("in the future");
  });
});

// ============================================================================
// markAsCompacted Tests
// ============================================================================

describe("markAsCompacted", () => {
  it("should mark a block as compacted with current timestamp", () => {
    const now = Date.now();
    const block = createToolResultBlock("tool-1", "result content");

    const result = markAsCompacted(block, now);

    expect(result.compactedAt).toBe(now);
    expect(result.tool_use_id).toBe("tool-1");
    expect(result.content).toBe("result content");
  });

  it("should use Date.now() if no timestamp provided", () => {
    const block = createToolResultBlock("tool-1", "content");
    const before = Date.now();

    const result = markAsCompacted(block);

    const after = Date.now();
    expect(result.compactedAt).toBeGreaterThanOrEqual(before);
    expect(result.compactedAt).toBeLessThanOrEqual(after);
  });

  it("should not mutate the original block", () => {
    const block = createToolResultBlock("tool-1", "content");

    markAsCompacted(block, 1000);

    expect(block.compactedAt).toBeUndefined();
  });

  it("should overwrite existing compactedAt", () => {
    const block = createToolResultBlock("tool-1", "content", 1000);

    const result = markAsCompacted(block, 2000);

    expect(result.compactedAt).toBe(2000);
  });
});

// ============================================================================
// isCompacted Tests
// ============================================================================

describe("isCompacted", () => {
  it("should return true for compacted blocks", () => {
    const block = createToolResultBlock("tool-1", "content", Date.now());

    expect(isCompacted(block)).toBe(true);
  });

  it("should return false for non-compacted blocks", () => {
    const block = createToolResultBlock("tool-1", "content");

    expect(isCompacted(block)).toBe(false);
  });

  it("should return true even for timestamp 0", () => {
    const block = createToolResultBlock("tool-1", "content", 0);

    expect(isCompacted(block)).toBe(true);
  });
});

// ============================================================================
// getCompactionAge Tests
// ============================================================================

describe("getCompactionAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return age in milliseconds for compacted blocks", () => {
    vi.setSystemTime(10_000);
    const block = createToolResultBlock("tool-1", "content", 5000);

    const age = getCompactionAge(block);

    expect(age).toBe(5000);
  });

  it("should return undefined for non-compacted blocks", () => {
    const block = createToolResultBlock("tool-1", "content");

    expect(getCompactionAge(block)).toBeUndefined();
  });

  it("should handle future timestamps (negative age)", () => {
    vi.setSystemTime(1000);
    const block = createToolResultBlock("tool-1", "content", 5000);

    const age = getCompactionAge(block);

    expect(age).toBe(-4000);
  });
});

// ============================================================================
// getCompactionStatus Tests
// ============================================================================

describe("getCompactionStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return full status for compacted blocks", () => {
    vi.setSystemTime(310_000); // 310 seconds after epoch
    const block = createToolResultBlock("tool-1", "content", 10_000);

    const status = getCompactionStatus(block);

    expect(status.isCompacted).toBe(true);
    expect(status.compactedAt).toBe(10_000);
    expect(status.ageMs).toBe(300_000); // 5 minutes
    expect(status.ageFormatted).toBe("5 minutes ago");
  });

  it("should return minimal status for non-compacted blocks", () => {
    const block = createToolResultBlock("tool-1", "content");

    const status = getCompactionStatus(block);

    expect(status.isCompacted).toBe(false);
    expect(status.compactedAt).toBeUndefined();
    expect(status.ageMs).toBeUndefined();
    expect(status.ageFormatted).toBeUndefined();
  });
});

// ============================================================================
// clearCompactionTimestamp Tests
// ============================================================================

describe("clearCompactionTimestamp", () => {
  it("should remove compactedAt from a compacted block", () => {
    const block = createToolResultBlock("tool-1", "content", 1000);

    const result = clearCompactionTimestamp(block);

    expect(result.compactedAt).toBeUndefined();
    expect(result.tool_use_id).toBe("tool-1");
    expect(result.content).toBe("content");
  });

  it("should not mutate the original block", () => {
    const block = createToolResultBlock("tool-1", "content", 1000);

    clearCompactionTimestamp(block);

    expect(block.compactedAt).toBe(1000);
  });

  it("should work on non-compacted blocks", () => {
    const block = createToolResultBlock("tool-1", "content");

    const result = clearCompactionTimestamp(block);

    expect(result.compactedAt).toBeUndefined();
    expect(result.tool_use_id).toBe("tool-1");
  });

  it("should preserve other properties", () => {
    const block: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: "tool-1",
      content: "content",
      is_error: true,
      compactedAt: 1000,
    };

    const result = clearCompactionTimestamp(block);

    expect(result.is_error).toBe(true);
    expect(result.type).toBe("tool_result");
    expect(result.compactedAt).toBeUndefined();
  });
});

// ============================================================================
// findCompactedBlocks Tests
// ============================================================================

describe("findCompactedBlocks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should find all compacted blocks", () => {
    vi.setSystemTime(10_000);

    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [
        createToolResultBlock("tool-1", "content1", 5000),
        createToolResultBlock("tool-2", "content2"),
      ]),
      createMessageWithToolResults("msg-2", [createToolResultBlock("tool-3", "content3", 8000)]),
    ];

    const results = findCompactedBlocks(messages);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      messageIndex: 0,
      blockIndex: 0,
      toolId: "tool-1",
      status: {
        isCompacted: true,
        compactedAt: 5000,
        ageMs: 5000,
        ageFormatted: "5 seconds ago",
      },
    });
    expect(results[1]).toEqual({
      messageIndex: 1,
      blockIndex: 0,
      toolId: "tool-3",
      status: {
        isCompacted: true,
        compactedAt: 8000,
        ageMs: 2000,
        ageFormatted: "2 seconds ago",
      },
    });
  });

  it("should return empty array when no compacted blocks", () => {
    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [createToolResultBlock("tool-1", "content1")]),
    ];

    const results = findCompactedBlocks(messages);

    expect(results).toHaveLength(0);
  });

  it("should skip string content messages", () => {
    const messages: ContextMessage[] = [
      createTextMessage("msg-1", "Hello world"),
      createMessageWithToolResults("msg-2", [createToolResultBlock("tool-1", "content", 1000)]),
    ];

    const results = findCompactedBlocks(messages);

    expect(results).toHaveLength(1);
    expect(results[0]?.messageIndex).toBe(1);
  });

  it("should handle empty messages array", () => {
    const results = findCompactedBlocks([]);

    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// getCompactionStats Tests
// ============================================================================

describe("getCompactionStats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should calculate correct statistics", () => {
    vi.setSystemTime(10_000);

    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [
        createToolResultBlock("tool-1", "content1", 5000),
        createToolResultBlock("tool-2", "content2"),
      ]),
      createMessageWithToolResults("msg-2", [createToolResultBlock("tool-3", "content3", 7000)]),
    ];

    const stats = getCompactionStats(messages);

    expect(stats.totalToolResults).toBe(3);
    expect(stats.compactedCount).toBe(2);
    expect(stats.compactionRate).toBeCloseTo(0.6667, 3);
    expect(stats.oldestCompaction).toBe(5000);
    expect(stats.newestCompaction).toBe(7000);
    expect(stats.averageAgeMs).toBe(4000); // (5000 + 3000) / 2
  });

  it("should handle no tool results", () => {
    const messages: ContextMessage[] = [createTextMessage("msg-1", "Hello")];

    const stats = getCompactionStats(messages);

    expect(stats.totalToolResults).toBe(0);
    expect(stats.compactedCount).toBe(0);
    expect(stats.compactionRate).toBe(0);
    expect(stats.oldestCompaction).toBeUndefined();
    expect(stats.newestCompaction).toBeUndefined();
    expect(stats.averageAgeMs).toBeUndefined();
  });

  it("should handle no compacted blocks", () => {
    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [
        createToolResultBlock("tool-1", "content1"),
        createToolResultBlock("tool-2", "content2"),
      ]),
    ];

    const stats = getCompactionStats(messages);

    expect(stats.totalToolResults).toBe(2);
    expect(stats.compactedCount).toBe(0);
    expect(stats.compactionRate).toBe(0);
    expect(stats.averageAgeMs).toBeUndefined();
  });

  it("should handle all blocks compacted", () => {
    vi.setSystemTime(10_000);

    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [createToolResultBlock("tool-1", "content1", 5000)]),
    ];

    const stats = getCompactionStats(messages);

    expect(stats.compactionRate).toBe(1);
  });

  it("should handle empty messages array", () => {
    const stats = getCompactionStats([]);

    expect(stats.totalToolResults).toBe(0);
    expect(stats.compactedCount).toBe(0);
    expect(stats.compactionRate).toBe(0);
  });
});

// ============================================================================
// markBlocksAsCompacted Tests
// ============================================================================

describe("markBlocksAsCompacted", () => {
  it("should mark specified blocks as compacted", () => {
    const timestamp = 12345;
    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [
        createToolResultBlock("tool-1", "content1"),
        createToolResultBlock("tool-2", "content2"),
      ]),
      createMessageWithToolResults("msg-2", [createToolResultBlock("tool-3", "content3")]),
    ];

    const result = markBlocksAsCompacted(
      messages,
      [
        { messageIndex: 0, blockIndex: 1 },
        { messageIndex: 1, blockIndex: 0 },
      ],
      timestamp
    );

    // Check marked blocks
    const content0 = result[0]?.content as ToolResultBlock[];
    const content1 = result[1]?.content as ToolResultBlock[];

    expect(content0[0]?.compactedAt).toBeUndefined();
    expect(content0[1]?.compactedAt).toBe(timestamp);
    expect(content1[0]?.compactedAt).toBe(timestamp);

    // Original should be unchanged
    const origContent0 = messages[0]?.content as ToolResultBlock[];
    expect(origContent0[1]?.compactedAt).toBeUndefined();
  });

  it("should return new array when no locations provided", () => {
    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [createToolResultBlock("tool-1", "content1")]),
    ];

    const result = markBlocksAsCompacted(messages, []);

    expect(result).not.toBe(messages);
    expect(result).toEqual(messages);
  });

  it("should handle invalid block indices gracefully", () => {
    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [createToolResultBlock("tool-1", "content1")]),
    ];

    const result = markBlocksAsCompacted(messages, [{ messageIndex: 0, blockIndex: 99 }], 1000);

    // Should not throw, block unchanged
    const content = result[0]?.content as ToolResultBlock[];
    expect(content[0]?.compactedAt).toBeUndefined();
  });

  it("should not mutate original messages", () => {
    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [createToolResultBlock("tool-1", "content1")]),
    ];

    markBlocksAsCompacted(messages, [{ messageIndex: 0, blockIndex: 0 }], 1000);

    const content = messages[0]?.content as ToolResultBlock[];
    expect(content[0]?.compactedAt).toBeUndefined();
  });

  it("should preserve unaffected messages by reference", () => {
    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [createToolResultBlock("tool-1", "content1")]),
      createMessageWithToolResults("msg-2", [createToolResultBlock("tool-2", "content2")]),
    ];

    const result = markBlocksAsCompacted(messages, [{ messageIndex: 1, blockIndex: 0 }], 1000);

    // Message 0 should be same reference (not cloned)
    expect(result[0]).toBe(messages[0]);
    // Message 1 should be different (cloned)
    expect(result[1]).not.toBe(messages[1]);
  });
});

// ============================================================================
// clearBlocksCompaction Tests
// ============================================================================

describe("clearBlocksCompaction", () => {
  it("should clear compaction timestamps from specified blocks", () => {
    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [
        createToolResultBlock("tool-1", "content1", 1000),
        createToolResultBlock("tool-2", "content2", 2000),
      ]),
      createMessageWithToolResults("msg-2", [createToolResultBlock("tool-3", "content3", 3000)]),
    ];

    const result = clearBlocksCompaction(messages, [
      { messageIndex: 0, blockIndex: 0 },
      { messageIndex: 1, blockIndex: 0 },
    ]);

    const content0 = result[0]?.content as ToolResultBlock[];
    const content1 = result[1]?.content as ToolResultBlock[];

    expect(content0[0]?.compactedAt).toBeUndefined();
    expect(content0[1]?.compactedAt).toBe(2000); // Unchanged
    expect(content1[0]?.compactedAt).toBeUndefined();
  });

  it("should return new array when no locations provided", () => {
    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [createToolResultBlock("tool-1", "content1", 1000)]),
    ];

    const result = clearBlocksCompaction(messages, []);

    expect(result).not.toBe(messages);
    expect(result).toEqual(messages);
  });

  it("should not mutate original messages", () => {
    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [createToolResultBlock("tool-1", "content1", 1000)]),
    ];

    clearBlocksCompaction(messages, [{ messageIndex: 0, blockIndex: 0 }]);

    const content = messages[0]?.content as ToolResultBlock[];
    expect(content[0]?.compactedAt).toBe(1000);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Integration: Mark and Find workflow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should mark blocks and find them", () => {
    vi.setSystemTime(10_000);

    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [
        createToolResultBlock("tool-1", "content1"),
        createToolResultBlock("tool-2", "content2"),
      ]),
    ];

    // Mark one block
    const marked = markBlocksAsCompacted(messages, [{ messageIndex: 0, blockIndex: 0 }], 10_000);

    // Find compacted blocks
    const found = findCompactedBlocks(marked);

    expect(found).toHaveLength(1);
    expect(found[0]?.toolId).toBe("tool-1");
    expect(found[0]?.status.isCompacted).toBe(true);
  });

  it("should support full lifecycle: mark -> find -> clear", () => {
    vi.setSystemTime(10_000);

    const messages: ContextMessage[] = [
      createMessageWithToolResults("msg-1", [createToolResultBlock("tool-1", "content1")]),
    ];

    // Mark
    const marked = markBlocksAsCompacted(messages, [{ messageIndex: 0, blockIndex: 0 }], 10_000);

    // Find
    const found = findCompactedBlocks(marked);
    expect(found).toHaveLength(1);

    // Clear
    const cleared = clearBlocksCompaction(marked, [{ messageIndex: 0, blockIndex: 0 }]);

    // Verify cleared
    const foundAfterClear = findCompactedBlocks(cleared);
    expect(foundAfterClear).toHaveLength(0);
  });
});
