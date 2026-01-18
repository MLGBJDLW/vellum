/**
 * Height Estimator Utilities Tests (T011)
 *
 * @module tui/utils/__tests__/heightEstimator.test
 */

import { describe, expect, it } from "vitest";
import type { Message } from "../../context/MessagesContext.js";
import { estimateMessageHeight, estimateWrappedLineCount } from "../heightEstimator.js";

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

describe("estimateMessageHeight", () => {
  const baseMessage: Message = {
    id: "1",
    role: "assistant",
    content: "Hello world",
    timestamp: new Date(),
  };

  it("calculates basic message height (header + content + margin)", () => {
    const height = estimateMessageHeight(baseMessage, { width: 80 });
    // 1 (header) + 1 (content) + 1 (margin) = 3
    expect(height).toBe(3);
  });

  it("includes thinking block height", () => {
    const msg: Message = { ...baseMessage, thinking: "Let me think..." };
    const height = estimateMessageHeight(msg, { width: 80 });
    // 1 (header) + 1 (content) + 1 (thinking label) + 1 (thinking text) + 1 (margin) = 5
    expect(height).toBe(5);
  });

  it("includes tool calls height", () => {
    const msg: Message = {
      ...baseMessage,
      toolCalls: [
        { id: "t1", name: "read_file", arguments: {}, status: "completed" },
        { id: "t2", name: "write_file", arguments: {}, status: "running" },
      ],
    };
    const height = estimateMessageHeight(msg, { width: 80 });
    // 1 (header) + 1 (content) + 1 (tool margin) + 2 (tool calls) + 1 (margin) = 6
    expect(height).toBe(6);
  });

  it("handles tool_group messages", () => {
    const msg: Message = {
      ...baseMessage,
      role: "tool_group",
      toolCalls: [
        { id: "t1", name: "tool1", arguments: {}, status: "completed" },
        { id: "t2", name: "tool2", arguments: {}, status: "completed" },
      ],
    };
    const height = estimateMessageHeight(msg, { width: 80 });
    // tool_group: toolCalls.length + margin = 2 + 1 = 3
    expect(height).toBe(3);
  });

  it("excludes tool calls when configured", () => {
    const msg: Message = {
      ...baseMessage,
      toolCalls: [{ id: "t1", name: "read_file", arguments: {}, status: "completed" }],
    };
    const height = estimateMessageHeight(msg, { width: 80, includeToolCalls: false });
    // 1 (header) + 1 (content) + 1 (margin) = 3 (no tool calls)
    expect(height).toBe(3);
  });
});
