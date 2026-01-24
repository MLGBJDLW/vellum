/**
 * Buffered Stdout for VS Code Terminal
 *
 * Implements Synchronized Output (DEC 2026) to prevent flickering in VS Code's
 * integrated terminal on Windows. Batches multiple writes into a single
 * atomic frame, wrapped in begin/end synchronized update sequences.
 *
 * @module tui/buffered-stdout
 */

import fs from "node:fs";
import { Writable } from "node:stream";

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

// =============================================================================
// Environment Detection
// =============================================================================

/**
 * Detects if running inside VS Code integrated terminal.
 */
function isVsCodeTerminal(): boolean {
  return (
    process.env.TERM_PROGRAM === "vscode" ||
    process.env.VSCODE_INJECTION === "1" ||
    !!process.env.VSCODE_GIT_IPC_HANDLE
  );
}

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

  constructor() {
    super();

    // Forward terminal resize events so Ink can re-render on window size changes.
    this.onResize = () => {
      this.emit("resize");
    };
    process.stdout.on("resize", this.onResize);
  }

  /**
   * Cleanup any listeners. Safe to call multiple times.
   */
  dispose(): void {
    process.stdout.off("resize", this.onResize);
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
      // FIX: Use process.nextTick instead of setImmediate for tighter batching
      // This prevents partial frames from being visible, reducing header duplication/flickering
      // nextTick runs before I/O callbacks, setImmediate runs after - nextTick is faster
      process.nextTick(() => this.flush());
    }

    callback();
  }

  /**
   * Flushes the accumulated buffer as a single atomic frame.
   * Wraps output in synchronized update sequences to prevent flickering.
   */
  flush(): void {
    this.scheduled = false;

    if (!this.buf) return;

    const frame = this.buf;
    this.buf = "";

    // Atomic write with synchronized output wrapping:
    // 1. Hide cursor to prevent cursor flicker
    // 2. Begin synchronized update (terminal holds display)
    // 3. Write the actual frame content
    // 4. End synchronized update (terminal renders atomically)
    // 5. Show cursor again
    atomicWrite(HIDE_CURSOR + BSU + frame + ESU + SHOW_CURSOR);
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
 * On Windows + VS Code terminal: Returns a BufferedStdout that implements
 * synchronized output to prevent flickering.
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
  // Only use buffered output on Windows + VS Code where flickering is most severe
  if (process.platform === "win32" && isVsCodeTerminal() && (process.stdout.isTTY ?? false)) {
    // Type assertion: BufferedStdout implements write semantics needed by Ink
    // Full WriteStream interface (clearLine, cursorTo, etc.) not required for rendering
    return new BufferedStdout() as unknown as NodeJS.WriteStream;
  }
  return process.stdout;
}
