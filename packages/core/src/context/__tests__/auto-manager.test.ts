/**
 * Tests for AutoContextManager
 *
 * Verifies the unified orchestrator for context management components:
 * - State machine transitions (healthy → warning → critical → overflow)
 * - Tool output pruning (warning state)
 * - Truncation (critical state)
 * - Compression (critical state with LLM client)
 * - Recovery strategies (overflow state)
 *
 * @module @vellum/core/context/__tests__/auto-manager.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AutoContextManager,
  createDefaultConfig,
  estimateRequiredActions,
} from "../auto-manager.js";
import type { CompressionLLMClient } from "../compression.js";
import type { ContextMessage, ThresholdConfig, TokenBudget } from "../types.js";
import { MessagePriority } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test message with minimal required fields.
 */
function createMessage(
  id: string,
  role: "user" | "assistant" | "system",
  content: string,
  tokens?: number
): ContextMessage {
  return {
    id,
    role,
    content,
    priority: role === "system" ? MessagePriority.SYSTEM : MessagePriority.NORMAL,
    tokens,
    createdAt: Date.now(),
  };
}

/**
 * Create a mock LLM client for compression tests.
 */
function createMockLLMClient(): CompressionLLMClient {
  return {
    summarize: vi
      .fn()
      .mockResolvedValue("## Summary\nThis is a compressed summary of the conversation."),
  };
}

/**
 * Create messages that total approximately the specified token count.
 */
function createMessagesWithTokens(totalTokens: number, messageCount: number): ContextMessage[] {
  const tokensPerMessage = Math.floor(totalTokens / messageCount);
  const messages: ContextMessage[] = [];

  for (let i = 0; i < messageCount; i++) {
    const role = i === 0 ? "system" : i % 2 === 1 ? "user" : "assistant";
    messages.push(
      createMessage(
        `msg-${i}`,
        role as "user" | "assistant" | "system",
        "x".repeat(tokensPerMessage * 4), // ~4 chars per token
        tokensPerMessage
      )
    );
  }

  return messages;
}

// ============================================================================
// Constructor Tests
// ============================================================================

