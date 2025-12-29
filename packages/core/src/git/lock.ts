/**
 * Git Snapshot Lock
 *
 * Provides a mutex-style lock for serializing git operations.
 * Ensures only one snapshot operation runs at a time to prevent
 * race conditions and repository corruption.
 *
 * @module git/lock
 */

import type { VellumError } from "../errors/types.js";
import type { Result } from "../types/result.js";
import { Err, Ok } from "../types/result.js";
import { gitLockTimeoutError } from "./errors.js";

// =============================================================================
// T009: GitSnapshotLock (Mutex for Concurrency)
// =============================================================================

/**
 * Represents a pending lock request in the queue.
 */
interface QueuedRequest {
  resolve: () => void;
  reject: (error: VellumError) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Async mutex lock for serializing git snapshot operations.
 *
 * Uses a simple queue pattern where concurrent calls to `acquire()`
 * are queued and resolved in order. This prevents race conditions
 * when multiple parts of the system try to create snapshots simultaneously.
 *
 * @example
 * ```typescript
 * const lock = new GitSnapshotLock();
 *
 * const result = await lock.acquire();
 * if (!result.ok) {
 *   console.error("Lock timeout:", result.error);
 *   return;
 * }
 *
 * try {
 *   await performGitOperations();
 * } finally {
 *   lock.release();
 * }
 * ```
 */
export class GitSnapshotLock {
  private locked = false;
  private queue: QueuedRequest[] = [];
  private readonly timeoutMs: number;

  /**
   * Creates a new GitSnapshotLock.
   *
   * @param timeoutMs - Maximum time to wait for lock acquisition (default: 30000ms)
   */
  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Attempts to acquire the lock.
   *
   * If the lock is free, acquires immediately. Otherwise, queues the request
   * and waits until the lock becomes available or timeout is reached.
   *
   * @returns Ok(true) if lock acquired, Err with GIT_LOCK_TIMEOUT (7020) on timeout
   *
   * @example
   * ```typescript
   * const result = await lock.acquire();
   * if (!result.ok) {
   *   // Handle timeout - result.error.code === 7020
   *   return result;
   * }
   * // Lock acquired, proceed with operations
   * ```
   */
  async acquire(): Promise<Result<true, VellumError>> {
    // Fast path: lock is free
    if (!this.locked) {
      this.locked = true;
      return Ok(true);
    }

    // Slow path: wait in queue
    return new Promise<Result<true, VellumError>>((resolve) => {
      const timeoutId = setTimeout(() => {
        // Find and remove this request from the queue
        const index = this.queue.findIndex((req) => req.timeoutId === timeoutId);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        resolve(Err(gitLockTimeoutError(this.timeoutMs)));
      }, this.timeoutMs);

      const request: QueuedRequest = {
        resolve: () => {
          clearTimeout(timeoutId);
          resolve(Ok(true));
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          resolve(Err(error));
        },
        timeoutId,
      };

      this.queue.push(request);
    });
  }

  /**
   * Releases the lock.
   *
   * If there are queued requests, grants the lock to the next one.
   * This method is idempotent - safe to call multiple times.
   *
   * @example
   * ```typescript
   * try {
   *   await performOperations();
   * } finally {
   *   lock.release(); // Always release in finally
   *   lock.release(); // Safe to call again
   * }
   * ```
   */
  release(): void {
    if (!this.locked) {
      // Already released, idempotent
      return;
    }

    // Check if there's a queued request
    const next = this.queue.shift();
    if (next) {
      // Grant lock to next in queue
      next.resolve();
    } else {
      // No waiters, release the lock
      this.locked = false;
    }
  }

  /**
   * Returns whether the lock is currently held.
   *
   * @returns true if lock is acquired, false if free
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Returns the number of requests waiting in the queue.
   *
   * @returns Number of pending lock requests
   */
  queueLength(): number {
    return this.queue.length;
  }

  /**
   * Clears all pending requests with a timeout error.
   *
   * Useful for cleanup during shutdown.
   */
  clearQueue(): void {
    for (const request of this.queue) {
      clearTimeout(request.timeoutId);
      request.reject(gitLockTimeoutError(this.timeoutMs));
    }
    this.queue = [];
  }

  /**
   * Executes a function while holding the lock.
   *
   * Automatically acquires before and releases after execution,
   * ensuring proper cleanup even if the function throws.
   *
   * @param fn - Async function to execute while holding the lock
   * @returns Result containing the function's return value or lock timeout error
   *
   * @example
   * ```typescript
   * const result = await lock.withLock(async () => {
   *   const snapshot = await createSnapshot();
   *   return snapshot.hash;
   * });
   *
   * if (result.ok) {
   *   console.log("Snapshot created:", result.value);
   * }
   * ```
   */
  async withLock<T>(fn: () => Promise<T>): Promise<Result<T, VellumError>> {
    const acquireResult = await this.acquire();
    if (!acquireResult.ok) {
      return Err(acquireResult.error);
    }

    try {
      const value = await fn();
      return Ok(value);
    } finally {
      this.release();
    }
  }
}

/**
 * Global lock instance for singleton usage.
 *
 * Use this when you need a single lock shared across the application.
 *
 * @example
 * ```typescript
 * import { globalSnapshotLock } from "@vellum/core/git";
 *
 * await globalSnapshotLock.withLock(async () => {
 *   // Git operations here
 * });
 * ```
 */
export const globalSnapshotLock = new GitSnapshotLock();
