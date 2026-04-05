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
  type ExecutionResult,
  type Gauge,
  type Histogram,
  llmRequestDuration,
  llmRequestErrors,
  llmRequestsTotal,
  MetricsCollector,
  memoryUsageBytes,
  promptTokensTotal,
} from "@vellum/core";

export interface ToolAggregateStats {
  calls: number;
  successfulCalls: number;
  failedCalls: number;
  totalDurationMs: number;
  averageDurationMs: number;
}

export interface MetricsSnapshot {
  tools: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    averageDurationMs: number;
    byTool: Record<string, ToolAggregateStats>;
  };
  llm: {
    totalRequests: number;
    errors: number;
    averageDurationMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  session: {
    messagesProcessed: number;
    commandsExecuted: number;
    sessionDurationMs: number;
  };
  system: {
    memoryUsageBytes: number;
    activeConnections: number;
  };
}

export interface ToolUsageMetrics {
  toolName: string;
  durationMs: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolLifecycleSource {
  on(
    event: "toolStart",
    handler: (callId: string, toolName: string, input: Record<string, unknown>) => void
  ): void;
  on(
    event: "toolEnd",
    handler: (callId: string, toolName: string, result: ExecutionResult) => void
  ): void;
  off(
    event: "toolStart",
    handler: (callId: string, toolName: string, input: Record<string, unknown>) => void
  ): void;
  off(
    event: "toolEnd",
    handler: (callId: string, toolName: string, result: ExecutionResult) => void
  ): void;
}

interface ActiveToolCall {
  toolName: string;
  startedAt: number;
}

export class TuiMetricsManager {
  private readonly collector: MetricsCollector;
  private sessionStartTime: number;
  private readonly toolCallsTotal: Counter;
  private readonly toolCallsSuccess: Counter;
  private readonly toolCallsError: Counter;
  private readonly toolDuration: Histogram;
  private readonly messagesProcessed: Counter;
  private readonly commandsExecuted: Counter;
  private readonly activeToolCalls = new Map<string, ActiveToolCall>();
  private readonly toolAggregates = new Map<string, ToolAggregateStats>();
  private readonly llmLabels = new Map<string, { provider: string; model: string }>();
  private readonly commandNames = new Set<string>();
  private toolCallsTotalCount = 0;
  private toolCallsSuccessCount = 0;
  private toolCallsErrorCount = 0;
  private toolDurationTotalMs = 0;
  private llmRequestsCount = 0;
  private llmErrorsCount = 0;
  private llmDurationTotalMs = 0;
  private llmPromptTokensCount = 0;
  private llmCompletionTokensCount = 0;
  private messagesProcessedCount = 0;
  private commandsExecutedCount = 0;

