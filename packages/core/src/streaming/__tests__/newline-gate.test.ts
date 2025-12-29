/**
 * @file newline-gate.test.ts
 * @description Unit tests for NewlineGate - T025
 *
 * Tests cover:
 * - Buffers partial lines until newline
 * - Returns complete lines immediately
 * - flush() returns remaining buffer
 * - Bypass mode when enabled=false
 * - Timeout force flush (mocked timers)
 * - Overflow force flush at maxBufferSize
 * - EC-004: Unicode handling in buffer
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NEWLINE_GATE_CONFIG, NewlineGate } from "../newline-gate.js";

describe("NewlineGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Basic Buffering Behavior
  // ===========================================================================

  describe("Basic Buffering Behavior", () => {
    it("should buffer partial lines until newline", () => {
      const gate = new NewlineGate();

      expect(gate.feed("Hello ")).toBeNull();
      expect(gate.feed("World")).toBeNull();
      expect(gate.feed("!\n")).toBe("Hello World!\n");
    });

    it("should return complete lines immediately", () => {
      const gate = new NewlineGate();

      expect(gate.feed("Complete line\n")).toBe("Complete line\n");
    });

    it("should handle multiple lines in single feed", () => {
      const gate = new NewlineGate();

      expect(gate.feed("Line 1\nLine 2\n")).toBe("Line 1\nLine 2\n");
    });

    it("should buffer content after last newline", () => {
      const gate = new NewlineGate();

      expect(gate.feed("Line 1\nPartial")).toBe("Line 1\n");
      expect(gate.bufferSize).toBe(7); // "Partial"
    });

    it("should handle consecutive newlines", () => {
      const gate = new NewlineGate();

      expect(gate.feed("\n\n\n")).toBe("\n\n\n");
    });

    it("should handle empty string feed", () => {
      const gate = new NewlineGate();

      expect(gate.feed("")).toBeNull();
      expect(gate.bufferSize).toBe(0);
    });
  });

  // ===========================================================================
  // Flush Behavior
  // ===========================================================================

  describe("Flush Behavior", () => {
    it("should return remaining buffer on flush", () => {
      const gate = new NewlineGate();

      gate.feed("Partial content");
      expect(gate.flush()).toBe("Partial content");
    });

    it("should return null when flushing empty buffer", () => {
      const gate = new NewlineGate();

      expect(gate.flush()).toBeNull();
    });

    it("should clear buffer after flush", () => {
      const gate = new NewlineGate();

      gate.feed("Content");
      gate.flush();
      expect(gate.bufferSize).toBe(0);
      expect(gate.flush()).toBeNull();
    });

    it("should reset lastFeedTime on flush", () => {
      const gate = new NewlineGate();

      gate.feed("Content");
      expect(gate.timeSinceLastFeed).toBeGreaterThanOrEqual(0);

      gate.flush();
      expect(gate.timeSinceLastFeed).toBe(0);
    });
  });

  // ===========================================================================
  // Reset Functionality
  // ===========================================================================

  describe("Reset Functionality", () => {
    it("should clear buffer on reset", () => {
      const gate = new NewlineGate();

      gate.feed("Some content");
      gate.reset();

      expect(gate.bufferSize).toBe(0);
      expect(gate.flush()).toBeNull();
    });

    it("should reset timeSinceLastFeed on reset", () => {
      const gate = new NewlineGate();

      gate.feed("Content");
      vi.advanceTimersByTime(50);

      gate.reset();
      expect(gate.timeSinceLastFeed).toBe(0);
    });
  });

  // ===========================================================================
  // Bypass Mode (enabled=false)
  // ===========================================================================

  describe("Bypass Mode", () => {
    it("should return text immediately when enabled=false", () => {
      const gate = new NewlineGate({ enabled: false });

      expect(gate.feed("No newline")).toBe("No newline");
      expect(gate.feed("Still no newline")).toBe("Still no newline");
    });

    it("should not buffer in bypass mode", () => {
      const gate = new NewlineGate({ enabled: false });

      gate.feed("Test");
      expect(gate.bufferSize).toBe(0);
    });

    it("should return content with newlines as-is in bypass mode", () => {
      const gate = new NewlineGate({ enabled: false });

      expect(gate.feed("Line\nWith\nNewlines")).toBe("Line\nWith\nNewlines");
    });
  });

  // ===========================================================================
  // Timeout Force Flush
  // ===========================================================================

  describe("Timeout Force Flush", () => {
    it("should report shouldForceFlush after timeout", () => {
      const gate = new NewlineGate({ flushTimeoutMs: 100 });

      gate.feed("Partial");

      // Before timeout
      vi.advanceTimersByTime(50);
      expect(gate.shouldForceFlush()).toBe(false);

      // At timeout
      vi.advanceTimersByTime(50);
      expect(gate.shouldForceFlush()).toBe(true);
    });

    it("should force flush after timeout via forceFlushIfNeeded", () => {
      const gate = new NewlineGate({ flushTimeoutMs: 100 });

      gate.feed("Partial content");

      // Before timeout
      vi.advanceTimersByTime(50);
      expect(gate.forceFlushIfNeeded()).toBeNull();

      // At timeout
      vi.advanceTimersByTime(50);
      expect(gate.forceFlushIfNeeded()).toBe("Partial content");
    });

    it("should reset timeout tracking after force flush", () => {
      const gate = new NewlineGate({ flushTimeoutMs: 100 });

      gate.feed("First");
      vi.advanceTimersByTime(100);
      gate.forceFlushIfNeeded();

      expect(gate.shouldForceFlush()).toBe(false);
      expect(gate.timeSinceLastFeed).toBe(0);
    });

    it("should not force flush empty buffer", () => {
      const gate = new NewlineGate({ flushTimeoutMs: 100 });

      vi.advanceTimersByTime(200);
      expect(gate.shouldForceFlush()).toBe(false);
      expect(gate.forceFlushIfNeeded()).toBeNull();
    });

    it("should track timeSinceLastFeed correctly", () => {
      const gate = new NewlineGate();

      gate.feed("Test");
      expect(gate.timeSinceLastFeed).toBe(0);

      vi.advanceTimersByTime(25);
      expect(gate.timeSinceLastFeed).toBe(25);

      vi.advanceTimersByTime(25);
      expect(gate.timeSinceLastFeed).toBe(50);
    });

    it("should update lastFeedTime on each feed", () => {
      const gate = new NewlineGate({ flushTimeoutMs: 100 });

      gate.feed("First");
      vi.advanceTimersByTime(80);
      expect(gate.timeSinceLastFeed).toBe(80);

      // Feed again - should reset timeout tracking
      gate.feed("Second");
      expect(gate.timeSinceLastFeed).toBe(0);

      vi.advanceTimersByTime(80);
      expect(gate.shouldForceFlush()).toBe(false);

      vi.advanceTimersByTime(20);
      expect(gate.shouldForceFlush()).toBe(true);
    });
  });

  // ===========================================================================
  // Overflow Force Flush
  // ===========================================================================

  describe("Overflow Force Flush", () => {
    it("should report shouldForceFlush at maxBufferSize", () => {
      const gate = new NewlineGate({ maxBufferSize: 10 });

      gate.feed("12345");
      expect(gate.shouldForceFlush()).toBe(false);

      gate.feed("67890");
      expect(gate.shouldForceFlush()).toBe(true);
    });

    it("should force flush at maxBufferSize via forceFlushIfNeeded", () => {
      const gate = new NewlineGate({ maxBufferSize: 10 });

      gate.feed("0123456789");
      expect(gate.forceFlushIfNeeded()).toBe("0123456789");
      expect(gate.bufferSize).toBe(0);
    });

    it("should force flush when exceeding maxBufferSize", () => {
      const gate = new NewlineGate({ maxBufferSize: 10 });

      gate.feed("12345678901234567890"); // 20 chars
      expect(gate.shouldForceFlush()).toBe(true);
    });

    it("should handle exact maxBufferSize boundary", () => {
      const gate = new NewlineGate({ maxBufferSize: 5 });

      // At boundary
      gate.feed("12345");
      expect(gate.bufferSize).toBe(5);
      expect(gate.shouldForceFlush()).toBe(true);

      // Flush and check
      const flushed = gate.forceFlushIfNeeded();
      expect(flushed).toBe("12345");
      expect(gate.bufferSize).toBe(0);
    });
  });

  // ===========================================================================
  // EC-004: Unicode Handling in Buffer
  // ===========================================================================

  describe("EC-004: Unicode Handling", () => {
    it("should handle basic Unicode characters", () => {
      const gate = new NewlineGate();

      expect(gate.feed("Hello 世界\n")).toBe("Hello 世界\n");
    });

    it("should buffer and flush Unicode content correctly", () => {
      const gate = new NewlineGate();

      gate.feed("日本語");
      gate.feed(" テスト");
      expect(gate.flush()).toBe("日本語 テスト");
    });

    it("should handle emoji characters", () => {
      const gate = new NewlineGate();

      expect(gate.feed("Hello 😀🎉\n")).toBe("Hello 😀🎉\n");
    });

    it("should handle mixed ASCII and Unicode", () => {
      const gate = new NewlineGate();

      gate.feed("ASCII ");
      gate.feed("한글 ");
      gate.feed("العربية");
      gate.feed("\n");

      // The last feed returns the complete line
      // Previous feeds returned null or partial
      expect(gate.bufferSize).toBe(0);
    });

    it("should handle Unicode in multiple feeds", () => {
      const gate = new NewlineGate();

      expect(gate.feed("Привет")).toBeNull();
      expect(gate.feed(" мир")).toBeNull();
      expect(gate.feed("!\n")).toBe("Привет мир!\n");
    });

    it("should handle Unicode surrogate pairs", () => {
      const gate = new NewlineGate();

      // Surrogate pairs (emoji with skin tones, etc.)
      const emoji = "👨‍👩‍👧‍👦"; // Family emoji with ZWJ
      expect(gate.feed(emoji)).toBeNull();
      expect(gate.flush()).toBe(emoji);
    });

    it("should handle Unicode newline characters", () => {
      const gate = new NewlineGate();

      // Standard \n should work
      expect(gate.feed("Line 1\nLine 2\n")).toBe("Line 1\nLine 2\n");
    });

    it("should calculate bufferSize correctly for Unicode", () => {
      const gate = new NewlineGate();

      // JavaScript string length counts UTF-16 code units
      const unicodeStr = "日本語"; // 3 characters
      gate.feed(unicodeStr);
      expect(gate.bufferSize).toBe(unicodeStr.length);
    });

    it("should handle Unicode overflow threshold correctly", () => {
      // Note: maxBufferSize uses string.length (UTF-16 code units)
      const gate = new NewlineGate({ maxBufferSize: 5 });

      // 3 Japanese characters = 3 code units
      gate.feed("日本語");
      expect(gate.bufferSize).toBe(3);
      expect(gate.shouldForceFlush()).toBe(false);

      // Add 2 more
      gate.feed("語句");
      expect(gate.bufferSize).toBe(5);
      expect(gate.shouldForceFlush()).toBe(true);
    });
  });

  // ===========================================================================
  // Configuration
  // ===========================================================================

  describe("Configuration", () => {
    it("should use default config values", () => {
      const gate = new NewlineGate();

      // Test default flushTimeoutMs (100)
      gate.feed("Test");
      vi.advanceTimersByTime(99);
      expect(gate.shouldForceFlush()).toBe(false);
      vi.advanceTimersByTime(1);
      expect(gate.shouldForceFlush()).toBe(true);
    });

    it("should accept partial config", () => {
      const gate = new NewlineGate({ flushTimeoutMs: 200 });

      gate.feed("Test");
      vi.advanceTimersByTime(150);
      expect(gate.shouldForceFlush()).toBe(false);

      vi.advanceTimersByTime(50);
      expect(gate.shouldForceFlush()).toBe(true);
    });

    it("should have correct default config values", () => {
      expect(DEFAULT_NEWLINE_GATE_CONFIG).toEqual({
        enabled: true,
        flushTimeoutMs: 100,
        maxBufferSize: 4096,
      });
    });
  });

  // ===========================================================================
  // Property Accessors
  // ===========================================================================

  describe("Property Accessors", () => {
    it("should report bufferSize correctly", () => {
      const gate = new NewlineGate();

      expect(gate.bufferSize).toBe(0);
      gate.feed("12345");
      expect(gate.bufferSize).toBe(5);
      gate.feed("67890");
      expect(gate.bufferSize).toBe(10);
    });

    it("should report timeSinceLastFeed correctly", () => {
      const gate = new NewlineGate();

      // No feed yet
      expect(gate.timeSinceLastFeed).toBe(0);

      gate.feed("Test");
      expect(gate.timeSinceLastFeed).toBe(0);

      vi.advanceTimersByTime(100);
      expect(gate.timeSinceLastFeed).toBe(100);
    });
  });

  // ===========================================================================
  // Complex Scenarios
  // ===========================================================================

  describe("Complex Scenarios", () => {
    it("should handle streaming chat-like output", () => {
      const gate = new NewlineGate();
      const output: string[] = [];

      // Simulate streaming response
      const chunks = [
        "Hello",
        ", ",
        "how are ",
        "you?\n",
        "I'm ",
        "doing great!\n",
        "Thanks for ",
        "asking.",
      ];

      for (const chunk of chunks) {
        const result = gate.feed(chunk);
        if (result) {
          output.push(result);
        }
      }

      // Flush remaining
      const remaining = gate.flush();
      if (remaining) {
        output.push(remaining);
      }

      expect(output).toEqual(["Hello, how are you?\n", "I'm doing great!\n", "Thanks for asking."]);
    });

    it("should handle rapid timeout resets", () => {
      const gate = new NewlineGate({ flushTimeoutMs: 50 });

      // Feed every 40ms - should never timeout
      gate.feed("a");
      vi.advanceTimersByTime(40);
      expect(gate.shouldForceFlush()).toBe(false);

      gate.feed("b");
      vi.advanceTimersByTime(40);
      expect(gate.shouldForceFlush()).toBe(false);

      gate.feed("c");
      vi.advanceTimersByTime(40);
      expect(gate.shouldForceFlush()).toBe(false);

      // Stop feeding - should timeout
      vi.advanceTimersByTime(50);
      expect(gate.shouldForceFlush()).toBe(true);
      expect(gate.forceFlushIfNeeded()).toBe("abc");
    });

    it("should interleave newlines and overflow conditions", () => {
      const gate = new NewlineGate({ maxBufferSize: 10 });

      // First line completes normally
      expect(gate.feed("Line1\n")).toBe("Line1\n");

      // Buffer fills up without newline
      gate.feed("ABCDEFGHIJ"); // 10 chars
      expect(gate.shouldForceFlush()).toBe(true);

      const flushed = gate.forceFlushIfNeeded();
      expect(flushed).toBe("ABCDEFGHIJ");

      // Continue with newlines
      expect(gate.feed("XY\n")).toBe("XY\n");
    });
  });
});
