import { EventEmitter } from "node:events";

import type { ExecutionResult } from "@vellum/core";
import { describe, expect, it } from "vitest";

import { attachToolLifecycleMetrics, createMetricsManager } from "../metrics-integration.js";

class MockToolLifecycleSource extends EventEmitter {
  emitToolStart(callId: string, toolName: string, input: Record<string, unknown> = {}): void {
    this.emit("toolStart", callId, toolName, input);
  }

  emitToolEnd(callId: string, toolName: string, result: ExecutionResult): void {
    this.emit("toolEnd", callId, toolName, result);
  }
}

function createExecutionResult(
  callId: string,
  toolName: string,
  success: boolean,
  durationMs: number
): ExecutionResult {
  return {
    callId,
    toolName,
    result: success
      ? { success: true, output: `${toolName}-ok` }
      : { success: false, error: `${toolName}-boom` },
    timing: {
      startedAt: 1_000,
      completedAt: 1_000 + durationMs,
      durationMs,
    },
  };
}

describe("tool lifecycle metrics integration", () => {
  it("aggregates per-tool totals, failures, and durations from lifecycle events", () => {
    const manager = createMetricsManager();
    const source = new MockToolLifecycleSource();
    const detach = attachToolLifecycleMetrics(source, manager);

    source.emitToolStart("call-1", "read_file", { path: "/a.txt" });
    source.emitToolEnd(
      "call-1",
      "read_file",
      createExecutionResult("call-1", "read_file", true, 120)
    );

    source.emitToolStart("call-2", "bash", { command: "pwd" });
    source.emitToolEnd("call-2", "bash", createExecutionResult("call-2", "bash", false, 300));

    source.emitToolStart("call-3", "read_file", { path: "/b.txt" });
    source.emitToolEnd(
      "call-3",
      "read_file",
      createExecutionResult("call-3", "read_file", true, 80)
    );

    const snapshot = manager.getSnapshot();

    expect(snapshot.tools.totalCalls).toBe(3);
    expect(snapshot.tools.successfulCalls).toBe(2);
    expect(snapshot.tools.failedCalls).toBe(1);
    expect(snapshot.tools.averageDurationMs).toBeCloseTo((120 + 300 + 80) / 3, 0);

    const readFileStats = snapshot.tools.byTool.read_file;
    const bashStats = snapshot.tools.byTool.bash;

    expect(readFileStats).toBeDefined();
    expect(bashStats).toBeDefined();

    if (!readFileStats || !bashStats) {
      throw new Error("Expected tool stats to be present in snapshot.");
    }

    expect(readFileStats.calls).toBe(2);
    expect(readFileStats.successfulCalls).toBe(2);
    expect(readFileStats.failedCalls).toBe(0);
    expect(readFileStats.totalDurationMs).toBe(200);
    expect(readFileStats.averageDurationMs).toBe(100);
    expect(bashStats.calls).toBe(1);
    expect(bashStats.failedCalls).toBe(1);

    detach();
  });

  it("stops recording after detaching from the lifecycle source", () => {
    const manager = createMetricsManager();
    const source = new MockToolLifecycleSource();
    const detach = attachToolLifecycleMetrics(source, manager);

    source.emitToolStart("call-1", "read_file", { path: "/test.txt" });
    source.emitToolEnd(
      "call-1",
      "read_file",
      createExecutionResult("call-1", "read_file", true, 42)
    );
    detach();

    source.emitToolStart("call-2", "bash", { command: "ls" });
    source.emitToolEnd("call-2", "bash", createExecutionResult("call-2", "bash", true, 15));

    const snapshot = manager.getSnapshot();
    expect(snapshot.tools.totalCalls).toBe(1);
    expect(Object.keys(snapshot.tools.byTool)).toEqual(["read_file"]);
  });

  it("reset clears aggregated tool and command counters", () => {
    const manager = createMetricsManager();

    manager.recordToolUsage({
      toolName: "read_file",
      durationMs: 25,
      success: true,
    });
    manager.recordCommand("metrics");
    manager.reset();

    const snapshot = manager.getSnapshot();
    expect(snapshot.tools.totalCalls).toBe(0);
    expect(snapshot.tools.successfulCalls).toBe(0);
    expect(snapshot.tools.failedCalls).toBe(0);
    expect(Object.keys(snapshot.tools.byTool)).toHaveLength(0);
    expect(snapshot.session.commandsExecuted).toBe(0);
  });

  it("renders a per-tool breakdown in the formatted metrics output", () => {
    const manager = createMetricsManager();

    manager.recordToolUsage({
      toolName: "read_file",
      durationMs: 42,
      success: true,
    });

    const formatted = manager.formatSnapshot(manager.getSnapshot());
    expect(formatted).toContain("Per tool");
    expect(formatted).toContain("read_file");
    expect(formatted).toContain("1 ok / 0 failed");
  });
});
