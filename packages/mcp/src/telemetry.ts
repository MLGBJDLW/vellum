// ============================================
// T038: MCP Telemetry Module (Opt-in)
// ============================================

/**
 * Telemetry module for tracking MCP tool call metrics.
 * Opt-in: Only collects data when `telemetry.enabled=true` in config.
 *
 * Tracks:
 * - Tool call duration
 * - Success/failure status
 * - Request/response sizes
 * - Error rates per server/tool
 *
 * @module mcp/telemetry
 */

import { EventEmitter } from "node:events";

// ============================================
// Types
// ============================================

/**
 * Telemetry configuration.
 */
export interface McpTelemetryConfig {
  /** Whether telemetry is enabled (default: false) */
  enabled: boolean;
  /** Whether to include request/response sizes (default: true) */
  trackSizes?: boolean;
  /** Sampling rate 0-1 (default: 1.0 = 100%) */
  samplingRate?: number;
  /** Maximum number of entries to keep in memory (default: 1000) */
  maxEntries?: number;
}

/**
 * Status of a tool call.
 */
export type ToolCallStatus = "success" | "error" | "timeout";

/**
 * Individual tool call metric entry.
 */
export interface ToolCallMetric {
  /** Timestamp of the call */
  timestamp: Date;
  /** Server name */
  serverName: string;
  /** Tool name */
  toolName: string;
  /** Call duration in milliseconds */
  durationMs: number;
  /** Call status */
  status: ToolCallStatus;
  /** Request size in bytes (if tracked) */
  requestSize?: number;
  /** Response size in bytes (if tracked) */
  responseSize?: number;
  /** Error message (if status is 'error' or 'timeout') */
  errorMessage?: string;
}

/**
 * Aggregated metrics for a server/tool combination.
 */
export interface AggregatedMetrics {
  /** Server name */
  serverName: string;
  /** Tool name (or '*' for server-wide) */
  toolName: string;
  /** Total number of calls */
  totalCalls: number;
  /** Number of successful calls */
  successCount: number;
  /** Number of failed calls */
  errorCount: number;
  /** Number of timed out calls */
  timeoutCount: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Minimum duration in milliseconds */
  minDurationMs: number;
  /** Maximum duration in milliseconds */
  maxDurationMs: number;
  /** 95th percentile duration in milliseconds */
  p95DurationMs: number;
  /** Total request bytes */
  totalRequestBytes: number;
  /** Total response bytes */
  totalResponseBytes: number;
  /** Error rate (0-1) */
  errorRate: number;
}

/**
 * Telemetry summary snapshot.
 */
export interface TelemetrySummary {
  /** Whether telemetry is enabled */
  enabled: boolean;
  /** Total number of tracked calls */
  totalCalls: number;
  /** Number of unique servers */
  uniqueServers: number;
  /** Number of unique tools */
  uniqueTools: number;
  /** Overall success rate (0-1) */
  overallSuccessRate: number;
  /** Overall average duration */
  overallAvgDurationMs: number;
  /** Metrics by server */
  byServer: Record<string, AggregatedMetrics>;
  /** Metrics by server/tool */
  byServerTool: Record<string, AggregatedMetrics>;
}

/**
 * Telemetry event types.
 */
export interface McpTelemetryEvents {
  /** Emitted when a metric is recorded */
  metric: ToolCallMetric;
  /** Emitted when telemetry is enabled/disabled */
  stateChange: { enabled: boolean };
}

/**
 * Options for recording a tool call.
 */
export interface RecordToolCallOptions {
  /** Server name */
  serverName: string;
  /** Tool name */
  toolName: string;
  /** Call status */
  status: ToolCallStatus;
  /** Duration in milliseconds */
  durationMs: number;
  /** Request arguments (for size calculation) */
  requestArgs?: unknown;
  /** Response content (for size calculation) */
  responseContent?: unknown;
  /** Error message if failed */
  errorMessage?: string;
}

// ============================================
// Telemetry Event Emitter
// ============================================

/**
 * Typed event emitter for telemetry events.
 */
export interface TelemetryEventEmitter {
  on<K extends keyof McpTelemetryEvents>(
    event: K,
    listener: (data: McpTelemetryEvents[K]) => void
  ): this;
  off<K extends keyof McpTelemetryEvents>(
    event: K,
    listener: (data: McpTelemetryEvents[K]) => void
  ): this;
  emit<K extends keyof McpTelemetryEvents>(event: K, data: McpTelemetryEvents[K]): boolean;
}

// ============================================
// McpTelemetry Implementation
// ============================================

