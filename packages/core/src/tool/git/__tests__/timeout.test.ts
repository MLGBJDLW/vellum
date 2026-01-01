// ============================================
// Git Timeout Integration Tests - T019
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode, VellumError } from "../../../errors/types.js";
import { GIT_TIMEOUTS } from "../types.js";
import { withTimeout } from "../utils.js";

// =============================================================================
// withTimeout() Utility Tests
// =============================================================================

describe("withTimeout", () => {
  // Use fake timers for consistent testing
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("basic functionality", () => {
    it("should resolve when operation completes before timeout", async () => {
      const operation = Promise.resolve("success");

      const resultPromise = withTimeout(operation, 1000, "test-operation");
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toBe("success");
    });

    it("should pass through the operation result", async () => {
      const expected = { data: [1, 2, 3], status: "ok" };
      const operation = Promise.resolve(expected);

      const resultPromise = withTimeout(operation, 1000, "test-operation");
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toEqual(expected);
    });

    it("should pass through operation errors", async () => {
      // Create operation with proper error handling setup
      let rejectFn!: (error: Error) => void;
      const operation = new Promise<string>((_, reject) => {
        rejectFn = reject;
      });

      const resultPromise = withTimeout(operation, 1000, "test-operation");

      // Set up catch handler before rejecting
      let caughtError: Error | undefined;
      resultPromise.catch((e: Error) => {
        caughtError = e;
      });

      // Reject the operation
      rejectFn?.(new Error("operation failed"));
      await vi.runAllTimersAsync();

      expect(caughtError?.message).toBe("operation failed");
    });
  });

  describe("timeout handling", () => {
    it("should reject with GIT_TIMEOUT error when operation exceeds timeout", async () => {
      // Create a slow operation that takes longer than timeout
      const slowOperation = new Promise<string>((resolve) => {
        setTimeout(() => resolve("too slow"), 5000);
      });

      const resultPromise = withTimeout(slowOperation, 100, "slow-operation");

      // Set up catch handler before advancing time
      let caughtError: VellumError | undefined;
      resultPromise.catch((e: VellumError) => {
        caughtError = e;
      });

      // Advance time past the timeout
      await vi.advanceTimersByTimeAsync(150);

      expect(caughtError).toBeInstanceOf(VellumError);
      expect((caughtError as VellumError).code).toBe(ErrorCode.GIT_TIMEOUT);
      expect((caughtError as VellumError).message).toContain("slow-operation");
      expect((caughtError as VellumError).message).toContain("timed out");
    });

    it("should include operation name in timeout error", async () => {
      const slowOperation = new Promise<string>((resolve) => {
        setTimeout(() => resolve("data"), 5000);
      });

      const resultPromise = withTimeout(slowOperation, 100, "git fetch");

      let caughtError: VellumError | undefined;
      resultPromise.catch((e: VellumError) => {
        caughtError = e;
      });

      await vi.advanceTimersByTimeAsync(150);

      expect(caughtError).toBeInstanceOf(VellumError);
      expect((caughtError as VellumError).message).toContain("git fetch");
    });

    it("should use correct timeout for LOCAL operations (5s)", async () => {
      const operation = new Promise<string>((resolve) => {
        setTimeout(() => resolve("data"), 10000);
      });

      const resultPromise = withTimeout(operation, GIT_TIMEOUTS.LOCAL, "status");

      let caughtError: VellumError | undefined;
      resultPromise.catch((e: VellumError) => {
        caughtError = e;
      });

      // Should not timeout at 4s
      await vi.advanceTimersByTimeAsync(4000);
      expect(caughtError).toBeUndefined();

      // Should timeout at 5s
      await vi.advanceTimersByTimeAsync(1500);
      expect(caughtError).toBeInstanceOf(VellumError);
    });

    it("should use correct timeout for NETWORK operations (30s)", async () => {
      const operation = new Promise<string>((resolve) => {
        setTimeout(() => resolve("data"), 60000);
      });

      const resultPromise = withTimeout(operation, GIT_TIMEOUTS.NETWORK, "fetch");

      let caughtError: VellumError | undefined;
      resultPromise.catch((e: VellumError) => {
        caughtError = e;
      });

      // Should not timeout at 25s
      await vi.advanceTimersByTimeAsync(25000);
      expect(caughtError).toBeUndefined();

      // Should timeout at 30s
      await vi.advanceTimersByTimeAsync(6000);
      expect(caughtError).toBeInstanceOf(VellumError);
    });
  });

  describe("abort signal handling", () => {
    it("should reject when abort signal is triggered before operation completes", async () => {
      const controller = new AbortController();
      const slowOperation = new Promise<string>((resolve) => {
        setTimeout(() => resolve("data"), 5000);
      });

      const resultPromise = withTimeout(slowOperation, 10000, "abortable-op", controller.signal);

      let caughtError: VellumError | undefined;
      resultPromise.catch((e: VellumError) => {
        caughtError = e;
      });

      // Abort before timeout
      controller.abort();
      await vi.advanceTimersByTimeAsync(10);

      expect(caughtError).toBeInstanceOf(VellumError);
      expect((caughtError as VellumError).code).toBe(ErrorCode.GIT_TIMEOUT);
    });

    it("should reject immediately if signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort(); // Pre-abort

      const operation = Promise.resolve("data");
      const resultPromise = withTimeout(operation, 1000, "pre-aborted", controller.signal);

      let caughtError: VellumError | undefined;
      resultPromise.catch((e: VellumError) => {
        caughtError = e;
      });

      await vi.runAllTimersAsync();

      expect(caughtError).toBeInstanceOf(VellumError);
    });

    it("should not reject after successful completion even if signal is later aborted", async () => {
      const controller = new AbortController();
      const operation = Promise.resolve("immediate-success");

      const resultPromise = withTimeout(operation, 1000, "immediate-op", controller.signal);
      const result = await resultPromise;

      expect(result).toBe("immediate-success");

      // Aborting after success should have no effect
      controller.abort();
      // No exception thrown
    });
  });

  describe("cleanup behavior", () => {
    it("should clean up timeout when operation completes", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const operation = Promise.resolve("done");

      const resultPromise = withTimeout(operation, 10000, "cleanup-test");
      await vi.runAllTimersAsync();

      await resultPromise;
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("should clean up timeout when operation fails", async () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      // Create operation with proper error handling
      let rejectFn!: (error: Error) => void;
      const operation = new Promise<string>((_, reject) => {
        rejectFn = reject;
      });

      const resultPromise = withTimeout(operation, 10000, "cleanup-test");

      // Set up catch handler before rejecting
      let caughtError: Error | undefined;
      resultPromise.catch((e: Error) => {
        caughtError = e;
      });

      // Reject the operation
      rejectFn?.(new Error("failed"));
      await vi.runAllTimersAsync();

      expect(caughtError?.message).toBe("failed");
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle zero timeout", async () => {
      const operation = new Promise<string>((resolve) => {
        setTimeout(() => resolve("data"), 100);
      });

      const resultPromise = withTimeout(operation, 0, "zero-timeout");

      let caughtError: VellumError | undefined;
      resultPromise.catch((e: VellumError) => {
        caughtError = e;
      });

      await vi.advanceTimersByTimeAsync(1);

      expect(caughtError).toBeInstanceOf(VellumError);
    });

    it("should handle very short timeout", async () => {
      const operation = new Promise<string>((resolve) => {
        setTimeout(() => resolve("data"), 100);
      });

      const resultPromise = withTimeout(operation, 1, "short-timeout");

      let caughtError: VellumError | undefined;
      resultPromise.catch((e: VellumError) => {
        caughtError = e;
      });

      await vi.advanceTimersByTimeAsync(5);

      expect(caughtError).toBeInstanceOf(VellumError);
    });

    it("should handle concurrent timeout operations", async () => {
      const op1Promise = new Promise<string>((resolve) => setTimeout(() => resolve("fast"), 50));
      const op2Promise = new Promise<string>((resolve) => setTimeout(() => resolve("slow"), 500));

      const promise1 = withTimeout(op1Promise, 100, "fast-op");
      const promise2 = withTimeout(op2Promise, 100, "slow-op");

      // Set up error handler for promise2
      let caughtError: VellumError | undefined;
      promise2.catch((e) => {
        caughtError = e;
      });

      await vi.advanceTimersByTimeAsync(75);
      await expect(promise1).resolves.toBe("fast");

      await vi.advanceTimersByTimeAsync(50);
      expect(caughtError).toBeInstanceOf(VellumError);
    });
  });
});

