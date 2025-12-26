import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withRetry, withTimeout } from "../retry.js";
import { ErrorCode, ErrorSeverity, VellumError } from "../types.js";

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("succeeds on first try", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const promise = withRetry(fn);
    const result = await promise;

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on recoverable error", async () => {
    const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

    const fn = vi.fn().mockRejectedValueOnce(recoverableError).mockResolvedValue("success");

    const promise = withRetry(fn);

    // First attempt fails
    await vi.advanceTimersByTimeAsync(0);
    // Wait for retry delay (1000ms default base delay)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects maxRetries", async () => {
    const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

    const fn = vi.fn().mockRejectedValue(recoverableError);

    const promise = withRetry(fn, { maxRetries: 2, baseDelay: 100 });

    // First attempt
    await vi.advanceTimersByTimeAsync(0);
    // First retry after 100ms
    await vi.advanceTimersByTimeAsync(100);
    // Second retry after 200ms
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).rejects.toThrow(recoverableError);
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("uses exponential backoff", async () => {
    const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

    const fn = vi.fn().mockRejectedValue(recoverableError);
    const onRetry = vi.fn();

    const promise = withRetry(fn, {
      maxRetries: 3,
      baseDelay: 100,
      backoffMultiplier: 2,
      onRetry,
    });

    // Advance through all retries
    await vi.advanceTimersByTimeAsync(0); // Initial attempt
    await vi.advanceTimersByTimeAsync(100); // First retry: 100ms
    await vi.advanceTimersByTimeAsync(200); // Second retry: 200ms
    await vi.advanceTimersByTimeAsync(400); // Third retry: 400ms

    await expect(promise).rejects.toThrow(recoverableError);

    // Check exponential delays
    expect(onRetry).toHaveBeenNthCalledWith(1, recoverableError, 1, 100);
    expect(onRetry).toHaveBeenNthCalledWith(2, recoverableError, 2, 200);
    expect(onRetry).toHaveBeenNthCalledWith(3, recoverableError, 3, 400);
  });

  it("respects error.retryDelay", async () => {
    const errorWithDelay = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT, {
      retryDelay: 5000,
    });

    const fn = vi.fn().mockRejectedValueOnce(errorWithDelay).mockResolvedValue("success");
    const onRetry = vi.fn();

    const promise = withRetry(fn, {
      maxRetries: 1,
      baseDelay: 100,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(0);
    // Should use error's retryDelay (5000) instead of calculated delay
    await vi.advanceTimersByTimeAsync(5000);

    const result = await promise;
    expect(result).toBe("success");
    expect(onRetry).toHaveBeenCalledWith(errorWithDelay, 1, 5000);
  });

  it("respects maxDelay cap", async () => {
    const errorWithLargeDelay = new VellumError("Rate limited", ErrorCode.LLM_RATE_LIMIT, {
      retryDelay: 100000,
    });

    const fn = vi.fn().mockRejectedValueOnce(errorWithLargeDelay).mockResolvedValue("success");
    const onRetry = vi.fn();

    const promise = withRetry(fn, {
      maxRetries: 1,
      maxDelay: 5000,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(0);
    // Should cap at maxDelay (5000) even though error.retryDelay is 100000
    await vi.advanceTimersByTimeAsync(5000);

    const result = await promise;
    expect(result).toBe("success");
    expect(onRetry).toHaveBeenCalledWith(errorWithLargeDelay, 1, 5000);
  });

  it("calls onRetry callback", async () => {
    const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

    const fn = vi.fn().mockRejectedValueOnce(recoverableError).mockResolvedValue("success");
    const onRetry = vi.fn();

    const promise = withRetry(fn, {
      maxRetries: 2,
      baseDelay: 100,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(recoverableError, 1, 100);
  });

  it("throws after max retries exhausted", async () => {
    const recoverableError = new VellumError("Persistent error", ErrorCode.LLM_NETWORK_ERROR);

    const fn = vi.fn().mockRejectedValue(recoverableError);

    const promise = withRetry(fn, { maxRetries: 2, baseDelay: 100 });

    // Advance through all retries
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).rejects.toThrow(recoverableError);
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("does not retry non-recoverable errors", async () => {
    const fatalError = new VellumError("Out of memory", ErrorCode.SYSTEM_OUT_OF_MEMORY);

    const fn = vi.fn().mockRejectedValue(fatalError);

    const promise = withRetry(fn, { maxRetries: 3, baseDelay: 100 });

    await expect(promise).rejects.toThrow(fatalError);
    expect(fn).toHaveBeenCalledTimes(1); // No retries
  });

  it("uses custom shouldRetry function", async () => {
    const customError = new Error("Custom error");
    const fn = vi.fn().mockRejectedValueOnce(customError).mockResolvedValue("success");

    const promise = withRetry(fn, {
      maxRetries: 2,
      baseDelay: 100,
      shouldRetry: (error) => error instanceof Error && error.message === "Custom error",
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects zero maxRetries", async () => {
    const recoverableError = new VellumError("Network error", ErrorCode.LLM_NETWORK_ERROR);

    const fn = vi.fn().mockRejectedValue(recoverableError);

    const promise = withRetry(fn, { maxRetries: 0 });

    await expect(promise).rejects.toThrow(recoverableError);
    expect(fn).toHaveBeenCalledTimes(1); // Only initial attempt
  });
});

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("succeeds within timeout", async () => {
    const fn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("success"), 100))
      );

    const promise = withTimeout(fn, 1000);

    // Advance past the function's internal delay
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws on timeout", async () => {
    const fn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("success"), 2000))
      );

    const promise = withTimeout(fn, 1000);

    // Advance to timeout
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("Operation timed out after 1000ms");
  });

  it("throws VellumError with correct code", async () => {
    const fn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("success"), 2000))
      );

    const promise = withTimeout(fn, 500);

    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).rejects.toMatchObject({
      name: "VellumError",
      code: ErrorCode.TOOL_TIMEOUT,
      message: "Operation timed out after 500ms",
    });
  });

  it("includes timeout value in error context", async () => {
    const fn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("success"), 2000))
      );

    const promise = withTimeout(fn, 750);

    await vi.advanceTimersByTimeAsync(750);

    try {
      await promise;
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(VellumError);
      expect((error as VellumError).context).toEqual({ timeout: 750 });
    }
  });

  it("propagates errors from function", async () => {
    const customError = new Error("Function failed");
    const fn = vi.fn().mockRejectedValue(customError);

    const promise = withTimeout(fn, 1000);

    await expect(promise).rejects.toThrow(customError);
  });

  it("clears timeout on success", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    const fn = vi.fn().mockResolvedValue("success");

    const promise = withTimeout(fn, 1000);
    await vi.advanceTimersByTimeAsync(0);

    await promise;

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("clears timeout on error", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    const customError = new Error("Function failed");
    const fn = vi.fn().mockRejectedValue(customError);

    const promise = withTimeout(fn, 1000);
    await vi.advanceTimersByTimeAsync(0);

    try {
      await promise;
    } catch {
      // Expected
    }

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("timeout error is retryable", async () => {
    const fn = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("success"), 2000))
      );

    const promise = withTimeout(fn, 500);

    await vi.advanceTimersByTimeAsync(500);

    try {
      await promise;
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(VellumError);
      expect((error as VellumError).isRetryable).toBe(true);
      expect((error as VellumError).severity).toBe(ErrorSeverity.RECOVERABLE);
    }
  });
});