  constructor() {
    this.collector = MetricsCollector.getInstance();
    this.sessionStartTime = Date.now();

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

  recordToolStart(callId: string, toolName: string, startedAt = Date.now()): void {
    this.activeToolCalls.set(callId, { toolName, startedAt });
  }

  recordToolEnd(
    callId: string,
    toolName: string,
    outcome: { success: boolean; durationMs?: number; error?: string }
  ): void {
    const activeCall = this.activeToolCalls.get(callId);
    const resolvedToolName = activeCall?.toolName ?? toolName;
    const durationMs =
      outcome.durationMs && outcome.durationMs > 0
        ? outcome.durationMs
        : activeCall
          ? Date.now() - activeCall.startedAt
          : 0;

    this.activeToolCalls.delete(callId);
    this.recordToolUsage({
      toolName: resolvedToolName,
      durationMs,
      success: outcome.success,
      error: outcome.error,
    });
  }

  recordToolUsage(metrics: ToolUsageMetrics): void {
    const { durationMs, success, toolName } = metrics;
    const normalizedDuration = Math.max(0, durationMs);
    const labels = { tool_name: toolName };

    this.toolCallsTotalCount += 1;
    this.toolDurationTotalMs += normalizedDuration;

    this.toolCallsTotal.inc();
    this.toolCallsTotal.inc(labels);
    this.toolDuration.observe(normalizedDuration);
    this.toolDuration.observe(normalizedDuration, labels);

    if (success) {
      this.toolCallsSuccessCount += 1;
      this.toolCallsSuccess.inc();
      this.toolCallsSuccess.inc(labels);
    } else {
      this.toolCallsErrorCount += 1;
      this.toolCallsError.inc();
      this.toolCallsError.inc(labels);
    }

    const existing = this.toolAggregates.get(toolName) ?? {
      calls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalDurationMs: 0,
      averageDurationMs: 0,
    };

    const nextCalls = existing.calls + 1;
    const nextSuccessfulCalls = existing.successfulCalls + (success ? 1 : 0);
    const nextFailedCalls = existing.failedCalls + (success ? 0 : 1);
    const nextTotalDurationMs = existing.totalDurationMs + normalizedDuration;

    this.toolAggregates.set(toolName, {
      calls: nextCalls,
      successfulCalls: nextSuccessfulCalls,
      failedCalls: nextFailedCalls,
      totalDurationMs: nextTotalDurationMs,
      averageDurationMs: nextTotalDurationMs / nextCalls,
    });
  }

  getToolStats(): Record<string, ToolAggregateStats> {
    return Object.fromEntries(
      [...this.toolAggregates.entries()]
        .sort((left, right) => {
          const callDelta = right[1].calls - left[1].calls;
          return callDelta !== 0 ? callDelta : left[0].localeCompare(right[0]);
        })
        .map(([toolName, stats]) => [toolName, { ...stats }])
    );
  }

  recordLlmRequest(
    provider: string,
    model: string,
    durationMs: number,
    promptTokens: number,
    completionTokens: number,
    success: boolean
  ): void {
    const labels = { provider, model };
    this.llmLabels.set(`${provider}::${model}`, labels);
    this.llmRequestsCount += 1;
    this.llmDurationTotalMs += durationMs;
    this.llmPromptTokensCount += promptTokens;
    this.llmCompletionTokensCount += completionTokens;

    llmRequestsTotal.inc();
    llmRequestsTotal.inc(labels);
    llmRequestDuration.observe(durationMs);
    llmRequestDuration.observe(durationMs, labels);

    if (!success) {
      this.llmErrorsCount += 1;
      llmRequestErrors.inc();
      llmRequestErrors.inc(labels);
    }

    promptTokensTotal.inc({}, promptTokens);
    promptTokensTotal.inc(labels, promptTokens);
    completionTokensTotal.inc({}, completionTokens);
    completionTokensTotal.inc(labels, completionTokens);
  }

  recordMessage(): void {
    this.messagesProcessedCount += 1;
    this.messagesProcessed.inc();
  }

  recordCommand(commandName: string): void {
    this.commandNames.add(commandName);
    this.commandsExecutedCount += 1;
    this.commandsExecuted.inc();
    this.commandsExecuted.inc({ command_name: commandName });
  }

  updateActiveConnections(count: number): void {
    activeConnections.set(count);
  }

  updateMemoryUsage(): void {
    const usage = process.memoryUsage();
    memoryUsageBytes.set(usage.heapUsed);
  }

  getSnapshot(): MetricsSnapshot {
    this.updateMemoryUsage();

    return {
      tools: {
        totalCalls: this.toolCallsTotalCount,
        successfulCalls: this.toolCallsSuccessCount,
        failedCalls: this.toolCallsErrorCount,
        averageDurationMs:
          this.toolCallsTotalCount > 0 ? this.toolDurationTotalMs / this.toolCallsTotalCount : 0,
        byTool: this.getToolStats(),
      },
      llm: {
        totalRequests: this.llmRequestsCount,
        errors: this.llmErrorsCount,
        averageDurationMs:
          this.llmRequestsCount > 0 ? this.llmDurationTotalMs / this.llmRequestsCount : 0,
        promptTokens: this.llmPromptTokensCount,
        completionTokens: this.llmCompletionTokensCount,
        totalTokens: this.llmPromptTokensCount + this.llmCompletionTokensCount,
      },
      session: {
        messagesProcessed: this.messagesProcessedCount,
        commandsExecuted: this.commandsExecutedCount,
        sessionDurationMs: Date.now() - this.sessionStartTime,
      },
      system: {
        memoryUsageBytes: memoryUsageBytes.get(),
        activeConnections: activeConnections.get(),
      },
    };
  }

  formatSnapshot(snapshot: MetricsSnapshot): string {
    const lines: string[] = [
      "Metrics Summary",
      "=".repeat(40),
      "",
      "Tools:",
      `   Total calls: ${snapshot.tools.totalCalls}`,
      `   Success rate: ${snapshot.tools.totalCalls > 0 ? ((snapshot.tools.successfulCalls / snapshot.tools.totalCalls) * 100).toFixed(1) : 0}%`,
      `   Avg duration: ${snapshot.tools.averageDurationMs.toFixed(0)}ms`,
    ];

    const perToolEntries = Object.entries(snapshot.tools.byTool);
    if (perToolEntries.length > 0) {
      lines.push("", "   Per tool:");
      for (const [toolName, stats] of perToolEntries) {
        lines.push(
          `   - ${toolName}: ${stats.calls} calls, ${stats.successfulCalls} ok / ${stats.failedCalls} failed, avg ${stats.averageDurationMs.toFixed(0)}ms`
        );
      }
    }

    lines.push(
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
      `   Connections: ${snapshot.system.activeConnections}`
    );

    return lines.join("\n");
  }

  reset(): void {
    this.toolCallsTotal.reset();
    this.toolCallsSuccess.reset();
    this.toolCallsError.reset();
    this.toolDuration.reset();

    for (const toolName of this.toolAggregates.keys()) {
      const labels = { tool_name: toolName };
      this.toolCallsTotal.reset(labels);
      this.toolCallsSuccess.reset(labels);
      this.toolCallsError.reset(labels);
      this.toolDuration.reset(labels);
    }

    llmRequestsTotal.reset();
    llmRequestErrors.reset();
    llmRequestDuration.reset();
    promptTokensTotal.reset();
    completionTokensTotal.reset();

    for (const labels of this.llmLabels.values()) {
      llmRequestsTotal.reset(labels);
      llmRequestErrors.reset(labels);
      llmRequestDuration.reset(labels);
      promptTokensTotal.reset(labels);
      completionTokensTotal.reset(labels);
    }

    this.messagesProcessed.reset();
    this.commandsExecuted.reset();
    for (const commandName of this.commandNames) {
      this.commandsExecuted.reset({ command_name: commandName });
    }

    this.activeToolCalls.clear();
    this.toolAggregates.clear();
    this.llmLabels.clear();
    this.commandNames.clear();
    this.toolCallsTotalCount = 0;
    this.toolCallsSuccessCount = 0;
    this.toolCallsErrorCount = 0;
    this.toolDurationTotalMs = 0;
    this.llmRequestsCount = 0;
    this.llmErrorsCount = 0;
    this.llmDurationTotalMs = 0;
    this.llmPromptTokensCount = 0;
    this.llmCompletionTokensCount = 0;
    this.messagesProcessedCount = 0;
    this.commandsExecutedCount = 0;
    this.sessionStartTime = Date.now();

    activeConnections.set(0);
    memoryUsageBytes.set(0);
  }
}

let metricsManager: TuiMetricsManager | null = null;

export function getMetricsManager(): TuiMetricsManager {
  if (!metricsManager) {
    metricsManager = new TuiMetricsManager();
  }

  return metricsManager;
}

export function createMetricsManager(): TuiMetricsManager {
  return new TuiMetricsManager();
}

export function attachToolLifecycleMetrics(
  source: ToolLifecycleSource,
  manager: TuiMetricsManager = getMetricsManager()
): () => void {
  const handleToolStart = (callId: string, toolName: string, _input: Record<string, unknown>) => {
    manager.recordToolStart(callId, toolName);
  };

  const handleToolEnd = (callId: string, toolName: string, result: ExecutionResult) => {
    manager.recordToolEnd(callId, toolName, {
      success: result.result.success,
      durationMs: result.timing.durationMs,
      error: result.result.success ? undefined : String(result.result.error ?? "Unknown error"),
    });
  };

  source.on("toolStart", handleToolStart);
  source.on("toolEnd", handleToolEnd);

  return () => {
    source.off("toolStart", handleToolStart);
    source.off("toolEnd", handleToolEnd);
  };
}

export { MetricsCollector, type Counter, type Gauge, type Histogram };
