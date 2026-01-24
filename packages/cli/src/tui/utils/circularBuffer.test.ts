/**
 * Circular Buffer Unit Tests
 *
 * Tests for immutable circular buffer data structure with FIFO eviction.
 *
 * Note: useCircularBuffer hook tests are excluded as they require
 * ink-testing-library setup. The hook is a thin wrapper around the
 * core buffer functions which are thoroughly tested here.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CircularBuffer,
  createCircularBuffer,
  createMessageBuffer,
  MESSAGE_BUFFER_DEFAULTS,
} from "./circularBuffer.js";

describe("circularBuffer", () => {
  // ============================================================================
  // createCircularBuffer - Factory Function
  // ============================================================================

  describe("createCircularBuffer", () => {
    it("should create empty buffer with given maxSize", () => {
      const buffer = createCircularBuffer({ maxSize: 10 });

      expect(buffer.size).toBe(0);
      expect(buffer.maxSize).toBe(10);
      expect(buffer.isEmpty).toBe(true);
      expect(buffer.isFull).toBe(false);
    });

    it("should create buffer with maxSize of 1", () => {
      const buffer = createCircularBuffer({ maxSize: 1 });

      expect(buffer.maxSize).toBe(1);
      expect(buffer.isEmpty).toBe(true);
    });

    it("should create buffer with large maxSize", () => {
      const buffer = createCircularBuffer({ maxSize: 10000 });

      expect(buffer.maxSize).toBe(10000);
      expect(buffer.isEmpty).toBe(true);
    });
  });

  // ============================================================================
  // push - Single Element Addition
  // ============================================================================

  describe("push", () => {
    it("should add element and return new instance (immutability)", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 10 });
      const newBuffer = buffer.push(1);

      // Immutability check
      expect(newBuffer).not.toBe(buffer);
      expect(buffer.size).toBe(0); // Original unchanged
      expect(newBuffer.size).toBe(1);
      expect(newBuffer.first()).toBe(1);
    });

    it("should add multiple elements sequentially", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 10 });
      const result = buffer.push(1).push(2).push(3);

      expect(result.size).toBe(3);
      expect(result.toArray()).toEqual([1, 2, 3]);
    });

    it("should update isEmpty and isFull flags correctly", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 2 });

      const one = buffer.push(1);
      expect(one.isEmpty).toBe(false);
      expect(one.isFull).toBe(false);

      const two = one.push(2);
      expect(two.isEmpty).toBe(false);
      expect(two.isFull).toBe(true);
    });

    it("should evict oldest when full (FIFO)", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 3 });
      const filled = buffer.push(1).push(2).push(3);

      expect(filled.isFull).toBe(true);
      expect(filled.size).toBe(3);

      const overflowed = filled.push(4);
      expect(overflowed.size).toBe(3);
      expect(overflowed.first()).toBe(2); // 1 was evicted
      expect(overflowed.last()).toBe(4);
      expect(overflowed.toArray()).toEqual([2, 3, 4]);
    });

    it("should handle push on buffer with maxSize 1", () => {
      const buffer = createCircularBuffer<string>({ maxSize: 1 });

      const one = buffer.push("a");
      expect(one.toArray()).toEqual(["a"]);

      const two = one.push("b");
      expect(two.toArray()).toEqual(["b"]);
      expect(two.size).toBe(1);
    });

    it("should handle various data types", () => {
      // Objects
      const objBuffer = createCircularBuffer<{ id: number }>({ maxSize: 3 });
      const withObj = objBuffer.push({ id: 1 }).push({ id: 2 });
      expect(withObj.first()).toEqual({ id: 1 });

      // Strings
      const strBuffer = createCircularBuffer<string>({ maxSize: 3 });
      const withStr = strBuffer.push("hello").push("world");
      expect(withStr.toArray()).toEqual(["hello", "world"]);

      // Mixed (via union type)
      const mixedBuffer = createCircularBuffer<string | number>({ maxSize: 3 });
      const withMixed = mixedBuffer.push(1).push("two");
      expect(withMixed.toArray()).toEqual([1, "two"]);
    });
  });

  // ============================================================================
  // pushMany - Batch Addition
  // ============================================================================

  describe("pushMany", () => {
    it("should add multiple elements at once", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 10 });
      const result = buffer.pushMany([1, 2, 3, 4, 5]);

      expect(result.size).toBe(5);
      expect(result.toArray()).toEqual([1, 2, 3, 4, 5]);
    });

    it("should return new instance (immutability)", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 10 });
      const newBuffer = buffer.pushMany([1, 2, 3]);

      expect(newBuffer).not.toBe(buffer);
      expect(buffer.size).toBe(0);
    });

    it("should handle empty array", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 10 }).push(1);
      const result = buffer.pushMany([]);

      expect(result.size).toBe(1);
      expect(result.toArray()).toEqual([1]);
    });

    it("should evict when batch exceeds capacity", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 3 });
      const result = buffer.pushMany([1, 2, 3, 4, 5]);

      expect(result.size).toBe(3);
      expect(result.toArray()).toEqual([3, 4, 5]); // 1, 2 evicted
    });

    it("should combine with existing items and evict correctly", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 4 });
      const existing = buffer.push(1).push(2);
      const result = existing.pushMany([3, 4, 5, 6]);

      expect(result.size).toBe(4);
      expect(result.toArray()).toEqual([3, 4, 5, 6]); // 1, 2 evicted
    });

    it("should handle batch larger than maxSize", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 2 });
      const result = buffer.pushMany([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      expect(result.size).toBe(2);
      expect(result.toArray()).toEqual([9, 10]); // Only last 2 remain
    });
  });

  // ============================================================================
  // onEvict Callback
  // ============================================================================

  describe("onEvict callback", () => {
    it("should call onEvict with evicted item on push overflow", () => {
      const onEvict = vi.fn();
      const buffer = createCircularBuffer<number>({
        maxSize: 2,
        onEvict,
      });

      buffer.push(1).push(2).push(3);

      expect(onEvict).toHaveBeenCalledTimes(1);
      expect(onEvict).toHaveBeenCalledWith([1]);
    });

    it("should call onEvict with multiple items on pushMany overflow", () => {
      const onEvict = vi.fn();
      const buffer = createCircularBuffer<number>({
        maxSize: 3,
        onEvict,
      });

      buffer.push(1).push(2).pushMany([3, 4, 5, 6]);

      // Should have been called: first for push(3) evicting nothing,
      // then for pushMany evicting [1, 2, 3]
      expect(onEvict).toHaveBeenCalledWith([1, 2, 3]);
    });

    it("should not call onEvict when not overflowing", () => {
      const onEvict = vi.fn();
      const buffer = createCircularBuffer<number>({
        maxSize: 10,
        onEvict,
      });

      buffer.push(1).push(2).push(3);

      expect(onEvict).not.toHaveBeenCalled();
    });

    it("should call onEvict on resize reduction", () => {
      const onEvict = vi.fn();
      const buffer = createCircularBuffer<number>({ maxSize: 5, onEvict })
        .push(1)
        .push(2)
        .push(3)
        .push(4)
        .push(5);

      buffer.resize(2);

      expect(onEvict).toHaveBeenCalledWith([1, 2, 3]);
    });

    it("should pass correct evicted items in order (oldest first)", () => {
      const evictedItems: number[][] = [];
      const onEvict = (items: number[]) => evictedItems.push([...items]);

      const buffer = createCircularBuffer<number>({
        maxSize: 2,
        onEvict,
      });

      // Fill and overflow multiple times
      buffer.push(1).push(2).push(3).push(4).push(5);

      // Each push that overflows should trigger onEvict
      expect(evictedItems).toContainEqual([1]);
      expect(evictedItems).toContainEqual([2]);
      expect(evictedItems).toContainEqual([3]);
    });
  });

  // ============================================================================
  // get / first / last - Element Access
  // ============================================================================

  describe("get / first / last", () => {
    let buffer: CircularBuffer<string>;

    beforeEach(() => {
      buffer = createCircularBuffer<string>({ maxSize: 5 }).push("a").push("b").push("c");
    });

    it("should return correct element at index", () => {
      expect(buffer.get(0)).toBe("a");
      expect(buffer.get(1)).toBe("b");
      expect(buffer.get(2)).toBe("c");
    });

    it("should return first element (oldest)", () => {
      expect(buffer.first()).toBe("a");
    });

    it("should return last element (newest)", () => {
      expect(buffer.last()).toBe("c");
    });

    it("should return undefined for negative index", () => {
      expect(buffer.get(-1)).toBeUndefined();
      expect(buffer.get(-100)).toBeUndefined();
    });

    it("should return undefined for index >= size", () => {
      expect(buffer.get(3)).toBeUndefined();
      expect(buffer.get(100)).toBeUndefined();
    });

    it("should return undefined for first/last on empty buffer", () => {
      const empty = createCircularBuffer<number>({ maxSize: 5 });
      expect(empty.first()).toBeUndefined();
      expect(empty.last()).toBeUndefined();
    });

    it("should return correct elements after eviction", () => {
      const small = createCircularBuffer<number>({ maxSize: 3 })
        .push(1)
        .push(2)
        .push(3)
        .push(4)
        .push(5);

      expect(small.first()).toBe(3); // 1, 2 evicted
      expect(small.last()).toBe(5);
      expect(small.get(0)).toBe(3);
      expect(small.get(1)).toBe(4);
      expect(small.get(2)).toBe(5);
    });
  });

  // ============================================================================
  // toArray - Array Conversion
  // ============================================================================

  describe("toArray", () => {
    it("should return items in order (oldest first)", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2).push(3);

      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it("should return empty array for empty buffer", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 });
      expect(buffer.toArray()).toEqual([]);
    });

    it("should return correct order after eviction", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 3 })
        .push(1)
        .push(2)
        .push(3)
        .push(4)
        .push(5);

      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });

    it("should return a copy (not internal reference)", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2);

      const arr1 = buffer.toArray();
      const arr2 = buffer.toArray();

      expect(arr1).not.toBe(arr2); // Different instances
      expect(arr1).toEqual(arr2); // Same content

      // Modifying returned array should not affect buffer
      arr1.push(999);
      expect(buffer.toArray()).toEqual([1, 2]);
    });
  });

  // ============================================================================
  // forEach - Iteration
  // ============================================================================

  describe("forEach", () => {
    it("should iterate in order (oldest first)", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2).push(3);

      const collected: number[] = [];
      buffer.forEach((item) => {
        collected.push(item);
      });

      expect(collected).toEqual([1, 2, 3]);
    });

    it("should pass correct index to callback", () => {
      const buffer = createCircularBuffer<string>({ maxSize: 5 }).push("a").push("b").push("c");

      const indices: number[] = [];
      buffer.forEach((_, index) => {
        indices.push(index);
      });

      expect(indices).toEqual([0, 1, 2]);
    });

    it("should not call callback for empty buffer", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 });
      const callback = vi.fn();

      buffer.forEach(callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should iterate correctly after eviction", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 3 }).push(1).push(2).push(3).push(4);

      const collected: Array<{ item: number; index: number }> = [];
      buffer.forEach((item, index) => {
        collected.push({ item, index });
      });

      expect(collected).toEqual([
        { item: 2, index: 0 },
        { item: 3, index: 1 },
        { item: 4, index: 2 },
      ]);
    });
  });

  // ============================================================================
  // find - Element Search
  // ============================================================================

  describe("find", () => {
    it("should find first matching element", () => {
      const buffer = createCircularBuffer<{ id: number; name: string }>({
        maxSize: 5,
      })
        .push({ id: 1, name: "Alice" })
        .push({ id: 2, name: "Bob" })
        .push({ id: 3, name: "Charlie" });

      const found = buffer.find((item) => item.id === 2);
      expect(found).toEqual({ id: 2, name: "Bob" });
    });

    it("should return undefined when not found", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2).push(3);

      const found = buffer.find((n) => n > 100);
      expect(found).toBeUndefined();
    });

    it("should return undefined for empty buffer", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 });
      const found = buffer.find(() => true);
      expect(found).toBeUndefined();
    });

    it("should find in order (returns oldest match first)", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(2).push(4).push(6);

      const found = buffer.find((n) => n % 2 === 0);
      expect(found).toBe(2); // First even number (oldest)
    });
  });

  // ============================================================================
  // filter - Element Filtering
  // ============================================================================

  describe("filter", () => {
    it("should return new buffer with filtered items", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2).push(3).push(4);

      const filtered = buffer.filter((n) => n % 2 === 0);

      expect(filtered.toArray()).toEqual([2, 4]);
      expect(filtered).not.toBe(buffer);
    });

    it("should preserve maxSize in filtered buffer", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2).push(3);

      const filtered = buffer.filter((n) => n > 1);

      expect(filtered.maxSize).toBe(5);
    });

    it("should return empty buffer when no matches", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2).push(3);

      const filtered = buffer.filter((n) => n > 100);

      expect(filtered.isEmpty).toBe(true);
      expect(filtered.size).toBe(0);
    });

    it("should return all items when all match", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(2).push(4).push(6);

      const filtered = buffer.filter((n) => n % 2 === 0);

      expect(filtered.toArray()).toEqual([2, 4, 6]);
    });

    it("should not modify original buffer", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2).push(3);

      buffer.filter((n) => n === 1);

      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });
  });

  // ============================================================================
  // map - Element Transformation
  // ============================================================================

  describe("map", () => {
    it("should transform all elements", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2).push(3);

      const doubled = buffer.map((n) => n * 2);

      expect(doubled).toEqual([2, 4, 6]);
    });

    it("should pass index to mapper", () => {
      const buffer = createCircularBuffer<string>({ maxSize: 5 }).push("a").push("b").push("c");

      const withIndex = buffer.map((item, index) => `${index}:${item}`);

      expect(withIndex).toEqual(["0:a", "1:b", "2:c"]);
    });

    it("should return empty array for empty buffer", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 });
      const mapped = buffer.map((n) => n * 2);

      expect(mapped).toEqual([]);
    });

    it("should allow type transformation", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2);

      const asStrings = buffer.map((n) => String(n));

      expect(asStrings).toEqual(["1", "2"]);
    });
  });

  // ============================================================================
  // clear - Buffer Reset
  // ============================================================================

  describe("clear", () => {
    it("should return empty buffer with same maxSize", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2).push(3);

      const cleared = buffer.clear();

      expect(cleared.size).toBe(0);
      expect(cleared.isEmpty).toBe(true);
      expect(cleared.maxSize).toBe(5);
    });

    it("should return new instance (immutability)", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2);

      const cleared = buffer.clear();

      expect(cleared).not.toBe(buffer);
      expect(buffer.size).toBe(2); // Original unchanged
    });

    it("should work on already empty buffer", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 });
      const cleared = buffer.clear();

      expect(cleared.isEmpty).toBe(true);
      expect(cleared.maxSize).toBe(5);
    });

    it("should not trigger onEvict", () => {
      const onEvict = vi.fn();
      const buffer = createCircularBuffer<number>({ maxSize: 5, onEvict }).push(1).push(2);

      buffer.clear();

      expect(onEvict).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // resize - Capacity Adjustment
  // ============================================================================

  describe("resize", () => {
    it("should allow increasing size", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 3 }).push(1).push(2).push(3);

      const resized = buffer.resize(5);

      expect(resized.maxSize).toBe(5);
      expect(resized.isFull).toBe(false);
      expect(resized.toArray()).toEqual([1, 2, 3]);
    });

    it("should evict oldest when decreasing size", () => {
      const onEvict = vi.fn();
      const buffer = createCircularBuffer<number>({ maxSize: 5, onEvict })
        .push(1)
        .push(2)
        .push(3)
        .push(4)
        .push(5);

      const resized = buffer.resize(2);

      expect(resized.size).toBe(2);
      expect(resized.maxSize).toBe(2);
      expect(resized.toArray()).toEqual([4, 5]); // Keep newest
      expect(onEvict).toHaveBeenCalledWith([1, 2, 3]);
    });

    it("should return new instance (immutability)", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1);
      const resized = buffer.resize(10);

      expect(resized).not.toBe(buffer);
      expect(buffer.maxSize).toBe(5);
    });

    it("should work with same size (no change)", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2);

      const resized = buffer.resize(5);

      expect(resized.maxSize).toBe(5);
      expect(resized.toArray()).toEqual([1, 2]);
    });

    it("should resize to 1", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2).push(3);

      const resized = buffer.resize(1);

      expect(resized.size).toBe(1);
      expect(resized.maxSize).toBe(1);
      expect(resized.toArray()).toEqual([3]); // Keep newest
    });

    it("should handle resize of empty buffer", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 });
      const resized = buffer.resize(10);

      expect(resized.isEmpty).toBe(true);
      expect(resized.maxSize).toBe(10);
    });
  });

  // ============================================================================
  // createMessageBuffer - Preset Factory
  // ============================================================================

  describe("createMessageBuffer", () => {
    it("should use default maxSize from MESSAGE_BUFFER_DEFAULTS", () => {
      const buffer = createMessageBuffer();

      expect(buffer.maxSize).toBe(MESSAGE_BUFFER_DEFAULTS.maxMessages);
    });

    it("should allow custom maxSize", () => {
      const buffer = createMessageBuffer({ maxSize: 100 });

      expect(buffer.maxSize).toBe(100);
    });

    it("should pass through onEvict callback", () => {
      const onEvict = vi.fn();
      const buffer = createMessageBuffer<number>({
        maxSize: 2,
        onEvict,
      });

      buffer.push(1).push(2).push(3);

      expect(onEvict).toHaveBeenCalledWith([1]);
    });

    it("should work like regular circular buffer", () => {
      interface Message {
        id: number;
        text: string;
      }

      const buffer = createMessageBuffer<Message>({ maxSize: 3 });
      const filled = buffer
        .push({ id: 1, text: "Hello" })
        .push({ id: 2, text: "World" })
        .push({ id: 3, text: "!" });

      expect(filled.size).toBe(3);
      expect(filled.isFull).toBe(true);

      const overflowed = filled.push({ id: 4, text: "New" });
      expect(overflowed.first()?.id).toBe(2); // id:1 evicted
    });
  });

  // ============================================================================
  // MESSAGE_BUFFER_DEFAULTS - Configuration Constants
  // ============================================================================

  describe("MESSAGE_BUFFER_DEFAULTS", () => {
    it("should have expected default values", () => {
      expect(MESSAGE_BUFFER_DEFAULTS.maxMessages).toBe(500);
      expect(MESSAGE_BUFFER_DEFAULTS.evictBatchSize).toBe(50);
      expect(MESSAGE_BUFFER_DEFAULTS.warningThreshold).toBe(0.9);
    });

    it("should be readonly at compile time (as const)", () => {
      // `as const` provides TypeScript compile-time readonly protection
      // Runtime mutation is prevented by TypeScript, not Object.freeze
      expect(MESSAGE_BUFFER_DEFAULTS).toEqual({
        maxMessages: 500,
        evictBatchSize: 50,
        warningThreshold: 0.9,
      });
    });
  });

  // ============================================================================
  // Edge Cases & Stress Tests
  // ============================================================================

  describe("edge cases", () => {
    it("should handle rapid sequential operations", () => {
      let buffer = createCircularBuffer<number>({ maxSize: 5 });

      for (let i = 0; i < 100; i++) {
        buffer = buffer.push(i);
      }

      expect(buffer.size).toBe(5);
      expect(buffer.toArray()).toEqual([95, 96, 97, 98, 99]);
    });

    it("should maintain consistency through mixed operations", () => {
      const onEvict = vi.fn();
      let buffer = createCircularBuffer<number>({ maxSize: 3, onEvict });

      // Series of operations
      buffer = buffer.push(1).push(2);
      buffer = buffer.pushMany([3, 4, 5]); // Evicts 1, 2
      buffer = buffer.resize(2); // Evicts 3
      buffer = buffer.push(6); // Evicts 4
      buffer = buffer.clear();
      buffer = buffer.pushMany([10, 11, 12]); // Evicts 10

      expect(buffer.toArray()).toEqual([11, 12]);
    });

    it("should handle objects with same content but different references", () => {
      const buffer = createCircularBuffer<{ val: number }>({ maxSize: 3 })
        .push({ val: 1 })
        .push({ val: 1 })
        .push({ val: 1 });

      expect(buffer.size).toBe(3);
      expect(buffer.first()).not.toBe(buffer.last()); // Different object refs
      expect(buffer.first()).toEqual(buffer.last()); // Same content
    });

    it("should handle undefined and null values", () => {
      const buffer = createCircularBuffer<number | undefined | null>({
        maxSize: 5,
      })
        .push(1)
        .push(undefined)
        .push(null)
        .push(2);

      expect(buffer.toArray()).toEqual([1, undefined, null, 2]);
      expect(buffer.get(1)).toBeUndefined();
      expect(buffer.get(2)).toBeNull();
    });

    it("should preserve order through many evictions", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 3 });

      // Push 1-10, final should be 8, 9, 10
      const final = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].reduce((buf, n) => buf.push(n), buffer);

      expect(final.toArray()).toEqual([8, 9, 10]);
      expect(final.first()).toBe(8);
      expect(final.last()).toBe(10);
    });
  });

  // ============================================================================
  // useCircularBuffer - React Hook (requires ink-testing-library)
  // ============================================================================

  describe("useCircularBuffer", () => {
    it.todo("should initialize with empty buffer - requires ink-testing-library");
    it.todo("should provide push action that updates state");
    it.todo("should provide pushMany action");
    it.todo("should provide clear action");
    it.todo("should provide resize action");
  });

  // ============================================================================
  // Type Safety Tests
  // ============================================================================

  describe("type safety", () => {
    it("should maintain type through operations", () => {
      interface User {
        id: number;
        name: string;
      }

      const buffer = createCircularBuffer<User>({ maxSize: 5 })
        .push({ id: 1, name: "Alice" })
        .push({ id: 2, name: "Bob" });

      // Type should be preserved
      const first = buffer.first();
      const arr = buffer.toArray();

      expect(first?.name).toBe("Alice");
      expect(arr[1]?.name).toBe("Bob");
    });

    it("should type-check filter predicate", () => {
      const buffer = createCircularBuffer<{ active: boolean }>({ maxSize: 5 })
        .push({ active: true })
        .push({ active: false })
        .push({ active: true });

      const activeOnly = buffer.filter((item) => item.active);

      expect(activeOnly.size).toBe(2);
    });

    it("should type-check map transformation", () => {
      const buffer = createCircularBuffer<number>({ maxSize: 5 }).push(1).push(2);

      // number[] -> string[]
      const strings: string[] = buffer.map((n) => `value: ${n}`);

      expect(strings).toEqual(["value: 1", "value: 2"]);
    });
  });
});
