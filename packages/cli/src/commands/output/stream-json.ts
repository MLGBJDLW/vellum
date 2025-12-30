/**
 * Streaming JSON Output (T-049)
 *
 * Implements newline-delimited JSON (NDJSON) output for streaming results.
 * Each line is a valid JSON object, parseable by tools like jq.
 *
 * @module cli/commands/output/stream-json
 */

import type { CommandResult } from "../types.js";

// =============================================================================
// Interfaces
// =============================================================================

/**
 * Base event type for streaming JSON
 */
export type StreamEventType =
  | "start"
  | "result"
  | "error"
  | "progress"
  | "output"
  | "complete"
  | "metadata";

/**
 * Streaming JSON event
 *
 * Each event is output as a single line of JSON.
 */
export interface StreamJsonEvent<T = unknown> {
  /** Event type for discrimination */
  type: StreamEventType;
  /** ISO timestamp of event */
  timestamp: string;
  /** Event payload */
  data: T;
  /** Sequence number (0-indexed) */
  seq: number;
}

/**
 * Start event data
 */
export interface StartEventData {
  command: string;
  args?: Record<string, unknown>;
}

/**
 * Result event data (wraps CommandResult)
 */
export interface ResultEventData {
  kind: CommandResult["kind"];
  message?: string;
  code?: string;
  data?: unknown;
}

/**
 * Error event data
 */
export interface ErrorEventData {
  code: string;
  message: string;
  stack?: string;
}

/**
 * Progress event data
 */
export interface ProgressEventData {
  current: number;
  total?: number;
  message?: string;
  percentage?: number;
}

/**
 * Output event data (for streaming content)
 */
export interface OutputEventData {
  content: string;
  stream?: "stdout" | "stderr";
}

/**
 * Complete event data
 */
export interface CompleteEventData {
  exitCode: number;
  duration: number;
}

/**
 * Metadata event data
 */
export interface MetadataEventData {
  version?: string;
  [key: string]: unknown;
}

/**
 * Writer output destination
 */
export interface StreamOutput {
  write(line: string): void;
}

/**
 * Stream writer options
 */
export interface StreamJsonWriterOptions {
  /** Output destination (defaults to stdout-like object) */
  output?: StreamOutput;
  /** Include pretty-printed JSON (default: false for NDJSON compliance) */
  pretty?: boolean;
  /** Include timestamps (default: true) */
  includeTimestamps?: boolean;
  /** Include sequence numbers (default: true) */
  includeSequence?: boolean;
}

// =============================================================================
// Stream JSON Writer
// =============================================================================

/**
 * Writes streaming JSON events (NDJSON format)
 *
 * Each event is written as a single line of valid JSON, making output
 * easily parseable by tools like jq:
 *
 * ```bash
 * vellum --json | jq 'select(.type == "result")'
 * ```
 *
 * @example
 * ```typescript
 * const writer = new StreamJsonWriter();
 *
 * writer.start({ command: '/help' });
 * writer.result(await executor.execute('/help'));
 * writer.complete(0, 150);
 * ```
 */
export class StreamJsonWriter {
  private seq = 0;
  private readonly output: StreamOutput;
  private readonly pretty: boolean;
  private readonly includeTimestamps: boolean;
  private readonly includeSequence: boolean;
  private startTime: number | null = null;

  constructor(options: StreamJsonWriterOptions = {}) {
    this.output = options.output ?? { write: (line) => console.log(line) };
    this.pretty = options.pretty ?? false;
    this.includeTimestamps = options.includeTimestamps ?? true;
    this.includeSequence = options.includeSequence ?? true;
  }

  /**
   * Write a generic event
   *
   * @param type - Event type
   * @param data - Event payload
   */
  write<T>(type: StreamEventType, data: T): void {
    const event: StreamJsonEvent<T> = {
      type,
      timestamp: this.includeTimestamps ? new Date().toISOString() : "",
      data,
      seq: this.includeSequence ? this.seq++ : 0,
    };

    // Remove empty fields if not needed
    const output: Record<string, unknown> = { type, data };
    if (this.includeTimestamps) {
      output.timestamp = event.timestamp;
    }
    if (this.includeSequence) {
      output.seq = event.seq;
    }

    const json = this.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
    this.output.write(json);
  }

