import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UsageTracker } from "../usage/index.js";

describe("UsageTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    UsageTracker.resetInstance();
  });

  afterEach(() => {
    UsageTracker.resetInstance();
    vi.useRealTimers();
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = UsageTracker.getInstance();
      const instance2 = UsageTracker.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("record", () => {
    it("AC-007-1: should store event with timestamp", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record();

      // Verify event was recorded
      expect(tracker.getEventCount()).toBe(1);
      expect(tracker.getUsage("minute")).toBe(1);
    });

    it("should record with specified count", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(5);

      expect(tracker.getUsage("minute")).toBe(5);
    });

    it("should record multiple events", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(1);
      tracker.record(2);
      tracker.record(3);

      expect(tracker.getEventCount()).toBe(3);
      expect(tracker.getUsage("minute")).toBe(6);
    });
  });

  describe("getUsage", () => {
    it("AC-007-2: should calculate sum within minute window", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(5);
      tracker.record(3);

      expect(tracker.getUsage("minute")).toBe(8);
    });

    it("AC-007-2: should calculate sum within hour window", () => {
      const tracker = UsageTracker.getInstance();

      // Record at different times within the hour
      tracker.record(10);
      vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes later
      tracker.record(5);

      expect(tracker.getUsage("hour")).toBe(15);
    });

    it("AC-007-2: should calculate sum within day window", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(10);
      vi.advanceTimersByTime(12 * 60 * 60 * 1000); // 12 hours later
      tracker.record(20);

      expect(tracker.getUsage("day")).toBe(30);
    });

    it("should exclude events outside the window", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(10);
      vi.advanceTimersByTime(2 * 60 * 1000); // 2 minutes later
      tracker.record(5);

      // First event is outside minute window
      expect(tracker.getUsage("minute")).toBe(5);
      // Both events within hour window
      expect(tracker.getUsage("hour")).toBe(15);
    });

    it("should return 0 for empty tracker", () => {
      const tracker = UsageTracker.getInstance();

      expect(tracker.getUsage("minute")).toBe(0);
      expect(tracker.getUsage("hour")).toBe(0);
      expect(tracker.getUsage("day")).toBe(0);
    });
  });

  describe("shouldCooldown", () => {
    it("AC-007-3: should return true when minute threshold exceeded", () => {
      const tracker = UsageTracker.getInstance();

      // Default threshold is 10 for minute
      for (let i = 0; i < 10; i++) {
        tracker.record();
      }

      expect(tracker.shouldCooldown("minute")).toBe(true);
    });

    it("AC-007-3: should return false when under threshold", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(5);

      expect(tracker.shouldCooldown("minute")).toBe(false);
    });

    it("should respect hour threshold", () => {
      const tracker = UsageTracker.getInstance();

      // Default threshold is 100 for hour
      tracker.record(99);
      expect(tracker.shouldCooldown("hour")).toBe(false);

      tracker.record(1);
      expect(tracker.shouldCooldown("hour")).toBe(true);
    });

    it("should respect day threshold", () => {
      const tracker = UsageTracker.getInstance();

      // Default threshold is 500 for day
      tracker.record(500);
      expect(tracker.shouldCooldown("day")).toBe(true);
    });
  });

  describe("prune", () => {
    it("AC-007-4: should remove events older than 24h", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(10);
      expect(tracker.getEventCount()).toBe(1);

      // Advance past 24 hours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      tracker.prune();

      expect(tracker.getEventCount()).toBe(0);
    });

    it("AC-007-4: should keep events within 24h", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(10);
      vi.advanceTimersByTime(23 * 60 * 60 * 1000); // 23 hours
      tracker.prune();

      expect(tracker.getEventCount()).toBe(1);
    });

    it("should auto-prune on interval", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(10);

      // Advance past 24 hours + prune interval
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);

      expect(tracker.getEventCount()).toBe(0);
    });
  });

  describe("dispose", () => {
    it("should clear events and stop timer", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(10);
      tracker.dispose();

      expect(tracker.getEventCount()).toBe(0);
    });
  });

  describe("clear", () => {
    it("should clear all events", () => {
      const tracker = UsageTracker.getInstance();

      tracker.record(10);
      tracker.record(20);
      tracker.clear();

      expect(tracker.getEventCount()).toBe(0);
      expect(tracker.getUsage("day")).toBe(0);
    });
  });
});
