/**
 * Buffered Stdout for Synchronized Output
 *
 * Implements Synchronized Output (DEC 2026) to prevent flickering in terminals
 * that support this protocol. Batches multiple writes into a single
 * atomic frame, wrapped in begin/end synchronized update sequences.
 *
 * @module tui/buffered-stdout
 */

import fs from "node:fs";
import { Writable } from "node:stream";
import { isCursorHidden, isCursorLocked } from "./utils/cursor-state.js";
import { globalFrameMonitor } from "./utils/frame-monitor.js";
import { isNoFlickerEnabled } from "./utils/no-flicker.js";

// =============================================================================
// Shared Stdout Reference
// =============================================================================

/**
 * Shared stdout reference for modules that need to write outside Ink.
 * When BufferedStdout is active, this should point to the BufferedStdout instance.
 * Other modules should use getActiveStdout() instead of process.stdout directly.
 */
let activeStdout: NodeJS.WriteStream = process.stdout;

/**
 * Get the active stdout stream.
 * Returns BufferedStdout when active, otherwise process.stdout.
 * Use this instead of process.stdout directly to ensure synchronized output.
 */
export function getActiveStdout(): NodeJS.WriteStream {
  return activeStdout;
}

/**
 * Set the active stdout stream.
 * Called by App initialization when BufferedStdout is created.
 * @internal
 */
export function setActiveStdout(stream: NodeJS.WriteStream): void {
  activeStdout = stream;
}

// =============================================================================
// Constants
// =============================================================================

/** Begin Synchronized Update (DEC 2026) */
const BSU = "\x1b[?2026h";

/** End Synchronized Update (DEC 2026) */
const ESU = "\x1b[?2026l";

/** Hide cursor during frame render */
const HIDE_CURSOR = "\x1b[?25l";

/** Show cursor after frame render */
const SHOW_CURSOR = "\x1b[?25h";

/** Cursor home (park at 0,0) for alt screen self-healing */
const CURSOR_HOME = "\x1b[H";

/** Default frame interval (~60fps) */
const DEFAULT_FRAME_INTERVAL_MS = 16;

// =============================================================================
// Atomic Write Helper
// =============================================================================

/**
 * Writes a string synchronously to stdout (fd=1).
 * This bypasses Node's async buffering for atomic output.
 */
function atomicWrite(s: string): void {
  fs.writeSync(1, Buffer.from(s, "utf8"));
}

// =============================================================================
// BufferedStdout Class
// =============================================================================

/**
 * A Writable stream that batches writes and flushes them atomically
 * wrapped in synchronized output sequences.
 *
 * This prevents visual tearing/flickering in terminals that support
 * the DEC 2026 synchronized output feature (VS Code terminal).
 */
export class BufferedStdout extends Writable {
  private buf = "";
  private scheduled = false;
  private readonly onResize: () => void;

  // Frame throttle state
  private lastFlushTime = 0;
  private readonly frameIntervalMs: number;
  private pendingFlush = false;
  private pendingFlushTimer: ReturnType<typeof setTimeout> | null = null;

  // Alt screen cursor parking
  private altScreenActive = false;

  // Frame stats periodic logger
  private frameStatsTimer: ReturnType<typeof setInterval> | null = null;

  constructor(frameIntervalMs = DEFAULT_FRAME_INTERVAL_MS) {
    super();
    this.frameIntervalMs = frameIntervalMs;

    // Forward terminal resize events so Ink can re-render on window size changes.
    this.onResize = () => {
      this.emit("resize");
    };
    process.stdout.on("resize", this.onResize);

    // Start frame stats logging if VELLUM_FRAME_STATS=1
    const frameStatsEnv = process.env.VELLUM_FRAME_STATS;
    if (frameStatsEnv === "1" || frameStatsEnv?.toLowerCase() === "true") {
      this.frameStatsTimer = setInterval(() => {
        const stats = globalFrameMonitor.getStats();
        process.stderr.write(
          `[frame-stats] fps=${stats.fps} avg=${stats.avgFrameTime.toFixed(1)}ms dropped=${stats.droppedFrames} total=${stats.totalFrames}\n`
        );
      }, 5000);
      // Don't let the timer prevent process exit
      this.frameStatsTimer.unref();
    }
  }

  /**
   * Set whether alt screen mode is active.
   * When active, cursor is parked at (0,0) before each frame for self-healing.
   */
  setAltScreenActive(active: boolean): void {
    this.altScreenActive = active;
  }

