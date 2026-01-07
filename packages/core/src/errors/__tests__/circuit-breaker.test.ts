// ============================================
// Circuit Breaker Tests
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../events/bus.js";
import {
  CircuitBreaker,
  circuitClose,
  circuitHalfOpen,
  circuitOpen,
} from "../circuit-breaker/CircuitBreaker.js";
import { CircuitBreakerRegistry } from "../circuit-breaker/CircuitBreakerRegistry.js";
import { CircuitOpenError } from "../circuit-breaker/CircuitOpenError.js";
import { ErrorCode } from "../types.js";

// ============================================
// T012 - CircuitOpenError Tests
// ============================================

describe("CircuitOpenError", () => {
  it("should create error with correct properties", () => {
    const error = new CircuitOpenError("test-circuit", 5000);

    expect(error.name).toBe("CircuitOpenError");
    expect(error.circuitId).toBe("test-circuit");
    expect(error.retryAfterMs).toBe(5000);
    expect(error.message).toBe("Circuit breaker 'test-circuit' is open");
    expect(error.code).toBe(ErrorCode.CIRCUIT_OPEN);
    expect(error.isRetryable).toBe(true);
    expect(error.retryDelay).toBe(5000);
  });

  it("should include circuitId and retryAfterMs in context", () => {
    const error = new CircuitOpenError("my-circuit", 10000);

    expect(error.context).toEqual({
      circuitId: "my-circuit",
      retryAfterMs: 10000,
    });
  });

  it("should serialize to JSON correctly", () => {
    const error = new CircuitOpenError("api-service", 30000);
    const json = error.toJSON();

    expect(json.name).toBe("CircuitOpenError");
    expect(json.code).toBe(ErrorCode.CIRCUIT_OPEN);
    expect(json.isRetryable).toBe(true);
    expect(json.context).toEqual({
      circuitId: "api-service",
      retryAfterMs: 30000,
    });
  });
});

