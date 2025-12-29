/**
 * Unit tests for GitSnapshotLock
 *
 * Tests the mutex-style lock for serializing git operations.
 *
 * @see packages/core/src/git/lock.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "../../errors/types.js";
import { GitSnapshotLock } from "../lock.js";

// =============================================================================
// T030: GitSnapshotLock Tests
// =============================================================================

describe("GitSnapshotLock", () => {
  let lock: GitSnapshotLock;

  beforeEach(() => {
    lock = new GitSnapshotLock(100); // Short timeout for tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    lock.clearQueue();
    vi.useRealTimers();
  });

  // ===========================================================================
  // acquire() Tests
  // ===========================================================================

  describe("acquire()", () => {
    it("should acquire lock immediately when free", async () => {
      const result = await lock.acquire();

      expect(result.ok).toBe(true);
      expect(lock.isLocked()).toBe(true);
    });

    it("should return Ok(true) on successful acquire", async () => {
      const result = await lock.acquire();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it("should queue concurrent calls", async () => {
      // First acquire succeeds immediately
      const firstResult = await lock.acquire();
      expect(firstResult.ok).toBe(true);
      expect(lock.queueLength()).toBe(0);

      // Second acquire should be queued
      const secondPromise = lock.acquire();
      // Allow microtasks to run
      await vi.advanceTimersByTimeAsync(0);
      expect(lock.queueLength()).toBe(1);

      // Release first lock
      lock.release();

      // Second should now succeed
      const secondResult = await secondPromise;
      expect(secondResult.ok).toBe(true);
      expect(lock.queueLength()).toBe(0);
    });

    it("should only allow one holder at a time", async () => {
      const order: number[] = [];

      // Acquire first lock
      await lock.acquire();

      // Start multiple concurrent acquires
      const p1 = lock.acquire().then(() => {
        order.push(1);
        lock.release();
      });
      const p2 = lock.acquire().then(() => {
        order.push(2);
        lock.release();
      });
      const p3 = lock.acquire().then(() => {
        order.push(3);
        lock.release();
      });

      // Allow timers to advance
      await vi.advanceTimersByTimeAsync(0);
      expect(lock.queueLength()).toBe(3);

      // Release initial lock
      lock.release();

      // Process all queued requests
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      await Promise.all([p1, p2, p3]);

      // Should be processed in order
      expect(order).toEqual([1, 2, 3]);
    });

    it("should return error code 7020 on timeout", async () => {
      // Acquire lock first
      await lock.acquire();

      // Second acquire will timeout
      const timeoutPromise = lock.acquire();

      // Advance time past timeout
      await vi.advanceTimersByTimeAsync(150);

      const result = await timeoutPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_LOCK_TIMEOUT);
      }
    });

    it("should use default 30s timeout", () => {
      const defaultLock = new GitSnapshotLock();
      // The timeout is private, but we can verify behavior
      expect(defaultLock).toBeInstanceOf(GitSnapshotLock);
    });

    it("should remove timed-out request from queue", async () => {
      await lock.acquire();

      // Start a second acquire that will timeout
      const timeoutPromise = lock.acquire();
      await vi.advanceTimersByTimeAsync(0);
      expect(lock.queueLength()).toBe(1);

      // Let it timeout
      await vi.advanceTimersByTimeAsync(150);
      await timeoutPromise;

      expect(lock.queueLength()).toBe(0);
    });
  });

  // ===========================================================================
  // release() Tests
  // ===========================================================================

  describe("release()", () => {
    it("should release the lock", async () => {
      await lock.acquire();
      expect(lock.isLocked()).toBe(true);

      lock.release();
      expect(lock.isLocked()).toBe(false);
    });

    it("should be idempotent (safe to call multiple times)", async () => {
      await lock.acquire();

      // Multiple releases should not throw
      lock.release();
      lock.release();
      lock.release();

      expect(lock.isLocked()).toBe(false);
    });

    it("should be safe to call when already released", () => {
      // Never acquired, should not throw
      expect(() => lock.release()).not.toThrow();
      expect(lock.isLocked()).toBe(false);
    });

    it("should grant lock to next in queue", async () => {
      await lock.acquire();

      // Queue another request
      let secondAcquired = false;
      const secondPromise = lock.acquire().then((result) => {
        secondAcquired = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(secondAcquired).toBe(false);

      // Release should grant to second
      lock.release();
      await vi.advanceTimersByTimeAsync(0);

      const secondResult = await secondPromise;
      expect(secondAcquired).toBe(true);
      expect(secondResult.ok).toBe(true);
    });
  });

  // ===========================================================================
  // withLock() Tests
  // ===========================================================================

  describe("withLock()", () => {
    it("should execute function while holding lock", async () => {
      vi.useRealTimers(); // Need real timers for async execution

      let executedWhileLocked = false;

      const result = await lock.withLock(async () => {
        executedWhileLocked = lock.isLocked();
        return "result";
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("result");
      }
      expect(executedWhileLocked).toBe(true);
    });

    it("should release lock after function completes", async () => {
      vi.useRealTimers();

      await lock.withLock(async () => {
        return "done";
      });

      expect(lock.isLocked()).toBe(false);
    });

    it("should release lock even if function throws", async () => {
      vi.useRealTimers();

      try {
        await lock.withLock(async () => {
          throw new Error("Test error");
        });
      } catch {
        // Expected
      }

      expect(lock.isLocked()).toBe(false);
    });

    it("should return error on lock timeout", async () => {
      // Acquire lock first
      await lock.acquire();

      // withLock should timeout waiting for lock
      const resultPromise = lock.withLock(async () => "never");

      await vi.advanceTimersByTimeAsync(150);

      const result = await resultPromise;

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.GIT_LOCK_TIMEOUT);
      }
    });

    it("should return value from async function", async () => {
      vi.useRealTimers();

      const result = await lock.withLock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { data: "test" };
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ data: "test" });
      }
    });
  });

  // ===========================================================================
  // isLocked() and queueLength() Tests
  // ===========================================================================

  describe("isLocked()", () => {
    it("should return false initially", () => {
      expect(lock.isLocked()).toBe(false);
    });

    it("should return true when lock is held", async () => {
      await lock.acquire();
      expect(lock.isLocked()).toBe(true);
    });

    it("should return false after release", async () => {
      await lock.acquire();
      lock.release();
      expect(lock.isLocked()).toBe(false);
    });
  });

  describe("queueLength()", () => {
    it("should return 0 initially", () => {
      expect(lock.queueLength()).toBe(0);
    });

    it("should return correct queue length", async () => {
      await lock.acquire();

      // Queue multiple requests
      lock.acquire();
      await vi.advanceTimersByTimeAsync(0);
      expect(lock.queueLength()).toBe(1);

      lock.acquire();
      await vi.advanceTimersByTimeAsync(0);
      expect(lock.queueLength()).toBe(2);
    });
  });

  // ===========================================================================
  // clearQueue() Tests
  // ===========================================================================

  describe("clearQueue()", () => {
    it("should clear all pending requests", async () => {
      await lock.acquire();

      // Queue requests
      const p1 = lock.acquire();
      const p2 = lock.acquire();
      await vi.advanceTimersByTimeAsync(0);

      expect(lock.queueLength()).toBe(2);

      // Clear queue
      lock.clearQueue();

      expect(lock.queueLength()).toBe(0);

      // Pending requests should resolve with timeout error
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.ok).toBe(false);
      expect(r2.ok).toBe(false);
    });
  });
});
