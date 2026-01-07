/**
 * Credential Audit Logging
 *
 * Event-based audit logging for credential operations.
 * Logs all credential access with metadata while NEVER exposing credential values.
 *
 * @module credentials/audit
 */

import { z } from "zod";

// =============================================================================
// Audit Log Types
// =============================================================================

/**
 * Operations that can be audited
 */
export const AuditOperationSchema = z.enum([
  "resolve",
  "store",
  "delete",
  "rotate",
  "validate",
  "refresh",
]);

export type AuditOperation = z.infer<typeof AuditOperationSchema>;

/**
 * Schema for audit log entries
 *
 * Contains all metadata about credential operations WITHOUT the credential value.
 */
export const AuditLogEntrySchema = z.object({
  /** ISO 8601 timestamp */
  timestamp: z.string(),
  /** Type of operation performed */
  operation: AuditOperationSchema,
  /** Provider name (e.g., 'anthropic', 'openai') */
  provider: z.string(),
  /** Optional key within provider namespace */
  key: z.string().optional(),
  /** Source/store name where operation occurred */
  source: z.string(),
  /** Whether the operation succeeded */
  success: z.boolean(),
  /** Duration of the operation in milliseconds */
  durationMs: z.number(),
  /** Optional additional metadata (NEVER contains credential values) */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

/**
 * Partial entry for building audit logs
 */
export interface AuditLogInput {
  operation: AuditOperation;
  provider: string;
  key?: string;
  source: string;
  success: boolean;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Log Handler Types
// =============================================================================

/**
 * Handler function for processing audit log entries
 *
 * Implementations can write to console, file, remote service, etc.
 */
export type AuditLogHandler = (entry: AuditLogEntry) => void | Promise<void>;

/**
 * Options for the CredentialAuditLogger
 */
export interface CredentialAuditLoggerOptions {
  /** Whether audit logging is enabled (default: true) */
  readonly enabled?: boolean;
  /** Log handlers to process entries */
  readonly handlers?: readonly AuditLogHandler[];
  /** Include timestamp in ISO 8601 format (default: true) */
  readonly includeTimestamp?: boolean;
  /** Additional global metadata to include in all entries */
  readonly globalMetadata?: Record<string, unknown>;
}

// =============================================================================
// Built-in Log Handlers
// =============================================================================

/**
 * Console log handler options
 */
export interface ConsoleHandlerOptions {
  /** Log level for console output */
  readonly level?: "debug" | "info" | "warn" | "error";
  /** Whether to include full metadata in output */
  readonly verbose?: boolean;
  /** Custom prefix for log messages */
  readonly prefix?: string;
}

/**
 * Create a console log handler
 *
 * @param options - Console handler options
 * @returns AuditLogHandler that writes to console
 *
 * @example
 * ```typescript
 * const handler = createConsoleHandler({ level: 'info', verbose: true });
 * ```
 */
export function createConsoleHandler(options: ConsoleHandlerOptions = {}): AuditLogHandler {
  const { level = "info", verbose = false, prefix = "[AUDIT]" } = options;

  const logFn = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  }[level];

  return (entry: AuditLogEntry) => {
    const status = entry.success ? "✓" : "✗";
    const baseMessage = `${prefix} ${status} ${entry.operation.toUpperCase()} ${entry.provider}${entry.key ? `:${entry.key}` : ""} from ${entry.source} (${entry.durationMs}ms)`;

    if (verbose && entry.metadata) {
      logFn(baseMessage, entry.metadata);
    } else {
      logFn(baseMessage);
    }
  };
}

/**
 * File log handler options
 */
export interface FileHandlerOptions {
  /** Function to write log line (allows custom file handling) */
  readonly writeLine: (line: string) => void | Promise<void>;
  /** Format: 'json' for JSON lines, 'text' for human-readable */
  readonly format?: "json" | "text";
}

/**
 * Create a file log handler
 *
 * @param options - File handler options
 * @returns AuditLogHandler that writes to file via callback
 *
 * @example
 * ```typescript
 * const handler = createFileHandler({
 *   writeLine: (line) => fs.appendFileSync('audit.log', line + '\n'),
 *   format: 'json',
 * });
 * ```
 */
export function createFileHandler(options: FileHandlerOptions): AuditLogHandler {
  const { writeLine, format = "json" } = options;

  return async (entry: AuditLogEntry) => {
    if (format === "json") {
      await writeLine(JSON.stringify(entry));
    } else {
      const status = entry.success ? "SUCCESS" : "FAILURE";
      const line = `${entry.timestamp} [${status}] ${entry.operation} provider=${entry.provider}${entry.key ? ` key=${entry.key}` : ""} source=${entry.source} duration=${entry.durationMs}ms`;
      await writeLine(line);
    }
  };
}

/**
 * Create a custom handler that filters entries
 *
 * @param filter - Predicate to determine which entries to process
 * @param handler - Handler to process filtered entries
 * @returns AuditLogHandler that filters before processing
 *
 * @example
 * ```typescript
 * const handler = createFilteredHandler(
 *   (entry) => !entry.success, // Only failures
 *   createConsoleHandler({ level: 'error' })
 * );
 * ```
 */
export function createFilteredHandler(
  filter: (entry: AuditLogEntry) => boolean,
  handler: AuditLogHandler
): AuditLogHandler {
  return async (entry: AuditLogEntry) => {
    if (filter(entry)) {
      await handler(entry);
    }
  };
}

/**
 * Create a handler that batches entries for bulk processing
 *
 * @param batchSize - Number of entries to batch before flushing
 * @param flushInterval - Maximum time (ms) to wait before flushing
 * @param processor - Function to process a batch of entries
 * @returns Object with handler and flush function
 *
 * @example
 * ```typescript
 * const { handler, flush } = createBatchHandler(
 *   100, // Batch size
 *   5000, // 5 second flush interval
 *   async (entries) => {
 *     await sendToAnalyticsService(entries);
 *   }
 * );
 * ```
 */
export function createBatchHandler(
  batchSize: number,
  flushInterval: number,
  processor: (entries: readonly AuditLogEntry[]) => void | Promise<void>
): { handler: AuditLogHandler; flush: () => Promise<void> } {
  const batch: AuditLogEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (batch.length > 0) {
      const toProcess = [...batch];
      batch.length = 0;
      await processor(toProcess);
    }
  };

  const scheduleFlush = () => {
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, flushInterval);
    }
  };

  const handler: AuditLogHandler = async (entry: AuditLogEntry) => {
    batch.push(entry);

    if (batch.length >= batchSize) {
      await flush();
    } else {
      scheduleFlush();
    }
  };

  return { handler, flush };
}