// ============================================
// T013 - CircuitBreaker Tests
// ============================================

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    breaker?.dispose();
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("should start in CLOSED state", () => {
      breaker = new CircuitBreaker("test");
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should have zero failure count initially", () => {
      breaker = new CircuitBreaker("test");
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe("CLOSED state behavior (AC-003-1)", () => {
    it("should execute function and return result when CLOSED", async () => {
      breaker = new CircuitBreaker("test");
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should record failures and stay CLOSED below threshold", async () => {
      breaker = new CircuitBreaker("test", { failureThreshold: 5 });

      for (let i = 0; i < 4; i++) {
        await expect(
          breaker.execute(async () => {
            throw new Error("fail");
          })
        ).rejects.toThrow("fail");
      }

      expect(breaker.getFailureCount()).toBe(4);
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should transition to OPEN after failureThreshold failures in windowMs", async () => {
      breaker = new CircuitBreaker("test", {
        failureThreshold: 3,
        windowMs: 60000,
      });

      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute(async () => {
            throw new Error("fail");
          })
        ).rejects.toThrow("fail");
      }

      expect(breaker.getState()).toBe("OPEN");
    });

    it("should count only failures within sliding window", async () => {
      breaker = new CircuitBreaker("test", {
        failureThreshold: 3,
        windowMs: 10000,
      });

      // Record 2 failures
      for (let i = 0; i < 2; i++) {
        await expect(
          breaker.execute(async () => {
            throw new Error("fail");
          })
        ).rejects.toThrow("fail");
      }

      // Wait for failures to expire
      vi.advanceTimersByTime(15000);

      // These failures should be the only ones counted
      for (let i = 0; i < 2; i++) {
        await expect(
          breaker.execute(async () => {
            throw new Error("fail");
          })
        ).rejects.toThrow("fail");
      }

      // Should still be CLOSED (only 2 failures in window)
      expect(breaker.getState()).toBe("CLOSED");
      expect(breaker.getFailureCount()).toBe(2);
    });
  });

  describe("OPEN state behavior (AC-003-2)", () => {
    it("should reject with CircuitOpenError when OPEN", async () => {
      breaker = new CircuitBreaker("test", { failureThreshold: 1 });

      // Trigger OPEN state
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      expect(breaker.getState()).toBe("OPEN");

      // Should reject with CircuitOpenError
      await expect(breaker.execute(async () => "success")).rejects.toThrow(CircuitOpenError);
    });

    it("should include circuit ID in CircuitOpenError", async () => {
      breaker = new CircuitBreaker("my-service", { failureThreshold: 1 });

      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      try {
        await breaker.execute(async () => "success");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).circuitId).toBe("my-service");
      }
    });

    it("should include retryAfterMs in CircuitOpenError", async () => {
      breaker = new CircuitBreaker("test", {
        failureThreshold: 1,
        resetTimeoutMs: 30000,
      });

      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      try {
        await breaker.execute(async () => "success");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        // retryAfterMs should be close to resetTimeoutMs
        expect((error as CircuitOpenError).retryAfterMs).toBeGreaterThanOrEqual(29000);
        expect((error as CircuitOpenError).retryAfterMs).toBeLessThanOrEqual(30000);
      }
    });
  });

  describe("HALF_OPEN state transition (AC-003-3)", () => {
    it("should transition to HALF_OPEN after resetTimeoutMs", async () => {
      breaker = new CircuitBreaker("test", {
        failureThreshold: 1,
        resetTimeoutMs: 5000,
      });

      // Trigger OPEN
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");
      expect(breaker.getState()).toBe("OPEN");

      // Wait for reset timeout
      vi.advanceTimersByTime(5000);

      // Next execute attempt should transition to HALF_OPEN
      await breaker.execute(async () => "success");
      // After success, should be CLOSED
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should auto-transition via timer", async () => {
      breaker = new CircuitBreaker("test", {
        failureThreshold: 1,
        resetTimeoutMs: 5000,
      });

      // Trigger OPEN
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");
      expect(breaker.getState()).toBe("OPEN");

      // Timer should fire and transition to HALF_OPEN
      vi.advanceTimersByTime(5000);

      // State should now be HALF_OPEN
      expect(breaker.getState()).toBe("HALF_OPEN");
    });
  });

  describe("HALF_OPEN state behavior (AC-003-4, AC-003-5)", () => {
    it("should allow single test request in HALF_OPEN", async () => {
      breaker = new CircuitBreaker("test", {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        halfOpenMaxAttempts: 1,
      });

      // Trigger OPEN
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      // Wait for HALF_OPEN
      vi.advanceTimersByTime(1000);
      expect(breaker.getState()).toBe("HALF_OPEN");

      // First request should be allowed
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });

    it("should reject excess requests in HALF_OPEN", async () => {
      breaker = new CircuitBreaker("test", {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        halfOpenMaxAttempts: 1,
      });

      // Trigger OPEN
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      // Wait for HALF_OPEN
      vi.advanceTimersByTime(1000);

      // Start first request (but don't await yet)
      let resolveFirst!: () => void;
      const firstPromise = breaker.execute(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = () => resolve("success");
          })
      );

      // Second request should be rejected
      await expect(breaker.execute(async () => "second")).rejects.toThrow(CircuitOpenError);

      // Complete first request
      resolveFirst();
      await firstPromise;
    });

    it("should transition to CLOSED on success in HALF_OPEN", async () => {
      breaker = new CircuitBreaker("test", {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
      });

      // Trigger OPEN
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      // Wait for HALF_OPEN
      vi.advanceTimersByTime(1000);
      expect(breaker.getState()).toBe("HALF_OPEN");

      // Success should transition to CLOSED
      await breaker.execute(async () => "success");
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should transition to OPEN on failure in HALF_OPEN", async () => {
      breaker = new CircuitBreaker("test", {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
      });

      // Trigger OPEN
      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      // Wait for HALF_OPEN
      vi.advanceTimersByTime(1000);
      expect(breaker.getState()).toBe("HALF_OPEN");

      // Failure should transition back to OPEN
      await expect(
        breaker.execute(async () => {
          throw new Error("fail again");
        })
      ).rejects.toThrow("fail again");

      expect(breaker.getState()).toBe("OPEN");
    });
  });

  describe("EventBus integration (AC-003-6)", () => {
    let eventBus: EventBus;
    let events: Array<{ name: string; payload: unknown }>;

    beforeEach(() => {
      eventBus = new EventBus();
      events = [];

      eventBus.on(circuitOpen, (payload) => events.push({ name: "circuit:open", payload }));
      eventBus.on(circuitClose, (payload) => events.push({ name: "circuit:close", payload }));
      eventBus.on(circuitHalfOpen, (payload) =>
        events.push({ name: "circuit:half-open", payload })
      );
    });

    it("should emit circuit:open when transitioning to OPEN", async () => {
      breaker = new CircuitBreaker("test-service", {
        failureThreshold: 1,
        eventBus,
      });

      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      expect(events).toHaveLength(1);
      expect(events[0]?.name).toBe("circuit:open");
      expect(events[0]?.payload).toMatchObject({
        circuitId: "test-service",
        failureCount: 1,
      });
    });

    it("should emit circuit:half-open when transitioning to HALF_OPEN", async () => {
      breaker = new CircuitBreaker("test-service", {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        eventBus,
      });

      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      events = []; // Clear open event
      vi.advanceTimersByTime(1000);

      expect(events).toHaveLength(1);
      expect(events[0]?.name).toBe("circuit:half-open");
      expect(events[0]?.payload).toMatchObject({
        circuitId: "test-service",
      });
    });

    it("should emit circuit:close when transitioning to CLOSED", async () => {
      breaker = new CircuitBreaker("test-service", {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        eventBus,
      });

      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      vi.advanceTimersByTime(1000);
      events = []; // Clear previous events

      await breaker.execute(async () => "success");

      expect(events).toHaveLength(1);
      expect(events[0]?.name).toBe("circuit:close");
      expect(events[0]?.payload).toMatchObject({
        circuitId: "test-service",
      });
    });
  });

  describe("reset()", () => {
    it("should reset to CLOSED state", async () => {
      breaker = new CircuitBreaker("test", { failureThreshold: 1 });

      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");
      expect(breaker.getState()).toBe("OPEN");

      breaker.reset();
      expect(breaker.getState()).toBe("CLOSED");
      expect(breaker.getFailureCount()).toBe(0);
    });

    it("should allow requests after reset", async () => {
      breaker = new CircuitBreaker("test", { failureThreshold: 1 });

      await expect(
        breaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow("fail");

      breaker.reset();
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });
  });

  describe("recordSuccess() / recordFailure() direct calls", () => {
    it("should allow manual success recording", () => {
      breaker = new CircuitBreaker("test", { failureThreshold: 1 });

      // Force to HALF_OPEN by manipulating state (using type assertion for test access)
      // biome-ignore lint/suspicious/noExplicitAny: Test requires access to private state
      (breaker as any).state = "HALF_OPEN";
      breaker.recordSuccess();

      expect(breaker.getState()).toBe("CLOSED");
    });

    it("should allow manual failure recording", () => {
      breaker = new CircuitBreaker("test", { failureThreshold: 1 });

      breaker.recordFailure();
      expect(breaker.getState()).toBe("OPEN");
    });
  });
});

