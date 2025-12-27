import { Logger } from "./logger.js";
import { ConsoleTransport } from "./transports/console.js";
import { JsonTransport } from "./transports/json.js";
import { RotatingFileTransport } from "./transports/rotating-file.js";
import type { LogLevel } from "./types.js";

/**
 * Options for creating a logger via createLogger factory.
 */
export interface CreateLoggerOptions {
  /** Logger name for identification (default: 'vellum') */
  name?: string;
  /** Minimum log level (default: 'info') */
  level?: LogLevel;
  /** Enable console output (default: true) */
  console?: boolean;
  /** File transport configuration */
  file?: {
    /** Enable file logging */
    enabled: boolean;
    /** Path to log file */
    path: string;
    /** Maximum file size before rotation in bytes */
    maxSize?: number;
    /** Maximum number of rotated files to keep */
    maxFiles?: number;
    /** Whether to compress rotated files */
    compress?: boolean;
  };
  /** If true, output JSON format to console (default: false) */
  json?: boolean;
  /** Enable colored console output (default: true in non-production) */
  colors?: boolean;
  /** Include timestamps in console output (default: true) */
  timestamps?: boolean;
}

/**
 * Factory function to create a Logger with common transport configurations.
 *
 * @example
 * ```typescript
 * // Simple console logger
 * const logger = createLogger({ name: 'myapp', level: 'debug' });
 *
 * // Logger with file rotation
 * const logger = createLogger({
 *   name: 'myapp',
 *   level: 'info',
 *   file: {
 *     enabled: true,
 *     path: './logs/app.log',
 *     maxSize: 10 * 1024 * 1024, // 10MB
 *     maxFiles: 5,
 *     compress: true,
 *   },
 * });
 *
 * // JSON output for production
 * const logger = createLogger({
 *   name: 'myapp',
 *   level: 'info',
 *   json: true,
 *   colors: false,
 * });
 * ```
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const logger = new Logger({
    level: options.level ?? "info",
    context: options.name ? { logger: options.name } : undefined,
  });

  // Console transport (enabled by default)
  const enableConsole = options.console ?? true;
  if (enableConsole) {
    if (options.json) {
      // JSON output to console
      const jsonTransport = new JsonTransport();
      logger.addTransport(jsonTransport);
    } else {
      // Human-readable console output
      const consoleTransport = new ConsoleTransport({
        colors: options.colors ?? process.env.NODE_ENV !== "production",
      });
      logger.addTransport(consoleTransport);
    }
  }

  // File transport (optional)
  if (options.file?.enabled) {
    const fileTransport = new RotatingFileTransport({
      filepath: options.file.path,
      maxSize: options.file.maxSize,
      maxFiles: options.file.maxFiles,
      compress: options.file.compress,
    });
    logger.addTransport(fileTransport);
  }

  return logger;
}
