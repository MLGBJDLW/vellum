// ============================================
// T041: Enterprise Audit Logger
// ============================================

import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import {
  type AuditDestination,
  type FullEnterpriseConfig,
  getFullEnterpriseConfig,
} from "./EnterpriseConfig.js";

// ============================================
// Types
// ============================================

export type AuditEventType =
  | "server_connect"
  | "server_disconnect"
  | "server_blocked"
  | "tool_call"
  | "tool_blocked"
  | "tool_result"
  | "tool_error"
  | "resource_read"
  | "config_change";

export interface AuditEvent {
  timestamp: string;
  eventType: AuditEventType;
  serverName?: string;
  toolName?: string;
  userId?: string;
  sessionId?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface FileDestinationState {
  handle: fs.FileHandle | null;
  path: string;
  currentSize: number;
  maxSize: number;
  maxFiles: number;
}

interface HttpDestinationState {
  url: string;
  headers?: Record<string, string>;
  buffer: string[];
  batchSize: number;
  flushIntervalMs: number;
  flushTimer: ReturnType<typeof setInterval> | null;
}

// ============================================
// Audit Logger
// ============================================

export class AuditLogger {
  private enabled: boolean = false;
  private includeToolArgs: boolean = false;
  private includeToolResults: boolean = false;
  private fileDestinations: FileDestinationState[] = [];
  private httpDestinations: HttpDestinationState[] = [];
  private sessionId: string;
  private userId?: string;

  constructor(options: { sessionId?: string; userId?: string } = {}) {
    this.sessionId = options.sessionId ?? crypto.randomUUID();
    this.userId = options.userId;
  }

  /**
   * Initialize the audit logger with enterprise configuration.
   */
  async initialize(config?: FullEnterpriseConfig): Promise<void> {
    const enterpriseConfig = config ?? getFullEnterpriseConfig();
    const audit = enterpriseConfig.audit;

    if (!audit?.enabled) {
      this.enabled = false;
      return;
    }

    this.enabled = true;
    this.includeToolArgs = audit.includeToolArgs ?? false;
    this.includeToolResults = audit.includeToolResults ?? false;

    // Initialize destinations
    for (const dest of audit.destinations ?? []) {
      if (dest.type === "file") {
        await this.initFileDestination(dest);
      } else if (dest.type === "http") {
        this.initHttpDestination(dest);
      }
    }
  }

  private async initFileDestination(
    dest: Extract<AuditDestination, { type: "file" }>
  ): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(dirname(dest.path), { recursive: true });

    this.fileDestinations.push({
      handle: null,
      path: dest.path,
      currentSize: 0,
      maxSize: (dest.maxSizeMB ?? 100) * 1024 * 1024,
      maxFiles: dest.maxFiles ?? 10,
    });
  }

  private initHttpDestination(dest: Extract<AuditDestination, { type: "http" }>): void {
    const state: HttpDestinationState = {
      url: dest.url,
      headers: dest.headers,
      buffer: [],
      batchSize: dest.batchSize ?? 100,
      flushIntervalMs: dest.flushIntervalMs ?? 5000,
      flushTimer: null,
    };

    // Start flush timer
    state.flushTimer = setInterval(() => {
      this.flushHttpDestination(state).catch(() => {});
    }, state.flushIntervalMs);

    this.httpDestinations.push(state);
  }

  /**
   * Log an audit event.
   */
  async log(event: Omit<AuditEvent, "timestamp" | "sessionId" | "userId">): Promise<void> {
    if (!this.enabled) return;

    const fullEvent: AuditEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
    };

    // Strip args/results if not configured
    if (!this.includeToolArgs) {
      delete fullEvent.arguments;
    }
    if (!this.includeToolResults) {
      delete fullEvent.result;
    }

    const line = `${JSON.stringify(fullEvent)}\n`;

