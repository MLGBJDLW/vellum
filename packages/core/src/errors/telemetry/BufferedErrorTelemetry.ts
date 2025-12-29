// ============================================
// Buffered Error Telemetry - Aggregated Reporting
// ============================================

import { shouldSkipTelemetry } from "../privacy/ErrorNoTelemetry.js";
import type { VellumError } from "../types.js";

/**
 * Options for configuring BufferedErrorTelemetry.
 */
export interface BufferedErrorTelemetryOptions {
  /** Interval for automatic flush in milliseconds (default: 30000) */
  flushIntervalMs?: number;
  /** Maximum buffer size before auto-flush (default: 100) */
  maxBufferSize?: number;
  /** Callback invoked when errors are flushed */
  onFlush?: (aggregated: AggregatedError[]) => void | Promise<void>;
}

/**
 * An aggregated error record combining multiple occurrences.
 */
export interface AggregatedError {
  /** Unique fingerprint for this error type */
  fingerprint: string;
  /** Number of occurrences */
  count: number;
  /** Timestamp of first occurrence */
  firstSeen: number;
  /** Timestamp of most recent occurrence */
  lastSeen: number;
  /** Sample error instance (first occurrence) */
  sample: VellumError;
}

/** Default flush interval: 30 seconds */
const DEFAULT_FLUSH_INTERVAL_MS = 30000;

/** Default maximum buffer size */
const DEFAULT_MAX_BUFFER_SIZE = 100;

/**
 * Buffers and aggregates error telemetry for efficient reporting.
 *
 * Features:
 * - Aggregates errors with the same fingerprint (AC-009-1)
 * - Flushes aggregated errors to callback (AC-009-2)
 * - Respects privacy by skipping ErrorNoTelemetry instances
 * - Configurable flush interval and buffer size
 *
 * The fingerprint is generated from: `${error.name}-${error.code}-${message.substring(0, 100)}`
 *
 * @example
 * ```typescript
 * const telemetry = BufferedErrorTelemetry.getInstance();
 *
 * // Configure the callback
 * telemetry.configure({
 *   onFlush: async (errors) => {
 *     await sendToTelemetryService(errors);
 *   }
 * });
 *
 * // Record errors (same fingerprint will be aggregated)
 * telemetry.record(new VellumError('Rate limited', ErrorCode.LLM_RATE_LIMIT));
 * telemetry.record(new VellumError('Rate limited', ErrorCode.LLM_RATE_LIMIT));
 *
 * // Manual flush if needed
 * await telemetry.flush();
 * ```
 */
export class BufferedErrorTelemetry {
  private static instance: BufferedErrorTelemetry | undefined;

  private buffer = new Map<string, AggregatedError>();
  private flushTimer?: ReturnType<typeof setInterval>;
  private options: Required<BufferedErrorTelemetryOptions>;
  private flushing = false;

  private constructor(options: BufferedErrorTelemetryOptions = {}) {
    this.options = {
      flushIntervalMs: options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
      maxBufferSize: options.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE,
      onFlush: options.onFlush ?? (() => {}),
    };

    // Start automatic flush timer
    this.startFlushTimer();
  }

  /**
   * Gets the singleton instance of BufferedErrorTelemetry.
   */
  static getInstance(): BufferedErrorTelemetry {
    if (!BufferedErrorTelemetry.instance) {
      BufferedErrorTelemetry.instance = new BufferedErrorTelemetry();
    }
    return BufferedErrorTelemetry.instance;
  }

  /**
   * Resets the singleton instance (for testing).
   * @internal
   */
  static resetInstance(): void {
    if (BufferedErrorTelemetry.instance) {
      BufferedErrorTelemetry.instance.dispose();
      BufferedErrorTelemetry.instance = undefined;
    }
  }

  /**
   * Configures the telemetry instance with new options.
   * Existing buffer contents are preserved.
   *
   * @param options - New configuration options
   */
  configure(options: BufferedErrorTelemetryOptions): void {
    if (options.flushIntervalMs !== undefined) {
      this.options.flushIntervalMs = options.flushIntervalMs;
      // Restart timer with new interval
      this.startFlushTimer();
    }
    if (options.maxBufferSize !== undefined) {
      this.options.maxBufferSize = options.maxBufferSize;
    }
    if (options.onFlush !== undefined) {
      this.options.onFlush = options.onFlush;
    }
  }

  /**
   * Records an error for aggregated telemetry.
   * AC-009-1: Same fingerprint errors aggregated by count
   *
   * Errors marked with skipTelemetry=true are ignored.
   *
   * @param error - The error to record
   */
  record(error: VellumError): void {
    // Respect privacy - skip errors marked for no telemetry
    if (shouldSkipTelemetry(error)) {
      return;
    }

    const fingerprint = this.generateFingerprint(error);
    const now = Date.now();

    const existing = this.buffer.get(fingerprint);
    if (existing) {
      // Aggregate with existing entry
      existing.count += 1;
      existing.lastSeen = now;
    } else {
      // Create new aggregated entry
      this.buffer.set(fingerprint, {
        fingerprint,
        count: 1,
        firstSeen: now,
        lastSeen: now,
        sample: error,
      });
    }

    // Auto-flush if buffer exceeds max size
    if (this.buffer.size >= this.options.maxBufferSize) {
      void this.flush();
    }
  }

  /**
   * Flushes the buffer, sending aggregated errors to the onFlush callback.
   * AC-009-2: Flush sends aggregated errors to onFlush callback
   */
  async flush(): Promise<void> {
    // Prevent concurrent flushes
    if (this.flushing) {
      return;
    }

    if (this.buffer.size === 0) {
      return;
    }

    this.flushing = true;
    try {
      // Take snapshot of current buffer and clear it
      const aggregated = Array.from(this.buffer.values());
      this.buffer.clear();

      // Invoke callback
      await this.options.onFlush(aggregated);
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Generates a fingerprint for an error to group similar errors.
   *
   * Format: `${error.name}-${error.code}-${message.substring(0, 100)}`
   *
   * @param error - The error to fingerprint
   * @returns A string fingerprint
   */
  generateFingerprint(error: VellumError): string {
    // Truncate message to 100 chars for fingerprint
    const truncatedMessage = error.message.substring(0, 100);
    return `${error.name}-${error.code}-${truncatedMessage}`;
  }

  /**
   * Gets the current buffer size (for testing/monitoring).
   * @internal
   */
  getBufferSize(): number {
    return this.buffer.size;
  }

  /**
   * Clears the buffer without flushing (for testing).
   * @internal
   */
  clear(): void {
    this.buffer.clear();
  }

  /**
   * Gets a snapshot of the current buffer (for testing).
   * @internal
   */
  getBufferSnapshot(): AggregatedError[] {
    return Array.from(this.buffer.values());
  }

  /**
   * Disposes of the telemetry instance, stopping the flush timer.
   * Does not flush remaining buffer.
   */
  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.buffer.clear();
  }

  /**
   * Disposes and flushes remaining buffer.
   */
  async disposeAndFlush(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    await this.flush();
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.options.flushIntervalMs);

    // Allow the process to exit even if the timer is running
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }
}
