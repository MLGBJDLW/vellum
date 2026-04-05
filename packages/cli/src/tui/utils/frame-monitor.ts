/**
 * Frame Performance Monitor
 *
 * Lightweight diagnostic utility for tracking TUI render performance.
 * Zero overhead when not queried — all computation is deferred to getStats().
 *
 * @module tui/utils/frame-monitor
 */

// =============================================================================
// Types
// =============================================================================

export interface FrameStats {
  /** Frames per second (computed over sliding window) */
  readonly fps: number;
  /** Average frame time in milliseconds */
  readonly avgFrameTime: number;
  /** Number of dropped frames (frame time > 2x target interval) */
  readonly droppedFrames: number;
  /** Total frames rendered since last reset */
  readonly totalFrames: number;
  /** Duration of the most recent frame in milliseconds */
  readonly lastFrameTime: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Sliding window for FPS calculation (1 second) */
const FPS_WINDOW_MS = 1000;

/** Target frame interval (~60fps). Frames taking >2x this are "dropped". */
const TARGET_FRAME_MS = 16;

// =============================================================================
// FrameMonitor Class
// =============================================================================

export class FrameMonitor {
  private frameStartTime = 0;
  private timestamps: number[] = [];
  private durations: number[] = [];
  private totalFrameCount = 0;
  private droppedCount = 0;
  private lastDuration = 0;

  /**
   * Call at the start of each frame render.
   */
  frameStart(): void {
    this.frameStartTime = performance.now();
  }

  /**
   * Call at the end of each frame render.
   */
  frameEnd(): void {
    const now = performance.now();
    const duration = this.frameStartTime > 0 ? now - this.frameStartTime : 0;

    this.totalFrameCount++;
    this.lastDuration = duration;
    this.timestamps.push(now);
    this.durations.push(duration);

    // Detect dropped frame
    if (duration > TARGET_FRAME_MS * 2) {
      this.droppedCount++;
    }

    // Prune timestamps outside the sliding window
    const cutoff = now - FPS_WINDOW_MS;
    while (this.timestamps.length > 0) {
      const first = this.timestamps[0];
      if (first === undefined || first >= cutoff) break;
      this.timestamps.shift();
    }

    // Keep durations array bounded to avoid unbounded growth
    if (this.durations.length > 300) {
      this.durations = this.durations.slice(-120);
    }

    this.frameStartTime = 0;
  }

  /**
   * Get current performance stats.
   * All computation is deferred to this call — zero overhead during rendering.
   */
  getStats(): FrameStats {
    const fps = this.timestamps.length;
    const avgFrameTime =
      this.durations.length > 0
        ? this.durations.reduce((a, b) => a + b, 0) / this.durations.length
        : 0;

    return {
      fps,
      avgFrameTime,
      droppedFrames: this.droppedCount,
      totalFrames: this.totalFrameCount,
      lastFrameTime: this.lastDuration,
    };
  }

  /**
   * Reset all counters.
   */
  reset(): void {
    this.frameStartTime = 0;
    this.timestamps = [];
    this.durations = [];
    this.totalFrameCount = 0;
    this.droppedCount = 0;
    this.lastDuration = 0;
  }
}

// =============================================================================
// Global Singleton
// =============================================================================

/**
 * Global frame monitor instance.
 * Use this for application-wide frame tracking.
 *
 * @example
 * ```ts
 * globalFrameMonitor.frameStart();
 * // ... render frame ...
 * globalFrameMonitor.frameEnd();
 *
 * // Query stats when needed (e.g., debug overlay)
 * const stats = globalFrameMonitor.getStats();
 * console.log(`FPS: ${stats.fps}, Dropped: ${stats.droppedFrames}`);
 * ```
 */
export const globalFrameMonitor = new FrameMonitor();
