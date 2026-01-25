/**
 * CompactionStatsTracker Unit Tests
 *
 * Tests for P2-2: Compaction Stats Tracking
 *
 * @module @vellum/core/context/improvements/compaction-stats-tracker.test
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type CompactionMessageInfo,
  type CompactionRecordInput,
  CompactionStatsTracker,
  createCompactionStatsTracker,
} from "./compaction-stats-tracker.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a unique test directory.
 */
function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `vellum-compaction-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
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

/**
 * Create a mock compaction record.
 */
function createMockRecord(overrides: Partial<CompactionRecordInput> = {}): CompactionRecordInput {
  return {
    timestamp: Date.now(),
    originalTokens: 5000,
    compressedTokens: 500,
    messageCount: 10,
    isCascade: false,
    ...overrides,
  };
}

/**
 * Create mock message info for cascade detection.
 */
function createMockMessageInfo(
  overrides: Partial<CompactionMessageInfo> = {}
): CompactionMessageInfo {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 9)}`,
    isSummary: false,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("CompactionStatsTracker", () => {
  let testDir: string;
  let statsFilePath: string;
  let tracker: CompactionStatsTracker;

  beforeEach(() => {
    testDir = createTestDir();
    statsFilePath = join(testDir, "compaction-stats.json");
    tracker = new CompactionStatsTracker({
      enabled: true,
      persist: true,
      maxHistoryEntries: 100,
      statsFilePath,
    });
  });

  afterEach(async () => {
    // Wait for any pending microtasks (schedulePersist uses queueMicrotask)
    await new Promise<void>((resolve) => setImmediate(() => resolve()));

    // On Windows, file handles may not be released immediately
    // Retry cleanup with exponential backoff
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        cleanupTestDir(testDir);
        break;
      } catch (error: unknown) {
        attempts++;
        if (
          attempts >= maxAttempts ||
          !(error instanceof Error) ||
          !error.message.includes("ENOTEMPTY")
        ) {
          throw error;
        }
        // Wait before retry (exponential backoff: 10ms, 20ms, 40ms)
        await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempts));
      }
    }
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Record and Get Statistics
  // ==========================================================================

  describe("record", () => {
    it("should record a compaction and update stats", async () => {
      await tracker.record(
        createMockRecord({
          originalTokens: 5000,
          compressedTokens: 500,
          messageCount: 10,
        })
      );

      const stats = tracker.getStats();
      expect(stats.totalCompactions).toBe(1);
      expect(stats.sessionCompactions).toBe(1);
      expect(stats.totalOriginalTokens).toBe(5000);
      expect(stats.totalCompressedTokens).toBe(500);
    });

    it("should accumulate multiple records", async () => {
      await tracker.record(createMockRecord({ originalTokens: 1000, compressedTokens: 100 }));
      await tracker.record(createMockRecord({ originalTokens: 2000, compressedTokens: 200 }));
      await tracker.record(createMockRecord({ originalTokens: 3000, compressedTokens: 300 }));

      const stats = tracker.getStats();
      expect(stats.totalCompactions).toBe(3);
      expect(stats.totalOriginalTokens).toBe(6000);
      expect(stats.totalCompressedTokens).toBe(600);
    });

    it("should track cascade compactions separately", async () => {
      await tracker.record(createMockRecord({ isCascade: false }));
      await tracker.record(createMockRecord({ isCascade: true }));
      await tracker.record(createMockRecord({ isCascade: true }));

      const stats = tracker.getStats();
      expect(stats.totalCompactions).toBe(3);
      expect(stats.cascadeCompactions).toBe(2);
    });

    it("should add entries to history", async () => {
      await tracker.record(createMockRecord({ messageCount: 5 }));
      await tracker.record(createMockRecord({ messageCount: 8 }));

      const stats = tracker.getStats();
      expect(stats.history).toHaveLength(2);
      expect(stats.history[0]?.messageCount).toBe(5);
      expect(stats.history[1]?.messageCount).toBe(8);
    });

    it("should generate unique compaction IDs", async () => {
      await tracker.record(createMockRecord());
      await tracker.record(createMockRecord());

      const stats = tracker.getStats();
      const ids = stats.history.map((h) => h.compactionId);
      expect(new Set(ids).size).toBe(2); // All unique
    });

    it("should not record when disabled", async () => {
      const disabledTracker = new CompactionStatsTracker({ enabled: false });
      await disabledTracker.record(createMockRecord());

      const stats = disabledTracker.getStats();
      expect(stats.totalCompactions).toBe(0);
    });
  });

  // ==========================================================================
  // History Management
  // ==========================================================================

  describe("getHistory", () => {
    it("should return history newest first", async () => {
      await tracker.record(createMockRecord({ messageCount: 1 }));
      await tracker.record(createMockRecord({ messageCount: 2 }));
      await tracker.record(createMockRecord({ messageCount: 3 }));

      const history = tracker.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0]?.messageCount).toBe(3); // Newest first
      expect(history[2]?.messageCount).toBe(1); // Oldest last
    });

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await tracker.record(createMockRecord({ messageCount: i }));
      }

      const history = tracker.getHistory(3);
      expect(history).toHaveLength(3);
      expect(history[0]?.messageCount).toBe(9); // Most recent
    });

    it("should enforce maxHistoryEntries", async () => {
      const limitedTracker = new CompactionStatsTracker({
        enabled: true,
        persist: false,
        maxHistoryEntries: 5,
      });

      for (let i = 0; i < 10; i++) {
        await limitedTracker.record(createMockRecord({ messageCount: i }));
      }

      const stats = limitedTracker.getStats();
      expect(stats.history).toHaveLength(5);
      // Should keep most recent 5 (5,6,7,8,9)
      expect(stats.history[0]?.messageCount).toBe(5);
      expect(stats.history[4]?.messageCount).toBe(9);
    });
  });

  // ==========================================================================
  // Cascade Detection
  // ==========================================================================

  describe("isCascadeCompaction", () => {
    it("should detect cascade when message has isSummary=true", () => {
      const messages: CompactionMessageInfo[] = [
        createMockMessageInfo({ id: "msg-1" }),
        createMockMessageInfo({ id: "msg-2", isSummary: true }),
        createMockMessageInfo({ id: "msg-3" }),
      ];

      expect(tracker.isCascadeCompaction(messages)).toBe(true);
    });

    it("should detect cascade when message has condenseId", () => {
      const messages: CompactionMessageInfo[] = [
        createMockMessageInfo({ id: "msg-1" }),
        createMockMessageInfo({ id: "msg-2", condenseId: "condense-123" }),
      ];

      expect(tracker.isCascadeCompaction(messages)).toBe(true);
    });

    it("should not detect cascade for normal messages", () => {
      const messages: CompactionMessageInfo[] = [
        createMockMessageInfo({ id: "msg-1" }),
        createMockMessageInfo({ id: "msg-2" }),
        createMockMessageInfo({ id: "msg-3" }),
      ];

      expect(tracker.isCascadeCompaction(messages)).toBe(false);
    });

    it("should detect cascade for tracked compacted messages", () => {
      // Track some message IDs as compacted
      tracker.trackCompactedMessages(["old-msg-1", "old-msg-2"], "summary-1");

      const messages: CompactionMessageInfo[] = [
        createMockMessageInfo({ id: "summary-1" }), // Previously compacted
        createMockMessageInfo({ id: "new-msg-1" }),
      ];

      expect(tracker.isCascadeCompaction(messages)).toBe(true);
    });

    it("should handle empty condenseId as non-cascade", () => {
      const messages: CompactionMessageInfo[] = [
        createMockMessageInfo({ id: "msg-1", condenseId: "" }),
      ];

      expect(tracker.isCascadeCompaction(messages)).toBe(false);
    });
  });

  describe("trackCompactedMessages", () => {
    it("should track original message IDs", () => {
      tracker.trackCompactedMessages(["msg-1", "msg-2"], "summary-1");

      // Now these should be detected as cascade
      expect(tracker.isCascadeCompaction([createMockMessageInfo({ id: "msg-1" })])).toBe(true);

      expect(tracker.isCascadeCompaction([createMockMessageInfo({ id: "msg-2" })])).toBe(true);
    });

    it("should track summary ID for future cascade detection", () => {
      tracker.trackCompactedMessages(["msg-1"], "summary-1");

      // The summary itself should also be tracked
      expect(tracker.isCascadeCompaction([createMockMessageInfo({ id: "summary-1" })])).toBe(true);
    });
  });

  // ==========================================================================
  // Persistence
  // ==========================================================================

  describe("persist and load", () => {
    it("should persist stats to disk", async () => {
      await tracker.record(createMockRecord({ originalTokens: 1000 }));
      await tracker.persist();

      expect(existsSync(statsFilePath)).toBe(true);
    });

    it("should load persisted stats", async () => {
      // Record and persist
      await tracker.record(createMockRecord({ originalTokens: 1000, compressedTokens: 100 }));
      await tracker.record(createMockRecord({ originalTokens: 2000, compressedTokens: 200 }));

      // Flush any pending microtasks from schedulePersist
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
      await tracker.persist();

      // Create new tracker and load
      const newTracker = new CompactionStatsTracker({
        enabled: true,
        persist: true,
        maxHistoryEntries: 100,
        statsFilePath,
      });
      await newTracker.load();

      const stats = newTracker.getStats();
      expect(stats.totalCompactions).toBe(2);
      expect(stats.totalOriginalTokens).toBe(3000);
      expect(stats.totalCompressedTokens).toBe(300);
      // Session compactions should reset
      expect(stats.sessionCompactions).toBe(0);
    });

    it("should handle missing stats file gracefully", async () => {
      const newTracker = new CompactionStatsTracker({
        enabled: true,
        persist: true,
        statsFilePath: join(testDir, "nonexistent.json"),
      });

      // Should not throw
      await expect(newTracker.load()).resolves.not.toThrow();

      const stats = newTracker.getStats();
      expect(stats.totalCompactions).toBe(0);
    });

    it("should create directory if not exists", async () => {
      const nestedPath = join(testDir, "nested", "deep", "stats.json");
      const nestedTracker = new CompactionStatsTracker({
        enabled: true,
        persist: true,
        statsFilePath: nestedPath,
      });

      await nestedTracker.record(createMockRecord());
      await nestedTracker.persist();

      expect(existsSync(nestedPath)).toBe(true);
    });

    it("should handle corrupted stats file", async () => {
      // Write invalid JSON
      writeFileSync(statsFilePath, "{ invalid json }");

      const newTracker = new CompactionStatsTracker({
        enabled: true,
        persist: true,
        statsFilePath,
      });

      // Should not throw, just start fresh
      await expect(newTracker.load()).resolves.not.toThrow();

      const stats = newTracker.getStats();
      expect(stats.totalCompactions).toBe(0);
    });

    it("should not persist when persist=false", async () => {
      const noPersistTracker = new CompactionStatsTracker({
        enabled: true,
        persist: false,
      });

      await noPersistTracker.record(createMockRecord());
      await noPersistTracker.persist();

      // Should not create any file in temp dir
      const files = existsSync(testDir) ? [] : [];
      expect(files).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Reset
  // ==========================================================================

  describe("reset", () => {
    it("should clear all statistics", async () => {
      await tracker.record(createMockRecord());
      await tracker.record(createMockRecord());

      tracker.reset();

      const stats = tracker.getStats();
      expect(stats.totalCompactions).toBe(0);
      expect(stats.sessionCompactions).toBe(0);
      expect(stats.cascadeCompactions).toBe(0);
      expect(stats.totalOriginalTokens).toBe(0);
      expect(stats.totalCompressedTokens).toBe(0);
      expect(stats.history).toHaveLength(0);
    });

    it("should clear tracked compacted messages", async () => {
      tracker.trackCompactedMessages(["msg-1"], "summary-1");

      expect(tracker.isCascadeCompaction([createMockMessageInfo({ id: "msg-1" })])).toBe(true);

      tracker.reset();

      expect(tracker.isCascadeCompaction([createMockMessageInfo({ id: "msg-1" })])).toBe(false);
    });
  });

  // ==========================================================================
  // Session Management
  // ==========================================================================

  describe("setSessionId", () => {
    it("should update session ID and reset session compactions", async () => {
      await tracker.record(createMockRecord());
      await tracker.record(createMockRecord());

      expect(tracker.getStats().sessionCompactions).toBe(2);

      tracker.setSessionId("new-session");

      const stats = tracker.getStats();
      expect(stats.sessionId).toBe("new-session");
      expect(stats.sessionCompactions).toBe(0);
      // Total should remain
      expect(stats.totalCompactions).toBe(2);
    });
  });

  // ==========================================================================
  // Compression Efficiency
  // ==========================================================================

  describe("getCompressionEfficiency", () => {
    it("should calculate compression efficiency", async () => {
      await tracker.record(
        createMockRecord({
          originalTokens: 10000,
          compressedTokens: 2000,
        })
      );

      const efficiency = tracker.getCompressionEfficiency();
      expect(efficiency).toBeCloseTo(0.8, 2); // 80% reduction
    });

    it("should return 0 for no compactions", () => {
      const efficiency = tracker.getCompressionEfficiency();
      expect(efficiency).toBe(0);
    });

    it("should accumulate across multiple compactions", async () => {
      await tracker.record(
        createMockRecord({
          originalTokens: 1000,
          compressedTokens: 100,
        })
      );
      await tracker.record(
        createMockRecord({
          originalTokens: 1000,
          compressedTokens: 100,
        })
      );

      // Total: 2000 original, 200 compressed = 90% efficiency
      const efficiency = tracker.getCompressionEfficiency();
      expect(efficiency).toBeCloseTo(0.9, 2);
    });
  });

  // ==========================================================================
  // Factory Function
  // ==========================================================================

  describe("createCompactionStatsTracker", () => {
    it("should create tracker with default config", () => {
      const defaultTracker = createCompactionStatsTracker();
      expect(defaultTracker).toBeInstanceOf(CompactionStatsTracker);
    });

    it("should create tracker with custom config", () => {
      const customTracker = createCompactionStatsTracker({
        enabled: false,
        maxHistoryEntries: 50,
      });

      // Verify config was applied
      expect(customTracker.getStats().totalCompactions).toBe(0);
    });
  });

  // ==========================================================================
  // Quality Report Integration
  // ==========================================================================

  describe("quality report", () => {
    it("should store quality report in history entry", async () => {
      const qualityReport = {
        passed: true,
        originalTokens: 5000,
        summaryTokens: 500,
        compressionRatio: 10,
        warnings: ["Minor: High compression ratio"],
      };

      await tracker.record(
        createMockRecord({
          qualityReport,
        })
      );

      const history = tracker.getHistory(1);
      expect(history[0]?.qualityReport).toEqual(qualityReport);
    });
  });
});
