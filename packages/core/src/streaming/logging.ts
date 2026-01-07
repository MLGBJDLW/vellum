/**
 * Stream Logger Module
 *
 * Provides configurable logging for stream events.
 *
 * @module @vellum/core/streaming/logging
 */

import type { StreamEvent } from "@vellum/provider";

// =============================================================================
// T037: StreamLogger Class
// =============================================================================

/** Log level for stream logging */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/** Configuration for StreamLogger */
export interface StreamLoggerConfig {
  /** Minimum level to log (default: 'info') */
  level: LogLevel;

  /** Include timestamps (default: true) */
  timestamps: boolean;

  /** Include event type prefix (default: true) */
  prefix: boolean;

  /** Custom log function */
  logFn?: (level: LogLevel, message: string, data?: unknown) => void;
}

/** Numeric priority for log levels */
const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

/**
 * Logger for stream events.
 *
 * Provides configurable logging with support for different log levels,
 * timestamps, and custom log functions.
 *
 * @example
 * ```typescript
 * const logger = new StreamLogger({ level: 'debug' });
 *
 * // Log stream events
 * logger.logChunk({ type: 'text', content: 'Hello world' });
 *
 * // Log at specific levels
 * logger.log('info', 'Stream started');
 * logger.log('error', 'Connection failed', { code: 'TIMEOUT' });
 * ```
 *
 * @example
 * ```typescript
 * // Custom log function for integration with logging frameworks
 * const logger = new StreamLogger({
 *   level: 'trace',
 *   logFn: (level, message, data) => {
 *     myLoggerFramework.log({ level, message, data });
 *   },
 * });
 * ```
 */
export class StreamLogger {
  private readonly config: StreamLoggerConfig;

  /**
   * Create a new StreamLogger.
   *
   * @param config - Logger configuration options
   */
  constructor(config: Partial<StreamLoggerConfig> = {}) {
    this.config = {
      level: "info",
      timestamps: true,
      prefix: true,
      ...config,
    };
  }

  /**
   * Log a stream chunk.
   *
   * Automatically determines the appropriate log level based on event type.
   *
   * @param event - The stream event to log
   */
  logChunk(event: StreamEvent): void {
    const level = this.getLevelForEvent(event);
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) return;

    const message = this.formatMessage(event);
    this.log(level, message, event);
  }

  /**
   * Log at a specific level.
   *
   * @param level - The log level
   * @param message - The message to log
   * @param data - Optional data to include
   */
  log(level: LogLevel, message: string, data?: unknown): void {
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) return;

    if (this.config.logFn) {
      this.config.logFn(level, message, data);
    } else {
      const formatted = this.config.timestamps
        ? `[${new Date().toISOString()}] ${message}`
        : message;
      console[level === "trace" ? "debug" : level](formatted);
    }
  }

  /**
   * Determine appropriate log level for an event type.
   */
  private getLevelForEvent(event: StreamEvent): LogLevel {
    switch (event.type) {
      case "error":
        return "error";
      case "end":
        return "info";
      case "usage":
        return "debug";
      case "text":
      case "reasoning":
        return "trace";
      default:
        return "debug";
    }
  }

  /**
   * Format an event into a log message.
   */
  private formatMessage(event: StreamEvent): string {
    const prefix = this.config.prefix ? `[${event.type}] ` : "";
    switch (event.type) {
      case "text":
        return `${prefix}${event.content.slice(0, 50)}${event.content.length > 50 ? "..." : ""}`;
      case "error":
        return `${prefix}${event.message}`;
      case "end":
        return `${prefix}Stop reason: ${event.stopReason}`;
      default:
        return `${prefix}${event.type} event`;
    }
  }
}
