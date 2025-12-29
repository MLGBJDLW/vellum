import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorNoTelemetry } from "../privacy/ErrorNoTelemetry.js";
import {
  type AggregatedError,
  BufferedErrorTelemetry,
} from "../telemetry/BufferedErrorTelemetry.js";
import { ErrorCode, VellumError } from "../types.js";

describe("BufferedErrorTelemetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    BufferedErrorTelemetry.resetInstance();
  });

  afterEach(() => {
    BufferedErrorTelemetry.resetInstance();
    vi.useRealTimers();
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = BufferedErrorTelemetry.getInstance();
      const instance2 = BufferedErrorTelemetry.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("record", () => {
    it("should record an error in the buffer", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      const error = new VellumError("Test error", ErrorCode.LLM_RATE_LIMIT);

      telemetry.record(error);

      expect(telemetry.getBufferSize()).toBe(1);
    });

    it("AC-009-1: should aggregate errors with same fingerprint", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      const error1 = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);
      const error2 = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);

      telemetry.record(error1);
      telemetry.record(error2);

      expect(telemetry.getBufferSize()).toBe(1);

      const snapshot = telemetry.getBufferSnapshot();
      expect(snapshot[0]?.count).toBe(2);
    });

    it("AC-009-1: should keep separate entries for different fingerprints", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      const error1 = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);
      const error2 = new VellumError("Auth failed", ErrorCode.LLM_AUTH_FAILED);

      telemetry.record(error1);
      telemetry.record(error2);

      expect(telemetry.getBufferSize()).toBe(2);
    });

    it("should skip errors with skipTelemetry=true", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      const error = new ErrorNoTelemetry("Sensitive error", ErrorCode.LLM_AUTH_FAILED);

      telemetry.record(error);

      expect(telemetry.getBufferSize()).toBe(0);
    });

    it("should track firstSeen and lastSeen timestamps", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      const error = new VellumError("Test error", ErrorCode.LLM_RATE_LIMIT);

      const firstTime = Date.now();
      telemetry.record(error);

      vi.advanceTimersByTime(5000);

      const secondTime = Date.now();
      telemetry.record(new VellumError("Test error", ErrorCode.LLM_RATE_LIMIT));

      const snapshot = telemetry.getBufferSnapshot();
      expect(snapshot[0]?.firstSeen).toBe(firstTime);
      expect(snapshot[0]?.lastSeen).toBe(secondTime);
    });

    it("should keep first error as sample", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      const error1 = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);
      const error2 = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT);

      telemetry.record(error1);
      telemetry.record(error2);

      const snapshot = telemetry.getBufferSnapshot();
      expect(snapshot[0]?.sample).toBe(error1);
    });

    it("should auto-flush when buffer exceeds max size", async () => {
      const flushed: AggregatedError[][] = [];
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        maxBufferSize: 3,
        onFlush: (errors) => {
          flushed.push(errors);
        },
      });

      // Record 3 different errors to hit max size
      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));
      telemetry.record(new VellumError("Error 2", ErrorCode.LLM_TIMEOUT));
      telemetry.record(new VellumError("Error 3", ErrorCode.LLM_NETWORK_ERROR));

      // Allow the void promise to settle
      await Promise.resolve();

      expect(flushed.length).toBe(1);
      expect(flushed[0]?.length).toBe(3);
    });
  });

  describe("flush", () => {
    it("AC-009-2: should send aggregated errors to onFlush callback", async () => {
      const flushed: AggregatedError[][] = [];
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        onFlush: (errors) => {
          flushed.push(errors);
        },
      });

      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));
      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));

      await telemetry.flush();

      expect(flushed.length).toBe(1);
      expect(flushed[0]?.length).toBe(1);
      expect(flushed[0]?.[0]?.count).toBe(2);
    });

    it("AC-009-2: should clear buffer after flush", async () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({ onFlush: () => {} });

      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));

      await telemetry.flush();

      expect(telemetry.getBufferSize()).toBe(0);
    });

    it("should not flush if buffer is empty", async () => {
      let flushCalled = false;
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        onFlush: () => {
          flushCalled = true;
        },
      });

      await telemetry.flush();

      expect(flushCalled).toBe(false);
    });

    it("should prevent concurrent flushes", async () => {
      let flushCount = 0;
      let resolveFlush: (() => void) | undefined;
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        onFlush: async () => {
          flushCount++;
          await new Promise<void>((resolve) => {
            resolveFlush = resolve;
          });
        },
      });

      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));

      // Start two flushes simultaneously
      const flush1 = telemetry.flush();
      const flush2 = telemetry.flush();

      // Second flush should return immediately since first is in progress
      expect(flushCount).toBe(1);

      // Complete the first flush
      resolveFlush?.();
      await Promise.all([flush1, flush2]);

      expect(flushCount).toBe(1);
    });

    it("should handle async onFlush callback", async () => {
      const results: string[] = [];
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        onFlush: async (errors) => {
          await Promise.resolve();
          results.push(`Flushed ${errors.length} errors`);
        },
      });

      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));
      await telemetry.flush();

      expect(results).toEqual(["Flushed 1 errors"]);
    });
  });

  describe("generateFingerprint", () => {
    it("should generate fingerprint from name, code, and message", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      const error = new VellumError("Test error message", ErrorCode.LLM_RATE_LIMIT);

      const fingerprint = telemetry.generateFingerprint(error);

      expect(fingerprint).toBe("VellumError-2001-Test error message");
    });

    it("should truncate message to 100 chars", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      const longMessage = "A".repeat(150);
      const error = new VellumError(longMessage, ErrorCode.LLM_RATE_LIMIT);

      const fingerprint = telemetry.generateFingerprint(error);

      expect(fingerprint).toBe(`VellumError-2001-${"A".repeat(100)}`);
    });

    it("should produce same fingerprint for same error type", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      const error1 = new VellumError("Same message", ErrorCode.LLM_RATE_LIMIT);
      const error2 = new VellumError("Same message", ErrorCode.LLM_RATE_LIMIT);

      const fp1 = telemetry.generateFingerprint(error1);
      const fp2 = telemetry.generateFingerprint(error2);

      expect(fp1).toBe(fp2);
    });

    it("should produce different fingerprints for different error types", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      const error1 = new VellumError("Same message", ErrorCode.LLM_RATE_LIMIT);
      const error2 = new VellumError("Same message", ErrorCode.LLM_TIMEOUT);

      const fp1 = telemetry.generateFingerprint(error1);
      const fp2 = telemetry.generateFingerprint(error2);

      expect(fp1).not.toBe(fp2);
    });
  });

  describe("configure", () => {
    it("should update flush interval", async () => {
      const flushed: AggregatedError[][] = [];
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        flushIntervalMs: 1000,
        onFlush: (errors) => {
          flushed.push(errors);
        },
      });

      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));

      // Advance less than interval
      vi.advanceTimersByTime(500);
      expect(flushed.length).toBe(0);

      // Advance past interval
      vi.advanceTimersByTime(600);
      expect(flushed.length).toBe(1);
    });

    it("should update max buffer size", async () => {
      const flushed: AggregatedError[][] = [];
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        maxBufferSize: 2,
        onFlush: (errors) => {
          flushed.push(errors);
        },
      });

      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));
      expect(flushed.length).toBe(0);

      telemetry.record(new VellumError("Error 2", ErrorCode.LLM_TIMEOUT));

      // Allow the void promise to settle
      await Promise.resolve();

      expect(flushed.length).toBe(1);
    });
  });

  describe("dispose", () => {
    it("should clear buffer and stop timer", () => {
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));

      telemetry.dispose();

      expect(telemetry.getBufferSize()).toBe(0);
    });
  });

  describe("disposeAndFlush", () => {
    it("should flush before disposing", async () => {
      const flushed: AggregatedError[][] = [];
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        onFlush: (errors) => {
          flushed.push(errors);
        },
      });

      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));

      await telemetry.disposeAndFlush();

      expect(flushed.length).toBe(1);
      expect(telemetry.getBufferSize()).toBe(0);
    });
  });

  describe("clear", () => {
    it("should clear buffer without flushing", () => {
      let flushed = false;
      const telemetry = BufferedErrorTelemetry.getInstance();
      telemetry.configure({
        onFlush: () => {
          flushed = true;
        },
      });

      telemetry.record(new VellumError("Error 1", ErrorCode.LLM_RATE_LIMIT));
      telemetry.clear();

      expect(telemetry.getBufferSize()).toBe(0);
      expect(flushed).toBe(false);
    });
  });
});
