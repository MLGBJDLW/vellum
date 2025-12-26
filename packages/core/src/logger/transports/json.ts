import type { LogEntry, LogTransport } from "../types.js";

/**
 * Options for JsonTransport.
 */
export interface JsonTransportOptions {
  /** Custom output function (default: console.log) */
  output?: (line: string) => void;
}

/**
 * JSON transport for structured log output.
 * Outputs single-line JSON objects for each log entry.
 *
 * @example
 * ```typescript
 * const transport = new JsonTransport();
 * logger.addTransport(transport);
 * // Output: {"time":"2025-12-26T10:00:00.000Z","level":"info","message":"Hello"}
 *
 * // Custom output
 * const lines: string[] = [];
 * const transport = new JsonTransport({ output: (line) => lines.push(line) });
 * ```
 */
export class JsonTransport implements LogTransport {
  private readonly output: (line: string) => void;

  constructor(options: JsonTransportOptions = {}) {
    this.output = options.output ?? console.log;
  }

  /**
   * Output a log entry as a single-line JSON string.
   */
  log(entry: LogEntry): void {
    const obj: Record<string, unknown> = {
      time: entry.timestamp.toISOString(),
      level: entry.level,
    };

    if (entry.context && Object.keys(entry.context).length > 0) {
      obj.context = entry.context;
    }

    obj.message = entry.message;

    if (entry.data !== undefined) {
      obj.data = entry.data;
    }

    const line = JSON.stringify(obj);
    this.output(line);
  }
}