// ============================================
// T014 - CircuitBreakerRegistry Tests
// ============================================

describe("CircuitBreakerRegistry", () => {
  beforeEach(() => {
    CircuitBreakerRegistry.resetInstance();
  });

  afterEach(() => {
    CircuitBreakerRegistry.resetInstance();
  });

  describe("singleton pattern", () => {
    it("should return same instance on multiple calls", () => {
      const instance1 = CircuitBreakerRegistry.getInstance();
      const instance2 = CircuitBreakerRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = CircuitBreakerRegistry.getInstance();
      CircuitBreakerRegistry.resetInstance();
      const instance2 = CircuitBreakerRegistry.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("get()", () => {
    it("should create new breaker if not exists", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      const breaker = registry.get("test");

      expect(breaker).toBeInstanceOf(CircuitBreaker);
      expect(breaker.id).toBe("test");
    });

    it("should return same breaker on subsequent calls", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      const breaker1 = registry.get("test");
      const breaker2 = registry.get("test");

      expect(breaker1).toBe(breaker2);
    });

    it("should use default options when creating", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      registry.configure({ failureThreshold: 10 });

      const breaker = registry.get("test");
      // Can't directly check options, but can verify behavior
      expect(breaker).toBeInstanceOf(CircuitBreaker);
    });
  });

  describe("getOrCreate()", () => {
    it("should create with custom options", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      const breaker = registry.getOrCreate("test", { failureThreshold: 2 });

      expect(breaker.id).toBe("test");
    });

    it("should return existing breaker ignoring new options", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      const breaker1 = registry.getOrCreate("test", { failureThreshold: 2 });
      const breaker2 = registry.getOrCreate("test", { failureThreshold: 10 });

      expect(breaker1).toBe(breaker2);
    });
  });

  describe("has()", () => {
    it("should return false for non-existent breaker", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      expect(registry.has("test")).toBe(false);
    });

    it("should return true for existing breaker", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      registry.get("test");
      expect(registry.has("test")).toBe(true);
    });
  });

  describe("remove()", () => {
    it("should return false for non-existent breaker", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      expect(registry.remove("test")).toBe(false);
    });

    it("should return true and remove existing breaker", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      registry.get("test");

      expect(registry.remove("test")).toBe(true);
      expect(registry.has("test")).toBe(false);
    });
  });

  describe("getAll()", () => {
    it("should return empty array when no breakers", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      expect(registry.getAll()).toEqual([]);
    });

    it("should return all breakers", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      registry.get("test1");
      registry.get("test2");
      registry.get("test3");

      const all = registry.getAll();
      expect(all).toHaveLength(3);
      expect(all.map((b) => b.id).sort()).toEqual(["test1", "test2", "test3"]);
    });
  });

  describe("getIds()", () => {
    it("should return all breaker IDs", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      registry.get("alpha");
      registry.get("beta");

      const ids = registry.getIds();
      expect(ids.sort()).toEqual(["alpha", "beta"]);
    });
  });

  describe("resetAll()", () => {
    it("should reset all breakers to CLOSED", async () => {
      vi.useFakeTimers();
      const registry = CircuitBreakerRegistry.getInstance();
      const breaker1 = registry.getOrCreate("test1", { failureThreshold: 1 });
      const breaker2 = registry.getOrCreate("test2", { failureThreshold: 1 });

      // Open both breakers
      await expect(
        breaker1.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();
      await expect(
        breaker2.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();

      expect(breaker1.getState()).toBe("OPEN");
      expect(breaker2.getState()).toBe("OPEN");

      registry.resetAll();

      expect(breaker1.getState()).toBe("CLOSED");
      expect(breaker2.getState()).toBe("CLOSED");
      vi.useRealTimers();
    });
  });

  describe("configure()", () => {
    it("should set default options for new breakers", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      registry.configure({ failureThreshold: 10 });

      const options = registry.getDefaultOptions();
      expect(options.failureThreshold).toBe(10);
    });

    it("should merge with existing options", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      registry.configure({ failureThreshold: 10 });
      registry.configure({ resetTimeoutMs: 5000 });

      const options = registry.getDefaultOptions();
      expect(options.failureThreshold).toBe(10);
      expect(options.resetTimeoutMs).toBe(5000);
    });
  });

  describe("setEventBus()", () => {
    it("should set event bus for new breakers", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      const eventBus = new EventBus();
      registry.setEventBus(eventBus);

      // Event bus should be used for new breakers
      // Can't directly verify, but ensures no error
      registry.get("test");
    });
  });

  describe("getStats()", () => {
    it("should return zero counts when empty", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      const stats = registry.getStats();

      expect(stats).toEqual({
        total: 0,
        closed: 0,
        open: 0,
        halfOpen: 0,
      });
    });

    it("should count breakers by state", async () => {
      vi.useFakeTimers();
      const registry = CircuitBreakerRegistry.getInstance();

      // Create CLOSED breaker
      registry.get("closed");

      // Create OPEN breaker
      const openBreaker = registry.getOrCreate("open", { failureThreshold: 1 });
      await expect(
        openBreaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();

      // Create HALF_OPEN breaker
      const halfOpenBreaker = registry.getOrCreate("halfOpen", {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
      });
      await expect(
        halfOpenBreaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();
      vi.advanceTimersByTime(1000);

      const stats = registry.getStats();
      expect(stats.total).toBe(3);
      expect(stats.closed).toBe(1);
      expect(stats.open).toBe(1);
      expect(stats.halfOpen).toBe(1);
      vi.useRealTimers();
    });
  });

  describe("dispose()", () => {
    it("should clear all breakers", () => {
      const registry = CircuitBreakerRegistry.getInstance();
      registry.get("test1");
      registry.get("test2");

      registry.dispose();

      expect(registry.getAll()).toEqual([]);
      expect(registry.getDefaultOptions()).toEqual({});
    });
  });
});