    // Write to all destinations
    await Promise.all([
      ...this.fileDestinations.map((dest) => this.writeToFile(dest, line)),
      ...this.httpDestinations.map((dest) => this.bufferForHttp(dest, line)),
    ]);
  }

  private async writeToFile(dest: FileDestinationState, line: string): Promise<void> {
    try {
      // Open file if needed
      if (!dest.handle) {
        dest.handle = await fs.open(dest.path, "a");
        const stats = await dest.handle.stat();
        dest.currentSize = stats.size;
      }

      // Check rotation
      if (dest.currentSize + line.length > dest.maxSize) {
        await this.rotateFile(dest);
      }

      // Write line
      await dest.handle.write(line);
      dest.currentSize += line.length;
    } catch {
      // Silently fail - audit should not break the application
    }
  }

  private async rotateFile(dest: FileDestinationState): Promise<void> {
    // Close current handle
    if (dest.handle) {
      await dest.handle.close();
      dest.handle = null;
    }

    // Rotate files: .log -> .log.1 -> .log.2 -> ...
    for (let i = dest.maxFiles - 1; i >= 1; i--) {
      const oldPath = i === 1 ? dest.path : `${dest.path}.${i - 1}`;
      const newPath = `${dest.path}.${i}`;
      try {
        await fs.rename(oldPath, newPath);
      } catch {
        // File might not exist
      }
    }

    // Reset state
    dest.currentSize = 0;
  }

  private async bufferForHttp(dest: HttpDestinationState, line: string): Promise<void> {
    dest.buffer.push(line);
    if (dest.buffer.length >= dest.batchSize) {
      await this.flushHttpDestination(dest);
    }
  }

  private async flushHttpDestination(dest: HttpDestinationState): Promise<void> {
    if (dest.buffer.length === 0) return;

    const batch = dest.buffer.splice(0, dest.buffer.length);
    const body = batch.join("");

    try {
      await fetch(dest.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-ndjson",
          ...dest.headers,
        },
        body,
      });
    } catch {
      // Re-add to buffer on failure (with limit to prevent memory issues)
      if (dest.buffer.length < dest.batchSize * 10) {
        dest.buffer.unshift(...batch);
      }
    }
  }

  /**
   * Flush all pending logs and close connections.
   */
  async shutdown(): Promise<void> {
    // Flush HTTP destinations
    await Promise.all(
      this.httpDestinations.map(async (dest) => {
        if (dest.flushTimer) {
          clearInterval(dest.flushTimer);
          dest.flushTimer = null;
        }
        await this.flushHttpDestination(dest);
      })
    );

    // Close file handles
    await Promise.all(
      this.fileDestinations.map(async (dest) => {
        if (dest.handle) {
          await dest.handle.close();
          dest.handle = null;
        }
      })
    );

    this.enabled = false;
  }

  // ============================================
  // Convenience Methods
  // ============================================

  async logServerConnect(serverName: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log({ eventType: "server_connect", serverName, metadata });
  }

  async logServerDisconnect(serverName: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.log({ eventType: "server_disconnect", serverName, metadata });
  }

  async logServerBlocked(serverName: string, reason: string): Promise<void> {
    await this.log({ eventType: "server_blocked", serverName, error: reason });
  }

  async logToolCall(
    serverName: string,
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<void> {
    await this.log({ eventType: "tool_call", serverName, toolName, arguments: args });
  }

  async logToolBlocked(serverName: string, toolName: string, reason: string): Promise<void> {
    await this.log({ eventType: "tool_blocked", serverName, toolName, error: reason });
  }

  async logToolResult(serverName: string, toolName: string, result: unknown): Promise<void> {
    await this.log({ eventType: "tool_result", serverName, toolName, result });
  }

  async logToolError(serverName: string, toolName: string, error: string): Promise<void> {
    await this.log({ eventType: "tool_error", serverName, toolName, error });
  }
}

// ============================================
// Singleton Instance
// ============================================

let globalAuditLogger: AuditLogger | null = null;

/**
 * Get or create the global audit logger instance.
 */
export function getAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger();
  }
  return globalAuditLogger;
}

/**
 * Initialize the global audit logger.
 */
export async function initializeAuditLogger(options?: {
  sessionId?: string;
  userId?: string;
  config?: FullEnterpriseConfig;
}): Promise<AuditLogger> {
  globalAuditLogger = new AuditLogger({
    sessionId: options?.sessionId,
    userId: options?.userId,
  });
  await globalAuditLogger.initialize(options?.config);
  return globalAuditLogger;
}

/**
 * Shutdown the global audit logger.
 */
export async function shutdownAuditLogger(): Promise<void> {
  if (globalAuditLogger) {
    await globalAuditLogger.shutdown();
    globalAuditLogger = null;
  }
}