// =============================================================================
// CredentialAuditLogger Implementation
// =============================================================================

/**
 * Credential Audit Logger
 *
 * Provides comprehensive audit logging for credential operations.
 * Supports multiple log handlers for flexible output destinations.
 *
 * **Security**: This logger NEVER captures or logs credential values.
 * Only operation metadata is recorded.
 *
 * @example
 * ```typescript
 * const logger = new CredentialAuditLogger({
 *   handlers: [
 *     createConsoleHandler({ level: 'info' }),
 *     createFileHandler({ writeLine: myFileWriter, format: 'json' }),
 *   ],
 * });
 *
 * // Log an operation
 * logger.log({
 *   operation: 'resolve',
 *   provider: 'anthropic',
 *   source: 'keychain',
 *   success: true,
 *   durationMs: 15,
 * });
 *
 * // Use timing helper
 * const timer = logger.startTimer('store', 'openai', 'file');
 * try {
 *   await doStoreOperation();
 *   timer.success();
 * } catch (error) {
 *   timer.failure({ error: String(error) });
 * }
 * ```
 */
export class CredentialAuditLogger {
  /** Whether logging is enabled */
  private readonly enabled: boolean;

  /** Registered log handlers */
  private readonly handlers: AuditLogHandler[];

  /** Whether to include timestamps */
  private readonly includeTimestamp: boolean;

  /** Global metadata for all entries */
  private readonly globalMetadata: Record<string, unknown>;

  /**
   * Create a new CredentialAuditLogger
   *
   * @param options - Logger configuration
   */
  constructor(options: CredentialAuditLoggerOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.handlers = [...(options.handlers ?? [])];
    this.includeTimestamp = options.includeTimestamp ?? true;
    this.globalMetadata = options.globalMetadata ?? {};
  }

  // ===========================================================================
  // Handler Management
  // ===========================================================================