/**
 * MCP Telemetry Tracker
 *
 * Tracks tool call metrics when enabled. Data is stored in memory
 * and can be exported or aggregated.
 *
 * @example
 * ```typescript
 * import { McpTelemetry } from '@vellum/mcp';
 *
 * const telemetry = new McpTelemetry({ enabled: true });
 *
 * // Record a tool call
 * telemetry.recordToolCall({
 *   serverName: 'filesystem',
 *   toolName: 'read_file',
 *   status: 'success',
 *   durationMs: 42,
 *   requestArgs: { path: '/tmp/file.txt' },
 *   responseContent: { content: 'file contents...' },
 * });
 *
 * // Get summary
 * const summary = telemetry.getSummary();
 * console.log(`Success rate: ${summary.overallSuccessRate * 100}%`);
 *
 * // Get server-specific metrics
 * const serverMetrics = telemetry.getServerMetrics('filesystem');
 * ```
 */
export class McpTelemetry extends EventEmitter implements TelemetryEventEmitter {
  private config: Required<McpTelemetryConfig>;
  private metrics: ToolCallMetric[] = [];

  /**
   * Create a new telemetry tracker.
   *
   * @param config - Telemetry configuration
   */
  constructor(config?: Partial<McpTelemetryConfig>) {
    super();
    this.config = {
      enabled: config?.enabled ?? false,
      trackSizes: config?.trackSizes ?? true,
      samplingRate: config?.samplingRate ?? 1.0,
      maxEntries: config?.maxEntries ?? 1000,
    };
  }

  /**
   * Check if telemetry is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable telemetry.
   *
   * @param enabled - Whether to enable telemetry
   */
  setEnabled(enabled: boolean): void {
    const wasEnabled = this.config.enabled;
    this.config.enabled = enabled;

    if (wasEnabled !== enabled) {
      this.emit("stateChange", { enabled });
    }
  }

  /**
   * Update telemetry configuration.
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<McpTelemetryConfig>): void {
    if (config.enabled !== undefined) {
      this.setEnabled(config.enabled);
    }
    if (config.trackSizes !== undefined) {
      this.config.trackSizes = config.trackSizes;
    }
    if (config.samplingRate !== undefined) {
      this.config.samplingRate = Math.max(0, Math.min(1, config.samplingRate));
    }
    if (config.maxEntries !== undefined) {
      this.config.maxEntries = config.maxEntries;
    }
  }

  /**
   * Record a tool call metric.
   *
   * @param options - Tool call details
   */
  recordToolCall(options: RecordToolCallOptions): void {
    if (!this.config.enabled) {
      return;
    }

    // Apply sampling
    if (this.config.samplingRate < 1.0 && Math.random() > this.config.samplingRate) {
      return;
    }

    const metric: ToolCallMetric = {
      timestamp: new Date(),
      serverName: options.serverName,
      toolName: options.toolName,
      durationMs: options.durationMs,
      status: options.status,
      errorMessage: options.errorMessage,
    };

    // Calculate sizes if enabled
    if (this.config.trackSizes) {
      if (options.requestArgs !== undefined) {
        metric.requestSize = this.calculateSize(options.requestArgs);
      }
      if (options.responseContent !== undefined) {
        metric.responseSize = this.calculateSize(options.responseContent);
      }
    }

    // Add to metrics with size limit
    this.metrics.push(metric);
    if (this.metrics.length > this.config.maxEntries) {
      // Remove oldest entries (FIFO)
      this.metrics.splice(0, this.metrics.length - this.config.maxEntries);
    }

    // Emit event
    this.emit("metric", metric);
  }

  /**
   * Calculate the approximate size of a value in bytes.
   */
  private calculateSize(value: unknown): number {
    try {
      return Buffer.byteLength(JSON.stringify(value), "utf8");
    } catch {
      return 0;
    }
  }

  /**
   * Get all recorded metrics.
   *
   * @returns Array of metric entries
   */
  getMetrics(): readonly ToolCallMetric[] {
    return this.metrics;
  }

  /**
   * Get metrics filtered by server name.
   *
   * @param serverName - Server to filter by
   * @returns Filtered metrics
   */
  getMetricsByServer(serverName: string): ToolCallMetric[] {
    return this.metrics.filter((m) => m.serverName === serverName);
  }

  /**
   * Get metrics filtered by server and tool name.
   *
   * @param serverName - Server to filter by
   * @param toolName - Tool to filter by
   * @returns Filtered metrics
   */
  getMetricsByTool(serverName: string, toolName: string): ToolCallMetric[] {
    return this.metrics.filter((m) => m.serverName === serverName && m.toolName === toolName);
  }

  /**
   * Get aggregated metrics for a server.
   *
   * @param serverName - Server to aggregate
   * @returns Aggregated metrics
   */
  getServerMetrics(serverName: string): AggregatedMetrics | null {
    const serverMetrics = this.getMetricsByServer(serverName);
    if (serverMetrics.length === 0) {
      return null;
    }

    return this.aggregateMetrics(serverMetrics, serverName, "*");
  }

