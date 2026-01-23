/**
 * Integration Tests for Non-Destructive Compression System
 *
 * End-to-end tests covering:
 * - T032 [REQ-001]: Full compaction flow with 6-section summary
 * - T034 [REQ-004]: DeepSeek integration with reasoning blocks
 *
 * These tests verify the complete compression workflow:
 * - 10-message input produces 6-section structured summary
 * - Original messages are recoverable via condenseId
 * - DeepSeek models receive synthetic reasoning blocks
 *
 * @module @vellum/core/context/__tests__/compression.integration.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CompressionLLMClient,
  CondensedMessageStore,
  DEFAULT_SUMMARY_PROMPT,
  getEffectiveApiHistory,
  linkCompressedMessages,
  NonDestructiveCompressor,
  recoverCondensed,
} from "../compression.js";
import { ReasoningBlockHandler } from "../reasoning-block.js";
import type { ContextMessage } from "../types.js";
import { MessagePriority } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test message with standard fields.
 */
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

/**
 * Generate a realistic 6-section summary matching DEFAULT_SUMMARY_PROMPT format.
 */
function createSixSectionSummary(): string {
  return `## 1. Task Overview
User is implementing a context compression system for an AI coding assistant CLI.

## 2. Key Decisions Made
- Using non-destructive compression with condenseId tracking
- 6-section structured summaries for organized context
- Supporting DeepSeek models with reasoning blocks

## 3. Code Changes
- packages/core/src/context/compression.ts: Added NonDestructiveCompressor
- packages/core/src/context/reasoning-block.ts: Added ReasoningBlockHandler
- packages/core/src/context/types.ts: Updated message types

## 4. Current State
Compression system is implemented with full test coverage. Integration tests are in progress.

## 5. Pending Items
- Performance benchmarking
- Edge case testing for large message sets

## 6. Important Context
- Target compression ratio: 30%
- Minimum messages to compress: 4
- DeepSeek models require <thinking> blocks`;
}

/**
 * Create a mock LLM client that returns structured summaries.
 */
function createMockLLMClient(summaryResponse?: string): CompressionLLMClient & {
  summarize: ReturnType<typeof vi.fn>;
} {
  return {
    summarize: vi.fn().mockResolvedValue(summaryResponse ?? createSixSectionSummary()),
  };
}

/**
 * Create 10 realistic conversation messages for compression testing.
 */
function createTenMessageConversation(): ContextMessage[] {
  const now = Date.now();
  return [
    createMessage("msg-1", "user", "I need to implement a context compression system.", {
      tokens: 50,
      createdAt: now,
    }),
    createMessage(
      "msg-2",
      "assistant",
      "I'll help you implement context compression. Let's start by designing the core algorithm.",
      { tokens: 80, createdAt: now + 1000 }
    ),
    createMessage(
      "msg-3",
      "user",
      "What approach should we use? I want to preserve the ability to recover original messages.",
      { tokens: 70, createdAt: now + 2000 }
    ),
    createMessage(
      "msg-4",
      "assistant",
      "We should use non-destructive compression with condenseId pointers. This allows full traceability.",
      { tokens: 90, createdAt: now + 3000 }
    ),
    createMessage("msg-5", "user", "That sounds good. What about the summary format?", {
      tokens: 45,
      createdAt: now + 4000,
    }),
    createMessage(
      "msg-6",
      "assistant",
      "I recommend a 6-section structured summary: Task Overview, Key Decisions, Code Changes, Current State, Pending Items, and Important Context.",
      { tokens: 120, createdAt: now + 5000 }
    ),
    createMessage("msg-7", "user", "Perfect. Can you implement the compressor class?", {
      tokens: 40,
      createdAt: now + 6000,
    }),
    createMessage(
      "msg-8",
      "assistant",
      "Here's the NonDestructiveCompressor implementation with configurable target ratio and max summary tokens.",
      { tokens: 150, createdAt: now + 7000 }
    ),
    createMessage("msg-9", "user", "Great! Now let's add support for DeepSeek models.", {
      tokens: 45,
      createdAt: now + 8000,
    }),
    createMessage(
      "msg-10",
      "assistant",
      "I've added the ReasoningBlockHandler to inject synthetic <thinking> blocks for DeepSeek reasoning models.",
      { tokens: 100, createdAt: now + 9000 }
    ),
  ];
}

