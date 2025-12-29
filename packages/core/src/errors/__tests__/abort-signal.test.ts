// ============================================
// Vellum AbortSignal Support Tests
// T022 - AbortSignal support for withRetry
// ============================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AbortError, withRetry } from "../retry.js";
import { ErrorCode, VellumError } from "../types.js";

describe("AbortSignal support in withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("AbortError", () => {
    it("creates an AbortError with default message", () => {
      const error = new AbortError();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AbortError);
      expect(error.name).toBe("AbortError");
      expect(error.message).toBe("Operation aborted");
    });

    it("creates an AbortError with custom message", () => {
      const error = new AbortError("Custom abort message");

      expect(error.message).toBe("Custom abort message");
    });
  });

  describe("withRetry abort behavior", () => {
    it("AC-006-1: throws AbortError when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const fn = vi.fn().mockResolvedValue("success");

      await expect(withRetry(fn, { signal: controller.signal })).rejects.toThrow(AbortError);

      expect(fn).not.toHaveBeenCalled();
    });

    it("AC-006-2: throws AbortError when aborted during delay", async () => {
      const controller = new AbortController();
      let _callCount = 0;

      const fn = vi.fn(async () => {
        _callCount++;
        throw new VellumError("Retryable error", ErrorCode.LLM_RATE_LIMIT);
      });

      const promise = withRetry(fn, {
        signal: controller.signal,
        maxRetries: 3,
        baseDelay: 1000,
      });

      // Let the first attempt fail
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(1);

      // Abort during the delay
      controller.abort();

      await expect(promise).rejects.toThrow(AbortError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("AC-006-3: cancels delay when signal is aborted", async () => {
      const controller = new AbortController();
      const onRetry = vi.fn();

      const fn = vi.fn(async () => {
        throw new VellumError("Retryable error", ErrorCode.LLM_RATE_LIMIT);
      });

      const promise = withRetry(fn, {
        signal: controller.signal,
        maxRetries: 3,
        baseDelay: 10000, // Long delay
        onRetry,
      });

      // Let first attempt fail
      await vi.advanceTimersByTimeAsync(0);
      expect(onRetry).toHaveBeenCalledTimes(1);

      // Abort while waiting for delay
      controller.abort();

      await expect(promise).rejects.toThrow(AbortError);

      // Should not have retried because abort cancelled the delay
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("succeeds when not aborted", async () => {
      const controller = new AbortController();
      const fn = vi.fn().mockResolvedValue("success");

      const result = await withRetry(fn, { signal: controller.signal });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries normally when signal is provided but not aborted", async () => {
      const controller = new AbortController();
      let callCount = 0;

      const fn = vi.fn(async () => {
        callCount++;
        if (callCount < 3) {
          throw new VellumError("Retryable", ErrorCode.LLM_RATE_LIMIT);
        }
        return "success";
      });

      const promise = withRetry(fn, {
        signal: controller.signal,
        maxRetries: 3,
        baseDelay: 100,
      });

      // First attempt fails
      await vi.advanceTimersByTimeAsync(0);
      // Wait for first retry delay
      await vi.advanceTimersByTimeAsync(100);
      // Second attempt fails
      await vi.advanceTimersByTimeAsync(0);
      // Wait for second retry delay
      await vi.advanceTimersByTimeAsync(200);
      // Third attempt succeeds
      await vi.advanceTimersByTimeAsync(0);

      const result = await promise;
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("works without signal (backward compatibility)", async () => {
      let callCount = 0;

      const fn = vi.fn(async () => {
        callCount++;
        if (callCount < 2) {
          throw new VellumError("Retryable", ErrorCode.LLM_RATE_LIMIT);
        }
        return "success";
      });

      const promise = withRetry(fn, {
        maxRetries: 3,
        baseDelay: 100,
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(0);

      const result = await promise;
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("checks signal before each retry attempt", async () => {
      const controller = new AbortController();

      const fn = vi.fn(async () => {
        throw new VellumError("Retryable", ErrorCode.LLM_RATE_LIMIT);
      });

      const promise = withRetry(fn, {
        signal: controller.signal,
        maxRetries: 5,
        baseDelay: 100,
      });

      // First attempt
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(1);

      // Wait for first delay, second attempt
      await vi.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(2);

      // Wait for second delay, third attempt
      await vi.advanceTimersByTimeAsync(200);
      expect(fn).toHaveBeenCalledTimes(3);

      // Abort during the third delay
      controller.abort();

      await expect(promise).rejects.toThrow(AbortError);
      // Should not have made more attempts after abort
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
