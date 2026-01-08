/**
 * Metrics Integration
 *
 * Wires the @vellum/core metrics collection to the TUI application,
 * providing observability for tool usage, API calls, and performance.
 *
 * @module cli/tui/metrics-integration
 */

import {
  activeConnections,
  type Counter,
  completionTokensTotal,
  type Gauge,
  type Histogram,
  llmRequestDuration,
  llmRequestErrors,
  // Pre-defined metrics
  llmRequestsTotal,
  MetricsCollector,
  memoryUsageBytes,
  promptTokensTotal,
} from "@vellum/core";

// =============================================================================
// Types
// =============================================================================

export interface MetricsSnapshot {
  /** Tool usage statistics */
  tools: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageDurationMs: number;
    byTool: Record<string, { calls: number; avgDuration: number }>;
  };
  /** LLM request statistics */
  llm: {
    totalRequests: number;
    errors: number;
    averageDurationMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Session statistics */
  session: {
    messagesProcessed: number;
    commandsExecuted: number;
    sessionDurationMs: number;
  };
  /** System statistics */
  system: {
    memoryUsageBytes: number;
    activeConnections: number;
  };
}

export interface ToolUsageMetrics {
  /** Tool name */
  toolName: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Optional error message if failed */
  error?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Metrics Manager
// =============================================================================

/**
 * Metrics manager for TUI application observability
 */
export class TuiMetricsManager {
  private readonly collector: MetricsCollector;
  private readonly sessionStartTime: number;

  // Tool metrics
  private readonly toolCallsTotal: Counter;
  private readonly toolCallsSuccess: Counter;
  private readonly toolCallsError: Counter;
  private readonly toolDuration: Histogram;

  // Session metrics
  private readonly messagesProcessed: Counter;
  private readonly commandsExecuted: Counter;

  constructor() {
    this.collector = MetricsCollector.getInstance();
    this.sessionStartTime = Date.now();

    // Initialize tool metrics
    this.toolCallsTotal = this.collector.createCounter({
      name: "vellum_tool_calls_total",
      description: "Total number of tool calls",
      labels: ["tool_name"],
    });

    this.toolCallsSuccess = this.collector.createCounter({
      name: "vellum_tool_calls_success",
      description: "Successful tool calls",
      labels: ["tool_name"],
    });

    this.toolCallsError = this.collector.createCounter({
      name: "vellum_tool_calls_error",
      description: "Failed tool calls",
      labels: ["tool_name"],
    });

    this.toolDuration = this.collector.createHistogram({
      name: "vellum_tool_duration_ms",
      description: "Tool execution duration in milliseconds",
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    });

    // Initialize session metrics
    this.messagesProcessed = this.collector.createCounter({
      name: "vellum_messages_processed_total",
      description: "Total messages processed",
    });

    this.commandsExecuted = this.collector.createCounter({
      name: "vellum_commands_executed_total",
      description: "Total commands executed",
      labels: ["command_name"],
    });
  }

  // ===========================================================================
  // Tool Metrics
  // ===========================================================================

  /**
   * Record tool usage metrics
   *
   * @param metrics - Tool usage metrics
   *
   * @example
   * ```typescript
   * metricsManager.recordToolUsage({
   *   toolName: "bash",
   *   durationMs: 1234,
   *   success: true,
   * });
   * ```
   */
  recordToolUsage(metrics: ToolUsageMetrics): void {
    const { toolName, durationMs, success, error } = metrics;
    const labels = { tool_name: toolName };

    this.toolCallsTotal.inc(labels);
    this.toolDuration.observe(durationMs, labels);

    if (success) {
      this.toolCallsSuccess.inc(labels);
    } else {
      this.toolCallsError.inc(labels);
      if (error) {
        // Could log error details here
      }
    }
  }

  /**
   * Get tool usage statistics
   */
  getToolStats(): Record<string, { calls: number; avgDuration: number }> {
    // This would aggregate from the histogram
    // For now, return empty object (real impl would track per-tool)
    return {};
  }

  // ===========================================================================
  // LLM Metrics
  // ===========================================================================

  /**
   * Record LLM request metrics
   *
   * @param provider - Provider name
   * @param model - Model name
   * @param durationMs - Request duration
   * @param promptTokens - Prompt token count
   * @param completionTokens - Completion token count
   * @param success - Whether request succeeded
   */
  recordLlmRequest(
    provider: string,
    model: string,
    durationMs: number,
    promptTokens: number,
    completionTokens: number,
    success: boolean
  ): void {
    const labels = { provider, model };

    llmRequestsTotal.inc(labels);
    llmRequestDuration.observe(durationMs, labels);

    if (!success) {
      llmRequestErrors.inc(labels);
    }

    promptTokensTotal.inc(labels, promptTokens);
    completionTokensTotal.inc(labels, completionTokens);
  }