  /**
   * Add a log handler
   *
   * @param handler - Handler to add
   * @returns Unsubscribe function
   */
  addHandler(handler: AuditLogHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index >= 0) {
        this.handlers.splice(index, 1);
      }
    };
  }

  /**
   * Remove a log handler
   *
   * @param handler - Handler to remove
   * @returns true if handler was removed
   */
  removeHandler(handler: AuditLogHandler): boolean {
    const index = this.handlers.indexOf(handler);
    if (index >= 0) {
      this.handlers.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get the current handler count
   */
  get handlerCount(): number {
    return this.handlers.length;
  }

  // ===========================================================================
  // Logging Methods
  // ===========================================================================

  /**
   * Log an audit entry
   *
   * @param input - Audit log input data
   */
  async log(input: AuditLogInput): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const entry = this.createEntry(input);

    // Call all handlers
    const promises = this.handlers.map(async (handler) => {
      try {
        await handler(entry);
      } catch {
        // Ignore handler errors - audit logging should not break operations
      }
    });

    await Promise.all(promises);
  }

  /**
   * Log synchronously (does not wait for async handlers)
   *
   * @param input - Audit log input data
   */
  logSync(input: AuditLogInput): void {
    if (!this.enabled) {
      return;
    }

    const entry = this.createEntry(input);

    for (const handler of this.handlers) {
      try {
        handler(entry);
      } catch {
        // Ignore handler errors
      }
    }
  }

  /**
   * Create a timer for measuring operation duration
   *
   * @param operation - Operation type
   * @param provider - Provider name
   * @param source - Source/store name
   * @param key - Optional key
   * @returns Timer object with success/failure methods
   *
   * @example
   * ```typescript
   * const timer = logger.startTimer('resolve', 'anthropic', 'keychain');
   * try {
   *   const result = await resolveCredential();
   *   timer.success({ storePriority: 1 });
   *   return result;
   * } catch (error) {
   *   timer.failure({ error: error.message });
   *   throw error;
   * }
   * ```
   */
  startTimer(
    operation: AuditOperation,
    provider: string,
    source: string,
    key?: string
  ): AuditTimer {
    const startTime = performance.now();

    return {
      success: async (metadata?: Record<string, unknown>) => {
        const durationMs = Math.round(performance.now() - startTime);
        await this.log({
          operation,
          provider,
          key,
          source,
          success: true,
          durationMs,
          metadata,
        });
      },
      failure: async (metadata?: Record<string, unknown>) => {
        const durationMs = Math.round(performance.now() - startTime);
        await this.log({
          operation,
          provider,
          key,
          source,
          success: false,
          durationMs,
          metadata,
        });
      },
      successSync: (metadata?: Record<string, unknown>) => {
        const durationMs = Math.round(performance.now() - startTime);
        this.logSync({
          operation,
          provider,
          key,
          source,
          success: true,
          durationMs,
          metadata,
        });
      },
      failureSync: (metadata?: Record<string, unknown>) => {
        const durationMs = Math.round(performance.now() - startTime);
        this.logSync({
          operation,
          provider,
          key,
          source,
          success: false,
          durationMs,
          metadata,
        });
      },
      elapsed: () => Math.round(performance.now() - startTime),
    };
  }

  // ===========================================================================
  // Convenience Methods
  // ===========================================================================

  /**
   * Log a resolve operation
   */
  async logResolve(
    provider: string,
    source: string,
    success: boolean,
    durationMs: number,
    options?: { key?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await this.log({
      operation: "resolve",
      provider,
      source,
      success,
      durationMs,
      key: options?.key,
      metadata: options?.metadata,
    });
  }

  /**
   * Log a store operation
   */
  async logStore(
    provider: string,
    source: string,
    success: boolean,
    durationMs: number,
    options?: { key?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await this.log({
      operation: "store",
      provider,
      source,
      success,
      durationMs,
      key: options?.key,
      metadata: options?.metadata,
    });
  }

  /**
   * Log a delete operation
   */
  async logDelete(
    provider: string,
    source: string,
    success: boolean,
    durationMs: number,
    options?: { key?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await this.log({
      operation: "delete",
      provider,
      source,
      success,
      durationMs,
      key: options?.key,
      metadata: options?.metadata,
    });
  }

  /**
   * Log a rotate operation
   */
  async logRotate(
    provider: string,
    source: string,
    success: boolean,
    durationMs: number,
    options?: { key?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await this.log({
      operation: "rotate",
      provider,
      source,
      success,
      durationMs,
      key: options?.key,
      metadata: options?.metadata,
    });
  }

  /**
   * Log a validate operation
   */
  async logValidate(
    provider: string,
    source: string,
    success: boolean,
    durationMs: number,
    options?: { key?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await this.log({
      operation: "validate",
      provider,
      source,
      success,
      durationMs,
      key: options?.key,
      metadata: options?.metadata,
    });
  }

  /**
   * Log a refresh operation
   */
  async logRefresh(
    provider: string,
    source: string,
    success: boolean,
    durationMs: number,
    options?: { key?: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    await this.log({
      operation: "refresh",
      provider,
      source,
      success,
      durationMs,
      key: options?.key,
      metadata: options?.metadata,
    });
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Create a full audit log entry from input
   */
  private createEntry(input: AuditLogInput): AuditLogEntry {
    const entry: AuditLogEntry = {
      timestamp: this.includeTimestamp ? new Date().toISOString() : "",
      operation: input.operation,
      provider: input.provider,
      source: input.source,
      success: input.success,
      durationMs: input.durationMs,
    };

    // Add optional key
    if (input.key !== undefined) {
      entry.key = input.key;
    }

    // Merge global and input metadata
    const combinedMetadata = {
      ...this.globalMetadata,
      ...input.metadata,
    };

    if (Object.keys(combinedMetadata).length > 0) {
      entry.metadata = combinedMetadata;
    }

    return entry;
  }
}

// =============================================================================
// Timer Interface
// =============================================================================

/**
 * Timer interface for measuring operation duration
 */
export interface AuditTimer {
  /** Mark operation as successful and log */
  success: (metadata?: Record<string, unknown>) => Promise<void>;
  /** Mark operation as failed and log */
  failure: (metadata?: Record<string, unknown>) => Promise<void>;
  /** Mark operation as successful and log synchronously */
  successSync: (metadata?: Record<string, unknown>) => void;
  /** Mark operation as failed and log synchronously */
  failureSync: (metadata?: Record<string, unknown>) => void;
  /** Get elapsed time in milliseconds */
  elapsed: () => number;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a default audit logger with console output
 *
 * @param options - Logger options
 * @returns CredentialAuditLogger instance
 */
export function createDefaultAuditLogger(
  options: Partial<CredentialAuditLoggerOptions> = {}
): CredentialAuditLogger {
  return new CredentialAuditLogger({
    ...options,
    handlers: [createConsoleHandler({ level: "info" }), ...(options.handlers ?? [])],
  });
}

/**
 * Create a silent audit logger (for testing or when logging is disabled)
 *
 * @returns CredentialAuditLogger with no handlers
 */
export function createSilentAuditLogger(): CredentialAuditLogger {
  return new CredentialAuditLogger({
    enabled: false,
    handlers: [],
  });
}

// =============================================================================
// Integration Helper
// =============================================================================

/**
 * Create an audit logger that listens to CredentialManager events
 *
 * This helper connects the audit logger to a CredentialManager's event system.
 *
 * @param logger - Audit logger instance
 * @returns Event listener function to pass to manager.on()
 *
 * @example
 * ```typescript
 * const auditLogger = new CredentialAuditLogger({ ... });
 * const manager = new CredentialManager([...stores]);
 *
 * // Connect audit logger to manager events
 * const listener = createManagerEventListener(auditLogger);
 * manager.on(listener);
 * ```
 */
export function createManagerEventListener(
  logger: CredentialAuditLogger
): (event: {
  type: string;
  provider?: string;
  key?: string;
  source?: string;
  store?: string;
  valid?: boolean;
  operation?: string;
  error?: { code: string; message: string };
}) => void {
  // Track operation start times for duration calculation
  const operationTimers = new Map<string, number>();

  return (event) => {
    const timerKey = `${event.provider}:${event.key ?? ""}`;

    switch (event.type) {
      case "credential:resolved":
        logger.logSync({
          operation: "resolve",
          provider: event.provider ?? "unknown",
          key: event.key,
          source: event.source ?? "unknown",
          success: true,
          durationMs: getElapsed(timerKey),
        });
        break;

      case "credential:stored":
        logger.logSync({
          operation: "store",
          provider: event.provider ?? "unknown",
          source: event.store ?? "unknown",
          success: true,
          durationMs: getElapsed(timerKey),
        });
        break;

      case "credential:deleted":
        logger.logSync({
          operation: "delete",
          provider: event.provider ?? "unknown",
          key: event.key,
          source: event.store ?? "unknown",
          success: true,
          durationMs: getElapsed(timerKey),
        });
        break;

      case "credential:validated":
        logger.logSync({
          operation: "validate",
          provider: event.provider ?? "unknown",
          source: "validation",
          success: event.valid ?? false,
          durationMs: getElapsed(timerKey),
        });
        break;

      case "credential:not_found":
        logger.logSync({
          operation: "resolve",
          provider: event.provider ?? "unknown",
          key: event.key,
          source: "none",
          success: false,
          durationMs: getElapsed(timerKey),
          metadata: { notFound: true },
        });
        break;

      case "error":
        logger.logSync({
          operation: (event.operation ?? "unknown") as AuditOperation,
          provider: "unknown",
          source: "error",
          success: false,
          durationMs: 0,
          metadata: {
            errorCode: event.error?.code,
            errorMessage: event.error?.message,
          },
        });
        break;
    }
  };

  function getElapsed(key: string): number {
    const startTime = operationTimers.get(key);
    operationTimers.delete(key);
    if (startTime) {
      return Math.round(performance.now() - startTime);
    }
    return 0;
  }
}