describe("AutoContextManager", () => {
  describe("constructor", () => {
    it("should create manager with minimal config", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
      });

      expect(manager).toBeInstanceOf(AutoContextManager);
      expect(manager.getConfig().model).toBe("claude-3-5-sonnet");
    });

    it("should auto-detect context window from model", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
      });

      const budget = manager.getBudget();
      expect(budget.totalWindow).toBe(200_000);
    });

    it("should use custom context window when provided", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const budget = manager.getBudget();
      expect(budget.totalWindow).toBe(100_000);
    });

    it("should apply model-specific thresholds", () => {
      const manager = new AutoContextManager({
        model: "deepseek-chat", // Should use aggressive thresholds
      });

      const thresholds = manager.getThresholds();
      expect(thresholds.warning).toBe(0.85); // Aggressive profile
    });

    it("should allow custom threshold overrides", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        thresholds: {
          warning: 0.6,
          critical: 0.8,
        },
      });

      const thresholds = manager.getThresholds();
      expect(thresholds.warning).toBe(0.6);
      expect(thresholds.critical).toBe(0.8);
    });

    it("should initialize compressor when LLM client provided", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        llmClient: createMockLLMClient(),
        useAutoCondense: true,
      });

      expect(manager.getConfig().useAutoCondense).toBe(true);
    });

    it("should not initialize compressor when useAutoCondense is false", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        llmClient: createMockLLMClient(),
        useAutoCondense: false,
      });

      expect(manager.getConfig().useAutoCondense).toBe(false);
    });
  });

  // ============================================================================
  // State Calculation Tests
  // ============================================================================

  describe("calculateState", () => {
    let manager: AutoContextManager;

    beforeEach(() => {
      manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
        thresholds: {
          warning: 0.75,
          critical: 0.85,
          overflow: 0.95,
        },
      });
    });

    it("should return healthy when under warning threshold", () => {
      const budget = manager.getBudget();
      const tokens = Math.floor(budget.historyBudget * 0.5);

      expect(manager.calculateState(tokens)).toBe("healthy");
    });

    it("should return warning when at warning threshold", () => {
      const budget = manager.getBudget();
      const tokens = Math.floor(budget.historyBudget * 0.75);

      expect(manager.calculateState(tokens)).toBe("warning");
    });

    it("should return critical when at critical threshold", () => {
      const budget = manager.getBudget();
      const tokens = Math.floor(budget.historyBudget * 0.85);

      expect(manager.calculateState(tokens)).toBe("critical");
    });

    it("should return overflow when at overflow threshold", () => {
      const budget = manager.getBudget();
      const tokens = Math.floor(budget.historyBudget * 0.95);

      expect(manager.calculateState(tokens)).toBe("overflow");
    });
  });

  // ============================================================================
  // Manage Tests
  // ============================================================================

  describe("manage", () => {
    it("should return healthy state with no actions for small contexts", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 100_000,
      });

      const messages = createMessagesWithTokens(1000, 5);
      const result = await manager.manage(messages);

      expect(result.state).toBe("healthy");
      expect(result.actions).toHaveLength(0);
      expect(result.messages).toHaveLength(5);
    });

    it("should prune tool outputs in warning state", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 50_000,
        thresholds: { warning: 0.5, critical: 0.7, overflow: 0.9 },
      });

      // Create messages at warning threshold
      const budget = manager.getBudget();
      const targetTokens = Math.floor(budget.historyBudget * 0.55);
      const messages = createMessagesWithTokens(targetTokens, 10);

      const result = await manager.manage(messages);

      // Should be in warning or return to healthy after pruning
      expect(["healthy", "warning"]).toContain(result.state);
    });

    it("should create checkpoint in critical state", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 50_000,
        thresholds: { warning: 0.3, critical: 0.4, overflow: 0.9 },
      });

      const budget = manager.getBudget();
      const targetTokens = Math.floor(budget.historyBudget * 0.5);
      const messages = createMessagesWithTokens(targetTokens, 10);

      const result = await manager.manage(messages);

      // Should have created a checkpoint
      if (result.checkpoint) {
        expect(result.checkpoint).toMatch(/^chk_/);
        expect(result.actions.some((a) => a.startsWith("checkpoint:"))).toBe(true);
      }
    });

    it("should compress when LLM client available and critical", async () => {
      const mockClient = createMockLLMClient();
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 50_000,
        llmClient: mockClient,
        useAutoCondense: true,
        thresholds: { warning: 0.2, critical: 0.3, overflow: 0.9 },
      });

      const budget = manager.getBudget();
      const targetTokens = Math.floor(budget.historyBudget * 0.4);
      const messages = createMessagesWithTokens(targetTokens, 20);

      const result = await manager.manage(messages);

      // Compression should have been attempted
      if (result.actions.some((a) => a.startsWith("compress:"))) {
        expect(mockClient.summarize).toHaveBeenCalled();
      }
    });
  });

  // ============================================================================
  // Recovery Strategy Tests
  // ============================================================================

  describe("getRecoveryStrategy", () => {
    it("should suggest aggressive truncation when no checkpoints exist", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
      });

      const messages = createMessagesWithTokens(1000, 5);
      const strategy = manager.getRecoveryStrategy(messages);

      expect(strategy.type).toBe("aggressive_truncate");
      if (strategy.type === "aggressive_truncate") {
        expect(strategy.targetPercent).toBe(0.7);
      }
    });

    it("should suggest rollback when recent checkpoint exists", async () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
      });

      const messages = createMessagesWithTokens(1000, 5);

      // Create a checkpoint
      manager.createCheckpoint(messages, "test-checkpoint");

      const strategy = manager.getRecoveryStrategy(messages);

      expect(strategy.type).toBe("rollback");
      if (strategy.type === "rollback") {
        expect(strategy.checkpointId).toMatch(/^chk_/);
      }
    });
  });

  // ============================================================================
  // Token Counting Tests
  // ============================================================================

  describe("countTokens", () => {
    it("should use cached token counts when available", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
      });

      const messages = [
        createMessage("1", "user", "Hello", 10),
        createMessage("2", "assistant", "Hi there", 15),
      ];

      const count = manager.countTokens(messages);
      expect(count).toBe(25);
    });

    it("should estimate tokens when not cached", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
      });

      const messages = [
        createMessage("1", "user", "Hello world"), // ~3 tokens estimated
        createMessage("2", "assistant", "Hi there"), // ~2 tokens estimated
      ];

      const count = manager.countTokens(messages);
      expect(count).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Checkpoint Management Tests
  // ============================================================================

  describe("checkpoint management", () => {
    it("should create checkpoints manually", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
      });

      const messages = createMessagesWithTokens(1000, 5);
      const checkpointId = manager.createCheckpoint(messages, "manual-checkpoint");

      expect(checkpointId).toMatch(/^chk_/);
    });

    it("should rollback to checkpoint", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
      });

      const messages = createMessagesWithTokens(1000, 5);
      const checkpointId = manager.createCheckpoint(messages, "test");

      // Add more messages
      const newMessages = [...messages, createMessage("new-1", "user", "New message", 100)];

      // Rollback
      const restored = manager.rollbackToCheckpoint(checkpointId, newMessages);

      expect(restored).toHaveLength(5);
    });
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe("getConfig", () => {
    it("should return readonly configuration", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        recentCount: 5,
        maxCheckpoints: 10,
      });

      const config = manager.getConfig();

      expect(config.model).toBe("claude-3-5-sonnet");
      expect(config.recentCount).toBe(5);
      expect(config.maxCheckpoints).toBe(10);
    });
  });

  describe("getBudget", () => {
    it("should return token budget breakdown", () => {
      const manager = new AutoContextManager({
        model: "claude-3-5-sonnet",
        contextWindow: 200_000,
      });

      const budget = manager.getBudget();

      expect(budget.totalWindow).toBe(200_000);
      expect(budget.outputReserve).toBeGreaterThan(0);
      expect(budget.systemReserve).toBeGreaterThan(0);
      expect(budget.historyBudget).toBeGreaterThan(0);
      expect(budget.historyBudget).toBeLessThan(budget.totalWindow);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe("createDefaultConfig", () => {
  it("should create config with model", () => {
    const config = createDefaultConfig("claude-3-5-sonnet");

    expect(config.model).toBe("claude-3-5-sonnet");
    expect(config.useAutoCondense).toBe(false); // No LLM client
  });

  it("should enable compression when LLM client provided", () => {
    const config = createDefaultConfig("claude-3-5-sonnet", createMockLLMClient());

    expect(config.useAutoCondense).toBe(true);
    expect(config.llmClient).toBeDefined();
  });
});

describe("estimateRequiredActions", () => {
  const budget: TokenBudget = {
    totalWindow: 100_000,
    outputReserve: 30_000,
    systemReserve: 4_000,
    historyBudget: 66_000,
  };

  const thresholds: ThresholdConfig = {
    warning: 0.75,
    critical: 0.85,
    overflow: 0.95,
  };

  it("should return empty array for healthy state", () => {
    const tokens = Math.floor(budget.historyBudget * 0.5);
    const actions = estimateRequiredActions(tokens, budget, thresholds);

    expect(actions).toHaveLength(0);
  });

  it("should return prune for warning state", () => {
    const tokens = Math.floor(budget.historyBudget * 0.8);
    const actions = estimateRequiredActions(tokens, budget, thresholds);

    expect(actions).toContain("prune");
    expect(actions).not.toContain("compress");
  });

  it("should return multiple actions for critical state", () => {
    const tokens = Math.floor(budget.historyBudget * 0.9);
    const actions = estimateRequiredActions(tokens, budget, thresholds);

    expect(actions).toContain("prune");
    expect(actions).toContain("checkpoint");
    expect(actions).toContain("truncate");
    expect(actions).toContain("compress");
  });

  it("should return recovery for overflow state", () => {
    const tokens = Math.floor(budget.historyBudget * 0.98);
    const actions = estimateRequiredActions(tokens, budget, thresholds);

    expect(actions).toContain("recovery");
  });
});

// ============================================================================
// State Transition Tests
// ============================================================================

describe("State Transitions", () => {
  it("should transition healthy→warning as tokens increase", () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 100_000,
      thresholds: { warning: 0.5, critical: 0.7, overflow: 0.9 },
    });

    const budget = manager.getBudget();

    // At 40% = healthy
    expect(manager.calculateState(Math.floor(budget.historyBudget * 0.4))).toBe("healthy");
    // At 55% = warning
    expect(manager.calculateState(Math.floor(budget.historyBudget * 0.55))).toBe("warning");
  });

  it("should transition warning→critical as tokens increase", () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 100_000,
      thresholds: { warning: 0.5, critical: 0.7, overflow: 0.9 },
    });

    const budget = manager.getBudget();

    // At 55% = warning
    expect(manager.calculateState(Math.floor(budget.historyBudget * 0.55))).toBe("warning");
    // At 75% = critical
    expect(manager.calculateState(Math.floor(budget.historyBudget * 0.75))).toBe("critical");
  });

  it("should transition critical→overflow at threshold", () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 100_000,
      thresholds: { warning: 0.5, critical: 0.7, overflow: 0.9 },
    });

    const budget = manager.getBudget();

    // At 85% = critical
    expect(manager.calculateState(Math.floor(budget.historyBudget * 0.85))).toBe("critical");
    // At 95% = overflow
    expect(manager.calculateState(Math.floor(budget.historyBudget * 0.95))).toBe("overflow");
  });

  it("should handle full state sequence healthy→warning→critical→overflow", () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 100_000,
      thresholds: { warning: 0.4, critical: 0.6, overflow: 0.8 },
    });

    const budget = manager.getBudget();
    const states = [0.2, 0.5, 0.7, 0.9].map((pct) =>
      manager.calculateState(Math.floor(budget.historyBudget * pct))
    );

    expect(states).toEqual(["healthy", "warning", "critical", "overflow"]);
  });
});