// ============================================================================
// T032 [REQ-001]: Full Compaction Flow Integration Tests
// ============================================================================

describe("T032 [REQ-001] Full Compaction Flow Integration", () => {
  let mockClient: CompressionLLMClient & { summarize: ReturnType<typeof vi.fn> };
  let compressor: NonDestructiveCompressor;
  let store: CondensedMessageStore;

  beforeEach(() => {
    mockClient = createMockLLMClient();
    compressor = new NonDestructiveCompressor({ llmClient: mockClient });
    store = new CondensedMessageStore();
  });

  describe("10-message compression produces 6-section summary", () => {
    it("should compress 10 messages into a structured summary", async () => {
      const messages = createTenMessageConversation();

      // Compress first 8 messages, keep last 2 as recent
      const result = await compressor.compress(messages, { start: 0, end: 8 });

      // Verify compression result structure
      expect(result).toMatchObject({
        summary: expect.objectContaining({
          isSummary: true,
          role: "assistant",
        }),
        compressedMessageIds: expect.any(Array),
        originalTokens: expect.any(Number),
        summaryTokens: expect.any(Number),
        ratio: expect.any(Number),
        condenseId: expect.stringMatching(/^condense-/),
      });

      // Verify 8 messages were compressed
      expect(result.compressedMessageIds).toHaveLength(8);
      expect(result.compressedMessageIds).toContain("msg-1");
      expect(result.compressedMessageIds).toContain("msg-8");
      expect(result.compressedMessageIds).not.toContain("msg-9");
      expect(result.compressedMessageIds).not.toContain("msg-10");
    });

    it("should produce summary containing all 6 sections", async () => {
      const messages = createTenMessageConversation();

      const result = await compressor.compress(messages, { start: 0, end: 8 });

      // Verify summary contains all 6 sections
      const summaryContent = result.summary.content as string;
      expect(summaryContent).toContain("## 1. Task Overview");
      expect(summaryContent).toContain("## 2. Key Decisions Made");
      expect(summaryContent).toContain("## 3. Code Changes");
      expect(summaryContent).toContain("## 4. Current State");
      expect(summaryContent).toContain("## 5. Pending Items");
      expect(summaryContent).toContain("## 6. Important Context");
    });

    it("should pass correct prompt to LLM client", async () => {
      const messages = createTenMessageConversation();

      await compressor.compress(messages, { start: 0, end: 8 });

      // Verify LLM was called with default summary prompt
      expect(mockClient.summarize).toHaveBeenCalledTimes(1);
      expect(mockClient.summarize).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: "msg-1" })]),
        DEFAULT_SUMMARY_PROMPT
      );
    });

    it("should achieve target compression ratio", async () => {
      const messages = createTenMessageConversation();

      const result = await compressor.compress(messages, { start: 0, end: 8 });

      // Verify compression achieved
      expect(result.summaryTokens).toBeLessThan(result.originalTokens);
      expect(result.ratio).toBeLessThan(1);
      expect(result.ratio).toBeGreaterThan(0);
    });
  });

  describe("Original messages recoverable via condenseId", () => {
    it("should store and recover original messages", async () => {
      const messages = createTenMessageConversation();

      // Step 1: Compress messages
      const result = await compressor.compress(messages, { start: 0, end: 8 });

      // Step 2: Store compressed messages in store
      const compressedMessages = messages.slice(0, 8);
      store.store(result.condenseId, compressedMessages, result);

      // Step 3: Verify store has the entry
      expect(store.has(result.condenseId)).toBe(true);

      // Step 4: Create current state with summary replacing originals
      const linkedMessages = linkCompressedMessages(messages, result);
      const currentMessages = [result.summary, ...linkedMessages.slice(8)];

      // Step 5: Recover original messages
      const recovery = recoverCondensed(currentMessages, result.condenseId, store);

      // Verify recovery was successful
      expect(recovery).not.toBeNull();
      expect(recovery?.success).toBe(true);
      expect(recovery?.condenseId).toBe(result.condenseId);
      expect(recovery?.restoredMessages).toHaveLength(8);

      // Verify original message content is recovered
      const recoveredIds = recovery?.restoredMessages.map((m) => m.id);
      expect(recoveredIds).toContain("msg-1");
      expect(recoveredIds).toContain("msg-8");
    });

    it("should produce correct API history after compression", async () => {
      const messages = createTenMessageConversation();

      // Compress first 8 messages
      const result = await compressor.compress(messages, { start: 0, end: 8 });

      // Link compressed messages
      const linkedMessages = linkCompressedMessages(messages, result);

      // Add summary to message list
      const allMessages = [result.summary, ...linkedMessages];

      // Get effective API history (should exclude compressed originals)
      const effective = getEffectiveApiHistory(allMessages);

      // Should have summary + 2 recent messages (not compressed originals)
      expect(effective).toHaveLength(3);
      expect(effective[0]?.isSummary).toBe(true);
      expect(effective[1]?.id).toBe("msg-9");
      expect(effective[2]?.id).toBe("msg-10");

      // Compressed originals should not be in effective history
      const compressedInEffective = effective.filter((m) =>
        result.compressedMessageIds.includes(m.id)
      );
      expect(compressedInEffective).toHaveLength(0);
    });

    it("should clear condenseParent after recovery", async () => {
      const messages = createTenMessageConversation();

      const result = await compressor.compress(messages, { start: 0, end: 8 });
      const compressedMessages = messages.slice(0, 8);
      store.store(result.condenseId, compressedMessages, result);

      const linkedMessages = linkCompressedMessages(messages, result);
      const currentMessages = [result.summary, ...linkedMessages];

      const recovery = recoverCondensed(currentMessages, result.condenseId, store);

      // Verify condenseParent is cleared from all restored messages
      for (const msg of recovery?.restoredMessages ?? []) {
        expect(msg.condenseParent).toBeUndefined();
      }
    });

    it("should remove entry from store after recovery", async () => {
      const messages = createTenMessageConversation();

      const result = await compressor.compress(messages, { start: 0, end: 8 });
      const compressedMessages = messages.slice(0, 8);
      store.store(result.condenseId, compressedMessages, result);

      const currentMessages = [result.summary, ...messages.slice(8)];

      recoverCondensed(currentMessages, result.condenseId, store);

      // Store should no longer have the entry
      expect(store.has(result.condenseId)).toBe(false);
    });
  });

  describe("Edge cases and error handling", () => {
    it("should reject compression with too few messages", async () => {
      const messages = createTenMessageConversation().slice(0, 3);

      await expect(compressor.compress(messages, { start: 0, end: 3 })).rejects.toThrow(
        /at least 4 messages/
      );
    });

    it("should generate unique condenseIds for multiple compressions", async () => {
      const messages = createTenMessageConversation();

      const result1 = await compressor.compress(messages, { start: 0, end: 6 });
      const result2 = await compressor.compress(messages, { start: 0, end: 6 });

      expect(result1.condenseId).not.toBe(result2.condenseId);
    });

    it("should return null when recovering non-existent condenseId", () => {
      const messages = createTenMessageConversation();

      const recovery = recoverCondensed(messages, "condense-nonexistent", store);

      expect(recovery).toBeNull();
    });
  });
});