  // ===========================================================================
  // Session Metrics
  // ===========================================================================

  /**
   * Record a message processed
   */
  recordMessage(): void {
    this.messagesProcessed.inc();
  }

  /**
   * Record a command execution
   *
   * @param commandName - Name of the command executed
   */
  recordCommand(commandName: string): void {
    this.commandsExecuted.inc({ command_name: commandName });
  }

  // ===========================================================================
  // System Metrics
  // ===========================================================================

  /**
   * Update active connections count
   *
   * @param count - Number of active connections
   */
  updateActiveConnections(count: number): void {
    activeConnections.set(count);
  }

  /**
   * Update memory usage
   */
  updateMemoryUsage(): void {
    const usage = process.memoryUsage();
    memoryUsageBytes.set(usage.heapUsed);
  }

  // ===========================================================================
  // Snapshots
  // ===========================================================================

  /**
   * Get a snapshot of all metrics
   *
   * @returns Current metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    this.updateMemoryUsage();

    return {
      tools: {
        totalCalls: this.toolCallsTotal.get(),
        successfulCalls: this.toolCallsSuccess.get(),
        failedCalls: this.toolCallsError.get(),
        averageDurationMs: this.toolDuration.getStats().avg,
        byTool: this.getToolStats(),
      },
      llm: {
        totalRequests: llmRequestsTotal.get(),
        errors: llmRequestErrors.get(),
        averageDurationMs: llmRequestDuration.getStats().avg,
        promptTokens: promptTokensTotal.get(),
        completionTokens: completionTokensTotal.get(),
        totalTokens: promptTokensTotal.get() + completionTokensTotal.get(),
      },
      session: {
        messagesProcessed: this.messagesProcessed.get(),
        commandsExecuted: this.commandsExecuted.get(),
        sessionDurationMs: Date.now() - this.sessionStartTime,
      },
      system: {
        memoryUsageBytes: memoryUsageBytes.get(),
        activeConnections: activeConnections.get(),
      },
    };
  }

  /**
   * Format metrics snapshot for display
   *
   * @param snapshot - Metrics snapshot
   * @returns Formatted string for display
   */
  formatSnapshot(snapshot: MetricsSnapshot): string {
    const lines: string[] = [
      "Metrics Summary",
      "=".repeat(40),
      "",
      "Tools:",
      `   Total calls: ${snapshot.tools.totalCalls}`,
      `   Success rate: ${snapshot.tools.totalCalls > 0 ? ((snapshot.tools.successfulCalls / snapshot.tools.totalCalls) * 100).toFixed(1) : 0}%`,
      `   Avg duration: ${snapshot.tools.averageDurationMs.toFixed(0)}ms`,
      "",
      "LLM Requests:",
      `   Total: ${snapshot.llm.totalRequests}`,
      `   Errors: ${snapshot.llm.errors}`,
      `   Avg duration: ${snapshot.llm.averageDurationMs.toFixed(0)}ms`,
      `   Tokens: ${snapshot.llm.promptTokens} in / ${snapshot.llm.completionTokens} out`,
      "",
      "Session:",
      `   Messages: ${snapshot.session.messagesProcessed}`,
      `   Commands: ${snapshot.session.commandsExecuted}`,
      `   Duration: ${(snapshot.session.sessionDurationMs / 1000).toFixed(0)}s`,
      "",
      "System:",
      `   Memory: ${(snapshot.system.memoryUsageBytes / 1024 / 1024).toFixed(1)}MB`,
      `   Connections: ${snapshot.system.activeConnections}`,
    ];

    return lines.join("\n");
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    MetricsCollector.resetInstance();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let metricsManager: TuiMetricsManager | null = null;

/**
 * Get the global metrics manager instance
 */
export function getMetricsManager(): TuiMetricsManager {
  if (!metricsManager) {
    metricsManager = new TuiMetricsManager();
  }
  return metricsManager;
}

/**
 * Create a new metrics manager instance (for testing)
 */
export function createMetricsManager(): TuiMetricsManager {
  return new TuiMetricsManager();
}

// =============================================================================
// Exports
// =============================================================================

export { MetricsCollector, type Counter, type Histogram, type Gauge };