  /**
   * Cleanup any listeners. Safe to call multiple times.
   */
  dispose(): void {
    process.stdout.off("resize", this.onResize);
    if (this.pendingFlushTimer) {
      clearTimeout(this.pendingFlushTimer);
      this.pendingFlushTimer = null;
    }
    if (this.frameStatsTimer) {
      clearInterval(this.frameStatsTimer);
      this.frameStatsTimer = null;
    }
    // Best-effort flush to avoid losing a last frame.
    this.flush();
  }

  /**
   * Writable _write implementation - buffers chunks and schedules flush.
   */
  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.buf += chunk.toString("utf8");

    if (!this.scheduled) {
      this.scheduled = true;
      // Schedule flush with frame throttling.
      // Use nextTick for tighter batching, but respect frame interval.
      process.nextTick(() => this.throttledFlush());
    }

    callback();
  }

  /**
   * Throttled flush: respects frame interval to avoid exceeding ~60fps.
   * Buffers writes within the throttle window and guarantees trailing flush.
   */
  private throttledFlush(): void {
    const now = performance.now();
    const elapsed = now - this.lastFlushTime;

    if (elapsed >= this.frameIntervalMs) {
      // Outside throttle window — flush immediately
      this.flush();
    } else {
      // Within throttle window — schedule trailing flush
      if (!this.pendingFlush) {
        this.pendingFlush = true;
        const remaining = this.frameIntervalMs - elapsed;
        this.pendingFlushTimer = setTimeout(() => {
          this.pendingFlushTimer = null;
          this.pendingFlush = false;
          this.flush();
        }, remaining);
      }
      // If pendingFlush already set, the scheduled timer will pick up accumulated buf
    }
  }

  /**
   * Flushes the accumulated buffer as a single atomic frame.
   * Wraps output in synchronized update sequences to prevent flickering.
   */
  flush(): void {
    this.scheduled = false;

    if (!this.buf) return;

    globalFrameMonitor.frameStart();

    const frame = this.buf;
    this.buf = "";
    this.lastFlushTime = performance.now();

    const shouldShowCursor = !isCursorHidden() && !isCursorLocked();
    const cursorSuffix = shouldShowCursor ? SHOW_CURSOR : "";

    // Cursor parking: in alt screen, prepend cursor-home to self-heal drift
    const cursorPark = this.altScreenActive ? CURSOR_HOME : "";

    // Atomic write with synchronized output wrapping:
    // 1. Park cursor at home (alt screen only)
    // 2. Hide cursor to prevent cursor flicker
    // 3. Begin synchronized update (terminal holds display)
    // 4. Write the actual frame content
    // 5. End synchronized update (terminal renders atomically)
    // 6. Show cursor again
    atomicWrite(cursorPark + HIDE_CURSOR + BSU + frame + ESU + cursorSuffix);

    globalFrameMonitor.frameEnd();
  }

  /**
   * Proxy common stdout properties for Ink compatibility.
   */
  get columns(): number {
    return process.stdout.columns ?? 80;
  }

  get rows(): number {
    return process.stdout.rows ?? 24;
  }

  get isTTY(): boolean {
    return process.stdout.isTTY ?? false;
  }

  // Preserve Ink color capability detection.
  // Node's stdout provides these methods; delegate when available.
  hasColors(count?: number): boolean {
    const stdoutWithHasColors = process.stdout as unknown as {
      hasColors?: (count?: number) => boolean;
    };
    return stdoutWithHasColors.hasColors?.(count) ?? false;
  }

  getColorDepth(env?: NodeJS.ProcessEnv): number {
    const stdoutWithGetColorDepth = process.stdout as unknown as {
      getColorDepth?: (env?: NodeJS.ProcessEnv) => number;
    };
    return stdoutWithGetColorDepth.getColorDepth?.(env) ?? 1;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a compatible stdout stream for Ink rendering.
 *
 * On terminals supporting DEC 2026 synchronized output: Returns a BufferedStdout
 * that wraps frames in BSU/ESU sequences to prevent flickering.
 *
 * On other platforms/terminals: Returns the native process.stdout.
 *
 * @returns A WriteStream compatible with Ink's render() options
 *
 * @example
 * ```ts
 * import { render } from 'ink';
 * import { createCompatStdout } from './buffered-stdout';
 *
 * render(<App />, { stdout: createCompatStdout() });
 * ```
 */
export function createCompatStdout(): NodeJS.WriteStream {
  // VELLUM_NO_FLICKER env var overrides auto-detection;
  // otherwise falls back to terminal capability detection
  if (isNoFlickerEnabled() && (process.stdout.isTTY ?? false)) {
    // Type assertion: BufferedStdout implements write semantics needed by Ink
    // Full WriteStream interface (clearLine, cursorTo, etc.) not required for rendering
    return new BufferedStdout() as unknown as NodeJS.WriteStream;
  }
  return process.stdout;
}