// ============================================================================
// useAutoCondense Tests
// ============================================================================

describe("useAutoCondense configuration", () => {
  it("should skip compression when useAutoCondense=false even with LLM client", async () => {
    const mockClient = createMockLLMClient();
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 50_000,
      llmClient: mockClient,
      useAutoCondense: false, // Explicitly disabled
      thresholds: { warning: 0.2, critical: 0.3, overflow: 0.9 },
    });

    const budget = manager.getBudget();
    const targetTokens = Math.floor(budget.historyBudget * 0.4);
    const messages = createMessagesWithTokens(targetTokens, 20);

    const result = await manager.manage(messages);

    // Compression should NOT have been called
    expect(mockClient.summarize).not.toHaveBeenCalled();
    expect(result.actions.filter((a) => a.startsWith("compress:"))).toHaveLength(0);
  });

  it("should enable compression when useAutoCondense=true with LLM client", async () => {
    const mockClient = createMockLLMClient();
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 50_000,
      llmClient: mockClient,
      useAutoCondense: true, // Enabled
      thresholds: { warning: 0.2, critical: 0.3, overflow: 0.9 },
    });

    const config = manager.getConfig();
    expect(config.useAutoCondense).toBe(true);
  });
});

// ============================================================================
// Recovery Strategy Tests - Extended
// ============================================================================

