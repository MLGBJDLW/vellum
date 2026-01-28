/**
 * Pause Signal for Stream Processing
 *
 * Provides a mechanism to pause and resume async stream processing.
 * Used by AgentStreamHandler to control stream flow during user interaction.
 *
 * @module @vellum/core/streaming/pause-signal
 */

/**
 * Signal for pausing and resuming async stream processing.
 *
 * This class provides a simple mechanism for controlling stream flow:
 * - Call `pause()` to pause stream processing
 * - Call `resume()` to resume stream processing
 * - Use `waitIfPaused()` in the stream consumer to block when paused
 *
 * @example
 * ```typescript
 * const pauseSignal = new PauseSignal();
 *
 * // In stream consumer:
 * for await (const event of stream) {
 *   await pauseSignal.waitIfPaused();
 *   // process event
 * }
 *
 * // To pause:
 * pauseSignal.pause();
 *
 * // To resume:
 * pauseSignal.resume();
 * ```
 */
export class PauseSignal {
  private paused = false;
  private resumePromise: Promise<void> | null = null;
  private resumeResolve: (() => void) | null = null;

  /**
   * Pause stream processing.
   *
   * Subsequent calls to `waitIfPaused()` will block until `resume()` is called.
   * Multiple calls to `pause()` when already paused have no effect.
   */
  pause(): void {
    if (!this.paused) {
      this.paused = true;
      this.resumePromise = new Promise((resolve) => {
        this.resumeResolve = resolve;
      });
    }
  }

  /**
   * Resume stream processing.
   *
   * Resolves the pending promise from `waitIfPaused()`, allowing stream
   * processing to continue. Multiple calls when not paused have no effect.
   */
  resume(): void {
    if (this.paused) {
      this.paused = false;
      this.resumeResolve?.();
      this.resumePromise = null;
      this.resumeResolve = null;
    }
  }

  /**
   * Wait if currently paused.
   *
   * Returns immediately if not paused. When paused, this method will
   * block until `resume()` is called.
   *
   * @returns Promise that resolves when stream can continue
   */
  async waitIfPaused(): Promise<void> {
    if (this.paused && this.resumePromise) {
      await this.resumePromise;
    }
  }

  /**
   * Check if currently paused.
   *
   * @returns `true` if paused, `false` otherwise
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Reset the signal to initial state.
   *
   * Resumes any paused consumers and clears internal state.
   * Useful when starting a new stream session.
   */
  reset(): void {
    this.paused = false;
    this.resumeResolve?.();
    this.resumePromise = null;
    this.resumeResolve = null;
  }
}
