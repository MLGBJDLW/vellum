import type { LogEntry, LoggerOptions, LogLevel, LogTransport } from "./types.js";
import { LOG_LEVEL_PRIORITY } from "./types.js";

/**
 * Logger with multi-transport support, level filtering, and child logger creation.
 *
 * @example
 * ```typescript
 * const logger = new Logger({ level: 'info' });
 * logger.addTransport(consoleTransport);
 * logger.info('Application started', { version: '1.0.0' });
 *
 * const childLogger = logger.child({ requestId: '123' });
 * childLogger.debug('Processing request'); // inherits transports and level
 * ```
 */
export class Logger {
  private level: LogLevel;
  private context: Record<string, unknown>;
  private transports: LogTransport[];

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.context = options.context ?? {};
    this.transports = options.transports ?? [];
  }

  /**
   * Log a debug message.
   */
  debug(message: string, data?: unknown): void {
    this.log("debug", message, data);
  }

  /**
   * Log an info message.
   */
  info(message: string, data?: unknown): void {
    this.log("info", message, data);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, data?: unknown): void {
    this.log("warn", message, data);
  }

  /**
   * Log an error message.
   */
  error(message: string, data?: unknown): void {
    this.log("error", message, data);
  }

  /**
   * Add a transport for log output.
   */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  /**
   * Set the minimum log level.
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level.
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Create a child logger with merged context.
   * Child inherits transports and level from parent.
   */
  child(context: Record<string, unknown>): Logger {
    return new Logger({
      level: this.level,
      context: { ...this.context, ...context },
      transports: this.transports,
    });
  }

  /**
   * Flush all transports that support flushing.
   */
  async flush(): Promise<void> {
    const flushPromises = this.transports
      .filter((t) => t.flush !== undefined)
      .map((t) => t.flush!());

    await Promise.all(flushPromises);
  }

  /**
   * Dispose all transports that support disposal.
   */
  dispose(): void {
    for (const transport of this.transports) {
      transport.dispose?.();
    }
  }

  /**
   * Internal log method with level filtering.
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: Object.keys(this.context).length > 0 ? this.context : undefined,
      data,
    };

    for (const transport of this.transports) {
      transport.log(entry);
    }
  }

  /**
   * Check if a log level should be logged based on current level setting.
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }
}
