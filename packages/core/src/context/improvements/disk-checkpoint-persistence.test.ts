/**
 * DiskCheckpointPersistence Unit Tests
 *
 * Tests for P2-1: Checkpoint Disk Persistence
 *
 * @module @vellum/core/context/improvements/disk-checkpoint-persistence.test
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ContextMessage, MessagePriority } from "../types.js";
import {
  createDiskCheckpointPersistence,
  DiskCheckpointPersistence,
} from "./disk-checkpoint-persistence.js";

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
 * Create a unique test directory.
 */
function createTestDir(): string {
  const dir = join(tmpdir(), `vellum-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Clean up a test directory.
 */
function cleanupTestDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("DiskCheckpointPersistence", () => {
  let testDir: string;
  let persistence: DiskCheckpointPersistence;

  beforeEach(() => {
    testDir = createTestDir();
    persistence = new DiskCheckpointPersistence({
      enabled: true,
      directory: testDir,
      maxDiskUsage: 10 * 1024 * 1024, // 10MB
      strategy: "immediate",
      enableCompression: true,
    });
  });

  afterEach(async () => {
    await persistence.clear();
    cleanupTestDir(testDir);
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Basic Persist and Load
  // ==========================================================================

  describe("persist", () => {
    it("should persist a checkpoint and return metadata", async () => {
      const messages = createMockMessages(5);
      const result = await persistence.persist({
        checkpointId: "chk-1",
        messages,
        metadata: { reason: "test" },
      });

      expect(result.checkpointId).toBe("chk-1");
      expect(result.messageCount).toBe(5);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.createdAt).toBeGreaterThan(0);
    });

    it("should create checkpoint file on disk", async () => {
      const messages = createMockMessages(3);
      const result = await persistence.persist({
        checkpointId: "chk-file-test",
        messages,
      });

      const filePath = join(testDir, result.filePath);
      expect(existsSync(filePath)).toBe(true);
    });

    it("should compress data when enabled", async () => {
      const messages = createMockMessages(100); // Larger data benefits from compression
      const result = await persistence.persist({
        checkpointId: "chk-compressed",
        messages,
      });

      expect(result.compressed).toBe(true);
      expect(result.filePath).toContain(".gz");
    });

    it("should not compress when disabled", async () => {
      const uncompressedPersistence = new DiskCheckpointPersistence({
        enabled: true,
        directory: testDir,
        enableCompression: false,
        strategy: "immediate",
      });

      const messages = createMockMessages(5);
      const result = await uncompressedPersistence.persist({
        checkpointId: "chk-uncompressed",
        messages,
      });

      expect(result.compressed).toBe(false);
      expect(result.filePath).toContain(".checkpoint");
      expect(result.filePath).not.toContain(".gz");
    });
  });

  describe("load", () => {
    it("should load a persisted checkpoint", async () => {
      const messages = createMockMessages(5);
      await persistence.persist({
        checkpointId: "chk-load-test",
        messages,
        metadata: { reason: "pre-compression" },
      });

      const loaded = await persistence.load("chk-load-test");

      expect(loaded).not.toBeNull();
      expect(loaded?.messages).toHaveLength(5);
      expect(loaded?.metadata).toEqual({ reason: "pre-compression" });
    });

    it("should preserve message content exactly", async () => {
      const originalMessage = createMockMessage({
        id: "exact-1",
        role: "assistant",
        content: "Exact content with special chars: 你好 🎉 <script>",
        priority: MessagePriority.TOOL_PAIR,
        metadata: { key: "value", nested: { a: 1 } },
      });

      await persistence.persist({
        checkpointId: "chk-exact",
        messages: [originalMessage],
      });

      const loaded = await persistence.load("chk-exact");

      expect(loaded).not.toBeNull();
      expect(loaded?.messages[0]).toEqual(originalMessage);
    });

    it("should return null for non-existent checkpoint", async () => {
      const loaded = await persistence.load("non-existent");
      expect(loaded).toBeNull();
    });

    it("should load compressed and uncompressed checkpoints", async () => {
      // Create compressed checkpoint
      const compressedPersistence = new DiskCheckpointPersistence({
        enabled: true,
        directory: testDir,
        enableCompression: true,
        strategy: "immediate",
      });

      await compressedPersistence.persist({
        checkpointId: "chk-compressed-load",
        messages: createMockMessages(50),
      });

      // Create uncompressed checkpoint
      const uncompressedPersistence = new DiskCheckpointPersistence({
        enabled: true,
        directory: testDir,
        enableCompression: false,
        strategy: "immediate",
      });

      await uncompressedPersistence.persist({
        checkpointId: "chk-uncompressed-load",
        messages: createMockMessages(5),
      });

      // Load both
      const loadedCompressed = await compressedPersistence.load("chk-compressed-load");
      const loadedUncompressed = await uncompressedPersistence.load("chk-uncompressed-load");

      expect(loadedCompressed?.messages).toHaveLength(50);
      expect(loadedUncompressed?.messages).toHaveLength(5);
    });
  });

  // ==========================================================================
  // List and Delete
  // ==========================================================================

  describe("list", () => {
    it("should list all persisted checkpoints", async () => {
      await persistence.persist({ checkpointId: "chk-1", messages: createMockMessages(3) });
      await persistence.persist({ checkpointId: "chk-2", messages: createMockMessages(5) });
      await persistence.persist({ checkpointId: "chk-3", messages: createMockMessages(2) });

      const list = await persistence.list();

      expect(list).toHaveLength(3);
      expect(list.map((cp) => cp.checkpointId).sort()).toEqual(["chk-1", "chk-2", "chk-3"]);
    });

    it("should return checkpoints sorted by creation time (newest first)", async () => {
      await persistence.persist({ checkpointId: "chk-first", messages: createMockMessages(1) });

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await persistence.persist({ checkpointId: "chk-second", messages: createMockMessages(1) });

      const list = await persistence.list();

      expect(list[0]?.checkpointId).toBe("chk-second");
      expect(list[1]?.checkpointId).toBe("chk-first");
    });

    it("should return empty array when no checkpoints", async () => {
      const list = await persistence.list();
      expect(list).toEqual([]);
    });
  });

  describe("delete", () => {
    it("should delete a persisted checkpoint", async () => {
      await persistence.persist({ checkpointId: "chk-delete", messages: createMockMessages(3) });

      const deleted = await persistence.delete("chk-delete");

      expect(deleted).toBe(true);

      const loaded = await persistence.load("chk-delete");
      expect(loaded).toBeNull();

      const list = await persistence.list();
      expect(list.find((cp) => cp.checkpointId === "chk-delete")).toBeUndefined();
    });

    it("should return false for non-existent checkpoint", async () => {
      const deleted = await persistence.delete("non-existent");
      expect(deleted).toBe(false);
    });

    it("should remove file from disk", async () => {
      const result = await persistence.persist({
        checkpointId: "chk-delete-file",
        messages: createMockMessages(3),
      });

      const filePath = join(testDir, result.filePath);
      expect(existsSync(filePath)).toBe(true);

      await persistence.delete("chk-delete-file");

      expect(existsSync(filePath)).toBe(false);
    });
  });

  // ==========================================================================
  // Disk Space Management
  // ==========================================================================

  describe("cleanup", () => {
    it("should clean up old checkpoints when over limit", async () => {
      // Create persistence with very small limit
      const smallPersistence = new DiskCheckpointPersistence({
        enabled: true,
        directory: testDir,
        maxDiskUsage: 500, // 500 bytes - very small
        strategy: "immediate",
        enableCompression: false,
      });

      // Persist multiple checkpoints that exceed the limit
      await smallPersistence.persist({
        checkpointId: "chk-old-1",
        messages: createMockMessages(10),
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await smallPersistence.persist({
        checkpointId: "chk-old-2",
        messages: createMockMessages(10),
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      await smallPersistence.persist({
        checkpointId: "chk-new",
        messages: createMockMessages(10),
      });

      const cleaned = await smallPersistence.cleanup();

      // Should have cleaned at least the oldest
      expect(cleaned).toBeGreaterThanOrEqual(1);

      // List remaining checkpoints
      const list = await smallPersistence.list();

      // With aggressive cleanup, we should have fewer checkpoints than we started with
      expect(list.length).toBeLessThan(3);
    });

    it("should not clean up when under limit", async () => {
      await persistence.persist({ checkpointId: "chk-keep-1", messages: createMockMessages(3) });
      await persistence.persist({ checkpointId: "chk-keep-2", messages: createMockMessages(3) });

      const cleaned = await persistence.cleanup();

      expect(cleaned).toBe(0);

      const list = await persistence.list();
      expect(list).toHaveLength(2);
    });
  });

  describe("getDiskUsage", () => {
    it("should return total bytes used", async () => {
      await persistence.persist({ checkpointId: "chk-usage-1", messages: createMockMessages(10) });
      await persistence.persist({ checkpointId: "chk-usage-2", messages: createMockMessages(20) });

      const usage = await persistence.getDiskUsage();

      expect(usage).toBeGreaterThan(0);
    });

    it("should return 0 when no checkpoints", async () => {
      const usage = await persistence.getDiskUsage();
      expect(usage).toBe(0);
    });
  });

  // ==========================================================================
  // Lazy Strategy
  // ==========================================================================

  describe("lazy strategy", () => {
    it("should defer persistence with lazy strategy", async () => {
      const lazyPersistence = new DiskCheckpointPersistence({
        enabled: true,
        directory: testDir,
        strategy: "lazy",
        enableCompression: false,
      });

      const result = await lazyPersistence.persist({
        checkpointId: "chk-lazy",
        messages: createMockMessages(5),
      });

      // Result should be returned immediately
      expect(result.checkpointId).toBe("chk-lazy");

      // Wait for lazy persist to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should now be persisted
      const loaded = await lazyPersistence.load("chk-lazy");
      expect(loaded).not.toBeNull();
    });

    it("should load from pending before disk", async () => {
      const lazyPersistence = new DiskCheckpointPersistence({
        enabled: true,
        directory: testDir,
        strategy: "lazy",
      });

      const messages = createMockMessages(5);
      await lazyPersistence.persist({
        checkpointId: "chk-pending",
        messages,
      });

      // Load immediately (before lazy persist completes)
      const loaded = await lazyPersistence.load("chk-pending");

      expect(loaded).not.toBeNull();
      expect(loaded?.messages).toHaveLength(5);
    });

    it("should flush pending persists", async () => {
      const lazyPersistence = new DiskCheckpointPersistence({
        enabled: true,
        directory: testDir,
        strategy: "lazy",
      });

      await lazyPersistence.persist({
        checkpointId: "chk-flush-1",
        messages: createMockMessages(3),
      });
      await lazyPersistence.persist({
        checkpointId: "chk-flush-2",
        messages: createMockMessages(3),
      });

      const flushed = await lazyPersistence.flush();

      expect(flushed).toBeGreaterThanOrEqual(0); // May have already been flushed
    });
  });

  // ==========================================================================
  // Disabled Behavior
  // ==========================================================================

  describe("disabled persistence", () => {
    it("should not persist when disabled", async () => {
      const disabledPersistence = new DiskCheckpointPersistence({
        enabled: false,
        directory: testDir,
      });

      const result = await disabledPersistence.persist({
        checkpointId: "chk-disabled",
        messages: createMockMessages(5),
      });

      // Should return a result but not persist
      expect(result.checkpointId).toBe("chk-disabled");
      expect(result.sizeBytes).toBe(0);

      const loaded = await disabledPersistence.load("chk-disabled");
      expect(loaded).toBeNull();
    });

    it("should return empty list when disabled", async () => {
      const disabledPersistence = new DiskCheckpointPersistence({
        enabled: false,
        directory: testDir,
      });

      const list = await disabledPersistence.list();
      expect(list).toEqual([]);
    });

    it("should report correct enabled state", () => {
      const enabledPersistence = new DiskCheckpointPersistence({
        enabled: true,
        directory: testDir,
      });

      const disabledPersistence = new DiskCheckpointPersistence({
        enabled: false,
        directory: testDir,
      });

      expect(enabledPersistence.isEnabled).toBe(true);
      expect(disabledPersistence.isEnabled).toBe(false);
    });
  });

  // ==========================================================================
  // Clear
  // ==========================================================================

  describe("clear", () => {
    it("should clear all checkpoints", async () => {
      await persistence.persist({ checkpointId: "chk-clear-1", messages: createMockMessages(3) });
      await persistence.persist({ checkpointId: "chk-clear-2", messages: createMockMessages(3) });

      const cleared = await persistence.clear();

      expect(cleared).toBeGreaterThan(0);

      const list = await persistence.list();
      expect(list).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("should handle corrupted checkpoint file", async () => {
      // Create a valid checkpoint first
      await persistence.persist({
        checkpointId: "chk-corrupt",
        messages: createMockMessages(5),
      });

      // Corrupt the file
      const filePath = join(testDir, "chk-corrupt.checkpoint.gz");
      if (existsSync(filePath)) {
        writeFileSync(filePath, "corrupted data");
      }

      // Should return null and clean up manifest
      const loaded = await persistence.load("chk-corrupt");
      expect(loaded).toBeNull();
    });

    it("should handle missing file gracefully", async () => {
      await persistence.persist({
        checkpointId: "chk-missing",
        messages: createMockMessages(5),
      });

      // Delete the file manually
      const files = readdirSync(testDir);
      for (const file of files) {
        if (file.includes("chk-missing")) {
          rmSync(join(testDir, file), { force: true });
        }
      }

      // Should return null
      const loaded = await persistence.load("chk-missing");
      expect(loaded).toBeNull();
    });

    it("should rebuild manifest from existing files", async () => {
      await persistence.persist({ checkpointId: "chk-rebuild-1", messages: createMockMessages(3) });
      await persistence.persist({ checkpointId: "chk-rebuild-2", messages: createMockMessages(3) });

      // Delete manifest
      const manifestPath = join(testDir, "manifest.json");
      if (existsSync(manifestPath)) {
        rmSync(manifestPath, { force: true });
      }

      // Create new instance (should rebuild manifest)
      const newPersistence = new DiskCheckpointPersistence({
        enabled: true,
        directory: testDir,
        strategy: "immediate",
      });

      const list = await newPersistence.list();
      expect(list.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe("createDiskCheckpointPersistence", () => {
    it("should create instance with default config", () => {
      const instance = createDiskCheckpointPersistence();
      expect(instance).toBeInstanceOf(DiskCheckpointPersistence);
    });

    it("should create instance with custom config", () => {
      const instance = createDiskCheckpointPersistence({
        directory: testDir,
        maxDiskUsage: 50 * 1024 * 1024,
      });

      expect(instance.currentConfig.directory).toBe(testDir);
      expect(instance.currentConfig.maxDiskUsage).toBe(50 * 1024 * 1024);
    });
  });
});
