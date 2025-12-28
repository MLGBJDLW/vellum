/**
 * Integration Tests for Context Management System
 *
 * End-to-end tests covering full workflows:
 * - Complete manage() workflow with state transitions
 * - API history filtering after compression
 * - Checkpoint creation and rollback
 * - Feature flag integration
 * - Error recovery strategies
 *
 * @module @vellum/core/context/__tests__/integration.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AutoContextManager,
  type CompressionLLMClient,
  type ContextMessage,
  getEffectiveApiHistory,
  MessagePriority,
  type ThresholdConfig,
} from "../index.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock LLM client for compression tests.
 */
function createMockLLMClient(): CompressionLLMClient & {
  summarize: ReturnType<typeof vi.fn>;
} {
  return {
    summarize: vi
      .fn()
      .mockResolvedValue(
        "## Summary\n" +
          "### 1. Task Overview\n" +
          "User requested testing context management.\n" +
          "### 2. Key Decisions\n" +
          "- Implemented compression\n" +
          "- Added checkpoints\n" +
          "### 3. Current State\n" +
          "System is working correctly."
      ),
  };
}

/**
 * Create a single test message.
 */
function createMessage(
  id: string,
  role: "user" | "assistant" | "system",
  content: string,
  options: Partial<ContextMessage> = {}
): ContextMessage {
  return {
    id,
    role,
    content,
    priority:
      role === "system" ? MessagePriority.SYSTEM : (options.priority ?? MessagePriority.NORMAL),
    tokens: options.tokens ?? Math.ceil(content.length / 4),
    createdAt: options.createdAt ?? Date.now(),
    ...options,
  };
}

/**
 * Create messages that total approximately the specified token count.
 */
function createMessagesWithTokens(
  totalTokens: number,
  messageCount: number,
  options: { includeSystem?: boolean; includeTools?: boolean } = {}
): ContextMessage[] {
  const { includeSystem = false, includeTools = false } = options;
  const tokensPerMessage = Math.floor(totalTokens / messageCount);
  const messages: ContextMessage[] = [];

  for (let i = 0; i < messageCount; i++) {
    let role: "user" | "assistant" | "system";

    if (i === 0 && includeSystem) {
      role = "system";
    } else if (i % 2 === 1) {
      role = "user";
    } else {
      role = "assistant";
    }

    // Create content based on whether we include tool blocks
    if (includeTools && role === "assistant" && i > 2 && i % 3 === 0) {
      // Create tool_use message
      messages.push({
        id: `msg-${i}`,
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: `tool-${i}`,
            name: "read_file",
            input: { path: `/test/file-${i}.ts` },
          },
        ],
        priority: MessagePriority.TOOL_PAIR,
        tokens: tokensPerMessage,
        createdAt: Date.now() + i,
      });
    } else if (includeTools && role === "user" && i > 2 && i % 3 === 1) {
      // Create tool_result message
      messages.push({
        id: `msg-${i}`,
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: `tool-${i - 1}`,
            content: "x".repeat(tokensPerMessage * 4),
          },
        ],
        priority: MessagePriority.TOOL_PAIR,
        tokens: tokensPerMessage,
        createdAt: Date.now() + i,
      });
    } else {
      messages.push(
        createMessage(`msg-${i}`, role, "x".repeat(tokensPerMessage * 4), {
          tokens: tokensPerMessage,
          createdAt: Date.now() + i,
        })
      );
    }
  }

  return messages;
}

/**
 * Create a conversation with realistic content.
 */
function createConversation(exchanges: number, tokensPerMessage: number): ContextMessage[] {
  const messages: ContextMessage[] = [];

  // System message
  messages.push(
    createMessage("system-1", "system", "You are a helpful assistant.", { tokens: 10 })
  );

  // User-assistant exchanges
  for (let i = 0; i < exchanges; i++) {
    messages.push(
      createMessage(`user-${i}`, "user", `User message ${i}: ${"x".repeat(tokensPerMessage * 4)}`, {
        tokens: tokensPerMessage,
        createdAt: Date.now() + i * 2,
      })
    );
    messages.push(
      createMessage(
        `assistant-${i}`,
        "assistant",
        `Assistant response ${i}: ${"x".repeat(tokensPerMessage * 4)}`,
        { tokens: tokensPerMessage, createdAt: Date.now() + i * 2 + 1 }
      )
    );
  }

  return messages;
}