// =============================================================================
// GIT_TIMEOUTS Constants Tests
// =============================================================================

describe("GIT_TIMEOUTS constants", () => {
  it("should define LOCAL timeout as 5 seconds", () => {
    expect(GIT_TIMEOUTS.LOCAL).toBe(5000);
  });

  it("should define NETWORK timeout as 30 seconds", () => {
    expect(GIT_TIMEOUTS.NETWORK).toBe(30000);
  });

  it("should be read-only (const)", () => {
    // TypeScript would catch this at compile time, but we can verify values are correct
    const timeouts = { ...GIT_TIMEOUTS };
    expect(timeouts).toEqual({
      LOCAL: 5000,
      NETWORK: 30000,
    });
  });
});

// =============================================================================
// Integration with Mock Slow Operations
// =============================================================================

describe("timeout integration with mock slow operations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should timeout simulated slow git fetch", async () => {
    // Simulate a git fetch that takes too long
    let resolved = false;
    const mockSlowFetch = new Promise<string>((resolve) => {
      setTimeout(() => {
        resolved = true;
        resolve("fetched data");
      }, 35000); // 35 seconds, exceeds 30s network timeout
    });

    const resultPromise = withTimeout(mockSlowFetch, GIT_TIMEOUTS.NETWORK, "git fetch");

    // Set up catch handler before advancing time
    let caughtError: VellumError | undefined;
    resultPromise.catch((e: VellumError) => {
      caughtError = e;
    });

    // Fast-forward past the timeout
    await vi.advanceTimersByTimeAsync(31000);

    expect(caughtError).toBeInstanceOf(VellumError);
    expect((caughtError as VellumError).code).toBe(ErrorCode.GIT_TIMEOUT);
    expect(resolved).toBe(false); // Original promise should not have resolved yet
  });

  it("should not timeout fast git status", async () => {
    // Simulate a fast git status
    const mockFastStatus = new Promise<{ clean: boolean }>((resolve) => {
      setTimeout(() => {
        resolve({ clean: true });
      }, 100); // 100ms, well under 5s local timeout
    });

    const resultPromise = withTimeout(mockFastStatus, GIT_TIMEOUTS.LOCAL, "git status");

    await vi.advanceTimersByTimeAsync(200);

    await expect(resultPromise).resolves.toEqual({ clean: true });
  });

  it("should handle aborted network operation", async () => {
    const controller = new AbortController();

    const mockNetworkOp = new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve("data");
      }, 10000);
    });

    const resultPromise = withTimeout(
      mockNetworkOp,
      GIT_TIMEOUTS.NETWORK,
      "git push",
      controller.signal
    );

    // Set up catch handler before aborting
    let caughtError: VellumError | undefined;
    resultPromise.catch((e: VellumError) => {
      caughtError = e;
    });

    // Simulate user cancellation after 5 seconds
    await vi.advanceTimersByTimeAsync(5000);
    controller.abort();
    await vi.advanceTimersByTimeAsync(10);

    expect(caughtError).toBeInstanceOf(VellumError);
    expect((caughtError as VellumError).code).toBe(ErrorCode.GIT_TIMEOUT);
  });

  it("should properly isolate concurrent operations", async () => {
    const results: Array<{ name: string; result: string | Error }> = [];

    const op1Promise = new Promise<string>((resolve) => setTimeout(() => resolve("op1-done"), 50));
    const op2Promise = new Promise<string>((resolve) => setTimeout(() => resolve("op2-done"), 150)); // Will timeout
    const op3Promise = new Promise<string>((resolve) => setTimeout(() => resolve("op3-done"), 80));

    const op1 = withTimeout(op1Promise, 100, "op1");
    const op2 = withTimeout(op2Promise, 100, "op2");
    const op3 = withTimeout(op3Promise, 100, "op3");

    // Set up handlers
    const p1 = op1
      .then((r) => results.push({ name: "op1", result: r }))
      .catch((e) => results.push({ name: "op1", result: e }));
    const p2 = op2
      .then((r) => results.push({ name: "op2", result: r }))
      .catch((e) => results.push({ name: "op2", result: e }));
    const p3 = op3
      .then((r) => results.push({ name: "op3", result: r }))
      .catch((e) => results.push({ name: "op3", result: e }));

    // Run all timers
    await vi.advanceTimersByTimeAsync(200);

    // Wait for all promises to settle
    await Promise.all([p1, p2, p3]);

    expect(results).toHaveLength(3);

    const op1Result = results.find((r) => r.name === "op1");
    const op2Result = results.find((r) => r.name === "op2");
    const op3Result = results.find((r) => r.name === "op3");

    expect(op1Result?.result).toBe("op1-done");
    expect(op2Result?.result).toBeInstanceOf(VellumError);
    expect(op3Result?.result).toBe("op3-done");
  });
});
