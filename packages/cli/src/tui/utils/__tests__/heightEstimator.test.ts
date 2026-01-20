/**
 * Height Estimator Utilities Tests (T011)
 *
 * Tests for upper-bound height estimation.
 * Note: Estimates are INTENTIONALLY CONSERVATIVE (larger) to prevent terminal overflow.
 *
 * @module tui/utils/__tests__/heightEstimator.test
 */

import { describe, expect, it } from "vitest";
import type { Message } from "../../context/MessagesContext.js";
import {
  DEFAULT_ESTIMATED_ITEM_HEIGHT,
  estimateMessageHeight,
  estimateWrappedLineCount,
  HEIGHT_SAFETY_MARGIN,
  MIN_MESSAGE_HEIGHT,
  THINKING_HEADER_UPPER_BOUND,
  TOOL_CALL_DIFF_UPPER_BOUND,
  TOOL_CALL_UPPER_BOUND,
} from "../heightEstimator.js";

describe("estimateWrappedLineCount", () => {
  it("returns 1 for empty string", () => {
    expect(estimateWrappedLineCount("", 80)).toBe(1);
  });

  it("returns 1 for short single-line text", () => {
    expect(estimateWrappedLineCount("hello", 80)).toBe(1);
  });

  it("calculates wrapped lines for long text", () => {
    const text = "a".repeat(160);
    expect(estimateWrappedLineCount(text, 80)).toBe(2);
  });

  it("handles multi-line text", () => {
    const text = "line1\nline2\nline3";
    expect(estimateWrappedLineCount(text, 80)).toBe(3);
  });

  it("handles multi-line with wrapping", () => {
    const text = `${"a".repeat(100)}\n${"b".repeat(50)}`;
    expect(estimateWrappedLineCount(text, 80)).toBe(3); // 2 + 1
  });
});

describe("estimateWrappedLineCount - CJK handling", () => {
  it("counts CJK characters as 2 columns each", () => {
    // 10 CJK chars = 20 columns, width 80 → 1 line
    expect(estimateWrappedLineCount("中文字符测试内容啊啊", 80)).toBe(1);
    // 40 CJK chars = 80 columns, width 40 → 2 lines
    expect(estimateWrappedLineCount("中".repeat(40), 40)).toBe(2);
  });
});

describe("estimateMessageHeight - Upper Bound Estimation", () => {
  const baseMessage: Message = {
    id: "1",
    role: "assistant",
    content: "Hello world",
    timestamp: new Date(),
  };

  it("returns at least MIN_MESSAGE_HEIGHT", () => {
    const height = estimateMessageHeight(baseMessage, { width: 80 });
    // Upper bound: header(2) + content(1) + margin(2) + safety(2) = 7, min=4
    expect(height).toBeGreaterThanOrEqual(MIN_MESSAGE_HEIGHT);
  });

  it("includes THINKING_HEADER_UPPER_BOUND for thinking blocks", () => {
    const msg: Message = { ...baseMessage, thinking: "Let me think..." };
    const height = estimateMessageHeight(msg, { width: 80 });
    // With thinking: header(2) + content(1) + thinking_header(4) + thinking(1) + margin(2) + safety(2) = 12
    expect(height).toBeGreaterThanOrEqual(THINKING_HEADER_UPPER_BOUND);
    expect(height).toBeGreaterThan(MIN_MESSAGE_HEIGHT);
  });

  it("uses TOOL_CALL_UPPER_BOUND for each tool call", () => {
    const msgWithOneTool: Message = {
      ...baseMessage,
      toolCalls: [{ id: "t1", name: "read_file", arguments: {}, status: "completed" }],
    };
    const msgWithTwoTools: Message = {
      ...baseMessage,
      toolCalls: [
        { id: "t1", name: "read_file", arguments: {}, status: "completed" },
        { id: "t2", name: "write_file", arguments: {}, status: "running" },
      ],
    };
    const height1 = estimateMessageHeight(msgWithOneTool, { width: 80 });
    const height2 = estimateMessageHeight(msgWithTwoTools, { width: 80 });
    // Each tool adds TOOL_CALL_UPPER_BOUND lines
    expect(height2 - height1).toBe(TOOL_CALL_UPPER_BOUND);
  });

  it("uses TOOL_CALL_DIFF_UPPER_BOUND when diff metadata is present", () => {
    const diffMeta = {
      diff: "--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-foo\n+bar",
      additions: 1,
      deletions: 1,
    };
    const msgWithoutDiff: Message = {
      ...baseMessage,
      toolCalls: [{ id: "t1", name: "apply_patch", arguments: {}, status: "completed" }],
    };
    const msgWithDiff: Message = {
      ...baseMessage,
      toolCalls: [
        {
          id: "t1",
          name: "apply_patch",
          arguments: {},
          status: "completed",
          result: { diffMeta },
        },
      ],
    };
    const heightWithoutDiff = estimateMessageHeight(msgWithoutDiff, { width: 80 });
    const heightWithDiff = estimateMessageHeight(msgWithDiff, { width: 80 });
    expect(heightWithDiff - heightWithoutDiff).toBe(
      TOOL_CALL_DIFF_UPPER_BOUND - TOOL_CALL_UPPER_BOUND
    );
  });

  it("handles tool_group messages with upper bound per tool", () => {
    const msg: Message = {
      ...baseMessage,
      role: "tool_group",
      toolCalls: [
        { id: "t1", name: "tool1", arguments: {}, status: "completed" },
        { id: "t2", name: "tool2", arguments: {}, status: "completed" },
      ],
    };
    const height = estimateMessageHeight(msg, { width: 80 });
    // tool_group: 2 tools * TOOL_CALL_UPPER_BOUND + margin(2)
    expect(height).toBeGreaterThanOrEqual(2 * TOOL_CALL_UPPER_BOUND);
  });

  it("excludes tool calls when configured", () => {
    const msg: Message = {
      ...baseMessage,
      toolCalls: [{ id: "t1", name: "read_file", arguments: {}, status: "completed" }],
    };
    const heightWithTools = estimateMessageHeight(msg, { width: 80 });
    const heightWithoutTools = estimateMessageHeight(msg, { width: 80, includeToolCalls: false });
    // Without tools should be smaller
    expect(heightWithoutTools).toBeLessThan(heightWithTools);
    expect(heightWithoutTools).toBeGreaterThanOrEqual(MIN_MESSAGE_HEIGHT);
  });

  it("includes HEIGHT_SAFETY_MARGIN in all estimates", () => {
    // Safety margin ensures we never under-estimate
    expect(HEIGHT_SAFETY_MARGIN).toBeGreaterThan(0);
    expect(DEFAULT_ESTIMATED_ITEM_HEIGHT).toBeGreaterThanOrEqual(MIN_MESSAGE_HEIGHT);
  });
});
