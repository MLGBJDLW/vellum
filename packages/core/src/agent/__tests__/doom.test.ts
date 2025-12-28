import { describe, expect, it } from "vitest";
import {
  countConsecutiveIdenticalCalls,
  createToolCall,
  DEFAULT_DOOM_LOOP_OPTIONS,
  detectDoomLoop,
  serializeToolCall,
} from "../doom.js";

describe("Doom Loop Detection", () => {
  describe("serializeToolCall", () => {
    it("should serialize without id by default", () => {
      const call = { id: "123", name: "read_file", input: { path: "test.txt" } };

      const serialized = serializeToolCall(call);

      expect(serialized).toBe(JSON.stringify({ name: "read_file", input: { path: "test.txt" } }));
      expect(serialized).not.toContain("123");
    });

    it("should include id when requested", () => {
      const call = { id: "123", name: "read_file", input: { path: "test.txt" } };

      const serialized = serializeToolCall(call, true);

      expect(serialized).toContain('"id":"123"');
    });
  });

  describe("detectDoomLoop", () => {
    it("should return detected=false with fewer than threshold calls", () => {
      const calls = [
        createToolCall("1", "read_file", { path: "test.txt" }),
        createToolCall("2", "read_file", { path: "test.txt" }),
      ];

      const result = detectDoomLoop(calls, { threshold: 3 });

      expect(result.detected).toBe(false);
      expect(result.repeatedCall).toBeUndefined();
    });

    it("should detect doom loop with 3 identical calls (default threshold)", () => {
      const calls = [
        createToolCall("1", "read_file", { path: "test.txt" }),
        createToolCall("2", "read_file", { path: "test.txt" }),
        createToolCall("3", "read_file", { path: "test.txt" }),
      ];

      const result = detectDoomLoop(calls);

      expect(result.detected).toBe(true);
      expect(result.repeatedCall).toBeDefined();
      expect(result.repeatedCall?.name).toBe("read_file");
      expect(result.repeatCount).toBe(3);
    });

    it("should not detect doom loop with different inputs", () => {
      const calls = [
        createToolCall("1", "read_file", { path: "a.txt" }),
        createToolCall("2", "read_file", { path: "b.txt" }),
        createToolCall("3", "read_file", { path: "c.txt" }),
      ];

      const result = detectDoomLoop(calls);

      expect(result.detected).toBe(false);
    });

    it("should not detect doom loop with different tool names", () => {
      const calls = [
        createToolCall("1", "read_file", { path: "test.txt" }),
        createToolCall("2", "write_file", { path: "test.txt" }),
        createToolCall("3", "read_file", { path: "test.txt" }),
      ];

      const result = detectDoomLoop(calls);

      expect(result.detected).toBe(false);
    });

    it("should use custom threshold", () => {
      const calls = [
        createToolCall("1", "read_file", { path: "test.txt" }),
        createToolCall("2", "read_file", { path: "test.txt" }),
        createToolCall("3", "read_file", { path: "test.txt" }),
        createToolCall("4", "read_file", { path: "test.txt" }),
        createToolCall("5", "read_file", { path: "test.txt" }),
      ];

      // Should not detect with threshold of 6
      const result1 = detectDoomLoop(calls, { threshold: 6 });
      expect(result1.detected).toBe(false);

      // Should detect with threshold of 5
      const result2 = detectDoomLoop(calls, { threshold: 5 });
      expect(result2.detected).toBe(true);
      expect(result2.repeatCount).toBe(5);
    });

    it("should only consider the last N calls", () => {
      const calls = [
        createToolCall("1", "other_tool", { data: "different" }),
        createToolCall("2", "read_file", { path: "test.txt" }),
        createToolCall("3", "read_file", { path: "test.txt" }),
        createToolCall("4", "read_file", { path: "test.txt" }),
      ];

      const result = detectDoomLoop(calls, { threshold: 3 });

      expect(result.detected).toBe(true);
    });

    it("should return empty array calls gracefully", () => {
      const result = detectDoomLoop([]);

      expect(result.detected).toBe(false);
    });
  });

  describe("countConsecutiveIdenticalCalls", () => {
    it("should count consecutive identical calls from the end", () => {
      const calls = [
        createToolCall("1", "other", { x: 1 }),
        createToolCall("2", "read_file", { path: "test.txt" }),
        createToolCall("3", "read_file", { path: "test.txt" }),
        createToolCall("4", "read_file", { path: "test.txt" }),
      ];

      const count = countConsecutiveIdenticalCalls(calls);

      expect(count).toBe(3);
    });

    it("should return 1 for single call", () => {
      const calls = [createToolCall("1", "read_file", { path: "test.txt" })];

      const count = countConsecutiveIdenticalCalls(calls);

      expect(count).toBe(1);
    });

    it("should return 0 for empty array", () => {
      const count = countConsecutiveIdenticalCalls([]);

      expect(count).toBe(0);
    });

    it("should count all calls when all identical", () => {
      const calls = [
        createToolCall("1", "read_file", { path: "test.txt" }),
        createToolCall("2", "read_file", { path: "test.txt" }),
        createToolCall("3", "read_file", { path: "test.txt" }),
      ];

      const count = countConsecutiveIdenticalCalls(calls);

      expect(count).toBe(3);
    });
  });

  describe("createToolCall", () => {
    it("should create a properly structured tool call", () => {
      const call = createToolCall("abc123", "my_tool", { key: "value" });

      expect(call.id).toBe("abc123");
      expect(call.name).toBe("my_tool");
      expect(call.input).toEqual({ key: "value" });
    });
  });

  describe("DEFAULT_DOOM_LOOP_OPTIONS", () => {
    it("should have expected default values", () => {
      expect(DEFAULT_DOOM_LOOP_OPTIONS.threshold).toBe(3);
      expect(DEFAULT_DOOM_LOOP_OPTIONS.includeId).toBe(false);
    });
  });
});
