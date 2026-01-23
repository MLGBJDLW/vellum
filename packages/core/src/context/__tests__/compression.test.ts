/**
 * Tests for Non-Destructive Context Compression
 *
 * Covers:
 * - REQ-CMP-001: Structured summary generation
 * - REQ-CMP-002: Non-destructive compression tracking
 *
 * @module @vellum/core/context/__tests__/compression.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CompressionLLMClient,
  type CompressionResult,
  CondensedMessageStore,
  calculateCompressionSavings,
  DEFAULT_SUMMARY_PROMPT,
  estimateCompressionTokens,
  generateCondenseId,
  getCompressedMessages,
  getEffectiveApiHistory,
  isSummaryMessage,
  linkCompressedMessages,
  NonDestructiveCompressor,
  recoverCondensed,
} from "../compression.js";
import type { ContextMessage } from "../types.js";
import { MessagePriority } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createMessage(
  id: string,
  role: ContextMessage["role"],
  content: string,
  options: Partial<ContextMessage> = {}
): ContextMessage {
  return {
    id,
    role,
    content,
    priority: options.priority ?? MessagePriority.NORMAL,
    tokens: options.tokens ?? Math.ceil(content.length / 4),
    createdAt: options.createdAt ?? Date.now(),
    ...options,
  };
}

function createMockLLMClient(summaryResponse: string = "Test summary"): CompressionLLMClient {
  return {
    summarize: vi.fn().mockResolvedValue(summaryResponse),
  };
}

function createTestMessages(count: number): ContextMessage[] {
  const messages: ContextMessage[] = [];
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    messages.push(createMessage(`msg-${i}`, role, `Message ${i} content`, { tokens: 100 }));
  }
  return messages;
}

// ============================================================================
// NonDestructiveCompressor Tests
// ============================================================================

describe("NonDestructiveCompressor", () => {
  let mockClient: CompressionLLMClient;

  beforeEach(() => {
    mockClient = createMockLLMClient();
  });

  describe("constructor", () => {
    it("should create compressor with required options", () => {
      const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
      expect(compressor).toBeDefined();
    });

    it("should use default values when optional options not provided", () => {
      const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
      expect(compressor.getTargetRatio()).toBe(0.3);
      expect(compressor.getMaxSummaryTokens()).toBe(2000);
      expect(compressor.getPreserveToolOutputs()).toBe(false);
    });

    it("should respect custom options", () => {
      const compressor = new NonDestructiveCompressor({
        llmClient: mockClient,
        targetRatio: 0.5,
        maxSummaryTokens: 1000,
        preserveToolOutputs: true,
      });
      expect(compressor.getTargetRatio()).toBe(0.5);
      expect(compressor.getMaxSummaryTokens()).toBe(1000);
      expect(compressor.getPreserveToolOutputs()).toBe(true);
    });
  });

  describe("compress()", () => {
    it("should compress messages and return CompressionResult", async () => {
      const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
      const messages = createTestMessages(10);

      const result = await compressor.compress(messages, { start: 0, end: 8 });

      expect(result).toMatchObject({
        summary: expect.objectContaining({
          isSummary: true,
          role: "assistant",
        }),
        compressedMessageIds: expect.arrayContaining(["msg-0", "msg-1"]),
        originalTokens: expect.any(Number),
        summaryTokens: expect.any(Number),
        ratio: expect.any(Number),
        condenseId: expect.stringMatching(/^condense-/),
      });
    });

    it("should call LLM client with correct parameters", async () => {
      const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
      const messages = createTestMessages(6);

      await compressor.compress(messages, { start: 0, end: 5 });

      expect(mockClient.summarize).toHaveBeenCalledTimes(1);
      expect(mockClient.summarize).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: "msg-0" }),
          expect.objectContaining({ id: "msg-1" }),
        ]),
        DEFAULT_SUMMARY_PROMPT
      );
    });

    it("should use custom prompt when provided", async () => {
      const customPrompt = "Custom summarization prompt";
      const compressor = new NonDestructiveCompressor({
        llmClient: mockClient,
        customPrompt,
      });
      const messages = createTestMessages(6);

      await compressor.compress(messages, { start: 0, end: 5 });

      expect(mockClient.summarize).toHaveBeenCalledWith(expect.any(Array), customPrompt);
    });

    it("should throw error when fewer than minMessagesToCompress messages", async () => {
      const compressor = new NonDestructiveCompressor({
        llmClient: mockClient,
        minMessagesToCompress: 4,
      });
      const messages = createTestMessages(3);

      await expect(compressor.compress(messages, { start: 0, end: 3 })).rejects.toThrow(
        /at least 4 messages/
      );
    });

    it("should generate unique condenseId for each compression", async () => {
      const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
      const messages = createTestMessages(10);

      const result1 = await compressor.compress(messages, { start: 0, end: 5 });
      const result2 = await compressor.compress(messages, { start: 0, end: 5 });

      expect(result1.condenseId).not.toBe(result2.condenseId);
    });

    it("should calculate default range when not provided", async () => {
      const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
      // 12 messages: should compress 0-5 (leave last 6 as "recent")
      const messages = createTestMessages(12);

      const result = await compressor.compress(messages);

      // Should compress first 6 messages (12 - 6 recent = 6)
      expect(result.compressedMessageIds.length).toBe(6);
      expect(result.compressedMessageIds).toContain("msg-0");
      expect(result.compressedMessageIds).not.toContain("msg-11");
    });

    it("should include summary prefix in content", async () => {
      const summaryText = "## 1. Task Overview\nBuilding a feature";
      mockClient = createMockLLMClient(summaryText);
      const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
      const messages = createTestMessages(6);

      const result = await compressor.compress(messages, { start: 0, end: 5 });

      expect(result.summary.content).toContain("[📦 Context Summary]");
      expect(result.summary.content).toContain(summaryText);
    });

    it("should set summary message metadata correctly", async () => {
      const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
      const messages = createTestMessages(6);

      const result = await compressor.compress(messages, { start: 0, end: 5 });

      expect(result.summary.isSummary).toBe(true);
      expect(result.summary.condenseId).toBe(result.condenseId);
      expect(result.summary.id).toBe(result.condenseId);
      expect(result.summary.createdAt).toBeGreaterThan(0);
      expect(result.summary.metadata).toEqual({
        compressedCount: 5,
        compressedRange: {
          firstId: "msg-0",
          lastId: "msg-4",
        },
      });
    });

    it("should calculate compression ratio correctly", async () => {
      const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
      const messages = createTestMessages(6);
      // Each message has 100 tokens, compressing 5 messages = 500 tokens
      // Summary ~50 chars => ~12 tokens

      const result = await compressor.compress(messages, { start: 0, end: 5 });

      expect(result.originalTokens).toBe(500);
      expect(result.ratio).toBe(result.summaryTokens / result.originalTokens);
      expect(result.ratio).toBeLessThan(1); // Compression should reduce tokens
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe("generateCondenseId", () => {
  it('should return string starting with "condense-"', () => {
    const id = generateCondenseId();
    expect(id).toMatch(/^condense-/);
  });

  it("should generate unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateCondenseId());
    }
    expect(ids.size).toBe(100);
  });

  it("should be valid UUID format after prefix", () => {
    const id = generateCondenseId();
    const uuid = id.replace("condense-", "");
    // UUID v4 format
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe("isSummaryMessage", () => {
  it("should return true for message with isSummary flag", () => {
    const msg = createMessage("1", "assistant", "Summary", { isSummary: true });
    expect(isSummaryMessage(msg)).toBe(true);
  });

  it("should return true for message with condenseId", () => {
    const msg = createMessage("1", "assistant", "Summary", { condenseId: "condense-123" });
    expect(isSummaryMessage(msg)).toBe(true);
  });

  it("should return false for regular message", () => {
    const msg = createMessage("1", "user", "Regular message");
    expect(isSummaryMessage(msg)).toBe(false);
  });

  it("should return true if both isSummary and condenseId present", () => {
    const msg = createMessage("1", "assistant", "Summary", {
      isSummary: true,
      condenseId: "condense-123",
    });
    expect(isSummaryMessage(msg)).toBe(true);
  });
});

describe("getCompressedMessages", () => {
  it("should return messages with matching condenseParent", () => {
    const condenseId = "condense-123";
    const messages: ContextMessage[] = [
      createMessage("1", "user", "Original 1", { condenseParent: condenseId }),
      createMessage("2", "assistant", "Original 2", { condenseParent: condenseId }),
      createMessage("3", "user", "Not compressed"),
      createMessage("4", "assistant", "Summary", { isSummary: true, condenseId }),
    ];

    const compressed = getCompressedMessages(messages, condenseId);

    expect(compressed).toHaveLength(2);
    expect(compressed.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("should return empty array when no matches", () => {
    const messages = createTestMessages(5);
    const compressed = getCompressedMessages(messages, "nonexistent");
    expect(compressed).toHaveLength(0);
  });
});

describe("estimateCompressionTokens", () => {
  it("should estimate input and output tokens based on ratio", () => {
    const messages = createTestMessages(10); // Each has 100 tokens = 1000 total

    const estimate = estimateCompressionTokens(messages, 0.3);

    expect(estimate.input).toBe(1000);
    expect(estimate.output).toBe(300); // 30% of 1000
  });

  it("should handle zero tokens", () => {
    const messages: ContextMessage[] = [createMessage("1", "user", "", { tokens: 0 })];

    const estimate = estimateCompressionTokens(messages, 0.5);

    expect(estimate.input).toBe(0);
    expect(estimate.output).toBe(0);
  });

  it("should round output up", () => {
    const messages: ContextMessage[] = [createMessage("1", "user", "Test", { tokens: 10 })];

    const estimate = estimateCompressionTokens(messages, 0.33);

    expect(estimate.output).toBe(4); // ceil(10 * 0.33) = 4
  });
});

describe("getEffectiveApiHistory", () => {
  it("should exclude compressed messages and keep summaries", () => {
    const condenseId = "condense-123";
    const messages: ContextMessage[] = [
      createMessage("1", "user", "Original 1", { condenseParent: condenseId }),
      createMessage("2", "assistant", "Original 2", { condenseParent: condenseId }),
      createMessage("summary", "assistant", "Summary", { isSummary: true, condenseId }),
      createMessage("3", "user", "New message"),
    ];

    const effective = getEffectiveApiHistory(messages);

    expect(effective).toHaveLength(2);
    expect(effective.map((m) => m.id)).toEqual(["summary", "3"]);
  });

  it("should keep all messages when no compression has occurred", () => {
    const messages = createTestMessages(5);

    const effective = getEffectiveApiHistory(messages);

    expect(effective).toHaveLength(5);
  });

  it("should keep message with condenseParent if summary does not exist", () => {
    // Edge case: orphaned condenseParent
    const messages: ContextMessage[] = [
      createMessage("1", "user", "Message", { condenseParent: "nonexistent-condense" }),
    ];

    const effective = getEffectiveApiHistory(messages);

    expect(effective).toHaveLength(1);
  });
});

describe("linkCompressedMessages", () => {
  it("should add condenseParent to compressed message IDs", () => {
    const messages = createTestMessages(5);
    const result: CompressionResult = {
      summary: createMessage("summary", "assistant", "Summary", { isSummary: true }),
      compressedMessageIds: ["msg-0", "msg-1", "msg-2"],
      originalTokens: 300,
      summaryTokens: 50,
      ratio: 0.17,
      condenseId: "condense-123",
    };

    const linked = linkCompressedMessages(messages, result);

    expect(linked[0]?.condenseParent).toBe("condense-123");
    expect(linked[1]?.condenseParent).toBe("condense-123");
    expect(linked[2]?.condenseParent).toBe("condense-123");
    expect(linked[3]?.condenseParent).toBeUndefined();
    expect(linked[4]?.condenseParent).toBeUndefined();
  });

  it("should not mutate original messages", () => {
    const messages = createTestMessages(3);
    const result: CompressionResult = {
      summary: createMessage("summary", "assistant", "Summary", { isSummary: true }),
      compressedMessageIds: ["msg-0"],
      originalTokens: 100,
      summaryTokens: 20,
      ratio: 0.2,
      condenseId: "condense-123",
    };

    linkCompressedMessages(messages, result);

    expect(messages[0]?.condenseParent).toBeUndefined();
  });
});

describe("calculateCompressionSavings", () => {
  it("should calculate token savings and percentage", () => {
    const result: CompressionResult = {
      summary: createMessage("s", "assistant", "Summary", { isSummary: true }),
      compressedMessageIds: [],
      originalTokens: 1000,
      summaryTokens: 300,
      ratio: 0.3,
      condenseId: "condense-123",
    };

    const savings = calculateCompressionSavings(result);

    expect(savings.tokens).toBe(700);
    expect(savings.percentage).toBe(70);
  });

  it("should handle zero original tokens", () => {
    const result: CompressionResult = {
      summary: createMessage("s", "assistant", "Summary", { isSummary: true }),
      compressedMessageIds: [],
      originalTokens: 0,
      summaryTokens: 0,
      ratio: 0,
      condenseId: "condense-123",
    };

    const savings = calculateCompressionSavings(result);

    expect(savings.tokens).toBe(0);
    expect(savings.percentage).toBe(0);
  });

  it("should round percentage correctly", () => {
    const result: CompressionResult = {
      summary: createMessage("s", "assistant", "Summary", { isSummary: true }),
      compressedMessageIds: [],
      originalTokens: 333,
      summaryTokens: 100,
      ratio: 0.3,
      condenseId: "condense-123",
    };

    const savings = calculateCompressionSavings(result);

    expect(savings.percentage).toBe(70); // (333-100)/333 = 70%
  });
});

// ============================================================================
// DEFAULT_SUMMARY_PROMPT Tests
// ============================================================================

describe("DEFAULT_SUMMARY_PROMPT", () => {
  it("should contain all 6 required sections", () => {
    expect(DEFAULT_SUMMARY_PROMPT).toContain("## 1. Task Overview");
    expect(DEFAULT_SUMMARY_PROMPT).toContain("## 2. Key Decisions Made");
    expect(DEFAULT_SUMMARY_PROMPT).toContain("## 3. Code Changes");
    expect(DEFAULT_SUMMARY_PROMPT).toContain("## 4. Current State");
    expect(DEFAULT_SUMMARY_PROMPT).toContain("## 5. Pending Items");
    expect(DEFAULT_SUMMARY_PROMPT).toContain("## 6. Important Context");
  });

  it("should not be empty", () => {
    expect(DEFAULT_SUMMARY_PROMPT.length).toBeGreaterThan(100);
  });
});

// ============================================================================
// CondensedMessageStore Tests (T012)
// ============================================================================

describe("CondensedMessageStore", () => {
  function createMockCompressionResult(condenseId: string): CompressionResult {
    return {
      summary: createMessage("summary-1", "assistant", "Summary content", {
        isSummary: true,
        condenseId,
      }),
      compressedMessageIds: ["msg-1", "msg-2", "msg-3"],
      originalTokens: 1000,
      summaryTokens: 300,
      ratio: 0.3,
      condenseId,
    };
  }

  describe("store()", () => {
    it("should store original messages with condenseId", () => {
      const store = new CondensedMessageStore();
      const condenseId = "condense-test-1";
      const originalMessages = createTestMessages(5);
      const result = createMockCompressionResult(condenseId);

      store.store(condenseId, originalMessages, result);

      expect(store.has(condenseId)).toBe(true);
      expect(store.size).toBe(1);
    });

    it("should overwrite existing entry with same condenseId", () => {
      const store = new CondensedMessageStore();
      const condenseId = "condense-test-1";
      const firstMessages = createTestMessages(3);
      const secondMessages = createTestMessages(5);
      const result = createMockCompressionResult(condenseId);

      store.store(condenseId, firstMessages, result);
      store.store(condenseId, secondMessages, result);

      const entry = store.get(condenseId);
      expect(entry?.originalMessages.length).toBe(5);
      expect(store.size).toBe(1);
    });
  });

  describe("get()", () => {
    it("should retrieve stored entry by condenseId", () => {
      const store = new CondensedMessageStore();
      const condenseId = "condense-test-1";
      const originalMessages = createTestMessages(4);
      const result = createMockCompressionResult(condenseId);

      store.store(condenseId, originalMessages, result);
      const entry = store.get(condenseId);

      expect(entry).toBeDefined();
      expect(entry?.condenseId).toBe(condenseId);
      expect(entry?.originalMessages).toEqual(originalMessages);
      expect(entry?.compressionResult).toEqual(result);
      expect(entry?.compressedAt).toBeGreaterThan(0);
    });

    it("should return undefined for non-existent condenseId", () => {
      const store = new CondensedMessageStore();
      expect(store.get("non-existent")).toBeUndefined();
    });
  });

  describe("has()", () => {
    it("should return true for existing condenseId", () => {
      const store = new CondensedMessageStore();
      const condenseId = "condense-test-1";
      store.store(condenseId, [], createMockCompressionResult(condenseId));

      expect(store.has(condenseId)).toBe(true);
    });

    it("should return false for non-existent condenseId", () => {
      const store = new CondensedMessageStore();
      expect(store.has("non-existent")).toBe(false);
    });
  });

  describe("delete()", () => {
    it("should remove entry and return true", () => {
      const store = new CondensedMessageStore();
      const condenseId = "condense-test-1";
      store.store(condenseId, [], createMockCompressionResult(condenseId));

      const deleted = store.delete(condenseId);

      expect(deleted).toBe(true);
      expect(store.has(condenseId)).toBe(false);
      expect(store.size).toBe(0);
    });

    it("should return false when condenseId does not exist", () => {
      const store = new CondensedMessageStore();
      expect(store.delete("non-existent")).toBe(false);
    });
  });

  describe("keys()", () => {
    it("should return all stored condenseIds", () => {
      const store = new CondensedMessageStore();
      const id1 = "condense-1";
      const id2 = "condense-2";
      const id3 = "condense-3";

      store.store(id1, [], createMockCompressionResult(id1));
      store.store(id2, [], createMockCompressionResult(id2));
      store.store(id3, [], createMockCompressionResult(id3));

      const keys = store.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain(id1);
      expect(keys).toContain(id2);
      expect(keys).toContain(id3);
    });

    it("should return empty array when store is empty", () => {
      const store = new CondensedMessageStore();
      expect(store.keys()).toEqual([]);
    });
  });

  describe("clear()", () => {
    it("should remove all entries", () => {
      const store = new CondensedMessageStore();
      store.store("id-1", [], createMockCompressionResult("id-1"));
      store.store("id-2", [], createMockCompressionResult("id-2"));

      store.clear();

      expect(store.size).toBe(0);
      expect(store.keys()).toEqual([]);
    });
  });
});

// ============================================================================
// recoverCondensed Tests (T013)
// ============================================================================

describe("recoverCondensed", () => {
  function createMockCompressionResult(condenseId: string): CompressionResult {
    return {
      summary: createMessage("summary-1", "assistant", "Summary content", {
        isSummary: true,
        condenseId,
      }),
      compressedMessageIds: ["msg-1", "msg-2", "msg-3"],
      originalTokens: 1000,
      summaryTokens: 300,
      ratio: 0.3,
      condenseId,
    };
  }

  it("should recover original messages and remove summary", () => {
    const store = new CondensedMessageStore();
    const condenseId = "condense-recovery-test";
    const originalMessages = createTestMessages(4);
    const result = createMockCompressionResult(condenseId);

    store.store(condenseId, originalMessages, result);

    // Create current messages with summary in place of originals
    const summaryMessage = createMessage("summary", "assistant", "[📦 Context Summary]", {
      isSummary: true,
      condenseId,
    });
    const currentMessages = [
      createMessage("system-1", "system", "System prompt"),
      summaryMessage,
      createMessage("recent-1", "user", "Recent message"),
    ];

    const recovery = recoverCondensed(currentMessages, condenseId, store);

    expect(recovery).not.toBeNull();
    expect(recovery?.success).toBe(true);
    expect(recovery?.condenseId).toBe(condenseId);
    expect(recovery?.restoredMessages).toHaveLength(4);

    // Verify summary was removed and originals inserted
    const summaryInResult = recovery?.messages.find(
      (m) => m.isSummary && m.condenseId === condenseId
    );
    expect(summaryInResult).toBeUndefined();

    // Verify original messages are in result
    for (const orig of originalMessages) {
      const found = recovery?.messages.find((m) => m.id === orig.id);
      expect(found).toBeDefined();
    }
  });

  it("should return null when condenseId not in store", () => {
    const store = new CondensedMessageStore();
    const currentMessages = createTestMessages(3);

    const recovery = recoverCondensed(currentMessages, "non-existent", store);

    expect(recovery).toBeNull();
  });

  it("should clear condenseParent from restored messages", () => {
    const store = new CondensedMessageStore();
    const condenseId = "condense-parent-test";

    // Create original messages with condenseParent set
    const originalMessages = [
      createMessage("msg-1", "user", "Hello", { condenseParent: condenseId }),
      createMessage("msg-2", "assistant", "Hi", { condenseParent: condenseId }),
    ];
    const result = createMockCompressionResult(condenseId);

    store.store(condenseId, originalMessages, result);

    const currentMessages = [
      createMessage("summary", "assistant", "Summary", { isSummary: true, condenseId }),
    ];

    const recovery = recoverCondensed(currentMessages, condenseId, store);

    // Verify condenseParent is cleared from restored messages
    for (const msg of recovery?.restoredMessages ?? []) {
      expect(msg.condenseParent).toBeUndefined();
    }
  });

  it("should remove entry from store after successful recovery", () => {
    const store = new CondensedMessageStore();
    const condenseId = "condense-cleanup-test";
    const originalMessages = createTestMessages(3);
    const result = createMockCompressionResult(condenseId);

    store.store(condenseId, originalMessages, result);
    expect(store.has(condenseId)).toBe(true);

    const currentMessages = [
      createMessage("summary", "assistant", "Summary", { isSummary: true, condenseId }),
    ];

    recoverCondensed(currentMessages, condenseId, store);

    expect(store.has(condenseId)).toBe(false);
  });

  it("should handle recovery when summary is not in current messages", () => {
    const store = new CondensedMessageStore();
    const condenseId = "condense-no-summary-test";
    const originalMessages = createTestMessages(3);
    const result = createMockCompressionResult(condenseId);

    store.store(condenseId, originalMessages, result);

    // Current messages without the summary
    const currentMessages = [
      createMessage("other-1", "user", "Some message"),
      createMessage("other-2", "assistant", "Response"),
    ];

    const recovery = recoverCondensed(currentMessages, condenseId, store);

    expect(recovery?.success).toBe(true);
    // Original messages should be appended
    expect(recovery?.messages.length).toBe(currentMessages.length + originalMessages.length);
  });

  it("should clear condenseParent from other messages pointing to recovered condenseId", () => {
    const store = new CondensedMessageStore();
    const condenseId = "condense-pointer-test";
    const originalMessages = createTestMessages(2);
    const result = createMockCompressionResult(condenseId);

    store.store(condenseId, originalMessages, result);

    // Current messages include some with condenseParent pointing to this condenseId
    const currentMessages = [
      createMessage("summary", "assistant", "Summary", { isSummary: true, condenseId }),
      createMessage("linked-1", "user", "Linked message", { condenseParent: condenseId }),
      createMessage("unlinked", "assistant", "Normal message"),
    ];

    const recovery = recoverCondensed(currentMessages, condenseId, store);

    // Find the linked message in result - condenseParent should be cleared
    const linkedInResult = recovery?.messages.find((m) => m.id === "linked-1");
    expect(linkedInResult?.condenseParent).toBeUndefined();

    // Unlinked message should be unchanged
    const unlinkedInResult = recovery?.messages.find((m) => m.id === "unlinked");
    expect(unlinkedInResult).toBeDefined();
  });
});
