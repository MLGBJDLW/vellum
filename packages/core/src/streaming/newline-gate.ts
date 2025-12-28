/**
 * NewlineGate - Visual Stability Buffer
 *
 * Buffers streaming text until complete lines are available,
 * preventing partial line rendering that causes visual jitter.
 *
 * @module @vellum/core/streaming/newline-gate
 */

/** Configuration for NewlineGate buffering */
export interface NewlineGateConfig {
  /** Enable newline buffering (default: true) */
  enabled: boolean;

  /** Force flush after this many ms without newline (default: 100) */
  flushTimeoutMs: number;

  /** Force flush when buffer exceeds this size (default: 4096) */
  maxBufferSize: number;
}

/** Default configuration */
export const DEFAULT_NEWLINE_GATE_CONFIG: NewlineGateConfig = {
  enabled: true,
  flushTimeoutMs: 100,
  maxBufferSize: 4096,
};

/**
 * NewlineGate buffers streaming text until complete lines are available.
 *
 * This prevents visual jitter caused by partial line rendering in terminals
 * and other line-oriented displays. Text is accumulated until a newline
 * character is encountered, then released as complete lines.
 *
 * Safety mechanisms ensure content is eventually flushed:
 * - Timeout: Forces flush after configurable idle period
 * - Overflow: Forces flush when buffer exceeds size limit
 *
 * @example
 * ```typescript
 * const gate = new NewlineGate();
 *
 * gate.feed("Hello ");     // returns null (buffering)
 * gate.feed("World\n");    // returns "Hello World\n"
 * gate.feed("Partial");    // returns null (buffering)
 * gate.flush();            // returns "Partial"
 * ```
 */
export class NewlineGate {
  private buffer: string = "";
  private lastFeedTime: number = 0;
  private readonly config: NewlineGateConfig;

  constructor(config: Partial<NewlineGateConfig> = {}) {
    this.config = { ...DEFAULT_NEWLINE_GATE_CONFIG, ...config };
  }

  /**
   * Feed text into the gate.
   * Returns complete lines (including newline), or null if buffering.
   * Bypasses buffering if config.enabled is false.
   */
  feed(text: string): string | null {
    if (!this.config.enabled) {
      return text; // Bypass mode
    }

    this.buffer += text;
    this.lastFeedTime = Date.now();

    // Check for complete lines (ends with \n)
    const lastNewlineIndex = this.buffer.lastIndexOf("\n");
    if (lastNewlineIndex !== -1) {
      const complete = this.buffer.slice(0, lastNewlineIndex + 1);
      this.buffer = this.buffer.slice(lastNewlineIndex + 1);
      return complete;
    }

    return null; // Still buffering
  }

  /**
   * Flush remaining buffer content.
   * Call this when stream ends.
   */
  flush(): string | null {
    if (this.buffer.length === 0) return null;
    const content = this.buffer;
    this.buffer = "";
    this.lastFeedTime = 0;
    return content;
  }

  /** Reset gate state */
  reset(): void {
    this.buffer = "";
    this.lastFeedTime = 0;
  }

  /**
   * Check if buffer should be force-flushed.
   * True if timeout exceeded OR buffer overflow.
   */
  shouldForceFlush(): boolean {
    if (this.buffer.length === 0) return false;

    const timeSinceLastFeed = Date.now() - this.lastFeedTime;

    // Timeout condition
    if (timeSinceLastFeed >= this.config.flushTimeoutMs) {
      return true;
    }

    // Overflow condition
    if (this.buffer.length >= this.config.maxBufferSize) {
      return true;
    }

    return false;
  }

  /**
   * Force flush the buffer if timeout/overflow conditions met.
   * Returns flushed content or null.
   */
  forceFlushIfNeeded(): string | null {
    if (this.shouldForceFlush()) {
      return this.flush();
    }
    return null;
  }

  /** Get current buffer size */
  get bufferSize(): number {
    return this.buffer.length;
  }

  /** Get time since last feed in ms */
  get timeSinceLastFeed(): number {
    if (this.lastFeedTime === 0) return 0;
    return Date.now() - this.lastFeedTime;
  }
}
