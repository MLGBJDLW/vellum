import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  withSessionRetry,
  abortableSleep,
  calculateRetryDelay,
  createSessionRetry,
  isAbortError,
  RetryAbortedError,
} from "../retry.js";
import { VellumError, ErrorCode } from "../../errors/index.js";

describe("Session Retry (T022)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe("abortableSleep", () => {
    it("sleeps for specified duration", async () => {
      const promise = abortableSleep(1000);
      vi.advanceTimersByTime(1000);
      await expect(promise).resolves.toBeUndefined();
    });

    it("throws RetryAbortedError if signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(abortableSleep(1000, controller.signal)).rejects.toThrow(RetryAbortedError);
    });

    it("throws RetryAbortedError when signal is aborted during sleep", async () => {
      const controller = new AbortController();
      const promise = abortableSleep(2000, controller.signal);

      // Abort after 500ms
      vi.advanceTimersByTime(500);
      controller.abort();

      await expect(promise).rejects.toThrow(RetryAbortedError);
    });

    it("cleans up timeout when aborted", async () => {
      const controller = new AbortController();
      const promise = abortableSleep(2000, controller.signal);

      controller.abort();

      await expect(promise).rejects.toThrow(RetryAbortedError);

      // Should not throw if we advance time
      vi.advanceTimersByTime(3000);
    });
  });

  describe("calculateRetryDelay", () => {
    it("uses exponential backoff", () => {
      expect(calculateRetryDelay(1, 1000, 30000, new Error())).toBe(1000);
      expect(calculateRetryDelay(2, 1000, 30000, new Error())).toBe(2000);
      expect(calculateRetryDelay(3, 1000, 30000, new Error())).toBe(4000);
      expect(calculateRetryDelay(4, 1000, 30000, new Error())).toBe(8000);
    });

    it("respects maxDelay", () => {
      expect(calculateRetryDelay(10, 1000, 30000, new Error())).toBe(30000);
    });

    it("respects VellumError.retryDelay", () => {
      const error = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT, {
        retryDelay: 5000,
      });
      expect(calculateRetryDelay(1, 1000, 30000, error)).toBe(5000);
    });

    it("caps VellumError.retryDelay at maxDelay", () => {
      const error = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT, {
        retryDelay: 60000,
      });
      expect(calculateRetryDelay(1, 1000, 30000, error)).toBe(30000);
    });
  });

  describe("withSessionRetry", () => {
    it("succeeds on first try", async () => {
      const fn = vi.fn().mockResolvedValue("success");

      const result = await withSessionRetry(fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries on recoverable error", async () => {
      const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

      const fn = vi.fn().mockRejectedValueOnce(recoverableError).mockResolvedValue("success");

      const promise = withSessionRetry(fn);

      // First attempt fails
      await vi.advanceTimersByTimeAsync(0);
      // Wait for retry delay (1000ms default base delay)
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("respects maxAttempts", async () => {
      const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

      const fn = vi.fn().mockRejectedValue(recoverableError);

      let caughtError: Error | undefined;
      const promise = withSessionRetry(fn, { maxAttempts: 2, baseDelay: 100 }).catch((err) => {
        caughtError = err;
      });

      // First attempt
      await vi.advanceTimersByTimeAsync(0);
      // First retry after 100ms
      await vi.advanceTimersByTimeAsync(100);

      await promise;

      expect(caughtError).toBe(recoverableError);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("uses exponential backoff", async () => {
      const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

      const fn = vi.fn().mockRejectedValue(recoverableError);
      const onRetry = vi.fn();

      let caughtError: Error | undefined;
      const promise = withSessionRetry(fn, {
        maxAttempts: 4,
        baseDelay: 100,
        onRetry,
      }).catch((err) => {
        caughtError = err;
      });

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(0); // Initial attempt
      await vi.advanceTimersByTimeAsync(100); // First retry: 100ms
      await vi.advanceTimersByTimeAsync(200); // Second retry: 200ms
      await vi.advanceTimersByTimeAsync(400); // Third retry: 400ms

      await promise;

      expect(caughtError).toBe(recoverableError);

      // Check exponential delays
      expect(onRetry).toHaveBeenNthCalledWith(1, recoverableError, 1, 100);
      expect(onRetry).toHaveBeenNthCalledWith(2, recoverableError, 2, 200);
      expect(onRetry).toHaveBeenNthCalledWith(3, recoverableError, 3, 400);
    });

    it("respects VellumError.retryDelay", async () => {
      const errorWithDelay = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT, {
        retryDelay: 5000,
      });

      const fn = vi.fn().mockRejectedValueOnce(errorWithDelay).mockResolvedValue("success");
      const onRetry = vi.fn();

      const promise = withSessionRetry(fn, {
        maxAttempts: 2,
        baseDelay: 100,
        onRetry,
      });

      // First attempt fails
      await vi.advanceTimersByTimeAsync(0);
      // Uses error's retryDelay instead of exponential
      await vi.advanceTimersByTimeAsync(5000);

      const result = await promise;
      expect(result).toBe("success");
      expect(onRetry).toHaveBeenCalledWith(errorWithDelay, 1, 5000);
    });

    it("throws RetryAbortedError when signal is aborted before attempt", async () => {
      const controller = new AbortController();
      controller.abort();

      const fn = vi.fn().mockResolvedValue("success");

      await expect(withSessionRetry(fn, { signal: controller.signal })).rejects.toThrow(
        RetryAbortedError
      );
      expect(fn).not.toHaveBeenCalled();
    });

    it("throws RetryAbortedError when signal is aborted during wait", async () => {
      const controller = new AbortController();
      const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

      const fn = vi.fn().mockRejectedValue(recoverableError);

      const promise = withSessionRetry(fn, {
        maxAttempts: 3,
        baseDelay: 1000,
        signal: controller.signal,
      });

      // First attempt fails
      await vi.advanceTimersByTimeAsync(0);

      // Abort during wait
      controller.abort();

      await expect(promise).rejects.toThrow(RetryAbortedError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("does not retry non-retryable errors", async () => {
      const fatalError = new VellumError("Auth failed", ErrorCode.LLM_AUTH_FAILED);

      const fn = vi.fn().mockRejectedValue(fatalError);

      await expect(withSessionRetry(fn, { maxAttempts: 3 })).rejects.toThrow(fatalError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("uses custom shouldRetry function", async () => {
      const customError = new Error("Custom error");
      const shouldRetry = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);

      const fn = vi.fn().mockRejectedValue(customError);

      let caughtError: Error | undefined;
      const promise = withSessionRetry(fn, {
        maxAttempts: 3,
        baseDelay: 100,
        shouldRetry,
      }).catch((err) => {
        caughtError = err;
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100);

      await promise;

      expect(caughtError).toBe(customError);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(shouldRetry).toHaveBeenCalledTimes(2);
    });

    it("respects maxDelay", async () => {
      const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

      const fn = vi.fn().mockRejectedValue(recoverableError);
      const onRetry = vi.fn();

      let caughtError: Error | undefined;
      const promise = withSessionRetry(fn, {
        maxAttempts: 4,
        baseDelay: 10000,
        maxDelay: 15000,
        onRetry,
      }).catch((err) => {
        caughtError = err;
      });

      // All delays should be capped at 15000
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10000);
      await vi.advanceTimersByTimeAsync(15000); // Would be 20000 without cap
      await vi.advanceTimersByTimeAsync(15000); // Would be 40000 without cap

      await promise;

      expect(caughtError).toBe(recoverableError);
      expect(onRetry).toHaveBeenNthCalledWith(1, recoverableError, 1, 10000);
      expect(onRetry).toHaveBeenNthCalledWith(2, recoverableError, 2, 15000);
      expect(onRetry).toHaveBeenNthCalledWith(3, recoverableError, 3, 15000);
    });
  });

  describe("createSessionRetry", () => {
    it("creates a retry function with preset options", async () => {
      const retry = createSessionRetry({ maxAttempts: 2, baseDelay: 50 });

      const fn = vi.fn().mockResolvedValue("success");
      const result = await retry(fn);

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("allows overriding preset options", async () => {
      const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);
      const retry = createSessionRetry({ maxAttempts: 5, baseDelay: 100 });

      const fn = vi.fn().mockRejectedValue(recoverableError);

      let caughtError: Error | undefined;
      const promise = retry(fn, { maxAttempts: 2 }).catch((err) => {
        caughtError = err;
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100);

      await promise;

      expect(caughtError).toBe(recoverableError);
      expect(fn).toHaveBeenCalledTimes(2); // Uses overridden maxAttempts
    });
  });

  describe("isAbortError", () => {
    it("returns true for RetryAbortedError", () => {
      expect(isAbortError(new RetryAbortedError())).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isAbortError(new Error("test"))).toBe(false);
      expect(isAbortError(new VellumError("test", ErrorCode.LLM_NETWORK_ERROR))).toBe(false);
    });
  });

  describe("RetryAbortedError", () => {
    it("has correct name and message", () => {
      const error = new RetryAbortedError();
      expect(error.name).toBe("RetryAbortedError");
      expect(error.message).toBe("Retry operation was aborted");
    });

    it("accepts custom message", () => {
      const error = new RetryAbortedError("Custom abort message");
      expect(error.message).toBe("Custom abort message");
    });
  });
});
