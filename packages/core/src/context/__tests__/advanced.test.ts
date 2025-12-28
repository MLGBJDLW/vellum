/**
 * Phase 3: Advanced Features - Integration and Edge Case Tests
 *
 * This test file provides comprehensive testing for Phase 3 features:
 * - NonDestructiveCompressor integration tests
 * - CheckpointManager advanced scenarios
 * - Threshold configuration validation
 *
 * These tests complement the individual module tests by focusing on:
 * - Cross-module integration scenarios
 * - Edge cases and error conditions
 * - Workflow simulations
 *
 * @module @vellum/core/context/__tests__/advanced.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CheckpointManager,
  createPreCompressionCheckpoint,
  resetCheckpointCounter,
} from "../checkpoint.js";
import {
  type CompressionLLMClient,
  type CompressionResult,
  calculateCompressionSavings,
  estimateCompressionTokens,
  getCompressedMessages,
  getEffectiveApiHistory,
  isSummaryMessage,
  linkCompressedMessages,
  NonDestructiveCompressor,
} from "../compression.js";
import {
  addModelThreshold,
  clearCustomThresholds,
  getThresholdConfig,
  getThresholdProfile,
  matchesModelPattern,
  THRESHOLD_PROFILES,
  validateThresholds,
} from "../threshold.js";
import type { ContentBlock, ContextMessage } from "../types.js";
import { MessagePriority } from "../types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createMessage(
  id: string,
  role: ContextMessage["role"],
  content: string | ContentBlock[],
  options: Partial<ContextMessage> = {}
): ContextMessage {
  return {
    id,
    role,
    content,
    priority: options.priority ?? MessagePriority.NORMAL,
    tokens: options.tokens ?? (typeof content === "string" ? Math.ceil(content.length / 4) : 50),
    createdAt: options.createdAt ?? Date.now(),
    ...options,
  };
}

function createMockLLMClient(summaryResponse?: string): CompressionLLMClient {
  return {
    summarize: vi.fn().mockResolvedValue(
      summaryResponse ??
        `## 1. Task Overview
User is building a feature.

## 2. Key Decisions Made
- Decision A
- Decision B

## 3. Code Changes
- Modified file.ts

## 4. Current State
Implementation in progress.

## 5. Pending Items
- Complete testing

## 6. Important Context
Critical note here.`
    ),
  };
}

function createTestMessages(count: number, tokensPer = 100): ContextMessage[] {
  const messages: ContextMessage[] = [];
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    messages.push(
      createMessage(`msg-${i}`, role, `Message ${i} content here`, { tokens: tokensPer })
    );
  }
  return messages;
}

function createToolUseMessage(id: string, toolId: string, toolName: string): ContextMessage {
  return {
    id,
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: toolId,
        name: toolName,
        input: { path: "/test/file.ts", action: "read" },
      },
    ],
    priority: MessagePriority.TOOL_PAIR,
    tokens: 30,
    createdAt: Date.now(),
  };
}

function createToolResultMessage(id: string, toolUseId: string): ContextMessage {
  return {
    id,
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: toolUseId,
        content: "Tool execution result content",
      },
    ],
    priority: MessagePriority.TOOL_PAIR,
    tokens: 40,
    createdAt: Date.now(),
  };
}

// ============================================================================
// Phase 3: Advanced Features Tests
// ============================================================================

describe("Phase 3: Advanced Features", () => {
  beforeEach(() => {
    resetCheckpointCounter();
    clearCustomThresholds();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    clearCustomThresholds();
  });

  // ==========================================================================
  // Compression Tests
  // ==========================================================================

  describe("compression", () => {
    describe("NonDestructiveCompressor.compress()", () => {
      it("should generate summary with correct condenseId", async () => {
        const mockClient = createMockLLMClient();
        const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
        const messages = createTestMessages(10);

        const result = await compressor.compress(messages, { start: 0, end: 8 });

        expect(result.summary).toBeDefined();
        expect(result.summary.condenseId).toBe(result.condenseId);
        expect(result.summary.isSummary).toBe(true);
        expect(result.condenseId).toMatch(/^condense-/);
      });

      it("should set original messages condenseParent pointers via linkCompressedMessages", async () => {
        const mockClient = createMockLLMClient();
        const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
        const messages = createTestMessages(8);

        const result = await compressor.compress(messages, { start: 0, end: 6 });
        const linked = linkCompressedMessages(messages, result);

        // First 6 messages should have condenseParent
        for (let i = 0; i < 6; i++) {
          expect(linked[i]?.condenseParent).toBe(result.condenseId);
        }
        // Last 2 messages should not
        expect(linked[6]?.condenseParent).toBeUndefined();
        expect(linked[7]?.condenseParent).toBeUndefined();
      });

      it("should calculate compression ratio correctly", async () => {
        const mockClient = createMockLLMClient("Short summary");
        const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
        const messages = createTestMessages(10, 100); // 10 messages × 100 tokens = 1000

        const result = await compressor.compress(messages, { start: 0, end: 8 });

        expect(result.originalTokens).toBe(800); // 8 messages × 100 tokens
        expect(result.ratio).toBe(result.summaryTokens / result.originalTokens);
        expect(result.ratio).toBeGreaterThan(0);
        expect(result.ratio).toBeLessThan(1);
      });

      it("should handle tool use/result blocks in messages", async () => {
        const mockClient = createMockLLMClient();
        const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
        const messages: ContextMessage[] = [
          createMessage("1", "user", "Please read the file"),
          createToolUseMessage("2", "tool-1", "read_file"),
          createToolResultMessage("3", "tool-1"),
          createMessage("4", "assistant", "I read the file"),
          createMessage("5", "user", "Thanks"),
          createMessage("6", "assistant", "You are welcome"),
        ];

        const result = await compressor.compress(messages, { start: 0, end: 5 });

        expect(result.compressedMessageIds).toContain("2");
        expect(result.compressedMessageIds).toContain("3");
        expect(mockClient.summarize).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ id: "2" })]),
          expect.any(String)
        );
      });

      it("should handle async LLM client errors gracefully", async () => {
        const errorClient: CompressionLLMClient = {
          summarize: vi.fn().mockRejectedValue(new Error("LLM API error")),
        };
        const compressor = new NonDestructiveCompressor({ llmClient: errorClient });
        const messages = createTestMessages(6);

        await expect(compressor.compress(messages, { start: 0, end: 5 })).rejects.toThrow(
          "LLM API error"
        );
      });

      it("should throw when minMessagesToCompress is not met", async () => {
        const mockClient = createMockLLMClient();
        const compressor = new NonDestructiveCompressor({
          llmClient: mockClient,
          minMessagesToCompress: 5,
        });
        const messages = createTestMessages(4);

        await expect(compressor.compress(messages, { start: 0, end: 4 })).rejects.toThrow(
          /at least 5 messages/
        );
      });
    });

    describe("isSummaryMessage detection", () => {
      it("should return true for message with isSummary flag", () => {
        const msg = createMessage("1", "assistant", "Summary", { isSummary: true });
        expect(isSummaryMessage(msg)).toBe(true);
      });

      it("should return true for message with condenseId", () => {
        const msg = createMessage("1", "assistant", "Summary", { condenseId: "condense-123" });
        expect(isSummaryMessage(msg)).toBe(true);
      });

      it("should return false for regular message without flags", () => {
        const msg = createMessage("1", "user", "Regular message");
        expect(isSummaryMessage(msg)).toBe(false);
      });

      it("should return false for message with only condenseParent", () => {
        const msg = createMessage("1", "user", "Compressed message", {
          condenseParent: "condense-456",
        });
        expect(isSummaryMessage(msg)).toBe(false);
      });
    });

    describe("getCompressedMessages lookup", () => {
      it("should find all messages with matching condenseParent", () => {
        const condenseId = "condense-abc";
        const messages: ContextMessage[] = [
          createMessage("1", "user", "Original 1", { condenseParent: condenseId }),
          createMessage("2", "assistant", "Original 2", { condenseParent: condenseId }),
          createMessage("3", "user", "Original 3", { condenseParent: condenseId }),
          createMessage("4", "user", "Not compressed"),
          createMessage("summary", "assistant", "Summary", { isSummary: true, condenseId }),
        ];

        const compressed = getCompressedMessages(messages, condenseId);

        expect(compressed).toHaveLength(3);
        expect(compressed.map((m) => m.id)).toEqual(["1", "2", "3"]);
      });

      it("should return empty array when no matches found", () => {
        const messages = createTestMessages(5);
        const compressed = getCompressedMessages(messages, "nonexistent-id");
        expect(compressed).toHaveLength(0);
      });
    });

    describe("Mock LLM client integration", () => {
      it("should call summarize with messages and prompt", async () => {
        const mockClient = createMockLLMClient();
        const compressor = new NonDestructiveCompressor({ llmClient: mockClient });
        const messages = createTestMessages(6);

        await compressor.compress(messages, { start: 0, end: 5 });

        expect(mockClient.summarize).toHaveBeenCalledTimes(1);
        const [calledMessages, calledPrompt] = (mockClient.summarize as ReturnType<typeof vi.fn>)
          .mock.calls[0]!;
        expect(calledMessages).toHaveLength(5);
        expect(calledPrompt).toContain("## 1. Task Overview");
      });

      it("should use custom prompt when provided", async () => {
        const mockClient = createMockLLMClient();
        const customPrompt = "Summarize concisely:";
        const compressor = new NonDestructiveCompressor({
          llmClient: mockClient,
          customPrompt,
        });
        const messages = createTestMessages(6);

        await compressor.compress(messages, { start: 0, end: 5 });

        expect(mockClient.summarize).toHaveBeenCalledWith(expect.any(Array), customPrompt);
      });
    });

    describe("getEffectiveApiHistory", () => {
      it("should exclude compressed messages but keep summaries", () => {
        const condenseId = "condense-123";
        const messages: ContextMessage[] = [
          createMessage("1", "user", "Original 1", { condenseParent: condenseId }),
          createMessage("2", "assistant", "Original 2", { condenseParent: condenseId }),
          createMessage("summary", "assistant", "Summary", { isSummary: true, condenseId }),
          createMessage("3", "user", "New message"),
          createMessage("4", "assistant", "New response"),
        ];

        const effective = getEffectiveApiHistory(messages);

        expect(effective).toHaveLength(3);
        expect(effective.map((m) => m.id)).toEqual(["summary", "3", "4"]);
      });
    });

    describe("calculateCompressionSavings", () => {
      it("should calculate correct savings", () => {
        const result: CompressionResult = {
          summary: createMessage("s", "assistant", "Summary", { isSummary: true }),
          compressedMessageIds: ["1", "2", "3"],
          originalTokens: 1000,
          summaryTokens: 200,
          ratio: 0.2,
          condenseId: "condense-123",
        };

        const savings = calculateCompressionSavings(result);

        expect(savings.tokens).toBe(800);
        expect(savings.percentage).toBe(80);
      });
    });

    describe("estimateCompressionTokens", () => {
      it("should estimate based on target ratio", () => {
        const messages = createTestMessages(5, 100); // 500 total tokens

        const estimate = estimateCompressionTokens(messages, 0.25);

        expect(estimate.input).toBe(500);
        expect(estimate.output).toBe(125);
      });
    });
  });

  // ==========================================================================
  // Checkpoint Tests
  // ==========================================================================

  describe("checkpoint", () => {
    describe("CheckpointManager.create() deep copies messages", () => {
      it("should create independent copy of messages", () => {
        const manager = new CheckpointManager();
        const messages = [
          createMessage("1", "user", "Hello"),
          createMessage("2", "assistant", "Hi there"),
        ];

        const checkpoint = manager.create(messages, { tokenCount: 100 });

        // Arrays should be different references
        expect(checkpoint.messages).not.toBe(messages);
        // Individual messages should be different references
        expect(checkpoint.messages[0]).not.toBe(messages[0]);
        // But content should be equal
        expect(checkpoint.messages[0]?.content).toBe(messages[0]?.content);
      });

      it("should deep copy tool_use blocks", () => {
        const manager = new CheckpointManager();
        const messages = [createToolUseMessage("1", "tool-1", "read_file")];

        const checkpoint = manager.create(messages);

        const originalContent = messages[0]?.content as ContentBlock[];
        const checkpointContent = checkpoint.messages[0]?.content as ContentBlock[];

        expect(checkpointContent).not.toBe(originalContent);
        expect((checkpointContent[0] as any).input).not.toBe((originalContent[0] as any).input);
        expect((checkpointContent[0] as any).input).toEqual((originalContent[0] as any).input);
      });

      it("should deep copy metadata", () => {
        const manager = new CheckpointManager();
        const messages: ContextMessage[] = [
          {
            ...createMessage("1", "user", "Test"),
            metadata: { nested: { value: 123 } },
          },
        ];

        const checkpoint = manager.create(messages);

        expect(checkpoint.messages[0]?.metadata).toEqual(messages[0]?.metadata);
        expect(checkpoint.messages[0]?.metadata).not.toBe(messages[0]?.metadata);
      });
    });

    describe("LRU eviction at maxCheckpoints", () => {
      it("should evict oldest checkpoint when limit reached", () => {
        const manager = new CheckpointManager({ maxCheckpoints: 3 });

        const cp1 = manager.create([createMessage("1", "user", "First")]);
        const cp2 = manager.create([createMessage("2", "user", "Second")]);
        const cp3 = manager.create([createMessage("3", "user", "Third")]);

        expect(manager.count).toBe(3);
        expect(manager.get(cp1.id)).toBeDefined();

        // Add 4th - should evict first
        const cp4 = manager.create([createMessage("4", "user", "Fourth")]);

        expect(manager.count).toBe(3);
        expect(manager.get(cp1.id)).toBeUndefined(); // Evicted
        expect(manager.get(cp2.id)).toBeDefined();
        expect(manager.get(cp3.id)).toBeDefined();
        expect(manager.get(cp4.id)).toBeDefined();
      });

      it("should continuously evict as new checkpoints are added", () => {
        const manager = new CheckpointManager({ maxCheckpoints: 2 });

        const cp1 = manager.create([createMessage("1", "user", "1")]);
        const cp2 = manager.create([createMessage("2", "user", "2")]);
        const cp3 = manager.create([createMessage("3", "user", "3")]);
        const cp4 = manager.create([createMessage("4", "user", "4")]);

        expect(manager.count).toBe(2);
        expect(manager.get(cp1.id)).toBeUndefined();
        expect(manager.get(cp2.id)).toBeUndefined();
        expect(manager.get(cp3.id)).toBeDefined();
        expect(manager.get(cp4.id)).toBeDefined();
      });
    });

    describe("rollback() restores checkpoint", () => {
      it("should restore messages from checkpoint", () => {
        const manager = new CheckpointManager();
        const originalMessages = [
          createMessage("1", "user", "First"),
          createMessage("2", "assistant", "Response"),
        ];

        const checkpoint = manager.create(originalMessages, { tokenCount: 50 });

        // Simulate adding more messages
        const currentMessages = [
          ...originalMessages,
          createMessage("3", "user", "New message"),
          createMessage("4", "assistant", "New response"),
        ];

        const result = manager.rollback(checkpoint.id, currentMessages);

        expect(result.messages).toHaveLength(2);
        expect(result.messages[0]?.id).toBe("1");
        expect(result.messages[1]?.id).toBe("2");
        expect(result.discardedMessages).toBe(2);
      });

      it("should return deep copy on rollback", () => {
        const manager = new CheckpointManager();
        const messages = [createMessage("1", "user", "Test")];

        const checkpoint = manager.create(messages);
        const result = manager.rollback(checkpoint.id, messages);

        expect(result.messages).not.toBe(checkpoint.messages);
        expect(result.messages[0]).not.toBe(checkpoint.messages[0]);
      });
    });

    describe("rollback() removes later checkpoints", () => {
      it("should remove checkpoints created after target", () => {
        const manager = new CheckpointManager();

        const cp1 = manager.create([createMessage("1", "user", "1")], { label: "First" });
        vi.advanceTimersByTime(1000);
        const cp2 = manager.create([createMessage("2", "user", "2")], { label: "Second" });
        vi.advanceTimersByTime(1000);
        const cp3 = manager.create([createMessage("3", "user", "3")], { label: "Third" });

        expect(manager.count).toBe(3);

        const result = manager.rollback(cp1.id, []);

        expect(result.removedCheckpoints).toBe(2);
        expect(manager.count).toBe(1);
        expect(manager.get(cp1.id)).toBeDefined();
        expect(manager.get(cp2.id)).toBeUndefined();
        expect(manager.get(cp3.id)).toBeUndefined();
      });

      it("should keep target checkpoint after rollback", () => {
        const manager = new CheckpointManager();

        const cp1 = manager.create([createMessage("1", "user", "1")]);
        manager.create([createMessage("2", "user", "2")]);

        manager.rollback(cp1.id, []);

        expect(manager.get(cp1.id)).toBeDefined();
        expect(manager.getLatest()?.id).toBe(cp1.id);
      });
    });

    describe("shouldAutoCheckpoint() interval logic", () => {
      it("should return true initially (no previous checkpoint)", () => {
        const manager = new CheckpointManager({
          autoCheckpoint: true,
          minCheckpointInterval: 60_000,
        });

        expect(manager.shouldAutoCheckpoint()).toBe(true);
      });

      it("should return false immediately after checkpoint creation", () => {
        const manager = new CheckpointManager({
          autoCheckpoint: true,
          minCheckpointInterval: 60_000,
        });

        manager.create([createMessage("1", "user", "Test")]);

        expect(manager.shouldAutoCheckpoint()).toBe(false);
      });

      it("should return true after interval has passed", () => {
        const manager = new CheckpointManager({
          autoCheckpoint: true,
          minCheckpointInterval: 60_000, // 1 minute
        });

        manager.create([createMessage("1", "user", "Test")]);
        expect(manager.shouldAutoCheckpoint()).toBe(false);

        vi.advanceTimersByTime(60_000);
        expect(manager.shouldAutoCheckpoint()).toBe(true);
      });

      it("should return false when autoCheckpoint is disabled", () => {
        const manager = new CheckpointManager({
          autoCheckpoint: false,
          minCheckpointInterval: 0,
        });

        expect(manager.shouldAutoCheckpoint()).toBe(false);
      });
    });

    describe("Checkpoint metadata", () => {
      it("should store label, reason, and tokenCount", () => {
        const manager = new CheckpointManager();

        const checkpoint = manager.create([createMessage("1", "user", "Test")], {
          label: "Pre-compression",
          reason: "pre-compression",
          tokenCount: 85000,
        });

        expect(checkpoint.label).toBe("Pre-compression");
        expect(checkpoint.reason).toBe("pre-compression");
        expect(checkpoint.tokenCount).toBe(85000);
        expect(checkpoint.createdAt).toBe(Date.now());
      });

      it("should default tokenCount to 0 if not provided", () => {
        const manager = new CheckpointManager();
        const checkpoint = manager.create([createMessage("1", "user", "Test")]);

        expect(checkpoint.tokenCount).toBe(0);
      });
    });

    describe("createPreCompressionCheckpoint utility", () => {
      it("should create checkpoint with correct metadata", () => {
        const manager = new CheckpointManager();
        const messages = [createMessage("1", "user", "Test")];

        const checkpoint = createPreCompressionCheckpoint(manager, messages, 75000);

        expect(checkpoint.label).toBe("Pre-compression backup");
        expect(checkpoint.reason).toBe("pre-compression");
        expect(checkpoint.tokenCount).toBe(75000);
      });
    });
  });

  // ==========================================================================
  // Threshold Tests
  // ==========================================================================

  describe("threshold", () => {
    describe("getThresholdConfig for specific models", () => {
      it("should return correct config for DeepSeek (aggressive)", () => {
        const config = getThresholdConfig("deepseek-chat");

        expect(config).toEqual({
          warning: 0.85,
          critical: 0.92,
          overflow: 0.97,
        });
      });

      it("should return correct config for Claude Opus (conservative)", () => {
        const config = getThresholdConfig("claude-3-opus-20240229");

        expect(config).toEqual({
          warning: 0.7,
          critical: 0.8,
          overflow: 0.9,
        });
      });

      it("should return balanced for unknown models", () => {
        const config = getThresholdConfig("unknown-model-xyz");

        expect(config).toEqual({
          warning: 0.75,
          critical: 0.85,
          overflow: 0.95,
        });
      });
    });

    describe("DeepSeek returns aggressive profile", () => {
      it("should return aggressive for deepseek-chat", () => {
        expect(getThresholdProfile("deepseek-chat")).toBe("aggressive");
      });

      it("should return aggressive for deepseek-coder", () => {
        expect(getThresholdProfile("deepseek-coder")).toBe("aggressive");
      });

      it("should return aggressive for deepseek-v3", () => {
        expect(getThresholdProfile("deepseek-v3")).toBe("aggressive");
      });
    });

    describe("Claude Opus returns conservative profile", () => {
      it("should return conservative for claude-3-opus", () => {
        expect(getThresholdProfile("claude-3-opus")).toBe("conservative");
      });

      it("should return conservative for claude-opus-4", () => {
        expect(getThresholdProfile("claude-opus-4")).toBe("conservative");
      });

      it("should return conservative for claude-3-opus-20240229", () => {
        expect(getThresholdProfile("claude-3-opus-20240229")).toBe("conservative");
      });
    });

    describe("Unknown model returns default", () => {
      it("should return balanced for completely unknown model", () => {
        expect(getThresholdProfile("my-custom-llm-v1")).toBe("balanced");
      });

      it("should use specified default profile", () => {
        const config = getThresholdConfig("unknown-model", "aggressive");

        expect(config).toEqual({
          warning: 0.85,
          critical: 0.92,
          overflow: 0.97,
        });
      });
    });

    describe("Pattern matching with wildcards", () => {
      it("should match * at end of pattern", () => {
        expect(matchesModelPattern("claude-3-opus-20240229", "claude-3-opus*")).toBe(true);
        expect(matchesModelPattern("claude-3-sonnet", "claude-3-opus*")).toBe(false);
      });

      it("should match * at start of pattern", () => {
        expect(matchesModelPattern("gpt-4-turbo", "*turbo")).toBe(true);
        expect(matchesModelPattern("turbo", "*turbo")).toBe(true);
        expect(matchesModelPattern("turbo-fast", "*turbo")).toBe(false);
      });

      it("should match * in middle of pattern", () => {
        expect(matchesModelPattern("claude-3-opus", "claude*opus")).toBe(true);
        expect(matchesModelPattern("claude-opus", "claude*opus")).toBe(true);
      });

      it("should be case-insensitive", () => {
        expect(matchesModelPattern("DeepSeek-Chat", "deepseek*")).toBe(true);
        expect(matchesModelPattern("CLAUDE-3-OPUS", "claude*opus")).toBe(true);
      });

      it("should require exact match when no wildcard", () => {
        expect(matchesModelPattern("gpt-4", "gpt-4")).toBe(true);
        expect(matchesModelPattern("gpt-4-turbo", "gpt-4")).toBe(false);
      });
    });

    describe("validateThresholds range and order", () => {
      it("should validate correct thresholds as valid", () => {
        const result = validateThresholds({
          warning: 0.75,
          critical: 0.85,
          overflow: 0.95,
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should reject when warning >= critical", () => {
        const result = validateThresholds({
          warning: 0.9,
          critical: 0.85,
          overflow: 0.95,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("warning") && e.includes("critical"))).toBe(
          true
        );
      });

      it("should reject when critical >= overflow", () => {
        const result = validateThresholds({
          warning: 0.75,
          critical: 0.96,
          overflow: 0.95,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("critical") && e.includes("overflow"))).toBe(
          true
        );
      });

      it("should reject values <= 0", () => {
        const result = validateThresholds({
          warning: 0,
          critical: 0.85,
          overflow: 0.95,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("warning") && e.includes("0"))).toBe(true);
      });

      it("should reject values >= 1", () => {
        const result = validateThresholds({
          warning: 0.75,
          critical: 0.85,
          overflow: 1.0,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("overflow") && e.includes("1"))).toBe(true);
      });

      it("should report multiple errors", () => {
        const result = validateThresholds({
          warning: 0.95,
          critical: 0.85,
          overflow: 0.75,
        });

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
      });

      it("should validate all built-in profiles", () => {
        for (const [, profile] of Object.entries(THRESHOLD_PROFILES)) {
          const result = validateThresholds(profile);
          expect(result.valid).toBe(true);
        }
      });
    });

    describe("Runtime customization", () => {
      it("should allow adding custom thresholds", () => {
        addModelThreshold({
          model: "my-model",
          profile: "conservative",
        });

        expect(getThresholdProfile("my-model")).toBe("conservative");
      });

      it("should allow custom thresholds to override built-in", () => {
        expect(getThresholdProfile("deepseek-chat")).toBe("aggressive");

        addModelThreshold({
          model: "deepseek*",
          profile: "balanced",
        });

        expect(getThresholdProfile("deepseek-chat")).toBe("balanced");
      });

      it("should clear custom thresholds", () => {
        addModelThreshold({
          model: "test-model",
          profile: "aggressive",
        });

        expect(getThresholdProfile("test-model")).toBe("aggressive");

        clearCustomThresholds();

        expect(getThresholdProfile("test-model")).toBe("balanced");
      });
    });
  });

  // ==========================================================================
  // Integration: Checkpoint + Compression Workflow
  // ==========================================================================

  describe("Integration: Checkpoint + Compression workflow", () => {
    it("should create checkpoint before compression, then restore on failure", async () => {
      const manager = new CheckpointManager();
      const errorClient: CompressionLLMClient = {
        summarize: vi.fn().mockRejectedValue(new Error("Compression failed")),
      };
      const compressor = new NonDestructiveCompressor({ llmClient: errorClient });
      const messages = createTestMessages(10);

      // Step 1: Create pre-compression checkpoint
      const checkpoint = createPreCompressionCheckpoint(manager, messages, 1000);
      expect(manager.count).toBe(1);

      // Step 2: Attempt compression (fails)
      try {
        await compressor.compress(messages, { start: 0, end: 8 });
      } catch {
        // Step 3: Rollback on failure
        const result = manager.rollback(checkpoint.id, messages);

        expect(result.messages).toHaveLength(10);
        expect(result.checkpoint.reason).toBe("pre-compression");
      }
    });

    it("should maintain checkpoint history through multiple compressions", async () => {
      const manager = new CheckpointManager({ maxCheckpoints: 5 });
      const mockClient = createMockLLMClient();
      const compressor = new NonDestructiveCompressor({ llmClient: mockClient });

      // Simulate multiple compression cycles
      for (let i = 1; i <= 3; i++) {
        const messages = createTestMessages(10);
        createPreCompressionCheckpoint(manager, messages, i * 1000);

        await compressor.compress(messages, { start: 0, end: 8 });

        vi.advanceTimersByTime(60000); // Advance time between compressions
      }

      expect(manager.count).toBe(3);
      const list = manager.list();
      expect(list[0]?.tokenCount).toBe(3000); // Most recent
      expect(list[2]?.tokenCount).toBe(1000); // Oldest
    });
  });

  // ==========================================================================
  // Integration: Threshold-based compression triggering
  // ==========================================================================

  describe("Integration: Threshold-based compression decision", () => {
    it("should use model-specific thresholds to determine compression need", () => {
      // DeepSeek has aggressive thresholds (warning at 85%)
      const deepseekThresholds = getThresholdConfig("deepseek-chat");
      expect(deepseekThresholds.warning).toBe(0.85);

      // Claude Opus has conservative thresholds (warning at 70%)
      const opusThresholds = getThresholdConfig("claude-opus-4");
      expect(opusThresholds.warning).toBe(0.7);

      // Simulate 75% usage
      const usage = 0.75;

      // DeepSeek: Still healthy (75% < 85% warning)
      const deepseekNeedsCompression = usage >= deepseekThresholds.warning;
      expect(deepseekNeedsCompression).toBe(false);

      // Claude Opus: Warning state (75% >= 70% warning)
      const opusNeedsCompression = usage >= opusThresholds.warning;
      expect(opusNeedsCompression).toBe(true);
    });
  });
});
