/**
 * Unit tests for Sliding Window functionality.
 *
 * @module slidingWindow.test
 */

import { describe, expect, it } from "vitest";
import {
  createInitialState,
  DEFAULT_SLIDING_WINDOW_CONFIG,
  getTotalLineCount,
  getVisibleLines,
  type SlidingWindowAction,
  type SlidingWindowConfig,
  type SlidingWindowState,
  shouldFlush,
  slidingWindowReducer,
} from "../slidingWindow.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates an array of test lines.
 */
function createLines(count: number, prefix = "line"): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

/**
 * Creates a test configuration with smaller limits for easier testing.
 */
function createTestConfig(overrides?: Partial<SlidingWindowConfig>): SlidingWindowConfig {
  return {
    liveLimit: 10,
    flushThreshold: 8,
    flushBatchSize: 3,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("slidingWindow", () => {
  describe("createInitialState", () => {
    it("should create empty initial state", () => {
      const state = createInitialState();

      expect(state.flushedLines).toEqual([]);
      expect(state.liveLines).toEqual([]);
      expect(state.totalLines).toBe(0);
      expect(state.flushCount).toBe(0);
      expect(state.isStreaming).toBe(false);
    });
  });

  describe("slidingWindowReducer", () => {
    describe("APPEND_LINES", () => {
      it("should append lines to liveLines", () => {
        const state = createInitialState();
        const config = createTestConfig();
        const action: SlidingWindowAction = {
          type: "APPEND_LINES",
          lines: ["line-0", "line-1", "line-2"],
        };

        const nextState = slidingWindowReducer(state, action, config);

        expect(nextState.liveLines).toEqual(["line-0", "line-1", "line-2"]);
        expect(nextState.totalLines).toBe(3);
        expect(nextState.flushCount).toBe(0);
      });

      it("should handle empty lines array", () => {
        const state = createInitialState();
        const config = createTestConfig();
        const action: SlidingWindowAction = {
          type: "APPEND_LINES",
          lines: [],
        };

        const nextState = slidingWindowReducer(state, action, config);

        // Should return same state (no-op)
        expect(nextState).toBe(state);
        expect(nextState.liveLines).toEqual([]);
        expect(nextState.totalLines).toBe(0);
      });

      it("should accumulate lines from multiple appends", () => {
        const config = createTestConfig();
        let state = createInitialState();

        state = slidingWindowReducer(state, { type: "APPEND_LINES", lines: ["a", "b"] }, config);
        state = slidingWindowReducer(state, { type: "APPEND_LINES", lines: ["c", "d"] }, config);

        expect(state.liveLines).toEqual(["a", "b", "c", "d"]);
        expect(state.totalLines).toBe(4);
      });

      it("should auto-flush when exceeding liveLimit", () => {
        const config = createTestConfig({
          liveLimit: 10,
          flushThreshold: 5,
          flushBatchSize: 3,
        });
        const state = createInitialState();

        // Add 12 lines (exceeds liveLimit of 10)
        // Flush is triggered when shouldFlush=true AND liveLines > liveLimit
        const action: SlidingWindowAction = {
          type: "APPEND_LINES",
          lines: createLines(12),
        };

        const nextState = slidingWindowReducer(state, action, config);

        // Should have flushed lines to get under liveLimit
        expect(nextState.flushedLines.length).toBeGreaterThan(0);
        expect(nextState.liveLines.length).toBeLessThanOrEqual(config.liveLimit);
        expect(nextState.totalLines).toBe(12);
        expect(nextState.flushCount).toBeGreaterThan(0);
      });

      it("should auto-flush multiple times when exceeding liveLimit", () => {
        const config = createTestConfig({
          liveLimit: 10,
          flushThreshold: 5,
          flushBatchSize: 3,
        });
        const state = createInitialState();

        // Add 15 lines (way over liveLimit of 10)
        const action: SlidingWindowAction = {
          type: "APPEND_LINES",
          lines: createLines(15),
        };

        const nextState = slidingWindowReducer(state, action, config);

        // Should have flushed multiple batches
        expect(nextState.liveLines.length).toBeLessThanOrEqual(config.liveLimit);
        expect(nextState.flushedLines.length).toBeGreaterThan(0);
        expect(nextState.totalLines).toBe(15);
        expect(nextState.flushCount).toBeGreaterThan(1);
      });

      it("should preserve line order after flush", () => {
        const config = createTestConfig({
          liveLimit: 6,
          flushThreshold: 4,
          flushBatchSize: 2,
        });
        const state = createInitialState();

        // Add lines
        const lines = ["a", "b", "c", "d", "e", "f"];
        const action: SlidingWindowAction = { type: "APPEND_LINES", lines };

        const nextState = slidingWindowReducer(state, action, config);

        // Combined lines should preserve order
        const allLines = [...nextState.flushedLines, ...nextState.liveLines];
        expect(allLines).toEqual(lines);
      });
    });

    describe("FLUSH_STABLE", () => {
      it("should move lines from liveLines to flushedLines", () => {
        const config = createTestConfig({
          liveLimit: 10,
          flushThreshold: 5,
          flushBatchSize: 3,
        });

        // Create state with 6 live lines (above threshold)
        const initialState: SlidingWindowState = {
          flushedLines: [],
          liveLines: createLines(6),
          totalLines: 6,
          flushCount: 0,
          isStreaming: false,
        };

        const nextState = slidingWindowReducer(initialState, { type: "FLUSH_STABLE" }, config);

        expect(nextState.flushedLines).toEqual(["line-0", "line-1", "line-2"]);
        expect(nextState.liveLines).toEqual(["line-3", "line-4", "line-5"]);
        expect(nextState.flushCount).toBe(1);
      });

      it("should respect flushBatchSize", () => {
        const config = createTestConfig({
          liveLimit: 20,
          flushThreshold: 10,
          flushBatchSize: 5,
        });

        const initialState: SlidingWindowState = {
          flushedLines: [],
          liveLines: createLines(12),
          totalLines: 12,
          flushCount: 0,
          isStreaming: false,
        };

        const nextState = slidingWindowReducer(initialState, { type: "FLUSH_STABLE" }, config);

        // Should flush exactly flushBatchSize lines
        expect(nextState.flushedLines.length).toBe(5);
        expect(nextState.liveLines.length).toBe(7);
      });

      it("should increment flushCount", () => {
        const config = createTestConfig({
          liveLimit: 10,
          flushThreshold: 5,
          flushBatchSize: 2,
        });

        let state: SlidingWindowState = {
          flushedLines: [],
          liveLines: createLines(8),
          totalLines: 8,
          flushCount: 0,
          isStreaming: false,
        };

        state = slidingWindowReducer(state, { type: "FLUSH_STABLE" }, config);
        expect(state.flushCount).toBe(1);

        state = slidingWindowReducer(state, { type: "FLUSH_STABLE" }, config);
        expect(state.flushCount).toBe(2);
      });

      it("should not flush when under threshold", () => {
        const config = createTestConfig({
          liveLimit: 10,
          flushThreshold: 5,
          flushBatchSize: 2,
        });

        const initialState: SlidingWindowState = {
          flushedLines: [],
          liveLines: createLines(3), // Below threshold
          totalLines: 3,
          flushCount: 0,
          isStreaming: false,
        };

        const nextState = slidingWindowReducer(initialState, { type: "FLUSH_STABLE" }, config);

        // Should return same state
        expect(nextState).toBe(initialState);
        expect(nextState.flushedLines).toEqual([]);
        expect(nextState.liveLines.length).toBe(3);
      });

      it("should preserve totalLines after flush", () => {
        const config = createTestConfig({
          liveLimit: 10,
          flushThreshold: 5,
          flushBatchSize: 3,
        });

        const initialState: SlidingWindowState = {
          flushedLines: ["old-1", "old-2"],
          liveLines: createLines(6),
          totalLines: 8,
          flushCount: 1,
          isStreaming: false,
        };

        const nextState = slidingWindowReducer(initialState, { type: "FLUSH_STABLE" }, config);

        expect(nextState.totalLines).toBe(8);
      });
    });

    describe("RESET", () => {
      it("should reset to initial state", () => {
        const state: SlidingWindowState = {
          flushedLines: ["a", "b", "c"],
          liveLines: ["d", "e", "f"],
          totalLines: 6,
          flushCount: 3,
          isStreaming: true,
        };

        const nextState = slidingWindowReducer(state, { type: "RESET" });

        expect(nextState.flushedLines).toEqual([]);
        expect(nextState.liveLines).toEqual([]);
        expect(nextState.totalLines).toBe(0);
        expect(nextState.flushCount).toBe(0);
        expect(nextState.isStreaming).toBe(false);
      });

      it("should handle reset on empty state", () => {
        const state = createInitialState();
        const nextState = slidingWindowReducer(state, { type: "RESET" });

        expect(nextState.flushedLines).toEqual([]);
        expect(nextState.liveLines).toEqual([]);
        expect(nextState.totalLines).toBe(0);
      });
    });

    describe("SET_STREAMING", () => {
      it("should update streaming state to true", () => {
        const state = createInitialState();
        const nextState = slidingWindowReducer(state, {
          type: "SET_STREAMING",
          isStreaming: true,
        });

        expect(nextState.isStreaming).toBe(true);
      });

      it("should update streaming state to false", () => {
        const state: SlidingWindowState = {
          ...createInitialState(),
          isStreaming: true,
        };

        const nextState = slidingWindowReducer(state, {
          type: "SET_STREAMING",
          isStreaming: false,
        });

        expect(nextState.isStreaming).toBe(false);
      });

      it("should return same state when value unchanged", () => {
        const state: SlidingWindowState = {
          ...createInitialState(),
          isStreaming: true,
        };

        const nextState = slidingWindowReducer(state, {
          type: "SET_STREAMING",
          isStreaming: true,
        });

        // Should return same reference
        expect(nextState).toBe(state);
      });

      it("should not affect other state properties", () => {
        const state: SlidingWindowState = {
          flushedLines: ["a", "b"],
          liveLines: ["c", "d"],
          totalLines: 4,
          flushCount: 1,
          isStreaming: false,
        };

        const nextState = slidingWindowReducer(state, {
          type: "SET_STREAMING",
          isStreaming: true,
        });

        expect(nextState.flushedLines).toEqual(["a", "b"]);
        expect(nextState.liveLines).toEqual(["c", "d"]);
        expect(nextState.totalLines).toBe(4);
        expect(nextState.flushCount).toBe(1);
      });
    });
  });

  describe("shouldFlush", () => {
    it("should return true when liveLines exceed threshold", () => {
      const config = createTestConfig({ flushThreshold: 5 });
      const state: SlidingWindowState = {
        ...createInitialState(),
        liveLines: createLines(6),
      };

      expect(shouldFlush(state, config)).toBe(true);
    });

    it("should return true when liveLines equal threshold", () => {
      const config = createTestConfig({ flushThreshold: 5 });
      const state: SlidingWindowState = {
        ...createInitialState(),
        liveLines: createLines(5),
      };

      expect(shouldFlush(state, config)).toBe(true);
    });

    it("should return false when under threshold", () => {
      const config = createTestConfig({ flushThreshold: 5 });
      const state: SlidingWindowState = {
        ...createInitialState(),
        liveLines: createLines(4),
      };

      expect(shouldFlush(state, config)).toBe(false);
    });

    it("should return false for empty liveLines", () => {
      const config = createTestConfig({ flushThreshold: 5 });
      const state = createInitialState();

      expect(shouldFlush(state, config)).toBe(false);
    });

    it("should use default config when not provided", () => {
      const state: SlidingWindowState = {
        ...createInitialState(),
        liveLines: createLines(DEFAULT_SLIDING_WINDOW_CONFIG.flushThreshold),
      };

      expect(shouldFlush(state)).toBe(true);
    });
  });

  describe("getVisibleLines", () => {
    it("should return empty array for initial state", () => {
      const state = createInitialState();
      expect(getVisibleLines(state)).toEqual([]);
    });

    it("should return liveLines when no flushed lines", () => {
      const state: SlidingWindowState = {
        ...createInitialState(),
        liveLines: ["a", "b", "c"],
      };

      expect(getVisibleLines(state)).toEqual(["a", "b", "c"]);
    });

    it("should return flushedLines when no live lines", () => {
      const state: SlidingWindowState = {
        ...createInitialState(),
        flushedLines: ["a", "b", "c"],
      };

      expect(getVisibleLines(state)).toEqual(["a", "b", "c"]);
    });

    it("should combine flushed and live lines in correct order", () => {
      const state: SlidingWindowState = {
        ...createInitialState(),
        flushedLines: ["a", "b"],
        liveLines: ["c", "d"],
      };

      expect(getVisibleLines(state)).toEqual(["a", "b", "c", "d"]);
    });

    it("should return new array instance", () => {
      const state: SlidingWindowState = {
        ...createInitialState(),
        flushedLines: ["a"],
        liveLines: ["b"],
      };

      const result1 = getVisibleLines(state);
      const result2 = getVisibleLines(state);

      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });
  });

  describe("getTotalLineCount", () => {
    it("should return 0 for initial state", () => {
      const state = createInitialState();
      expect(getTotalLineCount(state)).toBe(0);
    });

    it("should return totalLines from state", () => {
      const state: SlidingWindowState = {
        ...createInitialState(),
        totalLines: 42,
      };

      expect(getTotalLineCount(state)).toBe(42);
    });

    it("should reflect actual line count after operations", () => {
      const config = createTestConfig();
      let state = createInitialState();

      state = slidingWindowReducer(state, { type: "APPEND_LINES", lines: createLines(5) }, config);
      expect(getTotalLineCount(state)).toBe(5);

      state = slidingWindowReducer(state, { type: "APPEND_LINES", lines: createLines(3) }, config);
      expect(getTotalLineCount(state)).toBe(8);
    });
  });

  describe("DEFAULT_SLIDING_WINDOW_CONFIG", () => {
    it("should have expected default values", () => {
      expect(DEFAULT_SLIDING_WINDOW_CONFIG.liveLimit).toBe(500);
      expect(DEFAULT_SLIDING_WINDOW_CONFIG.flushThreshold).toBe(400);
      expect(DEFAULT_SLIDING_WINDOW_CONFIG.flushBatchSize).toBe(100);
    });

    it("should have flushThreshold less than liveLimit", () => {
      expect(DEFAULT_SLIDING_WINDOW_CONFIG.flushThreshold).toBeLessThan(
        DEFAULT_SLIDING_WINDOW_CONFIG.liveLimit
      );
    });

    it("should have flushBatchSize less than flushThreshold", () => {
      expect(DEFAULT_SLIDING_WINDOW_CONFIG.flushBatchSize).toBeLessThan(
        DEFAULT_SLIDING_WINDOW_CONFIG.flushThreshold
      );
    });
  });

  describe("edge cases", () => {
    it("should handle single line append", () => {
      const config = createTestConfig();
      const state = createInitialState();

      const nextState = slidingWindowReducer(
        state,
        { type: "APPEND_LINES", lines: ["single"] },
        config
      );

      expect(nextState.liveLines).toEqual(["single"]);
      expect(nextState.totalLines).toBe(1);
    });

    it("should handle very large batch append", () => {
      const config = createTestConfig({
        liveLimit: 100,
        flushThreshold: 80,
        flushBatchSize: 30,
      });
      const state = createInitialState();

      const nextState = slidingWindowReducer(
        state,
        { type: "APPEND_LINES", lines: createLines(500) },
        config
      );

      expect(nextState.totalLines).toBe(500);
      expect(nextState.liveLines.length).toBeLessThanOrEqual(config.liveLimit);
      expect(nextState.flushedLines.length).toBeGreaterThan(0);
    });

    it("should handle lines with special characters", () => {
      const config = createTestConfig();
      const state = createInitialState();
      const specialLines = ["line\twith\ttabs", "line\nwith\nnewlines", "特殊字符", "🎉 emoji"];

      const nextState = slidingWindowReducer(
        state,
        { type: "APPEND_LINES", lines: specialLines },
        config
      );

      expect(nextState.liveLines).toEqual(specialLines);
    });

    it("should handle empty string lines", () => {
      const config = createTestConfig();
      const state = createInitialState();

      const nextState = slidingWindowReducer(
        state,
        { type: "APPEND_LINES", lines: ["", "", ""] },
        config
      );

      expect(nextState.liveLines).toEqual(["", "", ""]);
      expect(nextState.totalLines).toBe(3);
    });

    it("should maintain state immutability", () => {
      const config = createTestConfig();
      const state = createInitialState();
      const originalLiveLines = state.liveLines;
      const originalFlushedLines = state.flushedLines;

      slidingWindowReducer(state, { type: "APPEND_LINES", lines: ["new"] }, config);

      // Original state should be unchanged
      expect(state.liveLines).toBe(originalLiveLines);
      expect(state.flushedLines).toBe(originalFlushedLines);
      expect(state.totalLines).toBe(0);
    });

    it("should handle repeated flush operations", () => {
      const config = createTestConfig({
        liveLimit: 10,
        flushThreshold: 4,
        flushBatchSize: 2,
      });

      let state: SlidingWindowState = {
        flushedLines: [],
        liveLines: createLines(10),
        totalLines: 10,
        flushCount: 0,
        isStreaming: false,
      };

      // Perform multiple flushes
      for (let i = 0; i < 3; i++) {
        state = slidingWindowReducer(state, { type: "FLUSH_STABLE" }, config);
      }

      expect(state.flushCount).toBe(3);
      expect(state.flushedLines.length).toBe(6);
      expect(state.liveLines.length).toBe(4);
      expect(state.totalLines).toBe(10);
    });
  });
});
