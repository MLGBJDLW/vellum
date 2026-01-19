import type { LogEntry, LogLevel, LogTransport } from "../types.js";

/**
 * Global flag to disable console transport when TUI is active.
 * Set this to true when entering TUI mode to prevent console.log from
 * bypassing Ink and causing terminal overflow.
 */
let tuiModeActive = false;

/**
 * Enable or disable TUI mode for the console transport.
 * When enabled, console output is suppressed to prevent terminal overflow.
 * @param enabled - Whether TUI mode is active
 */
export function setTuiModeActive(enabled: boolean): void {
  tuiModeActive = enabled;
}

/**
 * Check if TUI mode is currently active.
 * @returns True if TUI mode is active
 */
export function isTuiModeActive(): boolean {
  return tuiModeActive;
}

/**
 * ANSI color codes for terminal output.
 */
const COLORS = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
} as const;

/**
 * Color mapping for each log level.
 */
const LEVEL_COLORS: Record<LogLevel, string> = {
  trace: COLORS.gray,
  debug: COLORS.cyan,
  info: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
  fatal: COLORS.magenta,
};

/**
 * Options for ConsoleTransport.
 */
export interface ConsoleTransportOptions {
  /** Force colors on or off. Auto-detects if not specified. */
  colors?: boolean;
}

/**
 * Detect if colors should be enabled by default.
 * Disables colors when:
 * - stdout is not a TTY
 * - CI environment variable is set
 * - NO_COLOR environment variable is set
 */
function shouldEnableColors(): boolean {
  // Check NO_COLOR (standard: https://no-color.org/)
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  // Check CI environment
  if (process.env.CI) {
    return false;
  }

  // Check if stdout is a TTY
  if (!process.stdout.isTTY) {
    return false;
  }

  return true;
}

/**
 * Format a timestamp as ISO string without milliseconds.
 */
function formatTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Console transport with color support.
 * Outputs formatted log messages to stdout/stderr.
 *
 * @example
 * ```typescript
 * const transport = new ConsoleTransport({ colors: true });
 * logger.addTransport(transport);
 * ```
 */
export class ConsoleTransport implements LogTransport {
  private readonly useColors: boolean;

  constructor(options: ConsoleTransportOptions = {}) {
    this.useColors = options.colors ?? shouldEnableColors();
  }

  /**
   * Log an entry to the console with optional coloring.
   * Suppressed when TUI mode is active to prevent terminal overflow.
   */
  log(entry: LogEntry): void {
    // Guard: Suppress console output when TUI is active
    // This prevents console.log from bypassing Ink and causing overflow
    if (tuiModeActive) {
      return;
    }

    const timestamp = formatTimestamp(entry.timestamp);
    const level = entry.level.toUpperCase().padEnd(5);
    const message = entry.message;

    let output: string;

    if (this.useColors) {
      const color = LEVEL_COLORS[entry.level];
      output = `[${timestamp}] ${color}[${level}]${COLORS.reset} ${message}`;
    } else {
      output = `[${timestamp}] [${level}] ${message}`;
    }

    // Append data if present
    if (entry.data !== undefined) {
      const dataStr = typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data);
      output += ` ${dataStr}`;
    }

    // Use stderr for errors, stdout for everything else
    if (entry.level === "error") {
      console.error(output);
    } else {
      console.log(output);
    }
  }
}
