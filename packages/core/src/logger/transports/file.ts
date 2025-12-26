import { appendFile } from "node:fs/promises";

import type { LogEntry, LogTransport } from "../types.js";

/**
 * Options for FileTransport.
 */
export interface FileTransportOptions {
  /** Path to the log file */
  path: string;
  /** Flush interval in milliseconds (default: 1000) */
  flushInterval?: number;
  /** Maximum buffer size before auto-flush (default: 100) */
  maxBufferSize?: number;
  /** Error callback for write failures */
  onError?: (error: Error) => void;
}

/**
 * Format a log entry as a single line string.
 */
function formatEntry(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  let line = `[${timestamp}] [${level}] ${entry.message}`;

  if (entry.context && Object.keys(entry.context).length > 0) {
    line += ` context=${JSON.stringify(entry.context)}`;
  }

  if (entry.data !== undefined) {
    const dataStr = typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data);
    line += ` data=${dataStr}`;
  }

  return line;
}

/**
 * File transport with buffered writes.
 * Buffers log entries in memory and flushes periodically or when buffer is full.
 *
 * @example
 * ```typescript
 * const transport = new FileTransport({
 *   path: './app.log',
 *   flushInterval: 5000,
 *   maxBufferSize: 50,
 *   onError: (err) => console.error('Log write failed:', err),
 * });
 * logger.addTransport(transport);
 * ```
 */
export class FileTransport implements LogTransport {
  private readonly path: string;
  private readonly maxBufferSize: number;
  private readonly onError?: (error: Error) => void;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  /** Last error encountered during file write */
  lastError: Error | null = null;

  constructor(options: FileTransportOptions) {
    this.path = options.path;
    this.maxBufferSize = options.maxBufferSize ?? 100;
    this.onError = options.onError;

    const flushInterval = options.flushInterval ?? 1000;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, flushInterval);

    // Prevent timer from keeping process alive
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Buffer a log entry. Auto-flushes if buffer exceeds maxBufferSize.
   */
  log(entry: LogEntry): void {
    const line = formatEntry(entry);
    this.buffer.push(line);

    if (this.buffer.length >= this.maxBufferSize) {
      void this.flush();
    }
  }

  /**
   * Flush buffered entries to file.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) {
      return;
    }

    this.flushing = true;
    const entries = this.buffer;
    this.buffer = [];

    try {
      const content = entries.join("\n") + "\n";
      await appendFile(this.path, content, "utf-8");
      this.lastError = null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.lastError = err;
      this.onError?.(err);
      // Re-add entries to buffer on failure (at front)
      this.buffer = [...entries, ...this.buffer];
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Stop the flush timer and flush remaining entries.
   */
  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Synchronous dispose can't wait for flush, but we try
    void this.flush();
  }
}
