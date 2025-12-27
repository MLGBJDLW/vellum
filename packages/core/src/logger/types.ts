/**
 * Log severity levels in ascending order of importance.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * Numeric priority for log levels (higher = more severe).
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

/**
 * ANSI color codes for log levels.
 */
export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  trace: "\x1b[90m", // gray
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  fatal: "\x1b[35m", // magenta
};

/**
 * A single log entry with metadata.
 */
export interface LogEntry {
  /** Severity level of the log */
  level: LogLevel;
  /** Human-readable log message */
  message: string;
  /** When the log was created */
  timestamp: Date;
  /** Structured context data (logger identity, request id, etc.) */
  context?: Record<string, unknown>;
  /** Additional payload data */
  data?: unknown;
  /** OpenTelemetry trace ID (when within active span) */
  traceId?: string;
  /** OpenTelemetry span ID (when within active span) */
  spanId?: string;
}

/**
 * Result from Logger.time() for measuring durations.
 */
export interface TimerResult {
  /** Duration in milliseconds (updated when end/stop called) */
  duration: number;
  /** Logs the duration with optional message */
  end(message?: string): void;
  /** Returns duration in ms without logging */
  stop(): number;
}

/**
 * Transport interface for log output destinations.
 */
export interface LogTransport {
  /** Write a log entry to the transport */
  log(entry: LogEntry): void;
  /** Flush any buffered entries (optional) */
  flush?(): Promise<void>;
  /** Clean up resources (optional) */
  dispose?(): void;
}

/**
 * Options for creating a Logger instance.
 */
export interface LoggerOptions {
  /** Minimum level to log (default: 'info') */
  level?: LogLevel;
  /** Context data attached to all log entries */
  context?: Record<string, unknown>;
  /** Pre-configured transports */
  transports?: LogTransport[];
}
