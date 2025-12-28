/**
 * @fileoverview Tests for API History Filter
 * @see REQ-CMP-003 - API History Filtering
 */

import { describe, expect, it } from "vitest";
import {
  buildSummaryMap,
  getCompressionChain,
  getEffectiveApiHistory,
  getMessagesWithCondenseParent,
  shouldIncludeInApiHistory,
  summaryExistsForCondenseId,
  toApiFormat,
} from "../api-history-filter.js";
import { type ContextMessage, MessagePriority } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createMessage(overrides: Partial<ContextMessage> = {}): ContextMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 9)}`,
    role: "user",
    content: "test message",
    priority: MessagePriority.NORMAL,
    tokens: 10,
    ...overrides,
  };
}

function createSummary(
  condenseId: string,
  overrides: Partial<ContextMessage> = {}
): ContextMessage {
  return createMessage({
    role: "assistant",
    content: `Summary for ${condenseId}`,
    isSummary: true,
    condenseId,
    tokens: 50,
    ...overrides,
  });
}

function createCompressedMessage(
  condenseParent: string,
  overrides: Partial<ContextMessage> = {}
): ContextMessage {
  return createMessage({
    condenseParent,
    ...overrides,
  });
}

// ============================================================================
// buildSummaryMap Tests
// ============================================================================

describe("buildSummaryMap", () => {
  it("should return empty map for empty messages", () => {
    const map = buildSummaryMap([]);
    expect(map.size).toBe(0);
  });

  it("should return empty map when no summaries exist", () => {
    const messages = [createMessage({ id: "msg-1" }), createMessage({ id: "msg-2" })];
    const map = buildSummaryMap(messages);
    expect(map.size).toBe(0);
  });

  it("should map condenseId to summary message", () => {
    const summary = createSummary("condense-123");
    const messages = [createMessage({ id: "msg-1" }), summary, createMessage({ id: "msg-2" })];

    const map = buildSummaryMap(messages);

    expect(map.size).toBe(1);
    expect(map.get("condense-123")).toBe(summary);
  });

  it("should handle multiple summaries", () => {
    const summary1 = createSummary("condense-1");
    const summary2 = createSummary("condense-2");
    const messages = [summary1, createMessage(), summary2];

    const map = buildSummaryMap(messages);

    expect(map.size).toBe(2);
    expect(map.get("condense-1")).toBe(summary1);
    expect(map.get("condense-2")).toBe(summary2);
  });

  it("should ignore messages marked as summary but missing condenseId", () => {
    const messages = [
      createMessage({ isSummary: true }), // Missing condenseId
      createSummary("valid-condense"),
    ];

    const map = buildSummaryMap(messages);

    expect(map.size).toBe(1);
    expect(map.has("valid-condense")).toBe(true);
  });
});

// ============================================================================
// summaryExistsForCondenseId Tests
// ============================================================================

describe("summaryExistsForCondenseId", () => {
  it("should return false for empty messages", () => {
    expect(summaryExistsForCondenseId([], "any-id")).toBe(false);
  });

  it("should return false when no summary with condenseId exists", () => {
    const messages = [createMessage(), createSummary("other-condense")];
    expect(summaryExistsForCondenseId(messages, "non-existent")).toBe(false);
  });

  it("should return true when summary with condenseId exists", () => {
    const messages = [createMessage(), createSummary("target-condense")];
    expect(summaryExistsForCondenseId(messages, "target-condense")).toBe(true);
  });

  it("should not match non-summary messages with condenseId", () => {
    const messages = [
      createMessage({ condenseId: "some-id" }), // Not a summary
    ];
    expect(summaryExistsForCondenseId(messages, "some-id")).toBe(false);
  });
});

// ============================================================================
// getMessagesWithCondenseParent Tests
// ============================================================================

describe("getMessagesWithCondenseParent", () => {
  it("should return empty array for empty messages", () => {
    expect(getMessagesWithCondenseParent([], "any-id")).toEqual([]);
  });

  it("should return empty array when no messages have condenseParent", () => {
    const messages = [createMessage(), createMessage()];
    expect(getMessagesWithCondenseParent(messages, "any-id")).toEqual([]);
  });

  it("should return messages with matching condenseParent", () => {
    const compressed1 = createCompressedMessage("condense-1", { id: "c1" });
    const compressed2 = createCompressedMessage("condense-1", { id: "c2" });
    const other = createCompressedMessage("condense-2", { id: "other" });
    const messages = [compressed1, compressed2, other, createMessage()];

    const result = getMessagesWithCondenseParent(messages, "condense-1");

    expect(result).toHaveLength(2);
    expect(result).toContain(compressed1);
    expect(result).toContain(compressed2);
  });
});

// ============================================================================
// shouldIncludeInApiHistory Tests
// ============================================================================

describe("shouldIncludeInApiHistory", () => {
  it("should include regular messages without condenseParent", () => {
    const message = createMessage();
    const allMessages = [message];

    expect(shouldIncludeInApiHistory(message, allMessages)).toBe(true);
  });

  it("should include summaries by default", () => {
    const summary = createSummary("condense-1");
    const allMessages = [summary];

    expect(shouldIncludeInApiHistory(summary, allMessages)).toBe(true);
  });

  it("should exclude summaries when includeSummaries is false", () => {
    const summary = createSummary("condense-1");
    const allMessages = [summary];

    expect(shouldIncludeInApiHistory(summary, allMessages, { includeSummaries: false })).toBe(
      false
    );
  });

  it("should exclude compressed message when summary exists", () => {
    const summary = createSummary("condense-1");
    const compressed = createCompressedMessage("condense-1");
    const allMessages = [compressed, summary];

    expect(shouldIncludeInApiHistory(compressed, allMessages)).toBe(false);
  });

  it("should include compressed message when summary does not exist (orphaned)", () => {
    const compressed = createCompressedMessage("non-existent-condense");
    const allMessages = [compressed];

    expect(shouldIncludeInApiHistory(compressed, allMessages)).toBe(true);
  });

  it("should include compressed messages when includeCompressed is true", () => {
    const summary = createSummary("condense-1");
    const compressed = createCompressedMessage("condense-1");
    const allMessages = [compressed, summary];

    expect(shouldIncludeInApiHistory(compressed, allMessages, { includeCompressed: true })).toBe(
      true
    );
  });
});

// ============================================================================
// getCompressionChain Tests
// ============================================================================

describe("getCompressionChain", () => {
  it("should return empty array for non-existent condenseId", () => {
    const messages = [createMessage()];
    expect(getCompressionChain(messages, "non-existent")).toEqual([]);
  });

  it("should return single summary for simple compression", () => {
    const summary = createSummary("condense-1");
    const messages = [createMessage(), summary];

    const chain = getCompressionChain(messages, "condense-1");

    expect(chain).toHaveLength(1);
    expect(chain[0]).toBe(summary);
  });

  it("should follow nested compression chain", () => {
    // Summary A was compressed into Summary B
    const summaryA = createSummary("condense-a", { condenseParent: "condense-b" });
    const summaryB = createSummary("condense-b");
    const messages = [summaryA, summaryB];

    const chain = getCompressionChain(messages, "condense-a");

    expect(chain).toHaveLength(2);
    expect(chain[0]).toBe(summaryA);
    expect(chain[1]).toBe(summaryB);
  });

  it("should handle deep compression chains", () => {
    const summaryA = createSummary("condense-a", { condenseParent: "condense-b" });
    const summaryB = createSummary("condense-b", { condenseParent: "condense-c" });
    const summaryC = createSummary("condense-c");
    const messages = [summaryA, summaryB, summaryC];

    const chain = getCompressionChain(messages, "condense-a");

    expect(chain).toHaveLength(3);
    expect(chain.map((s) => s.condenseId)).toEqual(["condense-a", "condense-b", "condense-c"]);
  });

  it("should prevent infinite loops from circular references", () => {
    // Circular: A -> B -> A
    const summaryA = createSummary("condense-a", { condenseParent: "condense-b" });
    const summaryB = createSummary("condense-b", { condenseParent: "condense-a" });
    const messages = [summaryA, summaryB];

    const chain = getCompressionChain(messages, "condense-a");

    // Should stop after visiting each once
    expect(chain).toHaveLength(2);
  });
});

// ============================================================================
// getEffectiveApiHistory Tests
// ============================================================================

describe("getEffectiveApiHistory", () => {
  it("should return all messages when none are compressed", () => {
    const messages = [
      createMessage({ id: "msg-1" }),
      createMessage({ id: "msg-2" }),
      createMessage({ id: "msg-3" }),
    ];

    const result = getEffectiveApiHistory(messages);

    expect(result.messages).toHaveLength(3);
    expect(result.excludedCount).toBe(0);
    expect(result.excludedIds).toEqual([]);
    expect(result.hasSummaries).toBe(false);
  });

  it("should exclude compressed messages when summary exists", () => {
    const summary = createSummary("condense-1", { id: "summary" });
    const compressed1 = createCompressedMessage("condense-1", { id: "c1" });
    const compressed2 = createCompressedMessage("condense-1", { id: "c2" });
    const regular = createMessage({ id: "regular" });
    const messages = [compressed1, compressed2, summary, regular];

    const result = getEffectiveApiHistory(messages);

    expect(result.messages).toHaveLength(2);
    expect(result.messages.map((m) => m.id)).toEqual(["summary", "regular"]);
    expect(result.excludedCount).toBe(2);
    expect(result.excludedIds).toContain("c1");
    expect(result.excludedIds).toContain("c2");
    expect(result.hasSummaries).toBe(true);
  });

  it("should respect maxMessages limit", () => {
    const messages = [
      createMessage({ id: "msg-1" }),
      createMessage({ id: "msg-2" }),
      createMessage({ id: "msg-3" }),
    ];

    const result = getEffectiveApiHistory(messages, { maxMessages: 2 });

    expect(result.messages).toHaveLength(2);
    expect(result.excludedCount).toBe(1);
    expect(result.excludedIds).toContain("msg-3");
  });

  it("should respect maxTokens limit", () => {
    const messages = [
      createMessage({ id: "msg-1", tokens: 50 }),
      createMessage({ id: "msg-2", tokens: 50 }),
      createMessage({ id: "msg-3", tokens: 50 }),
    ];

    const result = getEffectiveApiHistory(messages, { maxTokens: 100 });

    expect(result.messages).toHaveLength(2);
    expect(result.tokenCount).toBe(100);
    expect(result.excludedCount).toBe(1);
  });

  it("should use custom tokenizer when provided", () => {
    const messages = [
      createMessage({ id: "msg-1", content: "hello" }),
      createMessage({ id: "msg-2", content: "world" }),
    ];

    const tokenizer = (msg: ContextMessage) => {
      const content = typeof msg.content === "string" ? msg.content : "";
      return content.length * 2; // Custom token calculation
    };

    const result = getEffectiveApiHistory(messages, {
      maxTokens: 15,
      tokenizer,
    });

    expect(result.messages).toHaveLength(1);
    expect(result.tokenCount).toBe(10); // "hello" = 5 chars * 2 = 10 tokens
  });

  it("should handle mixed compressed and regular messages", () => {
    const msg1 = createMessage({ id: "msg-1", tokens: 20 });
    const msg2 = createCompressedMessage("condense-1", { id: "msg-2", tokens: 30 });
    const summary = createSummary("condense-1", { id: "summary", tokens: 15 });
    const msg3 = createMessage({ id: "msg-3", tokens: 25 });

    const result = getEffectiveApiHistory([msg1, msg2, summary, msg3]);

    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((m) => m.id)).toEqual(["msg-1", "summary", "msg-3"]);
    expect(result.tokenCount).toBe(60); // 20 + 15 + 25
    expect(result.hasSummaries).toBe(true);
  });

  it("should return empty result for empty messages", () => {
    const result = getEffectiveApiHistory([]);

    expect(result.messages).toEqual([]);
    expect(result.excludedCount).toBe(0);
    expect(result.excludedIds).toEqual([]);
    expect(result.tokenCount).toBe(0);
    expect(result.hasSummaries).toBe(false);
  });
});

// ============================================================================
// toApiFormat Tests
// ============================================================================

describe("toApiFormat", () => {
  it("should return empty array for empty messages", () => {
    expect(toApiFormat([])).toEqual([]);
  });

  it("should strip internal fields and keep only role and content", () => {
    const messages: ContextMessage[] = [
      createMessage({
        id: "msg-1",
        role: "user",
        content: "Hello",
        priority: MessagePriority.NORMAL,
        tokens: 10,
        condenseId: "some-id",
        condenseParent: "parent-id",
        createdAt: Date.now(),
        metadata: { custom: "data" },
      }),
    ];

    const result = toApiFormat(messages);

    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("should preserve content blocks", () => {
    const contentBlocks = [
      { type: "text" as const, text: "Hello" },
      { type: "tool_use" as const, id: "tool-1", name: "read_file", input: { path: "test.ts" } },
    ];
    const messages: ContextMessage[] = [
      createMessage({
        role: "assistant",
        content: contentBlocks,
      }),
    ];

    const result = toApiFormat(messages);

    expect(result).toEqual([{ role: "assistant", content: contentBlocks }]);
  });

  it("should handle multiple messages", () => {
    const messages: ContextMessage[] = [
      createMessage({ role: "system", content: "System prompt" }),
      createMessage({ role: "user", content: "User message" }),
      createMessage({ role: "assistant", content: "Assistant reply" }),
    ];

    const result = toApiFormat(messages);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: "system", content: "System prompt" });
    expect(result[1]).toEqual({ role: "user", content: "User message" });
    expect(result[2]).toEqual({ role: "assistant", content: "Assistant reply" });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("API History Filter Integration", () => {
  it("should handle a realistic compression scenario", () => {
    // Scenario: User had a long conversation, messages 1-5 were compressed
    const originalMsgs = [
      createCompressedMessage("condense-1", {
        id: "orig-1",
        role: "user",
        content: "First question",
      }),
      createCompressedMessage("condense-1", {
        id: "orig-2",
        role: "assistant",
        content: "First answer",
      }),
      createCompressedMessage("condense-1", { id: "orig-3", role: "user", content: "Follow-up" }),
      createCompressedMessage("condense-1", {
        id: "orig-4",
        role: "assistant",
        content: "Detailed response",
      }),
      createCompressedMessage("condense-1", { id: "orig-5", role: "user", content: "Thanks!" }),
    ];

    const summary = createSummary("condense-1", {
      id: "summary-1",
      content: "User asked questions about X and received detailed answers.",
    });

    const recentMsgs = [
      createMessage({ id: "recent-1", role: "user", content: "New question" }),
      createMessage({ id: "recent-2", role: "assistant", content: "New answer" }),
    ];

    const allMessages = [...originalMsgs, summary, ...recentMsgs];

    const result = getEffectiveApiHistory(allMessages);

    // Should only include summary + recent messages
    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((m) => m.id)).toEqual(["summary-1", "recent-1", "recent-2"]);
    expect(result.excludedCount).toBe(5);
    expect(result.hasSummaries).toBe(true);

    // Convert to API format
    const apiMessages = toApiFormat(result.messages);
    expect(apiMessages[0]?.role).toBe("assistant");
    expect(apiMessages[0]?.content).toContain("User asked questions");
  });

  it("should handle nested compression", () => {
    // First compression round: messages 1-3 -> summary-a
    const originals1 = [
      createCompressedMessage("condense-a", { id: "o1" }),
      createCompressedMessage("condense-a", { id: "o2" }),
      createCompressedMessage("condense-a", { id: "o3" }),
    ];

    // Summary A was later compressed into Summary B
    // Note: summaries have isSummary=true, so they're included by default
    // The condenseParent on a summary indicates it was also compressed,
    // but since it's a summary, it's still included (unless includeSummaries=false)
    const summaryA = createSummary("condense-a", {
      id: "summary-a",
      condenseParent: "condense-b",
    });

    const summaryB = createSummary("condense-b", { id: "summary-b" });

    const recent = createMessage({ id: "recent" });

    const allMessages = [...originals1, summaryA, summaryB, recent];

    const result = getEffectiveApiHistory(allMessages);

    // Original messages excluded (parent is summary-a)
    // Both summaries included (isSummary=true takes precedence)
    // This is the correct behavior: summaries are always included by default
    expect(result.messages).toHaveLength(3);
    expect(result.messages.map((m) => m.id)).toEqual(["summary-a", "summary-b", "recent"]);
    expect(result.excludedCount).toBe(3); // 3 originals only
    expect(result.hasSummaries).toBe(true);
  });
});
