/**
 * Unit tests for Block Sums data structure
 *
 * Tests O(n/BLOCK_SIZE + BLOCK_SIZE) prefix sum queries implementation.
 */

import { describe, expect, it } from "vitest";
import {
  appendHeights,
  batchUpdateHeights,
  computeAnchorDelta,
  createBlockSums,
  getHeight,
  prefixSum,
  removeFromStart,
  updateHeight,
} from "./blockSums.js";

// Internal constant (not exported from module)
const BLOCK_SIZE = 32;

describe("blockSums", () => {
  // ==========================================================================
  // createBlockSums
  // ==========================================================================
  describe("createBlockSums", () => {
    it("should create empty state with no initial heights", () => {
      const state = createBlockSums();
      expect(state.heights).toEqual([]);
      expect(state.blockSums).toEqual([]);
      expect(state.totalHeight).toBe(0);
    });

    it("should create empty state with undefined argument", () => {
      const state = createBlockSums(undefined);
      expect(state.heights).toEqual([]);
      expect(state.totalHeight).toBe(0);
    });

    it("should create empty state with empty array", () => {
      const state = createBlockSums([]);
      expect(state.heights).toEqual([]);
      expect(state.blockSums).toEqual([]);
      expect(state.totalHeight).toBe(0);
    });

    it("should initialize with given heights", () => {
      const heights = [10, 20, 30];
      const state = createBlockSums(heights);
      expect(state.heights).toEqual(heights);
      expect(state.totalHeight).toBe(60);
    });

    it("should compute correct blockSums for single block", () => {
      const heights = [10, 20, 30];
      const state = createBlockSums(heights);
      expect(state.blockSums).toHaveLength(1);
      expect(state.blockSums[0]).toBe(60);
    });

    it("should compute correct blockSums for exactly one full block", () => {
      const heights = Array.from({ length: BLOCK_SIZE }, () => 5);
      const state = createBlockSums(heights);
      expect(state.blockSums).toHaveLength(1);
      expect(state.blockSums[0]).toBe(BLOCK_SIZE * 5);
      expect(state.totalHeight).toBe(BLOCK_SIZE * 5);
    });

    it("should compute correct blockSums for multiple blocks", () => {
      // Create array longer than BLOCK_SIZE
      const heights = Array.from({ length: BLOCK_SIZE + 5 }, (_, i) => i + 1);
      const state = createBlockSums(heights);

      // Should have 2 blocks
      expect(state.blockSums).toHaveLength(2);

      // First block sum should be sum of 1..BLOCK_SIZE
      const expectedFirstBlockSum = (BLOCK_SIZE * (BLOCK_SIZE + 1)) / 2;
      expect(state.blockSums[0]).toBe(expectedFirstBlockSum);

      // Second block sum should be sum of (BLOCK_SIZE+1)..(BLOCK_SIZE+5)
      const expectedSecondBlockSum =
        BLOCK_SIZE + 1 + (BLOCK_SIZE + 2) + (BLOCK_SIZE + 3) + (BLOCK_SIZE + 4) + (BLOCK_SIZE + 5);
      expect(state.blockSums[1]).toBe(expectedSecondBlockSum);
    });

    it("should compute correct totalHeight for multiple blocks", () => {
      const heights = Array.from({ length: BLOCK_SIZE * 2 + 10 }, () => 3);
      const state = createBlockSums(heights);
      expect(state.totalHeight).toBe((BLOCK_SIZE * 2 + 10) * 3);
    });

    it("should not mutate input array", () => {
      const original = [10, 20, 30];
      const copy = [...original];
      createBlockSums(original);
      expect(original).toEqual(copy);
    });
  });

  // ==========================================================================
  // updateHeight
  // ==========================================================================
  describe("updateHeight", () => {
    it("should update height at given index", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, 1, 25);

      expect(newState.heights[1]).toBe(25);
      expect(newState.totalHeight).toBe(65); // 10 + 25 + 30
    });

    it("should preserve other heights unchanged", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, 1, 25);

      expect(newState.heights[0]).toBe(10);
      expect(newState.heights[2]).toBe(30);
    });

    it("should return same reference when value unchanged", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, 1, 20);

      expect(newState).toBe(state); // Same reference
    });

    it("should handle index 0", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, 0, 15);

      expect(newState.heights[0]).toBe(15);
      expect(newState.totalHeight).toBe(65); // 15 + 20 + 30
    });

    it("should handle last index", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, 2, 50);

      expect(newState.heights[2]).toBe(50);
      expect(newState.totalHeight).toBe(80); // 10 + 20 + 50
    });

    it("should return same reference for negative index", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, -1, 50);

      expect(newState).toBe(state);
    });

    it("should return same reference for index >= length", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, 3, 50);

      expect(newState).toBe(state);
    });

    it("should return same reference for very large out of bounds index", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, 100, 50);

      expect(newState).toBe(state);
    });

    it("should update blockSums correctly when height changes", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, 1, 25);

      expect(newState.blockSums[0]).toBe(65); // Updated block sum
    });

    it("should update blockSums correctly across block boundary", () => {
      // Create state with items in two blocks
      const heights = Array.from({ length: BLOCK_SIZE + 5 }, () => 10);
      const state = createBlockSums(heights);

      // Update item in second block
      const newState = updateHeight(state, BLOCK_SIZE + 2, 20);

      // First block should be unchanged
      expect(newState.blockSums[0]).toBe(BLOCK_SIZE * 10);
      // Second block should reflect the change
      expect(newState.blockSums[1]).toBe(5 * 10 + 10); // 4 items at 10 + 1 item at 20
    });

    it("should handle height decrease", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, 1, 5);

      expect(newState.heights[1]).toBe(5);
      expect(newState.totalHeight).toBe(45); // 10 + 5 + 30
    });

    it("should handle setting height to 0", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = updateHeight(state, 1, 0);

      expect(newState.heights[1]).toBe(0);
      expect(newState.totalHeight).toBe(40); // 10 + 0 + 30
    });
  });

  // ==========================================================================
  // batchUpdateHeights
  // ==========================================================================
  describe("batchUpdateHeights", () => {
    it("should update multiple heights efficiently", () => {
      const state = createBlockSums([10, 20, 30, 40]);
      const newState = batchUpdateHeights(state, [
        { index: 0, height: 15 },
        { index: 2, height: 35 },
      ]);

      expect(newState.heights).toEqual([15, 20, 35, 40]);
      expect(newState.totalHeight).toBe(110); // 15 + 20 + 35 + 40
    });

    it("should return same reference for empty updates array", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = batchUpdateHeights(state, []);

      expect(newState).toBe(state);
    });

    it("should return same reference when all updates have no effect", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = batchUpdateHeights(state, [
        { index: 1, height: 20 }, // Same as existing
      ]);

      expect(newState).toBe(state);
    });

    it("should filter out invalid indices", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = batchUpdateHeights(state, [
        { index: -1, height: 100 },
        { index: 1, height: 25 },
        { index: 100, height: 200 },
      ]);

      expect(newState.heights).toEqual([10, 25, 30]);
      expect(newState.totalHeight).toBe(65);
    });

    it("should handle updates to same index (last wins)", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = batchUpdateHeights(state, [
        { index: 1, height: 25 },
        { index: 1, height: 35 },
      ]);

      expect(newState.heights[1]).toBe(35);
    });

    it("should update multiple blocks correctly", () => {
      const heights = Array.from({ length: BLOCK_SIZE * 2 }, () => 10);
      const state = createBlockSums(heights);

      const newState = batchUpdateHeights(state, [
        { index: 0, height: 20 },
        { index: BLOCK_SIZE, height: 30 },
      ]);

      // First block: one item changed from 10 to 20
      expect(newState.blockSums[0]).toBe(BLOCK_SIZE * 10 + 10);
      // Second block: one item changed from 10 to 30
      expect(newState.blockSums[1]).toBe(BLOCK_SIZE * 10 + 20);
    });

    it("should accumulate deltas within same block", () => {
      const state = createBlockSums([10, 20, 30, 40]);
      const newState = batchUpdateHeights(state, [
        { index: 0, height: 15 }, // +5
        { index: 1, height: 25 }, // +5
        { index: 2, height: 35 }, // +5
      ]);

      expect(newState.totalHeight).toBe(115); // 15 + 25 + 35 + 40
    });

    it("should return same reference when only invalid updates provided", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = batchUpdateHeights(state, [
        { index: -1, height: 100 },
        { index: 100, height: 200 },
      ]);

      expect(newState).toBe(state);
    });
  });

  // ==========================================================================
  // appendHeights
  // ==========================================================================
  describe("appendHeights", () => {
    it("should append new heights", () => {
      const state = createBlockSums([10, 20]);
      const newState = appendHeights(state, [30, 40]);

      expect(newState.heights).toEqual([10, 20, 30, 40]);
      expect(newState.totalHeight).toBe(100);
    });

    it("should return same reference for empty append", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = appendHeights(state, []);

      expect(newState).toBe(state);
    });

    it("should work on empty state", () => {
      const state = createBlockSums();
      const newState = appendHeights(state, [10, 20, 30]);

      expect(newState.heights).toEqual([10, 20, 30]);
      expect(newState.totalHeight).toBe(60);
    });

    it("should update blockSums correctly when staying in same block", () => {
      const state = createBlockSums([10, 20]);
      const newState = appendHeights(state, [30]);

      expect(newState.blockSums).toHaveLength(1);
      expect(newState.blockSums[0]).toBe(60);
    });

    it("should create new block when crossing boundary", () => {
      const heights = Array.from({ length: BLOCK_SIZE - 1 }, () => 5);
      const state = createBlockSums(heights);

      // Append enough to cross into new block
      const newState = appendHeights(state, [10, 20, 30]);

      expect(newState.blockSums).toHaveLength(2);
      // First block: (BLOCK_SIZE - 1) * 5 + 10 = BLOCK_SIZE items
      expect(newState.heights).toHaveLength(BLOCK_SIZE + 2);
    });

    it("should handle appending to exactly full block", () => {
      const heights = Array.from({ length: BLOCK_SIZE }, () => 5);
      const state = createBlockSums(heights);

      const newState = appendHeights(state, [10, 20]);

      expect(newState.blockSums).toHaveLength(2);
      expect(newState.blockSums[0]).toBe(BLOCK_SIZE * 5);
      expect(newState.blockSums[1]).toBe(30); // 10 + 20
    });

    it("should preserve original state immutably", () => {
      const state = createBlockSums([10, 20]);
      const newState = appendHeights(state, [30]);

      expect(state.heights).toEqual([10, 20]);
      expect(state.totalHeight).toBe(30);
      expect(newState.heights).toEqual([10, 20, 30]);
    });
  });

  // ==========================================================================
  // removeFromStart
  // ==========================================================================
  describe("removeFromStart", () => {
    it("should remove elements from beginning", () => {
      const state = createBlockSums([10, 20, 30, 40]);
      const newState = removeFromStart(state, 2);

      expect(newState.heights).toEqual([30, 40]);
      expect(newState.totalHeight).toBe(70);
    });

    it("should return same reference for count <= 0", () => {
      const state = createBlockSums([10, 20, 30]);
      expect(removeFromStart(state, 0)).toBe(state);
      expect(removeFromStart(state, -1)).toBe(state);
      expect(removeFromStart(state, -100)).toBe(state);
    });

    it("should return empty state when removing all", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = removeFromStart(state, 3);

      expect(newState.heights).toEqual([]);
      expect(newState.blockSums).toEqual([]);
      expect(newState.totalHeight).toBe(0);
    });

    it("should return empty state when removing more than length", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = removeFromStart(state, 100);

      expect(newState.heights).toEqual([]);
      expect(newState.totalHeight).toBe(0);
    });

    it("should rebuild blockSums after removal", () => {
      const heights = Array.from({ length: BLOCK_SIZE + 10 }, () => 5);
      const state = createBlockSums(heights);

      // Remove items to change block structure
      const newState = removeFromStart(state, 5);

      expect(newState.heights).toHaveLength(BLOCK_SIZE + 5);
      // BlockSums should be rebuilt correctly
      expect(newState.blockSums).toHaveLength(2);
    });

    it("should preserve original state immutably", () => {
      const state = createBlockSums([10, 20, 30, 40]);
      const newState = removeFromStart(state, 2);

      expect(state.heights).toEqual([10, 20, 30, 40]);
      expect(state.totalHeight).toBe(100);
      expect(newState.heights).toEqual([30, 40]);
    });

    it("should remove single element", () => {
      const state = createBlockSums([10, 20, 30]);
      const newState = removeFromStart(state, 1);

      expect(newState.heights).toEqual([20, 30]);
      expect(newState.totalHeight).toBe(50);
    });
  });

  // ==========================================================================
  // prefixSum
  // ==========================================================================
  describe("prefixSum", () => {
    it("should return 0 for index 0", () => {
      const state = createBlockSums([10, 20, 30]);
      expect(prefixSum(state, 0)).toBe(0);
    });

    it("should return 0 for negative index", () => {
      const state = createBlockSums([10, 20, 30]);
      expect(prefixSum(state, -1)).toBe(0);
      expect(prefixSum(state, -100)).toBe(0);
    });

    it("should return sum of all heights before index", () => {
      const state = createBlockSums([10, 20, 30, 40]);
      expect(prefixSum(state, 1)).toBe(10);
      expect(prefixSum(state, 2)).toBe(30); // 10 + 20
      expect(prefixSum(state, 3)).toBe(60); // 10 + 20 + 30
      expect(prefixSum(state, 4)).toBe(100); // 10 + 20 + 30 + 40
    });

    it("should clamp to totalHeight for index >= length", () => {
      const state = createBlockSums([10, 20, 30]);
      expect(prefixSum(state, 3)).toBe(60);
      expect(prefixSum(state, 4)).toBe(60);
      expect(prefixSum(state, 100)).toBe(60);
    });

    it("should work on empty state", () => {
      const state = createBlockSums();
      expect(prefixSum(state, 0)).toBe(0);
      expect(prefixSum(state, 1)).toBe(0);
    });

    it("should work across block boundaries", () => {
      const heights = Array.from({ length: BLOCK_SIZE + 10 }, () => 5);
      const state = createBlockSums(heights);

      // Index at block boundary
      expect(prefixSum(state, BLOCK_SIZE)).toBe(BLOCK_SIZE * 5);

      // Index past block boundary
      expect(prefixSum(state, BLOCK_SIZE + 5)).toBe((BLOCK_SIZE + 5) * 5);
    });

    it("should use blockSums for full blocks efficiently", () => {
      // Create state with exactly 2 full blocks
      const heights = Array.from({ length: BLOCK_SIZE * 2 }, (_, i) => i + 1);
      const state = createBlockSums(heights);

      // Query at second block boundary should use first blockSum
      const expectedSum = (BLOCK_SIZE * (BLOCK_SIZE + 1)) / 2;
      expect(prefixSum(state, BLOCK_SIZE)).toBe(expectedSum);
    });

    it("should handle single element", () => {
      const state = createBlockSums([42]);
      expect(prefixSum(state, 0)).toBe(0);
      expect(prefixSum(state, 1)).toBe(42);
    });
  });

  // ==========================================================================
  // getHeight
  // ==========================================================================
  describe("getHeight", () => {
    it("should return height at valid index", () => {
      const state = createBlockSums([10, 20, 30]);
      expect(getHeight(state, 0)).toBe(10);
      expect(getHeight(state, 1)).toBe(20);
      expect(getHeight(state, 2)).toBe(30);
    });

    it("should return 0 for negative index", () => {
      const state = createBlockSums([10, 20, 30]);
      expect(getHeight(state, -1)).toBe(0);
      expect(getHeight(state, -100)).toBe(0);
    });

    it("should return 0 for index >= length", () => {
      const state = createBlockSums([10, 20, 30]);
      expect(getHeight(state, 3)).toBe(0);
      expect(getHeight(state, 100)).toBe(0);
    });

    it("should return 0 for empty state", () => {
      const state = createBlockSums();
      expect(getHeight(state, 0)).toBe(0);
      expect(getHeight(state, 1)).toBe(0);
    });
  });

  // ==========================================================================
  // computeAnchorDelta
  // ==========================================================================
  describe("computeAnchorDelta", () => {
    it("should compute correct delta when height increases before anchor", () => {
      const state = createBlockSums([10, 20, 30]);
      const oldPrefix = prefixSum(state, 2); // 30

      const newState = updateHeight(state, 0, 15); // Increase first item by 5
      const delta = computeAnchorDelta(newState, oldPrefix, 2);

      expect(delta).toBe(5); // Height increased by 5 before anchor
    });

    it("should compute correct delta when height decreases before anchor", () => {
      const state = createBlockSums([10, 20, 30]);
      const oldPrefix = prefixSum(state, 2); // 30

      const newState = updateHeight(state, 0, 5); // Decrease first item by 5
      const delta = computeAnchorDelta(newState, oldPrefix, 2);

      expect(delta).toBe(-5); // Height decreased by 5 before anchor
    });

    it("should return 0 when height after anchor changes", () => {
      const state = createBlockSums([10, 20, 30]);
      const oldPrefix = prefixSum(state, 1); // 10

      const newState = updateHeight(state, 2, 50); // Change after anchor
      const delta = computeAnchorDelta(newState, oldPrefix, 1);

      expect(delta).toBe(0); // No change before anchor
    });

    it("should return 0 when height at anchor changes", () => {
      const state = createBlockSums([10, 20, 30]);
      const oldPrefix = prefixSum(state, 1); // 10

      const newState = updateHeight(state, 1, 50); // Change at anchor
      const delta = computeAnchorDelta(newState, oldPrefix, 1);

      expect(delta).toBe(0); // Prefix doesn't include anchor itself
    });

    it("should work with anchor at index 0", () => {
      const state = createBlockSums([10, 20, 30]);
      const oldPrefix = prefixSum(state, 0); // 0

      const newState = updateHeight(state, 1, 50);
      const delta = computeAnchorDelta(newState, oldPrefix, 0);

      expect(delta).toBe(0); // Nothing before index 0
    });

    it("should work with anchor at end", () => {
      const state = createBlockSums([10, 20, 30]);
      const oldPrefix = prefixSum(state, 3); // 60

      const newState = updateHeight(state, 0, 15); // +5
      const delta = computeAnchorDelta(newState, oldPrefix, 3);

      expect(delta).toBe(5);
    });

    it("should handle multiple height changes", () => {
      const state = createBlockSums([10, 20, 30, 40]);
      const oldPrefix = prefixSum(state, 3); // 60

      const newState = batchUpdateHeights(state, [
        { index: 0, height: 15 }, // +5
        { index: 1, height: 25 }, // +5
      ]);
      const delta = computeAnchorDelta(newState, oldPrefix, 3);

      expect(delta).toBe(10); // Combined +10 before anchor
    });

    it("should work across block boundaries", () => {
      const heights = Array.from({ length: BLOCK_SIZE + 10 }, () => 10);
      const state = createBlockSums(heights);
      const anchorIndex = BLOCK_SIZE + 5;
      const oldPrefix = prefixSum(state, anchorIndex);

      // Update item in first block
      const newState = updateHeight(state, 5, 20); // +10
      const delta = computeAnchorDelta(newState, oldPrefix, anchorIndex);

      expect(delta).toBe(10);
    });
  });

  // ==========================================================================
  // Integration tests
  // ==========================================================================
  describe("integration", () => {
    it("should maintain consistency through series of operations", () => {
      let state = createBlockSums([10, 20, 30]);

      // Update
      state = updateHeight(state, 1, 25);
      expect(state.totalHeight).toBe(65);
      expect(prefixSum(state, 3)).toBe(65);

      // Append
      state = appendHeights(state, [40, 50]);
      expect(state.totalHeight).toBe(155);
      expect(state.heights).toEqual([10, 25, 30, 40, 50]);

      // Remove from start
      state = removeFromStart(state, 1);
      expect(state.totalHeight).toBe(145);
      expect(state.heights).toEqual([25, 30, 40, 50]);

      // Verify prefixSum still works
      expect(prefixSum(state, 0)).toBe(0);
      expect(prefixSum(state, 2)).toBe(55);
      expect(prefixSum(state, 4)).toBe(145);
    });

    it("should handle large arrays efficiently", () => {
      const size = BLOCK_SIZE * 10 + 17; // Multiple blocks plus partial
      const heights = Array.from({ length: size }, (_, i) => (i % 50) + 1);
      const state = createBlockSums(heights);

      // Verify structure
      expect(state.heights).toHaveLength(size);
      expect(state.blockSums).toHaveLength(Math.ceil(size / BLOCK_SIZE));

      // Verify totalHeight matches sum of heights
      const expectedTotal = heights.reduce((a, b) => a + b, 0);
      expect(state.totalHeight).toBe(expectedTotal);

      // Verify prefixSum at end equals totalHeight
      expect(prefixSum(state, size)).toBe(expectedTotal);

      // Verify random mid-point
      const midpoint = Math.floor(size / 2);
      const expectedMidPrefix = heights.slice(0, midpoint).reduce((a, b) => a + b, 0);
      expect(prefixSum(state, midpoint)).toBe(expectedMidPrefix);
    });

    it("should preserve immutability through operations", () => {
      const original = createBlockSums([10, 20, 30]);
      const originalHeights = [...original.heights];
      const originalBlockSums = [...original.blockSums];
      const originalTotal = original.totalHeight;

      // Perform various operations
      updateHeight(original, 1, 100);
      batchUpdateHeights(original, [{ index: 0, height: 50 }]);
      appendHeights(original, [40, 50]);
      removeFromStart(original, 1);

      // Original should be unchanged
      expect(original.heights).toEqual(originalHeights);
      expect(original.blockSums).toEqual(originalBlockSums);
      expect(original.totalHeight).toBe(originalTotal);
    });
  });
});
