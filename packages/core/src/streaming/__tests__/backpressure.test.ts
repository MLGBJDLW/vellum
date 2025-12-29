/**
 * @file backpressure.test.ts
 * @description Tests for backpressure controllers and trackers
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdaptiveBackpressure,
  BackpressureController,
  DEFAULT_ADAPTIVE_CONFIG,
  DEFAULT_BACKPRESSURE_CONFIG,
  LatencyTracker,
  ThroughputTracker,
} from "../backpressure.js";

// =============================================================================
// T034: ThroughputTracker Tests
// =============================================================================

describe("ThroughputTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should track events per second", () => {
    const tracker = new ThroughputTracker(1000);

    // Record 10 events
    for (let i = 0; i < 10; i++) {
      tracker.record();
    }

    expect(tracker.eventsPerSecond()).toBe(10);
  });

  it("should prune old events outside window", () => {
    const tracker = new ThroughputTracker(1000);

    // Record 5 events
    for (let i = 0; i < 5; i++) {
      tracker.record();
    }
    expect(tracker.eventsPerSecond()).toBe(5);

    // Advance time past window
    vi.advanceTimersByTime(1001);

    // Record 3 more events
    for (let i = 0; i < 3; i++) {
      tracker.record();
    }

    // Old events should be pruned
    expect(tracker.eventsPerSecond()).toBe(3);
  });

  it("should return zero for empty tracker", () => {
    const tracker = new ThroughputTracker();
    expect(tracker.eventsPerSecond()).toBe(0);
  });

  it("should reset correctly", () => {
    const tracker = new ThroughputTracker();
    tracker.record();
    tracker.record();
    expect(tracker.eventsPerSecond()).toBe(2);

    tracker.reset();
    expect(tracker.eventsPerSecond()).toBe(0);
  });
});

// =============================================================================
// T035: LatencyTracker Tests
// =============================================================================

describe("LatencyTracker", () => {
  it("should calculate average latency", () => {
    const tracker = new LatencyTracker();
    tracker.record(10);
    tracker.record(20);
    tracker.record(30);

    expect(tracker.averageMs()).toBe(20);
  });

  it("should calculate p95 latency", () => {
    const tracker = new LatencyTracker();

    // Add 100 samples: 1, 2, 3, ..., 100
    for (let i = 1; i <= 100; i++) {
      tracker.record(i);
    }

    // p95 is at index floor(100 * 0.95) = 95, which is value 96
    expect(tracker.p95Ms()).toBe(96);
  });

  it("should return zero for empty tracker", () => {
    const tracker = new LatencyTracker();
    expect(tracker.averageMs()).toBe(0);
    expect(tracker.p95Ms()).toBe(0);
  });

  it("should limit samples to maxSamples", () => {
    const tracker = new LatencyTracker(5);

    // Add 10 samples
    for (let i = 1; i <= 10; i++) {
      tracker.record(i * 10);
    }

    // Only last 5 samples should remain: 60, 70, 80, 90, 100
    // Average: (60 + 70 + 80 + 90 + 100) / 5 = 80
    expect(tracker.averageMs()).toBe(80);
  });

  it("should reset correctly", () => {
    const tracker = new LatencyTracker();
    tracker.record(50);
    tracker.record(100);
    expect(tracker.averageMs()).toBe(75);

    tracker.reset();
    expect(tracker.averageMs()).toBe(0);
  });
});

// =============================================================================
// T013: BackpressureController Tests
// =============================================================================

describe("BackpressureController", () => {
  it("should have default config", () => {
    const controller = new BackpressureController();
    expect(controller.state).toBe("normal");
    expect(controller.size).toBe(0);
    expect(controller.isBlocked).toBe(false);
  });

  it("should send and receive items", async () => {
    const controller = new BackpressureController<string>();

    await controller.send("item1");
    await controller.send("item2");

    expect(controller.size).toBe(2);
    expect(controller.hasItems()).toBe(true);

    expect(controller.receive()).toBe("item1");
    expect(controller.receive()).toBe("item2");
    expect(controller.hasItems()).toBe(false);
  });

  it("should transition to warning state at threshold", async () => {
    const controller = new BackpressureController<number>({
      maxQueueSize: 10,
      warningThreshold: 0.5,
    });

    // Fill to 50% - should enter warning
    for (let i = 0; i < 5; i++) {
      await controller.send(i);
    }
    expect(controller.state).toBe("warning");
  });

  it("should transition to critical state when full", async () => {
    const controller = new BackpressureController<number>({
      maxQueueSize: 5,
      strategy: "drop_newest",
    });

    // Fill queue completely
    for (let i = 0; i < 5; i++) {
      await controller.send(i);
    }
    expect(controller.state).toBe("critical");
  });

  it("should drop newest when using drop_newest strategy", async () => {
    const controller = new BackpressureController<number>({
      maxQueueSize: 3,
      strategy: "drop_newest",
    });

    await controller.send(1);
    await controller.send(2);
    await controller.send(3);
    const dropped = await controller.send(4); // Should be dropped

    expect(dropped).toBe(false);
    expect(controller.size).toBe(3);
    expect(controller.receive()).toBe(1);
  });

  it("should drop oldest when using drop_oldest strategy", async () => {
    const controller = new BackpressureController<number>({
      maxQueueSize: 3,
      strategy: "drop_oldest",
    });

    await controller.send(1);
    await controller.send(2);
    await controller.send(3);
    await controller.send(4); // Should drop 1

    expect(controller.size).toBe(3);
    expect(controller.receive()).toBe(2); // 1 was dropped
  });

  it("should clear queue", async () => {
    const controller = new BackpressureController<number>();
    await controller.send(1);
    await controller.send(2);

    controller.clear();

    expect(controller.size).toBe(0);
    expect(controller.state).toBe("normal");
  });
});

// =============================================================================
// T036: AdaptiveBackpressure Tests
// =============================================================================

describe("AdaptiveBackpressure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should have default adaptive config", () => {
    const adaptive = new AdaptiveBackpressure();

    expect(adaptive.state).toBe("normal");
    expect(adaptive.getThroughput()).toBe(0);
    expect(adaptive.getLatency()).toBe(0);
    expect(adaptive.getP95Latency()).toBe(0);
  });

  it("should track throughput on sendWithTracking", async () => {
    const adaptive = new AdaptiveBackpressure<string>();

    await adaptive.sendWithTracking("item1");
    await adaptive.sendWithTracking("item2");
    await adaptive.sendWithTracking("item3");

    // Throughput should be 3 events in the window
    expect(adaptive.getThroughput()).toBe(3);
  });

  it("should adjust strategy to block for low latency", () => {
    const adaptive = new AdaptiveBackpressure<string>({
      coalesceThresholdMs: 50,
      dropThresholdMs: 100,
    });

    // Simulate low latency samples (< 50ms)
    for (let i = 0; i < 10; i++) {
      (adaptive as any).latency.record(20); // Low latency
    }

    const strategy = adaptive.adjustStrategy();
    expect(strategy).toBe("block");
  });

  it("should adjust strategy to coalesce for medium latency", () => {
    const adaptive = new AdaptiveBackpressure<string>({
      coalesceThresholdMs: 50,
      dropThresholdMs: 100,
    });

    // Simulate medium latency samples (50-100ms)
    for (let i = 0; i < 10; i++) {
      (adaptive as any).latency.record(75); // Medium latency
    }

    const strategy = adaptive.adjustStrategy();
    expect(strategy).toBe("coalesce");
  });

  it("should adjust strategy to drop_newest for high latency", () => {
    const adaptive = new AdaptiveBackpressure<string>({
      coalesceThresholdMs: 50,
      dropThresholdMs: 100,
    });

    // Simulate high latency samples (>= 100ms)
    for (let i = 0; i < 10; i++) {
      (adaptive as any).latency.record(150); // High latency
    }

    const strategy = adaptive.adjustStrategy();
    expect(strategy).toBe("drop_newest");
  });

  it("should respect adjustment interval to prevent thrashing", async () => {
    const adaptive = new AdaptiveBackpressure<string>({
      adjustmentIntervalMs: 1000,
      coalesceThresholdMs: 50,
      dropThresholdMs: 100,
    });

    // Setup: Record high latency and force initial adjustment
    (adaptive as any).latency.record(150);
    (adaptive as any).latency.record(150);
    (adaptive as any).latency.record(150);

    // First sendWithTracking triggers maybeAdjustStrategy
    // Since lastAdjustment starts at 0 and Date.now() > 1000, it will adjust
    await adaptive.sendWithTracking("item1");
    const metrics1 = adaptive.getMetrics();
    expect(metrics1.strategy).toBe("drop_newest");

    // Record low latency samples but don't advance time
    (adaptive as any).latency.record(20);
    (adaptive as any).latency.record(20);
    (adaptive as any).latency.record(20);

    // Immediate second send - should NOT adjust (within interval)
    await adaptive.sendWithTracking("item2");
    const metrics2 = adaptive.getMetrics();
    expect(metrics2.strategy).toBe("drop_newest"); // Unchanged

    // Advance past interval
    vi.advanceTimersByTime(1001);

    // Now adjustment should happen with low latency average
    await adaptive.sendWithTracking("item3");
    const metrics3 = adaptive.getMetrics();
    // Latency average is now lower, should switch strategies
    expect(["block", "coalesce"]).toContain(metrics3.strategy);
  });

  it("should return complete metrics snapshot", async () => {
    const adaptive = new AdaptiveBackpressure<string>();

    await adaptive.sendWithTracking("item1");
    await adaptive.sendWithTracking("item2");

    const metrics = adaptive.getMetrics();

    expect(metrics).toHaveProperty("throughput");
    expect(metrics).toHaveProperty("latency");
    expect(metrics).toHaveProperty("p95Latency");
    expect(metrics).toHaveProperty("strategy");
    expect(metrics).toHaveProperty("queueSize");
    expect(metrics).toHaveProperty("state");

    expect(metrics.queueSize).toBe(2);
    expect(metrics.state).toBe("normal");
  });

  it("should reset all state including trackers", async () => {
    const adaptive = new AdaptiveBackpressure<string>();

    await adaptive.sendWithTracking("item1");
    await adaptive.sendWithTracking("item2");

    expect(adaptive.size).toBe(2);
    expect(adaptive.getThroughput()).toBeGreaterThan(0);

    adaptive.reset();

    expect(adaptive.size).toBe(0);
    expect(adaptive.getThroughput()).toBe(0);
    expect(adaptive.getLatency()).toBe(0);
  });

  it("should inherit base controller functionality", async () => {
    const adaptive = new AdaptiveBackpressure<number>({
      maxQueueSize: 3,
      strategy: "drop_newest",
    });

    await adaptive.send(1);
    await adaptive.send(2);
    await adaptive.send(3);
    const dropped = await adaptive.send(4);

    expect(dropped).toBe(false);
    expect(adaptive.receive()).toBe(1);
  });
});

// =============================================================================
// Config Defaults Tests
// =============================================================================

describe("Config Defaults", () => {
  it("should have correct DEFAULT_BACKPRESSURE_CONFIG", () => {
    expect(DEFAULT_BACKPRESSURE_CONFIG).toEqual({
      maxQueueSize: 1000,
      warningThreshold: 0.8,
      strategy: "block",
      enableMetrics: false,
    });
  });

  it("should have correct DEFAULT_ADAPTIVE_CONFIG", () => {
    expect(DEFAULT_ADAPTIVE_CONFIG).toMatchObject({
      maxQueueSize: 1000,
      warningThreshold: 0.8,
      strategy: "block",
      enableMetrics: false,
      coalesceThresholdMs: 50,
      dropThresholdMs: 100,
      adjustmentIntervalMs: 1000,
    });
  });
});

// =============================================================================
// T026: Additional Backpressure Tests - State Transitions and Strategies
// =============================================================================

describe("T026: Backpressure State Transitions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("State Transitions: normal → warning → critical", () => {
    it("should start in normal state", () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 10,
        warningThreshold: 0.5,
      });

      expect(controller.state).toBe("normal");
    });

    it("should transition from normal to warning at threshold", () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 10,
        warningThreshold: 0.5,
        strategy: "drop_newest",
      });

      // Fill to 40% - still normal
      for (let i = 0; i < 4; i++) {
        controller.send(i);
      }
      expect(controller.state).toBe("normal");

      // Fill to 50% - warning
      controller.send(4);
      expect(controller.state).toBe("warning");
    });

    it("should transition from warning to critical when full", () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 10,
        warningThreshold: 0.5,
        strategy: "drop_newest",
      });

      // Fill to warning
      for (let i = 0; i < 5; i++) {
        controller.send(i);
      }
      expect(controller.state).toBe("warning");

      // Fill to critical
      for (let i = 5; i < 10; i++) {
        controller.send(i);
      }
      expect(controller.state).toBe("critical");
    });

    it("should transition back from critical to warning when items are consumed", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 10,
        warningThreshold: 0.5,
        strategy: "drop_newest",
      });

      // Fill to critical
      for (let i = 0; i < 10; i++) {
        await controller.send(i);
      }
      expect(controller.state).toBe("critical");

      // Consume one - now at 9/10 = 0.9 which is >= 1 (no, it's < 1)
      // Critical is when ratio >= 1, so 9/10 = 0.9 < 1 means warning
      controller.receive();
      // 9/10 = 0.9 >= warningThreshold 0.5, but < 1, so warning
      expect(controller.state).toBe("warning");

      // Consume more to get back to normal (need < 50%)
      while (controller.state !== "normal") {
        controller.receive();
      }
      expect(controller.state).toBe("normal");
    });

    it("should transition from warning to normal when items are consumed", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 10,
        warningThreshold: 0.5,
        strategy: "drop_newest",
      });

      // Fill to warning
      for (let i = 0; i < 6; i++) {
        await controller.send(i);
      }
      expect(controller.state).toBe("warning");

      // Consume to get below warning threshold
      controller.receive();
      controller.receive();
      expect(controller.state).toBe("normal");
    });
  });

  describe("Strategy: block", () => {
    it("should block when queue is full with block strategy", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 3,
        strategy: "block",
      });

      // Fill queue
      await controller.send(1);
      await controller.send(2);
      await controller.send(3);

      expect(controller.size).toBe(3);
      expect(controller.isBlocked).toBe(false);

      // Start blocking send
      let resolved = false;
      const sendPromise = controller.send(4).then(() => {
        resolved = true;
      });

      // Give time for the promise to start waiting
      await vi.advanceTimersByTimeAsync(10);
      expect(controller.isBlocked).toBe(true);
      expect(resolved).toBe(false);

      // Consume an item to unblock
      controller.receive();
      await sendPromise;

      expect(resolved).toBe(true);
      expect(controller.isBlocked).toBe(false);
    });
  });

  describe("Strategy: drop_oldest", () => {
    it("should drop oldest item when queue is full", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 3,
        strategy: "drop_oldest",
      });

      await controller.send(1);
      await controller.send(2);
      await controller.send(3);
      await controller.send(4); // Should drop 1

      expect(controller.size).toBe(3);
      expect(controller.receive()).toBe(2); // 1 was dropped
      expect(controller.receive()).toBe(3);
      expect(controller.receive()).toBe(4);
    });

    it("should return true for drop_oldest sends", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 2,
        strategy: "drop_oldest",
      });

      await controller.send(1);
      await controller.send(2);
      const result = await controller.send(3);

      expect(result).toBe(true); // Item was added (oldest dropped)
    });
  });

  describe("Strategy: drop_newest", () => {
    it("should drop new item when queue is full", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 3,
        strategy: "drop_newest",
      });

      await controller.send(1);
      await controller.send(2);
      await controller.send(3);
      const dropped = await controller.send(4); // Should be dropped

      expect(dropped).toBe(false);
      expect(controller.size).toBe(3);
      expect(controller.receive()).toBe(1);
      expect(controller.receive()).toBe(2);
      expect(controller.receive()).toBe(3);
    });
  });

  describe("Strategy: coalesce", () => {
    it("should fall back to drop_oldest when coalesce not implemented", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 3,
        strategy: "coalesce",
      });

      await controller.send(1);
      await controller.send(2);
      await controller.send(3);
      await controller.send(4); // Falls back to drop_oldest

      expect(controller.size).toBe(3);
      expect(controller.receive()).toBe(2); // 1 was dropped
    });
  });

  describe("EC-005: Rapid State Transitions", () => {
    it("should handle rapid fill and drain cycles", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 5,
        warningThreshold: 0.6, // 60% = 3 items
        strategy: "drop_newest",
      });

      // Rapid cycle 1: fill to critical
      for (let i = 0; i < 5; i++) {
        await controller.send(i);
      }
      expect(controller.state).toBe("critical");

      // Rapid drain
      while (controller.hasItems()) {
        controller.receive();
      }
      expect(controller.state).toBe("normal");

      // Rapid cycle 2: fill again
      for (let i = 0; i < 5; i++) {
        await controller.send(i);
      }
      expect(controller.state).toBe("critical");

      // Partial drain
      controller.receive();
      controller.receive();
      expect(controller.state).toBe("warning");
    });

    it("should maintain consistency during rapid transitions", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 10,
        warningThreshold: 0.5,
        strategy: "drop_newest",
      });

      // Rapid alternating fill/drain
      for (let cycle = 0; cycle < 100; cycle++) {
        // Fill to warning
        while (controller.state === "normal") {
          await controller.send(cycle);
        }

        // Drain to normal
        while ((controller.state as string) !== "normal") {
          controller.receive();
        }
      }

      // Controller should remain functional
      expect(controller.state).toBe("normal");
      expect(controller.size).toBeLessThanOrEqual(10);
    });

    it("should handle state oscillation at threshold boundary", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 10,
        warningThreshold: 0.5, // 5 items
        strategy: "drop_newest",
      });

      // Fill to exactly threshold
      for (let i = 0; i < 5; i++) {
        await controller.send(i);
      }
      expect(controller.state).toBe("warning");

      // Oscillate at boundary
      for (let i = 0; i < 10; i++) {
        controller.receive(); // 4 items - normal
        expect(controller.state).toBe("normal");

        await controller.send(100 + i); // 5 items - warning
        expect(controller.state).toBe("warning");
      }
    });

    it("should handle concurrent sends at capacity", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 5,
        strategy: "drop_newest",
      });

      // Fill queue
      for (let i = 0; i < 5; i++) {
        await controller.send(i);
      }

      // Multiple concurrent sends (all should be dropped)
      const results = await Promise.all([
        controller.send(100),
        controller.send(101),
        controller.send(102),
      ]);

      expect(results).toEqual([false, false, false]);
      expect(controller.size).toBe(5);
    });

    it("should handle watermark transitions with high throughput", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 100,
        warningThreshold: 0.8,
        strategy: "drop_newest",
      });

      const stateHistory: string[] = [];

      // High throughput simulation
      for (let i = 0; i < 1000; i++) {
        await controller.send(i);
        const currentState = controller.state;

        // Track state changes
        if (stateHistory.length === 0 || stateHistory[stateHistory.length - 1] !== currentState) {
          stateHistory.push(currentState);
        }

        // Occasionally drain
        if (i % 10 === 0 && controller.hasItems()) {
          for (let j = 0; j < 5; j++) {
            controller.receive();
          }
        }
      }

      // Should have seen multiple state transitions
      expect(stateHistory.length).toBeGreaterThan(1);
    });
  });

  describe("Queue Operations", () => {
    it("should correctly report hasItems", async () => {
      const controller = new BackpressureController<number>();

      expect(controller.hasItems()).toBe(false);

      await controller.send(1);
      expect(controller.hasItems()).toBe(true);

      controller.receive();
      expect(controller.hasItems()).toBe(false);
    });

    it("should return undefined when receiving from empty queue", () => {
      const controller = new BackpressureController<number>();

      expect(controller.receive()).toBeUndefined();
    });

    it("should clear queue and reset state", async () => {
      const controller = new BackpressureController<number>({
        maxQueueSize: 5,
        warningThreshold: 0.5,
      });

      // Fill to warning
      for (let i = 0; i < 3; i++) {
        await controller.send(i);
      }
      expect(controller.state).toBe("warning");

      // Clear
      controller.clear();
      expect(controller.size).toBe(0);
      expect(controller.state).toBe("normal");
      expect(controller.hasItems()).toBe(false);
    });
  });
});
