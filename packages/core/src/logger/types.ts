/**
 * Log severity levels in ascending order of importance.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Numeric priority for log levels (higher = more severe).
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
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