// ============================================================================
// T034 [REQ-004]: DeepSeek Integration Tests
// ============================================================================

describe("T034 [REQ-004] DeepSeek Integration", () => {
  let mockClient: CompressionLLMClient & { summarize: ReturnType<typeof vi.fn> };
  let reasoningHandler: ReasoningBlockHandler;

  beforeEach(() => {
    mockClient = createMockLLMClient();
    reasoningHandler = new ReasoningBlockHandler();
  });

  describe("DeepSeek model detection", () => {
    it("should detect deepseek models correctly", () => {
      expect(reasoningHandler.requiresReasoningBlock("deepseek")).toBe(true);
      expect(reasoningHandler.requiresReasoningBlock("deepseek-r1")).toBe(true);
      expect(reasoningHandler.requiresReasoningBlock("deepseek-v3")).toBe(true);
      expect(reasoningHandler.requiresReasoningBlock("deepseek-coder")).toBe(true);
      expect(reasoningHandler.requiresReasoningBlock("DeepSeek-R1")).toBe(true);
      expect(reasoningHandler.requiresReasoningBlock("DEEPSEEK")).toBe(true);
    });

    it("should not detect non-DeepSeek models", () => {
      expect(reasoningHandler.requiresReasoningBlock("gpt-4o")).toBe(false);
      expect(reasoningHandler.requiresReasoningBlock("claude-3-opus")).toBe(false);
      expect(reasoningHandler.requiresReasoningBlock("gemini-pro")).toBe(false);
      expect(reasoningHandler.requiresReasoningBlock("llama-3")).toBe(false);
    });
  });

  describe("Reasoning block addition for DeepSeek", () => {
    it("should add reasoning block to summary for DeepSeek model", async () => {
      const compressor = new NonDestructiveCompressor({
        llmClient: mockClient,
        reasoningBlockHandler: reasoningHandler,
        targetModel: "deepseek-r1",
      });
      const messages = createTenMessageConversation();

      const result = await compressor.compress(messages, { start: 0, end: 8 });

      // Summary should have reasoning content for DeepSeek
      expect(result.summary.reasoningContent).toBeDefined();
      expect(result.summary.reasoningContent).toContain("<thinking>");
      expect(result.summary.reasoningContent).toContain("</thinking>");
    });

    it("should include thinking prefix in reasoning block", async () => {
      const compressor = new NonDestructiveCompressor({
        llmClient: mockClient,
        reasoningBlockHandler: reasoningHandler,
        targetModel: "deepseek-r1",
      });
      const messages = createTenMessageConversation();

      const result = await compressor.compress(messages, { start: 0, end: 8 });

      // Should include the default thinking prefix
      expect(result.summary.reasoningContent).toContain("analyze the context");
    });

    it("should NOT add reasoning block for non-DeepSeek models", async () => {
      const compressor = new NonDestructiveCompressor({
        llmClient: mockClient,
        reasoningBlockHandler: reasoningHandler,
        targetModel: "gpt-4o",
      });
      const messages = createTenMessageConversation();

      const result = await compressor.compress(messages, { start: 0, end: 8 });

      // Summary should NOT have reasoning content for GPT-4
      expect(result.summary.reasoningContent).toBeUndefined();
    });

    it("should NOT add reasoning block when handler is not provided", async () => {
      const compressor = new NonDestructiveCompressor({
        llmClient: mockClient,
        targetModel: "deepseek-r1",
        // No reasoningBlockHandler
      });
      const messages = createTenMessageConversation();

      const result = await compressor.compress(messages, { start: 0, end: 8 });

      // Without handler, no reasoning content should be added
      expect(result.summary.reasoningContent).toBeUndefined();
    });
  });

  describe("DeepSeek message format validation", () => {
    it("should produce valid message format for DeepSeek API", () => {
      const summaryMessage = createMessage("summary-1", "assistant", createSixSectionSummary(), {
        isSummary: true,
        condenseId: "condense-deepseek-test",
      });

      const withReasoning = reasoningHandler.addReasoningBlock(summaryMessage);

      // Verify message has required fields
      expect(withReasoning.message.role).toBe("assistant");
      expect(withReasoning.message.content).toBeTruthy();
      expect(withReasoning.message.reasoningContent).toBeTruthy();

      // Verify reasoning block format
      expect(withReasoning.message.reasoningContent).toMatch(/<thinking>[\s\S]*<\/thinking>/);
    });

    it("should preserve original content when adding reasoning", () => {
      const originalContent = "This is the summary content.";
      const summaryMessage = createMessage("summary-1", "assistant", originalContent);

      const withReasoning = reasoningHandler.addReasoningBlock(summaryMessage);

      // Original content should be preserved
      expect(withReasoning.message.content).toBe(originalContent);
      expect(withReasoning.message.id).toBe(summaryMessage.id);
      expect(withReasoning.message.role).toBe(summaryMessage.role);
    });

    it("should only add reasoning to assistant messages", () => {
      const userMessage = createMessage("user-1", "user", "User content");

      const result = reasoningHandler.addReasoningBlock(userMessage);

      expect(result.wasAdded).toBe(false);
      expect(result.message.reasoningContent).toBeUndefined();
    });

    it("should process message for specific model via processForModel", () => {
      const summaryMessage = createMessage("summary-1", "assistant", "Summary content");

      // Process for DeepSeek - should add reasoning
      const deepseekResult = reasoningHandler.processForModel(summaryMessage, "deepseek-r1");
      expect(deepseekResult.wasAdded).toBe(true);
      expect(deepseekResult.message.reasoningContent).toBeDefined();

      // Process for GPT-4 - should NOT add reasoning
      const gptResult = reasoningHandler.processForModel(summaryMessage, "gpt-4o");
      expect(gptResult.wasAdded).toBe(false);
      expect(gptResult.message.reasoningContent).toBeUndefined();
    });
  });

  describe("Custom thinking prefix", () => {
    it("should support custom thinking prefix", () => {
      const customPrefix = "Let me carefully consider this context before responding...";
      const customHandler = new ReasoningBlockHandler({ thinkingPrefix: customPrefix });

      const summaryMessage = createMessage("summary-1", "assistant", "Summary content");
      const result = customHandler.addReasoningBlock(summaryMessage);

      expect(result.message.reasoningContent).toContain(customPrefix);
    });
  });
});

