/**
 * TruncationStateManager Unit Tests
 *
 * Tests for P0-2: Truncation Recovery Mechanism
 *
 * @module @vellum/core/context/improvements/truncation-state-manager.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ContextMessage, MessagePriority } from "../types.js";
import {
  createTruncationStateManager,
  TruncationStateManager,
} from "./truncation-state-manager.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock context message for testing.
 */
function createMockMessage(overrides: Partial<ContextMessage> = {}): ContextMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 9)}`,
    role: "user",
    content: "Test message content",
    priority: MessagePriority.NORMAL,
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Create an array of mock messages.
 */
function createMockMessages(count: number): ContextMessage[] {
  return Array.from({ length: count }, (_, i) =>
    createMockMessage({
      id: `msg-${i}`,
      content: `Test message ${i} with some content to make it meaningful`,
    })
  );
}

/**
 * Create a large message that exceeds size limits when multiplied.
 */
function createLargeMessage(sizeBytes: number): ContextMessage {
  const content = "x".repeat(sizeBytes);
  return createMockMessage({
    id: "large-msg",
    content,
  });
}

// ============================================================================
// Tests
// ============================================================================

describe("TruncationStateManager", () => {
  let manager: TruncationStateManager;

  beforeEach(() => {
    manager = new TruncationStateManager({
      maxSnapshots: 3,
      maxSnapshotSize: 1024 * 1024, // 1MB
      enableCompression: true,
      expirationMs: 30 * 60 * 1000, // 30 minutes
    });
  });

  afterEach(() => {
    manager.clear();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Basic Save and Recover
  // ==========================================================================

  describe("saveSnapshot", () => {
    it("should save a snapshot and return truncation state", () => {
      const messages = createMockMessages(5);
      const state = manager.saveSnapshot("trunc-1", messages, "token_overflow");

      expect(state.truncationId).toBe("trunc-1");
      expect(state.reason).toBe("token_overflow");
      expect(state.truncatedMessageIds).toHaveLength(5);
      expect(state.truncatedAt).toBeGreaterThan(0);
      expect(state.snapshot).toBeDefined();
      expect(state.snapshot?.snapshotId).toBe("snap-trunc-1");
    });

    it("should store message IDs correctly", () => {
      const messages = createMockMessages(3);
      const state = manager.saveSnapshot("trunc-2", messages, "sliding_window");

      expect(state.truncatedMessageIds).toEqual(["msg-0", "msg-1", "msg-2"]);
    });

    it("should throw if snapshot exceeds size limit", () => {
      const smallManager = new TruncationStateManager({
        maxSnapshotSize: 100, // Very small limit
        enableCompression: false, // Disable compression to ensure size check
      });

      const largeMessage = createLargeMessage(500);

      expect(() => {
        smallManager.saveSnapshot("trunc-large", [largeMessage], "emergency_recovery");
      }).toThrow(/exceeds limit/);
    });
  });

  describe("recover", () => {
    it("should recover messages from snapshot", () => {
      const messages = createMockMessages(5);
      manager.saveSnapshot("trunc-1", messages, "token_overflow");

      const recovered = manager.recover("trunc-1");

      expect(recovered).not.toBeNull();
      expect(recovered).toHaveLength(5);
      expect(recovered?.[0]?.id).toBe("msg-0");
      expect(recovered?.[4]?.id).toBe("msg-4");
    });

    it("should return null for non-existent truncation", () => {
      const recovered = manager.recover("non-existent");
      expect(recovered).toBeNull();
    });

    it("should preserve message content exactly", () => {
      const originalMessage = createMockMessage({
        id: "exact-1",
        role: "assistant",
        content: "Exact content with special chars: 你好 🎉 <script>",
        priority: MessagePriority.TOOL_PAIR,
        metadata: { key: "value", nested: { a: 1 } },
      });

      manager.saveSnapshot("trunc-exact", [originalMessage], "manual");
      const recovered = manager.recover("trunc-exact");

      expect(recovered).not.toBeNull();
      expect(recovered?.[0]).toEqual(originalMessage);
    });

    it("should handle messages with complex content blocks", () => {
      const complexMessage: ContextMessage = {
        id: "complex-1",
        role: "assistant",
        content: [
          { type: "text", text: "Here is the result:" },
          { type: "tool_use", id: "tool-1", name: "read_file", input: { path: "/test.ts" } },
        ],
        priority: MessagePriority.TOOL_PAIR,
      };

      manager.saveSnapshot("trunc-complex", [complexMessage], "token_overflow");
      const recovered = manager.recover("trunc-complex");

      expect(recovered).not.toBeNull();
      expect(recovered?.[0]?.content).toEqual(complexMessage.content);
    });
  });

  // ==========================================================================
  // LRU Eviction
  // ==========================================================================

  describe("LRU eviction", () => {
    it("should evict oldest snapshot when at capacity", () => {
      // Max 3 snapshots
      manager.saveSnapshot("trunc-1", createMockMessages(1), "token_overflow");
      manager.saveSnapshot("trunc-2", createMockMessages(1), "token_overflow");
      manager.saveSnapshot("trunc-3", createMockMessages(1), "token_overflow");

      expect(manager.size).toBe(3);

      // This should evict trunc-1
      manager.saveSnapshot("trunc-4", createMockMessages(1), "token_overflow");

      expect(manager.size).toBe(3);
      expect(manager.getState("trunc-1")).toBeNull();
      expect(manager.getState("trunc-2")).not.toBeNull();
      expect(manager.getState("trunc-3")).not.toBeNull();
      expect(manager.getState("trunc-4")).not.toBeNull();
    });

    it("should update LRU order on recover access", () => {
      manager.saveSnapshot("trunc-1", createMockMessages(1), "token_overflow");
      manager.saveSnapshot("trunc-2", createMockMessages(1), "token_overflow");
      manager.saveSnapshot("trunc-3", createMockMessages(1), "token_overflow");

      // Access trunc-1, making it most recently used
      manager.recover("trunc-1");

      // Add new snapshot - should evict trunc-2 (now oldest)
      manager.saveSnapshot("trunc-4", createMockMessages(1), "token_overflow");

      expect(manager.getState("trunc-1")).not.toBeNull(); // Was accessed, not evicted
      expect(manager.getState("trunc-2")).toBeNull(); // Should be evicted
      expect(manager.getState("trunc-3")).not.toBeNull();
      expect(manager.getState("trunc-4")).not.toBeNull();
    });

    it("should handle repeated saves to same ID", () => {
      const messages1 = [createMockMessage({ id: "m1", content: "First" })];
      const messages2 = [createMockMessage({ id: "m2", content: "Second" })];

      manager.saveSnapshot("trunc-1", messages1, "token_overflow");
      manager.saveSnapshot("trunc-1", messages2, "sliding_window");

      // Should have overwritten
      expect(manager.size).toBe(1);

      const recovered = manager.recover("trunc-1");
      expect(recovered?.[0]?.id).toBe("m2");
    });
  });

  // ==========================================================================
  // Compression
  // ==========================================================================

  describe("compression", () => {
    it("should compress large snapshots when enabled", () => {
      const compressedManager = new TruncationStateManager({
        maxSnapshots: 10,
        enableCompression: true,
      });

      // Create a message large enough to benefit from compression
      // Repetitive text compresses well
      const largeContent = "This is a test message. ".repeat(100);
      const message = createMockMessage({ content: largeContent });

      const state = compressedManager.saveSnapshot("trunc-comp", [message], "token_overflow");

      expect(state.snapshot?.compressed).toBe(true);
      // Compressed size should be smaller than original
      const originalSize = JSON.stringify([message]).length;
      expect(state.snapshot?.sizeBytes).toBeLessThan(originalSize);
    });

    it("should not compress when disabled", () => {
      const uncompressedManager = new TruncationStateManager({
        enableCompression: false,
      });

      const largeContent = "This is a test message. ".repeat(100);
      const message = createMockMessage({ content: largeContent });

      const state = uncompressedManager.saveSnapshot("trunc-uncomp", [message], "token_overflow");

      expect(state.snapshot?.compressed).toBe(false);
    });

    it("should correctly recover compressed snapshots", () => {
      const messages = createMockMessages(10);
      // Add large content to trigger compression
      messages[0] = createMockMessage({
        id: "msg-0",
        content: "Compressible content ".repeat(200),
      });

      manager.saveSnapshot("trunc-comp", messages, "token_overflow");
      const recovered = manager.recover("trunc-comp");

      expect(recovered).not.toBeNull();
      expect(recovered).toHaveLength(10);
      expect(recovered?.[0]?.content).toBe("Compressible content ".repeat(200));
    });

    it("should skip compression for small data", () => {
      const smallMessage = createMockMessage({ content: "tiny" });
      const state = manager.saveSnapshot("trunc-small", [smallMessage], "manual");

      // Small data shouldn't be compressed (threshold is 1KB)
      expect(state.snapshot?.compressed).toBe(false);
    });

    it("should skip compression if compressed size is larger", () => {
      // Random data compresses poorly or may expand
      const compressedManager = new TruncationStateManager({
        enableCompression: true,
      });

      // Very short random-ish content
      const message = createMockMessage({
        content: "abc123",
      });

      const state = compressedManager.saveSnapshot("trunc-rand", [message], "token_overflow");

      // Should not compress tiny content
      expect(state.snapshot?.compressed).toBe(false);
    });
  });

  // ==========================================================================
  // Expiration
  // ==========================================================================

  describe("expiration", () => {
    it("should return null for expired snapshots on recover", () => {
      const shortExpiryManager = new TruncationStateManager({
        expirationMs: 100, // 100ms expiration
      });

      shortExpiryManager.saveSnapshot("trunc-1", createMockMessages(1), "token_overflow");

      // Wait for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const recovered = shortExpiryManager.recover("trunc-1");
          expect(recovered).toBeNull();
          resolve();
        }, 150);
      });
    });

    it("should return null for expired snapshots on getState", () => {
      const shortExpiryManager = new TruncationStateManager({
        expirationMs: 100,
      });

      shortExpiryManager.saveSnapshot("trunc-1", createMockMessages(1), "token_overflow");

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const state = shortExpiryManager.getState("trunc-1");
          expect(state).toBeNull();
          resolve();
        }, 150);
      });
    });

    it("should clean up expired snapshots on cleanup()", () => {
      const shortExpiryManager = new TruncationStateManager({
        expirationMs: 100,
      });

      shortExpiryManager.saveSnapshot("trunc-1", createMockMessages(1), "token_overflow");
      shortExpiryManager.saveSnapshot("trunc-2", createMockMessages(1), "sliding_window");

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const cleaned = shortExpiryManager.cleanup();
          expect(cleaned).toBe(2);
          expect(shortExpiryManager.size).toBe(0);
          resolve();
        }, 150);
      });
    });
  });

  // ==========================================================================
  // State Management
  // ==========================================================================

  describe("getState", () => {
    it("should return state without recovering messages", () => {
      const messages = createMockMessages(5);
      manager.saveSnapshot("trunc-1", messages, "token_overflow");

      const state = manager.getState("trunc-1");

      expect(state).not.toBeNull();
      expect(state?.truncationId).toBe("trunc-1");
      expect(state?.reason).toBe("token_overflow");
      expect(state?.truncatedMessageIds).toHaveLength(5);
    });

    it("should return null for non-existent state", () => {
      const state = manager.getState("non-existent");
      expect(state).toBeNull();
    });
  });

  describe("listRecoverable", () => {
    it("should list all recoverable truncations", () => {
      manager.saveSnapshot("trunc-1", createMockMessages(1), "token_overflow");
      manager.saveSnapshot("trunc-2", createMockMessages(2), "sliding_window");
      manager.saveSnapshot("trunc-3", createMockMessages(3), "manual");

      const recoverable = manager.listRecoverable();

      expect(recoverable).toHaveLength(3);
      expect(recoverable.map((s) => s.truncationId)).toContain("trunc-1");
      expect(recoverable.map((s) => s.truncationId)).toContain("trunc-2");
      expect(recoverable.map((s) => s.truncationId)).toContain("trunc-3");
    });

    it("should exclude expired truncations", () => {
      const shortExpiryManager = new TruncationStateManager({
        expirationMs: 100,
      });

      shortExpiryManager.saveSnapshot("trunc-1", createMockMessages(1), "token_overflow");

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const recoverable = shortExpiryManager.listRecoverable();
          expect(recoverable).toHaveLength(0);
          resolve();
        }, 150);
      });
    });

    it("should return empty array when no snapshots", () => {
      const recoverable = manager.listRecoverable();
      expect(recoverable).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe("createTruncationStateManager", () => {
    it("should create manager with default options", () => {
      const defaultManager = createTruncationStateManager();
      expect(defaultManager).toBeInstanceOf(TruncationStateManager);

      // Test that it works
      const state = defaultManager.saveSnapshot("test", createMockMessages(1), "token_overflow");
      expect(state).toBeDefined();
    });

    it("should create manager with custom options", () => {
      const customManager = createTruncationStateManager({
        maxSnapshots: 10,
        enableCompression: false,
      });

      // Save 5 snapshots (wouldn't fit with default of 3)
      for (let i = 0; i < 5; i++) {
        customManager.saveSnapshot(`trunc-${i}`, createMockMessages(1), "token_overflow");
      }

      expect(customManager.size).toBe(5);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("should handle empty message array", () => {
      const state = manager.saveSnapshot("trunc-empty", [], "manual");

      expect(state.truncatedMessageIds).toHaveLength(0);

      const recovered = manager.recover("trunc-empty");
      expect(recovered).toEqual([]);
    });

    it("should handle messages with undefined optional fields", () => {
      const minimalMessage: ContextMessage = {
        id: "minimal",
        role: "user",
        content: "minimal content",
        priority: MessagePriority.NORMAL,
      };

      manager.saveSnapshot("trunc-min", [minimalMessage], "token_overflow");
      const recovered = manager.recover("trunc-min");

      expect(recovered?.[0]).toEqual(minimalMessage);
    });

    it("should handle clear operation", () => {
      manager.saveSnapshot("trunc-1", createMockMessages(1), "token_overflow");
      manager.saveSnapshot("trunc-2", createMockMessages(1), "sliding_window");

      expect(manager.size).toBe(2);

      manager.clear();

      expect(manager.size).toBe(0);
      expect(manager.recover("trunc-1")).toBeNull();
      expect(manager.recover("trunc-2")).toBeNull();
    });

    it("should handle all truncation reasons", () => {
      const reasons = ["token_overflow", "sliding_window", "emergency_recovery", "manual"] as const;

      for (const reason of reasons) {
        manager.saveSnapshot(`trunc-${reason}`, createMockMessages(1), reason);
        const state = manager.getState(`trunc-${reason}`);
        expect(state?.reason).toBe(reason);
      }
    });
  });
});
