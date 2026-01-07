/**
 * Checkpoint Manager Tests
 *
 * Tests for checkpoint creation, rollback, and LRU eviction functionality.
 *
 * Requirements covered:
 * - REQ-CPT-001: Pre-compression checkpoints with deep copy
 * - REQ-CPT-002: Interval-based automatic checkpoints
 * - REQ-CPT-003: Checkpoint rollback with subsequent cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CheckpointManager,
  createPreCompressionCheckpoint,
  generateCheckpointId,
  resetCheckpointCounter,
} from "../checkpoint.js";
import type { ContentBlock, ContextMessage, ToolUseBlock } from "../types.js";
import { MessagePriority } from "../types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestMessage(
  id: string,
  role: "user" | "assistant" | "system" = "user",
  content: string | ContextMessage["content"] = "test content"
): ContextMessage {
  return {
    id,
    role,
    content,
    priority: MessagePriority.NORMAL,
    tokens: 10,
    createdAt: Date.now(),
  };
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
        input: { path: "/test/file.ts" },
      },
    ],
    priority: MessagePriority.TOOL_PAIR,
    tokens: 25,
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
        content: "Tool result content",
      },
    ],
    priority: MessagePriority.TOOL_PAIR,
    tokens: 20,
    createdAt: Date.now(),
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe("CheckpointManager", () => {
  beforeEach(() => {
    resetCheckpointCounter();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should create manager with default options", () => {
      const manager = new CheckpointManager();
      expect(manager.count).toBe(0);
    });

    it("should create manager with custom options", () => {
      const manager = new CheckpointManager({
        maxCheckpoints: 10,
        minCheckpointInterval: 60_000,
        autoCheckpoint: false,
      });
      expect(manager.count).toBe(0);
    });
  });

  describe("create", () => {
    it("should create a checkpoint with deep-copied messages", () => {
      const manager = new CheckpointManager();
      const messages = [createTestMessage("1"), createTestMessage("2")];

      const checkpoint = manager.create(messages, {
        label: "Test checkpoint",
        reason: "test",
        tokenCount: 20,
      });

      expect(checkpoint.id).toMatch(/^chk_\d+_\d+$/);
      expect(checkpoint.messages).toHaveLength(2);
      expect(checkpoint.messages).not.toBe(messages); // Different array reference
      expect(checkpoint.messages[0]).not.toBe(messages[0]); // Different message reference
      expect(checkpoint.label).toBe("Test checkpoint");
      expect(checkpoint.reason).toBe("test");
      expect(checkpoint.tokenCount).toBe(20);
      expect(manager.count).toBe(1);
    });

    it("should deep-copy text content", () => {
      const manager = new CheckpointManager();
      const messages = [createTestMessage("1", "user", "Hello world")];

      const checkpoint = manager.create(messages);

      expect(checkpoint.messages[0]?.content).toBe("Hello world");
    });

    it("should deep-copy tool_use content blocks", () => {
      const manager = new CheckpointManager();
      const messages = [createToolUseMessage("1", "tool-1", "read_file")];

      const checkpoint = manager.create(messages);

      const content = checkpoint.messages[0]?.content;
      expect(Array.isArray(content)).toBe(true);
      const block = (content as ContentBlock[])[0] as ToolUseBlock;
      expect(block).toEqual({
        type: "tool_use",
        id: "tool-1",
        name: "read_file",
        input: { path: "/test/file.ts" },
      });
      // Verify deep copy of input
      const originalContent = messages[0]?.content as ContentBlock[];
      expect(block.input).not.toBe((originalContent[0] as ToolUseBlock).input);
    });

    it("should deep-copy tool_result content blocks", () => {
      const manager = new CheckpointManager();
      const messages = [createToolResultMessage("1", "tool-1")];

      const checkpoint = manager.create(messages);

      const content = checkpoint.messages[0]?.content;
      expect(Array.isArray(content)).toBe(true);
      const block = (content as unknown[])[0];
      expect(block).toEqual({
        type: "tool_result",
        tool_use_id: "tool-1",
        content: "Tool result content",
      });
    });

    it("should deep-copy image content blocks", () => {
      const manager = new CheckpointManager();
      const messages: ContextMessage[] = [
        {
          id: "1",
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", data: "abc123", media_type: "image/png" },
              mediaType: "image/png",
              width: 100,
              height: 100,
            },
          ],
          priority: MessagePriority.NORMAL,
        },
      ];

      const checkpoint = manager.create(messages);

      const content = checkpoint.messages[0]?.content as unknown[];
      expect(content[0]).toEqual({
        type: "image",
        source: { type: "base64", data: "abc123", media_type: "image/png" },
        mediaType: "image/png",
        width: 100,
        height: 100,
      });
    });

    it("should deep-copy nested tool_result content", () => {
      const manager = new CheckpointManager();
      const messages: ContextMessage[] = [
        {
          id: "1",
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool-1",
              content: [{ type: "text", text: "Nested text" }],
              is_error: false,
              compactedAt: 12345,
            },
          ],
          priority: MessagePriority.TOOL_PAIR,
        },
      ];

      const checkpoint = manager.create(messages);

      const content = checkpoint.messages[0]?.content as unknown[];
      expect((content[0] as Record<string, unknown>).content).toEqual([
        { type: "text", text: "Nested text" },
      ]);
      expect((content[0] as Record<string, unknown>).is_error).toBe(false);
      expect((content[0] as Record<string, unknown>).compactedAt).toBe(12345);
    });

    it("should deep-copy message metadata", () => {
      const manager = new CheckpointManager();
      const messages: ContextMessage[] = [
        {
          ...createTestMessage("1"),
          metadata: { custom: "value", nested: { key: 123 } },
        },
      ];

      const checkpoint = manager.create(messages);

      expect(checkpoint.messages[0]?.metadata).toEqual({
        custom: "value",
        nested: { key: 123 },
      });
      expect(checkpoint.messages[0]?.metadata).not.toBe(messages[0]?.metadata);
    });

    it("should evict oldest checkpoint when at maxCheckpoints limit (REQ-CPT-001)", () => {
      const manager = new CheckpointManager({ maxCheckpoints: 3 });

      // Create 3 checkpoints
      const cp1 = manager.create([createTestMessage("1")], { label: "First" });
      const cp2 = manager.create([createTestMessage("2")], { label: "Second" });
      const cp3 = manager.create([createTestMessage("3")], { label: "Third" });

      expect(manager.count).toBe(3);
      expect(manager.get(cp1.id)).toBeDefined();

      // Create 4th checkpoint - should evict first
      const cp4 = manager.create([createTestMessage("4")], { label: "Fourth" });

      expect(manager.count).toBe(3);
      expect(manager.get(cp1.id)).toBeUndefined(); // Evicted
      expect(manager.get(cp2.id)).toBeDefined();
      expect(manager.get(cp3.id)).toBeDefined();
      expect(manager.get(cp4.id)).toBeDefined();
    });

    it("should record creation timestamp", () => {
      const manager = new CheckpointManager();
      const checkpoint = manager.create([createTestMessage("1")]);

      expect(checkpoint.createdAt).toBe(Date.now());
    });

    it("should default tokenCount to 0 if not provided", () => {
      const manager = new CheckpointManager();
      const checkpoint = manager.create([createTestMessage("1")]);

      expect(checkpoint.tokenCount).toBe(0);
    });
  });

  describe("rollback", () => {
    it("should restore messages from checkpoint (REQ-CPT-003)", () => {
      const manager = new CheckpointManager();
      const originalMessages = [createTestMessage("1"), createTestMessage("2")];

      const checkpoint = manager.create(originalMessages, { tokenCount: 20 });

      // Simulate modifications
      const currentMessages = [...originalMessages, createTestMessage("3"), createTestMessage("4")];

      const result = manager.rollback(checkpoint.id, currentMessages);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]?.id).toBe("1");
      expect(result.messages[1]?.id).toBe("2");
      expect(result.checkpoint).toBe(checkpoint);
      expect(result.discardedMessages).toBe(2); // 4 - 2 = 2
    });

    it("should return deep-copied messages on rollback", () => {
      const manager = new CheckpointManager();
      const messages = [createTestMessage("1")];

      const checkpoint = manager.create(messages);
      const result = manager.rollback(checkpoint.id, messages);

      expect(result.messages).not.toBe(checkpoint.messages);
      expect(result.messages[0]).not.toBe(checkpoint.messages[0]);
    });

    it("should remove checkpoints created after target (REQ-CPT-003)", () => {
      const manager = new CheckpointManager();

      const cp1 = manager.create([createTestMessage("1")], { label: "First" });
      const cp2 = manager.create([createTestMessage("2")], { label: "Second" });
      const cp3 = manager.create([createTestMessage("3")], { label: "Third" });

      expect(manager.count).toBe(3);

      const result = manager.rollback(cp1.id, []);

      expect(manager.count).toBe(1);
      expect(result.removedCheckpoints).toBe(2);
      expect(manager.get(cp1.id)).toBeDefined();
      expect(manager.get(cp2.id)).toBeUndefined();
      expect(manager.get(cp3.id)).toBeUndefined();
    });

    it("should throw error for non-existent checkpoint", () => {
      const manager = new CheckpointManager();

      expect(() => manager.rollback("non-existent", [])).toThrow(
        "Checkpoint not found: non-existent"
      );
    });

    it("should keep target checkpoint after rollback", () => {
      const manager = new CheckpointManager();

      const cp1 = manager.create([createTestMessage("1")]);
      manager.create([createTestMessage("2")]);

      manager.rollback(cp1.id, []);

      expect(manager.get(cp1.id)).toBeDefined();
      expect(manager.getLatest()?.id).toBe(cp1.id);
    });
  });

  describe("get", () => {
    it("should return checkpoint by ID", () => {
      const manager = new CheckpointManager();
      const checkpoint = manager.create([createTestMessage("1")], { label: "Test" });

      const retrieved = manager.get(checkpoint.id);

      expect(retrieved).toBe(checkpoint);
    });

    it("should return undefined for non-existent ID", () => {
      const manager = new CheckpointManager();

      expect(manager.get("non-existent")).toBeUndefined();
    });
  });

  describe("list", () => {
    it("should return empty array when no checkpoints", () => {
      const manager = new CheckpointManager();

      expect(manager.list()).toEqual([]);
    });

    it("should return checkpoints newest first", () => {
      const manager = new CheckpointManager();

      const cp1 = manager.create([createTestMessage("1")], { label: "First" });
      vi.advanceTimersByTime(1000);
      const cp2 = manager.create([createTestMessage("2")], { label: "Second" });
      vi.advanceTimersByTime(1000);
      const cp3 = manager.create([createTestMessage("3")], { label: "Third" });

      const list = manager.list();

      expect(list).toHaveLength(3);
      expect(list[0]?.id).toBe(cp3.id);
      expect(list[1]?.id).toBe(cp2.id);
      expect(list[2]?.id).toBe(cp1.id);
    });
  });

  describe("getLatest", () => {
    it("should return undefined when no checkpoints", () => {
      const manager = new CheckpointManager();

      expect(manager.getLatest()).toBeUndefined();
    });

    it("should return most recent checkpoint", () => {
      const manager = new CheckpointManager();

      manager.create([createTestMessage("1")], { label: "First" });
      const latest = manager.create([createTestMessage("2")], { label: "Second" });

      expect(manager.getLatest()?.id).toBe(latest.id);
    });
  });

  describe("shouldAutoCheckpoint", () => {
    it("should return false when autoCheckpoint is disabled", () => {
      const manager = new CheckpointManager({ autoCheckpoint: false });

      expect(manager.shouldAutoCheckpoint()).toBe(false);
    });

    it("should return true when enough time has passed (REQ-CPT-002)", () => {
      const manager = new CheckpointManager({
        autoCheckpoint: true,
        minCheckpointInterval: 60_000, // 1 minute
      });

      // Initially should be true (no previous checkpoint)
      expect(manager.shouldAutoCheckpoint()).toBe(true);

      // Create a checkpoint
      manager.create([createTestMessage("1")]);

      // Immediately after should be false
      expect(manager.shouldAutoCheckpoint()).toBe(false);

      // After interval should be true again
      vi.advanceTimersByTime(60_000);
      expect(manager.shouldAutoCheckpoint()).toBe(true);
    });

    it("should return false when not enough time has passed", () => {
      const manager = new CheckpointManager({
        autoCheckpoint: true,
        minCheckpointInterval: 300_000, // 5 minutes
      });

      manager.create([createTestMessage("1")]);

      vi.advanceTimersByTime(60_000); // Only 1 minute
      expect(manager.shouldAutoCheckpoint()).toBe(false);

      vi.advanceTimersByTime(300_000); // Now 6 minutes total
      expect(manager.shouldAutoCheckpoint()).toBe(true);
    });
  });

  describe("clear", () => {
    it("should remove all checkpoints", () => {
      const manager = new CheckpointManager();

      manager.create([createTestMessage("1")]);
      manager.create([createTestMessage("2")]);

      expect(manager.count).toBe(2);

      manager.clear();

      expect(manager.count).toBe(0);
      expect(manager.list()).toEqual([]);
    });

    it("should preserve timing for auto-checkpoint after clear", () => {
      const manager = new CheckpointManager({
        autoCheckpoint: true,
        minCheckpointInterval: 60_000,
      });

      manager.create([createTestMessage("1")]);

      // Advance time but not enough
      vi.advanceTimersByTime(30_000);

      manager.clear();

      // Still not enough time since last checkpoint
      expect(manager.shouldAutoCheckpoint()).toBe(false);

      vi.advanceTimersByTime(30_000);
      expect(manager.shouldAutoCheckpoint()).toBe(true);
    });
  });

  describe("count", () => {
    it("should return 0 initially", () => {
      const manager = new CheckpointManager();
      expect(manager.count).toBe(0);
    });

    it("should return correct count after creates", () => {
      const manager = new CheckpointManager();

      manager.create([createTestMessage("1")]);
      expect(manager.count).toBe(1);

      manager.create([createTestMessage("2")]);
      expect(manager.count).toBe(2);
    });

    it("should reflect eviction", () => {
      const manager = new CheckpointManager({ maxCheckpoints: 2 });

      manager.create([createTestMessage("1")]);
      manager.create([createTestMessage("2")]);
      manager.create([createTestMessage("3")]);

      expect(manager.count).toBe(2);
    });
  });
});

describe("generateCheckpointId", () => {
  beforeEach(() => {
    resetCheckpointCounter();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should generate unique IDs", () => {
    const id1 = generateCheckpointId();
    const id2 = generateCheckpointId();

    expect(id1).not.toBe(id2);
  });

  it("should follow expected format", () => {
    const id = generateCheckpointId();

    expect(id).toMatch(/^chk_\d+_\d+$/);
  });

  it("should include timestamp", () => {
    const id = generateCheckpointId();
    const timestamp = Date.now().toString();

    expect(id).toContain(timestamp);
  });
});

describe("resetCheckpointCounter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should reset counter for deterministic IDs", () => {
    generateCheckpointId();
    generateCheckpointId();

    resetCheckpointCounter();

    const id = generateCheckpointId();
    expect(id).toMatch(/_1$/);
  });
});

describe("createPreCompressionCheckpoint", () => {
  beforeEach(() => {
    resetCheckpointCounter();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create checkpoint with pre-compression reason", () => {
    const manager = new CheckpointManager();
    const messages = [createTestMessage("1"), createTestMessage("2")];

    const checkpoint = createPreCompressionCheckpoint(manager, messages, 85000);

    expect(checkpoint.reason).toBe("pre-compression");
    expect(checkpoint.label).toBe("Pre-compression backup");
    expect(checkpoint.tokenCount).toBe(85000);
    expect(checkpoint.messages).toHaveLength(2);
  });

  it("should add checkpoint to manager", () => {
    const manager = new CheckpointManager();
    const messages = [createTestMessage("1")];

    const checkpoint = createPreCompressionCheckpoint(manager, messages, 10000);

    expect(manager.count).toBe(1);
    expect(manager.get(checkpoint.id)).toBe(checkpoint);
  });
});