// ============================================================================
// Full End-to-End Flow Test
// ============================================================================

describe("Full End-to-End Compression Flow", () => {
  it("should complete full compression → store → recover cycle", async () => {
    // Setup
    const mockClient = createMockLLMClient();
    const reasoningHandler = new ReasoningBlockHandler();
    const store = new CondensedMessageStore();
    const compressor = new NonDestructiveCompressor({
      llmClient: mockClient,
      reasoningBlockHandler: reasoningHandler,
      targetModel: "deepseek-r1",
    });

    // Step 1: Create 10 messages
    const messages = createTenMessageConversation();
    expect(messages).toHaveLength(10);

    // Step 2: Compress first 8 messages
    const result = await compressor.compress(messages, { start: 0, end: 8 });
    expect(result.compressedMessageIds).toHaveLength(8);
    expect(result.summary.isSummary).toBe(true);

    // Step 3: Verify 6-section summary format
    const summaryContent = result.summary.content as string;
    expect(summaryContent).toContain("## 1. Task Overview");
    expect(summaryContent).toContain("## 6. Important Context");

    // Step 4: Verify DeepSeek reasoning block
    expect(result.summary.reasoningContent).toContain("<thinking>");

    // Step 5: Store original messages
    const compressedOriginals = messages.slice(0, 8);
    store.store(result.condenseId, compressedOriginals, result);

    // Step 6: Create current state (summary + recent messages)
    const linkedMessages = linkCompressedMessages(messages, result);
    const currentState = [result.summary, ...linkedMessages.slice(8)];

    // Step 7: Verify effective API history excludes compressed originals
    const allWithSummary = [result.summary, ...linkedMessages];
    const effective = getEffectiveApiHistory(allWithSummary);
    expect(effective).toHaveLength(3); // summary + 2 recent

    // Step 8: Recover original messages
    const recovery = recoverCondensed(currentState, result.condenseId, store);
    expect(recovery?.success).toBe(true);
    expect(recovery?.restoredMessages).toHaveLength(8);

    // Step 9: Verify store is cleared after recovery
    expect(store.has(result.condenseId)).toBe(false);

    // Step 10: Verify recovered messages have correct IDs
    const recoveredIds = recovery?.restoredMessages.map((m) => m.id);
    expect(recoveredIds).toEqual(
      expect.arrayContaining([
        "msg-1",
        "msg-2",
        "msg-3",
        "msg-4",
        "msg-5",
        "msg-6",
        "msg-7",
        "msg-8",
      ])
    );
  });
});