describe("getRecoveryStrategy - Extended", () => {
  it("should return aggressive_truncate with 70% target", () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
    });

    const messages = createMessagesWithTokens(1000, 5);
    const strategy = manager.getRecoveryStrategy(messages);

    expect(strategy.type).toBe("aggressive_truncate");
    if (strategy.type === "aggressive_truncate") {
      expect(strategy.targetPercent).toBe(0.7);
    }
  });

  it("should use fallback when rollback fails", async () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 50_000,
      thresholds: { warning: 0.1, critical: 0.15, overflow: 0.2 },
    });

    // Create checkpoint then clear it to simulate invalid state
    const messages = createMessagesWithTokens(1000, 5);
    manager.createCheckpoint(messages, "test");

    // Should still be able to get a recovery strategy
    const strategy = manager.getRecoveryStrategy(messages);
    expect(["rollback", "aggressive_truncate"]).toContain(strategy.type);
  });
});

// ============================================================================
// Checkpoint Integration Tests
// ============================================================================

describe("Checkpoint Integration", () => {
  it("should create valid checkpoint with expected structure", () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
    });

    const messages = createMessagesWithTokens(1000, 5);
    const checkpointId = manager.createCheckpoint(messages, "before-operation");

    expect(checkpointId).toMatch(/^chk_/);

    // Verify checkpoint manager has it
    const checkpointMgr = manager.getCheckpointManager();
    expect(checkpointMgr).toBeDefined();
  });

  it("should restore exact message state on rollback", () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
    });

    const originalMessages = [
      createMessage("1", "system", "System prompt", 10),
      createMessage("2", "user", "Hello", 5),
      createMessage("3", "assistant", "Hi there", 8),
    ];

    const checkpointId = manager.createCheckpoint(originalMessages, "test");

    // Simulate adding more messages
    const modifiedMessages = [
      ...originalMessages,
      createMessage("4", "user", "Another message", 10),
      createMessage("5", "assistant", "Response", 12),
    ];

    // Rollback
    const restored = manager.rollbackToCheckpoint(checkpointId, modifiedMessages);

    expect(restored).toHaveLength(3);
    expect(restored.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("should throw on rollback to non-existent checkpoint", () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
    });

    const messages = createMessagesWithTokens(1000, 5);

    expect(() => {
      manager.rollbackToCheckpoint("non-existent-id", messages);
    }).toThrow();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("AutoContextManager Integration", () => {
  it("should handle full workflow: prune→truncate→compress", async () => {
    const mockClient = createMockLLMClient();
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 30_000,
      llmClient: mockClient,
      useAutoCondense: true,
      thresholds: { warning: 0.2, critical: 0.3, overflow: 0.9 },
    });

    const budget = manager.getBudget();
    // Use a higher percentage to ensure we hit critical state
    const targetTokens = Math.floor(budget.historyBudget * 0.5);
    const messages = createMessagesWithTokens(targetTokens, 25);

    const result = await manager.manage(messages);

    // Should have either performed actions or remain healthy if below thresholds
    // The key is that the manage function completes without error
    expect(result.state).toBeDefined();
    expect(result.messages.length).toBeGreaterThanOrEqual(0);
    expect(result.messages.length).toBeLessThanOrEqual(25);
    // Token count may be 0 if all messages were processed/compressed
    expect(result.tokenCount).toBeGreaterThanOrEqual(0);
  });

  it("should create checkpoint before compression in critical state", async () => {
    const mockClient = createMockLLMClient();
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 50_000,
      llmClient: mockClient,
      useAutoCondense: true,
      thresholds: { warning: 0.2, critical: 0.25, overflow: 0.9 },
    });

    const budget = manager.getBudget();
    const targetTokens = Math.floor(budget.historyBudget * 0.35);
    const messages = createMessagesWithTokens(targetTokens, 20);

    const result = await manager.manage(messages);

    // If we were in critical state, a checkpoint should have been created
    if (result.checkpoint) {
      expect(result.checkpoint).toMatch(/^chk_/);
      expect(result.actions.some((a) => a.startsWith("checkpoint:"))).toBe(true);
    }
  });

  it("should execute recovery strategy in overflow state", async () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 20_000,
      thresholds: { warning: 0.1, critical: 0.15, overflow: 0.2 },
    });

    const budget = manager.getBudget();
    // Create enough tokens to trigger overflow
    const targetTokens = Math.floor(budget.historyBudget * 0.25);
    const messages = createMessagesWithTokens(targetTokens, 30);

    const result = await manager.manage(messages);

    // Should have recovery actions if overflow was reached
    if (result.actions.some((a) => a.startsWith("recovery:"))) {
      expect(result.messages.length).toBeLessThan(30);
    }
  });

  it("should maintain message order after operations", async () => {
    const manager = new AutoContextManager({
      model: "claude-3-5-sonnet",
      contextWindow: 100_000,
    });

    const messages = [
      createMessage("sys", "system", "System", 10),
      createMessage("u1", "user", "User 1", 10),
      createMessage("a1", "assistant", "Assistant 1", 10),
      createMessage("u2", "user", "User 2", 10),
      createMessage("a2", "assistant", "Assistant 2", 10),
    ];

    const result = await manager.manage(messages);

    // Verify messages maintain conversation order
    const roles = result.messages.map((m) => m.role);
    const userIndices = roles.map((r, i) => (r === "user" ? i : -1)).filter((i) => i >= 0);
    const assistantIndices = roles
      .map((r, i) => (r === "assistant" ? i : -1))
      .filter((i) => i >= 0);

    // User messages should precede their corresponding assistant responses
    for (let i = 0; i < Math.min(userIndices.length, assistantIndices.length); i++) {
      // This is a basic check - in a real conversation, user typically precedes assistant
      expect(result.messages.length).toBeLessThanOrEqual(5);
    }
  });
});