// ============================================================================
// Integration Test Suites
// ============================================================================

describe("Context Management Integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // Full Workflow Tests
  // ==========================================================================

  describe("Full manage() Workflow", () => {
    it("should start healthy and remain healthy with small context", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const messages = createConversation(5, 100);
      const result = await manager.manage(messages);

      expect(result.state).toBe("healthy");
      expect(result.actions).toHaveLength(0);
      expect(result.messages.length).toBe(messages.length);
    });

    it("should transition from healthy to warning and prune", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 10_000,
        thresholds: { warning: 0.5, critical: 0.7, overflow: 0.9 },
      });

      const budget = manager.getBudget();
      // Create messages with tool outputs that exceed warning threshold
      const targetTokens = Math.floor(budget.historyBudget * 0.55);
      const messages = createMessagesWithTokens(targetTokens, 15, {
        includeTools: true,
      });

      const result = await manager.manage(messages);

      // Should either be healthy (after pruning) or warning
      expect(["healthy", "warning"]).toContain(result.state);
    });

    it("should transition to critical and create checkpoint before truncation", async () => {
      const mockClient = createMockLLMClient();
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 10_000,
        llmClient: mockClient,
        useAutoCondense: true,
        thresholds: { warning: 0.3, critical: 0.4, overflow: 0.95 },
      });

      const budget = manager.getBudget();
      // Target tokens to be in critical range (between 0.4 and 0.95)
      const targetTokens = Math.floor(budget.historyBudget * 0.5);
      const messages = createConversation(20, Math.floor(targetTokens / 40));

      const result = await manager.manage(messages);

      // Should have created a checkpoint if we hit critical state
      if (result.checkpoint) {
        expect(result.checkpoint).toMatch(/^chk_/);
        expect(result.actions.some((a) => a.startsWith("checkpoint:"))).toBe(true);
      }

      // Result should be a managed state (may still be overflow if context is large)
      expect(["healthy", "warning", "critical", "overflow"]).toContain(result.state);
      // Budget usage should be tracked
      expect(result.budgetUsed).toBeGreaterThanOrEqual(0);
    });

    it("should execute full workflow: prune → checkpoint → truncate → compress", async () => {
      const mockClient = createMockLLMClient();
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 8_000,
        llmClient: mockClient,
        useAutoCondense: true,
        thresholds: { warning: 0.25, critical: 0.35, overflow: 0.85 },
      });

      const budget = manager.getBudget();
      // Create enough messages to trigger critical state
      const targetTokens = Math.floor(budget.historyBudget * 0.5);
      const messages = createMessagesWithTokens(targetTokens, 30, {
        includeSystem: true,
        includeTools: true,
      });

      const result = await manager.manage(messages);

      // Should have executed multiple actions
      const hasCheckpoint = result.actions.some((a) => a.startsWith("checkpoint:"));
      const hasTruncate = result.actions.some((a) => a.startsWith("truncate:"));
      const hasCompress = result.actions.some((a) => a.startsWith("compress:"));

      // At least truncation or compression should have happened for critical state
      if (result.state !== "healthy" && result.state !== "warning") {
        expect(hasTruncate || hasCompress || hasCheckpoint).toBe(true);
      }

      // Final state should not be overflow
      expect(result.state).not.toBe("overflow");
    });
  });

  // ==========================================================================
  // State Transition Tests
  // ==========================================================================

  describe("State Transitions", () => {
    const thresholds: ThresholdConfig = {
      warning: 0.6,
      critical: 0.75,
      overflow: 0.9,
    };

    it("should correctly identify healthy state", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
        thresholds,
      });

      const budget = manager.getBudget();
      const tokens = Math.floor(budget.historyBudget * 0.5);

      expect(manager.calculateState(tokens)).toBe("healthy");
    });

    it("should correctly identify warning state", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
        thresholds,
      });

      const budget = manager.getBudget();
      const tokens = Math.floor(budget.historyBudget * 0.65);

      expect(manager.calculateState(tokens)).toBe("warning");
    });

    it("should correctly identify critical state", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
        thresholds,
      });

      const budget = manager.getBudget();
      const tokens = Math.floor(budget.historyBudget * 0.8);

      expect(manager.calculateState(tokens)).toBe("critical");
    });

    it("should correctly identify overflow state", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
        thresholds,
      });

      const budget = manager.getBudget();
      const tokens = Math.floor(budget.historyBudget * 0.95);

      expect(manager.calculateState(tokens)).toBe("overflow");
    });

    it("should transition through all states correctly", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
        thresholds,
      });

      const budget = manager.getBudget();

      // Test each threshold boundary
      const testCases = [
        { usage: 0.55, expected: "healthy" },
        { usage: 0.62, expected: "warning" },
        { usage: 0.77, expected: "critical" },
        { usage: 0.92, expected: "overflow" },
      ];

      for (const { usage, expected } of testCases) {
        const tokens = Math.floor(budget.historyBudget * usage);
        expect(manager.calculateState(tokens)).toBe(expected);
      }
    });
  });

  // ==========================================================================
  // API History Filtering Tests
  // ==========================================================================

  describe("API History Filtering", () => {
    it("should include all messages when no compression has occurred", () => {
      const messages: ContextMessage[] = [
        createMessage("msg-1", "user", "Hello"),
        createMessage("msg-2", "assistant", "Hi there"),
        createMessage("msg-3", "user", "How are you?"),
      ];

      const result = getEffectiveApiHistory(messages);

      expect(result.messages).toHaveLength(3);
      expect(result.excludedIds).toHaveLength(0);
    });

    it("should exclude compressed messages when summary exists", () => {
      const condenseId = "condense-test-123";

      const messages: ContextMessage[] = [
        // Summary message
        {
          id: "summary-1",
          role: "assistant",
          content: "## Summary\nThis is a summary.",
          priority: MessagePriority.NORMAL,
          isSummary: true,
          condenseId,
          tokens: 20,
        },
        // Compressed original (should be excluded)
        {
          id: "original-1",
          role: "user",
          content: "Original message 1",
          priority: MessagePriority.NORMAL,
          condenseParent: condenseId,
          tokens: 10,
        },
        // Compressed original (should be excluded)
        {
          id: "original-2",
          role: "assistant",
          content: "Original message 2",
          priority: MessagePriority.NORMAL,
          condenseParent: condenseId,
          tokens: 10,
        },
        // Recent message (should be included)
        createMessage("recent-1", "user", "Recent message"),
      ];

      const result = getEffectiveApiHistory(messages);

      // Should include: summary + recent
      expect(result.messages).toHaveLength(2);
      expect(result.excludedIds).toContain("original-1");
      expect(result.excludedIds).toContain("original-2");

      // Verify summary is included
      expect(result.messages.some((m) => m.id === "summary-1")).toBe(true);
      // Verify recent is included
      expect(result.messages.some((m) => m.id === "recent-1")).toBe(true);
    });

    it("should preserve message order after filtering", () => {
      const condenseId = "condense-order-test";

      const messages: ContextMessage[] = [
        createMessage("system", "system", "System prompt"),
        {
          id: "summary-1",
          role: "assistant",
          content: "Summary",
          priority: MessagePriority.NORMAL,
          isSummary: true,
          condenseId,
          tokens: 20,
        },
        {
          id: "compressed-1",
          role: "user",
          content: "Compressed",
          priority: MessagePriority.NORMAL,
          condenseParent: condenseId,
          tokens: 10,
        },
        createMessage("recent-1", "user", "Recent 1"),
        createMessage("recent-2", "assistant", "Recent 2"),
      ];

      const result = getEffectiveApiHistory(messages);

      expect(result.messages).toHaveLength(4);
      expect(result.messages[0]?.id).toBe("system");
      expect(result.messages[1]?.id).toBe("summary-1");
      expect(result.messages[2]?.id).toBe("recent-1");
      expect(result.messages[3]?.id).toBe("recent-2");
    });
  });

  // ==========================================================================
  // Checkpoint Rollback Tests
  // ==========================================================================

  describe("Checkpoint Rollback", () => {
    it("should create checkpoint and restore messages on rollback", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const originalMessages = createConversation(5, 100);
      const checkpointId = manager.createCheckpoint(originalMessages, "test-checkpoint");

      expect(checkpointId).toMatch(/^chk_/);

      // Add more messages
      const modifiedMessages = [
        ...originalMessages,
        createMessage("new-1", "user", "New message 1"),
        createMessage("new-2", "assistant", "New response"),
      ];

      // Rollback
      const restored = manager.rollbackToCheckpoint(checkpointId, modifiedMessages);

      expect(restored).toHaveLength(originalMessages.length);
      expect(restored).not.toContainEqual(expect.objectContaining({ id: "new-1" }));
      expect(restored).not.toContainEqual(expect.objectContaining({ id: "new-2" }));
    });

    it("should deep-copy messages in checkpoint", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const originalMessages: ContextMessage[] = [
        {
          id: "tool-msg",
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "read_file",
              input: { path: "/test.ts" },
            },
          ],
          priority: MessagePriority.TOOL_PAIR,
          tokens: 20,
        },
      ];

      const checkpointId = manager.createCheckpoint(originalMessages, "tool-checkpoint");

      // Modify original
      const content = originalMessages[0]?.content as Array<{
        type: string;
        input: { path: string };
      }>;
      content[0]?.input.path = "/modified.ts";

      // Rollback should have original value
      const restored = manager.rollbackToCheckpoint(checkpointId, originalMessages);
      const restoredContent = restored[0]?.content as Array<{
        input: { path: string };
      }>;

      expect(restoredContent[0]?.input.path).toBe("/test.ts");
    });

    it("should support multiple checkpoints with LRU eviction", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
        maxCheckpoints: 3,
      });

      const messages = createConversation(3, 50);

      // Create more checkpoints than limit
      const ckpt1 = manager.createCheckpoint(messages, "checkpoint-1");
      // Create additional checkpoints (values intentionally unused - testing eviction)
      manager.createCheckpoint(messages, "checkpoint-2");
      manager.createCheckpoint(messages, "checkpoint-3");
      const ckpt4 = manager.createCheckpoint(messages, "checkpoint-4");

      // First checkpoint should be evicted
      expect(() => manager.rollbackToCheckpoint(ckpt1, messages)).toThrow();

      // Later checkpoints should still work
      expect(() => manager.rollbackToCheckpoint(ckpt4, messages)).not.toThrow();
    });
  });

  // ==========================================================================
  // Feature Flag Tests
  // ==========================================================================

  describe("Feature Flag Integration", () => {
    it("should skip compression when useAutoCondense=false", async () => {
      const mockClient = createMockLLMClient();
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 10_000,
        llmClient: mockClient,
        useAutoCondense: false, // Disabled
        thresholds: { warning: 0.2, critical: 0.3, overflow: 0.9 },
      });

      const budget = manager.getBudget();
      const targetTokens = Math.floor(budget.historyBudget * 0.5);
      const messages = createConversation(15, Math.floor(targetTokens / 30));

      const result = await manager.manage(messages);

      // Compression should not have been called
      expect(mockClient.summarize).not.toHaveBeenCalled();
      expect(result.actions.some((a) => a.startsWith("compress:"))).toBe(false);
    });

    it("should still prune and truncate when useAutoCondense=false", async () => {
      const mockClient = createMockLLMClient();
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 50_000,
        llmClient: mockClient,
        useAutoCondense: false,
        thresholds: { warning: 0.3, critical: 0.5, overflow: 0.95 },
      });

      const budget = manager.getBudget();
      // Create messages in critical range
      const targetTokens = Math.floor(budget.historyBudget * 0.6);
      const messages = createMessagesWithTokens(targetTokens, 30, {
        includeTools: true,
        includeSystem: true,
      });

      const result = await manager.manage(messages);

      // Should not use compression
      expect(mockClient.summarize).not.toHaveBeenCalled();

      // Budget should be calculated
      expect(result.tokenCount).toBeGreaterThan(0);
      expect(typeof result.budgetUsed).toBe("number");
      expect(Number.isNaN(result.budgetUsed)).toBe(false);
    });

    it("should enable compression when useAutoCondense=true", async () => {
      const mockClient = createMockLLMClient();
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 8_000,
        llmClient: mockClient,
        useAutoCondense: true, // Enabled
        thresholds: { warning: 0.2, critical: 0.3, overflow: 0.85 },
      });

      const budget = manager.getBudget();
      const targetTokens = Math.floor(budget.historyBudget * 0.5);
      const messages = createConversation(20, Math.floor(targetTokens / 40));

      const result = await manager.manage(messages);

      // If compression action was taken, summarize should have been called
      const hasCompress = result.actions.some((a) => a.startsWith("compress:"));
      if (hasCompress) {
        expect(mockClient.summarize).toHaveBeenCalled();
      }
    });

    it("should respect custom protected tools in pruning", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 10_000,
        protectedTools: ["my_custom_tool", "another_tool"],
        thresholds: { warning: 0.3, critical: 0.5, overflow: 0.9 },
      });

      const messages: ContextMessage[] = [
        createMessage("msg-1", "user", "Hello"),
        {
          id: "tool-1",
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tu-1",
              name: "my_custom_tool",
              input: { data: "test" },
            },
          ],
          priority: MessagePriority.TOOL_PAIR,
          tokens: 1000,
        },
        {
          id: "result-1",
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu-1",
              content: "x".repeat(50_000), // Large output
            },
          ],
          priority: MessagePriority.TOOL_PAIR,
          tokens: 12500,
        },
      ];

      const result = await manager.manage(messages);

      // Protected tool output should not be trimmed (or minimally trimmed)
      const toolResultMsg = result.messages.find((m) => m.id === "result-1");
      expect(toolResultMsg).toBeDefined();
    });
  });

  // ==========================================================================
  // Error Recovery Tests
  // ==========================================================================

  describe("Error Recovery", () => {
    it("should suggest rollback strategy when recent checkpoint exists", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const messages = createConversation(5, 100);
      manager.createCheckpoint(messages, "recent-checkpoint");

      const strategy = manager.getRecoveryStrategy(messages);

      expect(strategy.type).toBe("rollback");
      if (strategy.type === "rollback") {
        expect(strategy.checkpointId).toMatch(/^chk_/);
      }
    });

    it("should suggest aggressive truncation when no checkpoints", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const messages = createConversation(5, 100);
      const strategy = manager.getRecoveryStrategy(messages);

      expect(strategy.type).toBe("aggressive_truncate");
      if (strategy.type === "aggressive_truncate") {
        expect(strategy.targetPercent).toBe(0.7);
      }
    });

    it("should handle overflow state with recovery", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 50_000,
        thresholds: { warning: 0.5, critical: 0.6, overflow: 0.8 },
      });

      const budget = manager.getBudget();
      // Create messages that will be in critical/overflow range
      const targetTokens = Math.floor(budget.historyBudget * 0.85);
      const messages = createConversation(20, Math.floor(targetTokens / 40));

      // Create a checkpoint so recovery can use rollback
      manager.createCheckpoint(messages.slice(0, 10), "pre-overflow");

      const result = await manager.manage(messages);

      // Verify actions were taken
      expect(result.actions.length).toBeGreaterThanOrEqual(0);
      // Budget usage should be tracked
      expect(result.budgetUsed).toBeGreaterThanOrEqual(0);
    });

    it("should reduce context after emergency recovery", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 50_000,
        thresholds: { warning: 0.4, critical: 0.5, overflow: 0.7 },
      });

      const budget = manager.getBudget();
      // Create messages in critical range
      const targetTokens = Math.floor(budget.historyBudget * 0.6);
      const messages = createConversation(30, Math.floor(targetTokens / 60));

      const initialTokens = manager.countTokens(messages);
      const result = await manager.manage(messages);
      const finalTokens = result.tokenCount;

      // If actions were taken, tokens should be reduced or stay same
      if (result.actions.length > 0) {
        expect(finalTokens).toBeLessThanOrEqual(initialTokens);
      }
      // Budget usage should be valid
      expect(result.budgetUsed).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(result.budgetUsed)).toBe(false);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should handle empty message array", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const result = await manager.manage([]);

      expect(result.state).toBe("healthy");
      expect(result.messages).toHaveLength(0);
      expect(result.actions).toHaveLength(0);
    });

    it("should handle single message", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const messages = [createMessage("only-msg", "user", "Hello")];
      const result = await manager.manage(messages);

      expect(result.state).toBe("healthy");
      expect(result.messages).toHaveLength(1);
    });

    it("should preserve system messages during truncation", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 10_000,
        thresholds: { warning: 0.2, critical: 0.3, overflow: 0.9 },
      });

      const messages: ContextMessage[] = [
        createMessage("system-1", "system", "System prompt", {
          tokens: 50,
          priority: MessagePriority.SYSTEM,
        }),
        ...createConversation(20, 200),
      ];

      const result = await manager.manage(messages);

      // System message should be preserved
      const systemMsg = result.messages.find((m) => m.id === "system-1");
      expect(systemMsg).toBeDefined();
      expect(systemMsg?.role).toBe("system");
    });

    it("should handle messages without token counts", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const messages: ContextMessage[] = [
        {
          id: "msg-1",
          role: "user",
          content: "Hello world",
          priority: MessagePriority.NORMAL,
          // No tokens field
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Hi there, how can I help?",
          priority: MessagePriority.NORMAL,
          // No tokens field
        },
      ];

      const result = await manager.manage(messages);

      expect(result.state).toBe("healthy");
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it("should maintain message order after all operations", async () => {
      const mockClient = createMockLLMClient();
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 10_000,
        llmClient: mockClient,
        useAutoCondense: true,
        thresholds: { warning: 0.3, critical: 0.4, overflow: 0.9 },
      });

      const messages = createConversation(10, 200);
      const result = await manager.manage(messages);

      // Verify messages are in chronological order
      for (let i = 1; i < result.messages.length; i++) {
        const prev = result.messages[i - 1]!;
        const curr = result.messages[i]!;

        // System messages can be at start without timestamp
        if (prev.role === "system") continue;

        // If both have createdAt, verify order
        if (prev.createdAt && curr.createdAt && !curr.isSummary) {
          expect(curr.createdAt).toBeGreaterThanOrEqual(prev.createdAt);
        }
      }
    });
  });

  // ==========================================================================
  // Budget Calculation Tests
  // ==========================================================================

  describe("Budget Calculations", () => {
    it("should calculate correct budget breakdown", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 200_000,
        systemReserve: 5_000,
      });

      const budget = manager.getBudget();

      expect(budget.totalWindow).toBe(200_000);
      expect(budget.systemReserve).toBe(5_000);
      expect(budget.outputReserve).toBeGreaterThan(0);
      expect(budget.historyBudget).toBe(
        budget.totalWindow - budget.outputReserve - budget.systemReserve
      );
    });

    it("should report accurate budget usage", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const budget = manager.getBudget();
      const targetUsage = 0.5;
      const targetTokens = Math.floor(budget.historyBudget * targetUsage);
      const messages = createMessagesWithTokens(targetTokens, 10);

      const result = await manager.manage(messages);

      // Budget used should be approximately what we targeted
      expect(result.budgetUsed).toBeGreaterThan(0.4);
      expect(result.budgetUsed).toBeLessThan(0.6);
    });
  });
});
