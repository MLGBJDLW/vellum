// ============================================
// T043 - Integration Tests
// CircuitBreaker + GlobalErrorHandler End-to-End
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../events/bus.js";
import { Events } from "../../events/definitions.js";
import { Logger } from "../../logger/logger.js";
import {
  CircuitBreaker,
  circuitClose,
  circuitHalfOpen,
  circuitOpen,
} from "../circuit-breaker/CircuitBreaker.js";
import { CircuitOpenError } from "../circuit-breaker/CircuitOpenError.js";
import { GlobalErrorHandler } from "../handler.js";
import { ErrorNoTelemetry } from "../privacy/ErrorNoTelemetry.js";
import {
  type AggregatedError,
  BufferedErrorTelemetry,
} from "../telemetry/BufferedErrorTelemetry.js";
import { ErrorCode, VellumError } from "../types.js";

describe("Integration: CircuitBreaker + GlobalErrorHandler", () => {
  let eventBus: EventBus;
  let logger: Logger;
  let handler: GlobalErrorHandler;
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = new EventBus();
    logger = new Logger({ level: "error" }); // Suppress logs in tests
    handler = new GlobalErrorHandler({ logger, eventBus });
    BufferedErrorTelemetry.resetInstance();
  });

  afterEach(() => {
    breaker?.dispose();
    BufferedErrorTelemetry.resetInstance();
    vi.useRealTimers();
  });

  describe("T043: End-to-end flow: error → circuit opens → EventBus event → handler skips telemetry", () => {
    it("should open circuit after threshold failures and emit event", async () => {
      const circuitEvents: unknown[] = [];
      const errorEvents: unknown[] = [];

      // Listen for circuit:open events
      eventBus.on(circuitOpen, (payload) => circuitEvents.push(payload));
      // Listen for error events
      eventBus.on(Events.error, (payload) => errorEvents.push(payload));

      breaker = new CircuitBreaker("api-service", {
        failureThreshold: 3,
        eventBus,
      });

      // Simulate 3 failures to trigger circuit open
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new VellumError("API failed", ErrorCode.LLM_NETWORK_ERROR);
          });
        } catch (error) {
          handler.handle(error);
        }
      }

      // Verify circuit:open event was emitted
      expect(circuitEvents).toHaveLength(1);
      expect(circuitEvents[0]).toMatchObject({
        circuitId: "api-service",
        failureCount: 3,
      });

      // Verify error events were emitted for each failure
      expect(errorEvents).toHaveLength(3);
    });

    it("should reject with CircuitOpenError when circuit is open", async () => {
      breaker = new CircuitBreaker("test-service", {
        failureThreshold: 1,
        resetTimeoutMs: 30000,
        eventBus,
      });

      // Trigger circuit open
      await expect(
        breaker.execute(async () => {
          throw new VellumError("First failure", ErrorCode.LLM_TIMEOUT);
        })
      ).rejects.toThrow();

      expect(breaker.getState()).toBe("OPEN");

      // Next attempt should throw CircuitOpenError
      try {
        await breaker.execute(async () => "success");
        expect.fail("Should have thrown CircuitOpenError");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        const circuitError = error as CircuitOpenError;
        expect(circuitError.circuitId).toBe("test-service");
        expect(circuitError.retryAfterMs).toBeLessThanOrEqual(30000);
      }
    });

    it("should skip telemetry for ErrorNoTelemetry errors", async () => {
      const errorEvents: unknown[] = [];
      eventBus.on(Events.error, (payload) => errorEvents.push(payload));

      // Create sensitive error
      const sensitiveError = new ErrorNoTelemetry(
        "Auth credentials invalid",
        ErrorCode.LLM_AUTH_FAILED
      );

      // Handle error
      const result = handler.handle(sensitiveError);

      // Should return the error
      expect(result).toBe(sensitiveError);
      expect(sensitiveError.skipTelemetry).toBe(true);

      // Should NOT emit to event bus (telemetry skip)
      expect(errorEvents).toHaveLength(0);
    });

    it("should emit error event for regular VellumError", async () => {
      const errorEvents: unknown[] = [];
      eventBus.on(Events.error, (payload) => errorEvents.push(payload));

      const regularError = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);
      handler.handle(regularError);

      // Should emit to event bus
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]).toMatchObject({
        error: regularError,
      });
    });
  });

  describe("CircuitBreaker + BufferedErrorTelemetry integration", () => {
    it("should aggregate circuit open errors correctly", async () => {
      const flushed: AggregatedError[][] = [];
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        onFlush: (errors) => {
          flushed.push(errors);
        },
      });

      breaker = new CircuitBreaker("payment-service", {
        failureThreshold: 1,
        resetTimeoutMs: 5000,
        eventBus,
      });

      // Trigger circuit open
      await expect(
        breaker.execute(async () => {
          throw new VellumError("Payment failed", ErrorCode.LLM_NETWORK_ERROR);
        })
      ).rejects.toThrow();

      // Try multiple times while circuit is open
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(async () => "should not run");
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            telemetry.record(error);
          }
        }
      }

      // Flush and check aggregation
      await telemetry.flush();

      expect(flushed).toHaveLength(1);
      expect(flushed[0]).toHaveLength(1); // All same fingerprint = 1 entry
      expect(flushed[0]?.[0]?.count).toBe(5); // 5 occurrences
    });

    it("should handle mixed error types correctly", async () => {
      const flushed: AggregatedError[][] = [];
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        onFlush: (errors) => {
          flushed.push(errors);
        },
      });

      // Record different types of errors
      telemetry.record(new VellumError("Rate limit", ErrorCode.LLM_RATE_LIMIT));
      telemetry.record(new VellumError("Timeout", ErrorCode.LLM_TIMEOUT));
      telemetry.record(new VellumError("Rate limit", ErrorCode.LLM_RATE_LIMIT)); // Same as first

      // ErrorNoTelemetry should be skipped
      telemetry.record(new ErrorNoTelemetry("Secret", ErrorCode.LLM_AUTH_FAILED));

      await telemetry.flush();

      expect(flushed).toHaveLength(1);
      expect(flushed[0]).toHaveLength(2); // 2 unique fingerprints

      const rateLimit = flushed[0]?.find((e) => e.fingerprint.includes("Rate limit"));
      expect(rateLimit?.count).toBe(2);
    });
  });

  describe("Full recovery cycle", () => {
    it("should recover from OPEN → HALF_OPEN → CLOSED", async () => {
      const stateChanges: string[] = [];

      eventBus.on(circuitOpen, () => stateChanges.push("OPEN"));
      eventBus.on(circuitHalfOpen, () => stateChanges.push("HALF_OPEN"));
      eventBus.on(circuitClose, () => stateChanges.push("CLOSED"));

      breaker = new CircuitBreaker("recovery-test", {
        failureThreshold: 2,
        resetTimeoutMs: 5000,
        eventBus,
      });

      // Trigger failures to open circuit
      for (let i = 0; i < 2; i++) {
        await expect(
          breaker.execute(async () => {
            throw new VellumError("Fail", ErrorCode.LLM_NETWORK_ERROR);
          })
        ).rejects.toThrow();
      }

      expect(breaker.getState()).toBe("OPEN");
      expect(stateChanges).toContain("OPEN");

      // Wait for timeout to transition to HALF_OPEN
      vi.advanceTimersByTime(5000);
      expect(breaker.getState()).toBe("HALF_OPEN");

      // Successful request should close circuit
      await breaker.execute(async () => "recovered");
      expect(breaker.getState()).toBe("CLOSED");
      expect(stateChanges).toContain("CLOSED");
    });

    it("should re-open circuit on failure during HALF_OPEN", async () => {
      breaker = new CircuitBreaker("half-open-fail", {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        eventBus,
      });

      // Open circuit
      await expect(
        breaker.execute(async () => {
          throw new VellumError("Initial fail", ErrorCode.LLM_TIMEOUT);
        })
      ).rejects.toThrow();

      expect(breaker.getState()).toBe("OPEN");

      // Wait for HALF_OPEN
      vi.advanceTimersByTime(1000);
      expect(breaker.getState()).toBe("HALF_OPEN");

      // Fail during HALF_OPEN
      await expect(
        breaker.execute(async () => {
          throw new VellumError("Still failing", ErrorCode.LLM_TIMEOUT);
        })
      ).rejects.toThrow();

      // Should be back to OPEN
      expect(breaker.getState()).toBe("OPEN");
    });
  });

  describe("Handler + Circuit + Telemetry complete flow", () => {
    it("should process error through entire stack", async () => {
      const errorEvents: unknown[] = [];
      const flushed: AggregatedError[][] = [];

      eventBus.on(Events.error, (payload) => errorEvents.push(payload));

      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        onFlush: (errors) => {
          flushed.push(errors);
        },
      });

      breaker = new CircuitBreaker("full-stack", {
        failureThreshold: 2,
        eventBus,
      });

      // Simulate error flow
      const simulateError = async () => {
        try {
          await breaker.execute(async () => {
            throw new VellumError("API Error", ErrorCode.LLM_NETWORK_ERROR);
          });
        } catch (error) {
          // 1. Handler normalizes and logs
          const normalized = handler.handle(error);

          // 2. Record to telemetry buffer
          telemetry.record(normalized);

          return normalized;
        }
      };

      // First error
      const error1 = await simulateError();
      expect(error1).toBeInstanceOf(VellumError);
      expect(errorEvents).toHaveLength(1);
      expect(breaker.getState()).toBe("CLOSED");

      // Second error - triggers circuit open
      await simulateError();
      expect(breaker.getState()).toBe("OPEN");
      expect(errorEvents).toHaveLength(2);

      // Third attempt - circuit rejects immediately
      try {
        await breaker.execute(async () => "should not run");
      } catch (error) {
        const normalized = handler.handle(error);
        telemetry.record(normalized);
        expect(error).toBeInstanceOf(CircuitOpenError);
      }

      // Flush telemetry
      await telemetry.flush();

      expect(flushed).toHaveLength(1);
      // Should have 2 unique fingerprints: VellumError + CircuitOpenError
      expect(flushed[0]?.length).toBe(2);
    });
  });
});