  /**
   * Get aggregated metrics for a specific tool.
   *
   * @param serverName - Server name
   * @param toolName - Tool name
   * @returns Aggregated metrics
   */
  getToolMetrics(serverName: string, toolName: string): AggregatedMetrics | null {
    const toolMetrics = this.getMetricsByTool(serverName, toolName);
    if (toolMetrics.length === 0) {
      return null;
    }

    return this.aggregateMetrics(toolMetrics, serverName, toolName);
  }

  /**
   * Aggregate a set of metrics.
   */
  private aggregateMetrics(
    metrics: ToolCallMetric[],
    serverName: string,
    toolName: string
  ): AggregatedMetrics {
    const durations = metrics.map((m) => m.durationMs).sort((a, b) => a - b);
    const successCount = metrics.filter((m) => m.status === "success").length;
    const errorCount = metrics.filter((m) => m.status === "error").length;
    const timeoutCount = metrics.filter((m) => m.status === "timeout").length;

    const totalRequestBytes = metrics.reduce((sum, m) => sum + (m.requestSize ?? 0), 0);
    const totalResponseBytes = metrics.reduce((sum, m) => sum + (m.responseSize ?? 0), 0);

    const avgDurationMs = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const p95Index = Math.floor(durations.length * 0.95);

    return {
      serverName,
      toolName,
      totalCalls: metrics.length,
      successCount,
      errorCount,
      timeoutCount,
      avgDurationMs: Math.round(avgDurationMs * 100) / 100,
      minDurationMs: durations[0] ?? 0,
      maxDurationMs: durations[durations.length - 1] ?? 0,
      p95DurationMs: durations[p95Index] ?? durations[durations.length - 1] ?? 0,
      totalRequestBytes,
      totalResponseBytes,
      errorRate: (errorCount + timeoutCount) / metrics.length,
    };
  }

  /**
   * Get a complete telemetry summary.
   *
   * @returns Telemetry summary snapshot
   */
  getSummary(): TelemetrySummary {
    const uniqueServers = new Set(this.metrics.map((m) => m.serverName));
    const uniqueTools = new Set(this.metrics.map((m) => `${m.serverName}:${m.toolName}`));

    const successCount = this.metrics.filter((m) => m.status === "success").length;
    const avgDurationMs =
      this.metrics.length > 0
        ? this.metrics.reduce((sum, m) => sum + m.durationMs, 0) / this.metrics.length
        : 0;

    // Aggregate by server
    const byServer: Record<string, AggregatedMetrics> = {};
    for (const serverName of uniqueServers) {
      const metrics = this.getServerMetrics(serverName);
      if (metrics) {
        byServer[serverName] = metrics;
      }
    }

    // Aggregate by server/tool
    const byServerTool: Record<string, AggregatedMetrics> = {};
    for (const key of uniqueTools) {
      const [serverName = "", toolName = ""] = key.split(":");
      const metrics = this.getToolMetrics(serverName, toolName);
      if (metrics) {
        byServerTool[key] = metrics;
      }
    }

    return {
      enabled: this.config.enabled,
      totalCalls: this.metrics.length,
      uniqueServers: uniqueServers.size,
      uniqueTools: uniqueTools.size,
      overallSuccessRate: this.metrics.length > 0 ? successCount / this.metrics.length : 1,
      overallAvgDurationMs: Math.round(avgDurationMs * 100) / 100,
      byServer,
      byServerTool,
    };
  }

  /**
   * Clear all recorded metrics.
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Export metrics as JSON.
   *
   * @returns JSON-serializable metrics array
   */
  export(): ToolCallMetric[] {
    return [...this.metrics];
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<Required<McpTelemetryConfig>> {
    return { ...this.config };
  }
}

/**
 * Create a telemetry tracker with default configuration.
 *
 * @param config - Optional configuration
 * @returns Configured McpTelemetry instance
 */
export function createMcpTelemetry(config?: Partial<McpTelemetryConfig>): McpTelemetry {
  return new McpTelemetry(config);
}

/**
 * Global singleton instance for convenience.
 */
let globalTelemetry: McpTelemetry | null = null;

/**
 * Get or create the global telemetry instance.
 *
 * @param config - Configuration (only used on first call)
 * @returns Global McpTelemetry instance
 */
export function getMcpTelemetry(config?: Partial<McpTelemetryConfig>): McpTelemetry {
  if (!globalTelemetry) {
    globalTelemetry = new McpTelemetry(config);
  }
  return globalTelemetry;
}

export default McpTelemetry;