  /**
   * Write a start event
   *
   * @param data - Start event data
   */
  start(data: StartEventData): void {
    this.startTime = Date.now();
    this.write("start", data);
  }

  /**
   * Write a result event from CommandResult
   *
   * @param result - Command execution result
   */
  result(result: CommandResult): void {
    const data: ResultEventData = {
      kind: result.kind,
    };

    switch (result.kind) {
      case "success":
        data.message = result.message;
        data.data = result.data;
        break;
      case "error":
        data.code = result.code;
        data.message = result.message;
        break;
      case "interactive":
        data.message = result.prompt.message;
        break;
      case "pending":
        data.message = result.operation.message;
        break;
    }

    this.write("result", data);
  }

  /**
   * Write an error event
   *
   * @param error - Error to write
   */
  error(error: unknown): void {
    const data: ErrorEventData = {
      code: "UNKNOWN_ERROR",
      message: "Unknown error",
    };

    if (error instanceof Error) {
      data.message = error.message;
      data.code = error.name;
      // Only include stack in development
      if (process.env.NODE_ENV === "development") {
        data.stack = error.stack;
      }
    } else if (typeof error === "string") {
      data.message = error;
    }

    this.write("error", data);
  }

  /**
   * Write a progress event
   *
   * @param data - Progress data
   */
  progress(data: ProgressEventData): void {
    if (data.total && data.total > 0) {
      data.percentage = Math.round((data.current / data.total) * 100);
    }
    this.write("progress", data);
  }

  /**
   * Write an output event (for streaming content)
   *
   * @param content - Content to output
   * @param stream - Output stream (stdout/stderr)
   */
  writeOutput(content: string, stream: "stdout" | "stderr" = "stdout"): void {
    this.write("output", { content, stream });
  }

  /**
   * Write a complete event
   *
   * @param exitCode - Exit code
   * @param duration - Duration in milliseconds (optional, calculated from start if available)
   */
  complete(exitCode: number, duration?: number): void {
    const elapsed = duration ?? (this.startTime ? Date.now() - this.startTime : 0);
    this.write("complete", { exitCode, duration: elapsed });
  }

  /**
   * Write metadata event
   *
   * @param data - Metadata key-value pairs
   */
  metadata(data: MetadataEventData): void {
    this.write("metadata", data);
  }

  /**
   * Get current sequence number
   */
  getSequence(): number {
    return this.seq;
  }

  /**
   * Reset sequence counter
   */
  reset(): void {
    this.seq = 0;
    this.startTime = null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a CommandResult as a single JSON line
 *
 * @param result - Command result to format
 * @returns JSON string (single line)
 */
export function formatResultAsJson(result: CommandResult): string {
  const data: ResultEventData = {
    kind: result.kind,
  };

  switch (result.kind) {
    case "success":
      data.message = result.message;
      data.data = result.data;
      break;
    case "error":
      data.code = result.code;
      data.message = result.message;
      break;
    case "interactive":
      data.message = result.prompt.message;
      break;
    case "pending":
      data.message = result.operation.message;
      break;
  }

  return JSON.stringify(data);
}

/**
 * Parse NDJSON input into events
 *
 * @param input - NDJSON string (multiple lines)
 * @returns Array of parsed events
 */
export function parseNdjson<T = unknown>(input: string): StreamJsonEvent<T>[] {
  return input
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as StreamJsonEvent<T>);
}

/**
 * Create a simple stream output that collects lines
 *
 * @returns Object with write function and lines array
 */
export function createCollector(): { output: StreamOutput; lines: string[] } {
  const lines: string[] = [];
  return {
    output: { write: (line) => lines.push(line) },
    lines,
  };
}
