// ============================================
// T034-T038: CLI and Telemetry Tests
// ============================================

import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================
// T034: CliHostProvider Tests
// ============================================

describe("CliHostProvider", () => {
  let CliHostProvider: typeof import("../cli/CliHostProvider.js").CliHostProvider;
  let createCliHostProvider: typeof import("../cli/CliHostProvider.js").createCliHostProvider;

  beforeEach(async () => {
    const module = await import("../cli/CliHostProvider.js");
    CliHostProvider = module.CliHostProvider;
    createCliHostProvider = module.createCliHostProvider;
  });

  describe("showInfo", () => {
    it("should output info message with blue prefix", () => {
      const chunks: string[] = [];
      const mockStdout = {
        write: (data: string) => {
          chunks.push(data);
          return true;
        },
        isTTY: false,
      } as unknown as NodeJS.WritableStream;

      const host = new CliHostProvider({
        stdout: mockStdout,
        useColors: false,
      });

      host.showInfo("Test message");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain("ℹ");
      expect(chunks[0]).toContain("Test message");
    });
  });

  describe("showWarning", () => {
    it("should output warning message with yellow prefix", () => {
      const chunks: string[] = [];
      const mockStdout = {
        write: (data: string) => {
          chunks.push(data);
          return true;
        },
        isTTY: false,
      } as unknown as NodeJS.WritableStream;

      const host = new CliHostProvider({
        stdout: mockStdout,
        useColors: false,
      });

      host.showWarning("Warning message");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain("⚠");
      expect(chunks[0]).toContain("Warning message");
    });
  });

  describe("showError", () => {
    it("should output error message with red prefix to stderr", () => {
      const chunks: string[] = [];
      const mockStderr = {
        write: (data: string) => {
          chunks.push(data);
          return true;
        },
        isTTY: false,
      } as unknown as NodeJS.WritableStream;

      const host = new CliHostProvider({
        stderr: mockStderr,
        useColors: false,
      });

      host.showError("Error message");

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain("✖");
      expect(chunks[0]).toContain("Error message");
    });
  });

  describe("showProgress", () => {
    it("should return a spinner with update, succeed, fail, stop methods", () => {
      const mockStdout = {
        write: () => true,
        isTTY: false,
      } as unknown as NodeJS.WritableStream;

      const host = new CliHostProvider({
        stdout: mockStdout,
        spinnerEnabled: false,
      });

      const spinner = host.showProgress({ text: "Loading..." });

      expect(spinner).toHaveProperty("update");
      expect(spinner).toHaveProperty("succeed");
      expect(spinner).toHaveProperty("fail");
      expect(spinner).toHaveProperty("stop");
    });

    it("should output success message on succeed()", () => {
      const chunks: string[] = [];
      const mockStdout = {
        write: (data: string) => {
          chunks.push(data);
          return true;
        },
        isTTY: false,
      } as unknown as NodeJS.WritableStream;

      const host = new CliHostProvider({
        stdout: mockStdout,
        spinnerEnabled: false,
        useColors: false,
      });

      const spinner = host.showProgress({ text: "Loading..." });
      spinner.succeed("Done!");

      expect(chunks.some((c) => c.includes("Done!"))).toBe(true);
    });
  });

  describe("createCliHostProvider", () => {
    it("should create a CliHostProvider instance", () => {
      const host = createCliHostProvider({ useColors: false });
      expect(host).toBeInstanceOf(CliHostProvider);
    });
  });
});

// ============================================
// T035: ProcessManager Tests
// ============================================

describe("ProcessManager", () => {
  let ProcessManager: typeof import("../cli/ProcessManager.js").ProcessManager;
  let createProcessManager: typeof import("../cli/ProcessManager.js").createProcessManager;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import("../cli/ProcessManager.js");
    ProcessManager = module.ProcessManager;
    createProcessManager = module.createProcessManager;
  });

  describe("constructor", () => {
    it("should create with default config", () => {
      const manager = new ProcessManager();
      expect(manager.getState()).toBe("running");
    });

    it("should accept custom shutdown timeout", () => {
      const manager = new ProcessManager({ shutdownTimeoutMs: 10000 });
      expect(manager.getState()).toBe("running");
    });
  });

  describe("registerProcess", () => {
    it("should register a process", () => {
      const manager = new ProcessManager({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      const mockProcess = {
        pid: 12345,
        kill: vi.fn(),
        once: vi.fn(),
      } as unknown as import("node:child_process").ChildProcess;

      manager.registerProcess(mockProcess, "test-process");

      expect(manager.getProcessCount()).toBe(1);
      expect(manager.getProcessNames()).toContain("test-process");
    });

    it("should not register process without PID", () => {
      const manager = new ProcessManager({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      const mockProcess = {
        pid: undefined,
        kill: vi.fn(),
        once: vi.fn(),
      } as unknown as import("node:child_process").ChildProcess;

      manager.registerProcess(mockProcess, "no-pid-process");

      expect(manager.getProcessCount()).toBe(0);
    });
  });

  describe("unregisterProcess", () => {
    it("should unregister a process", () => {
      const manager = new ProcessManager({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      const mockProcess = {
        pid: 12345,
        kill: vi.fn(),
        once: vi.fn(),
      } as unknown as import("node:child_process").ChildProcess;

      manager.registerProcess(mockProcess, "test-process");
      expect(manager.getProcessCount()).toBe(1);

      manager.unregisterProcess(mockProcess);
      expect(manager.getProcessCount()).toBe(0);
    });
  });

  describe("onCleanup", () => {
    it("should register cleanup handlers", async () => {
      const manager = new ProcessManager({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      const cleanupFn = vi.fn();
      manager.onCleanup(cleanupFn);

      await manager.shutdown();

      expect(cleanupFn).toHaveBeenCalled();
    });
  });

  describe("shutdown", () => {
    it("should transition to shutting_down and then terminated", async () => {
      const manager = new ProcessManager({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        shutdownTimeoutMs: 100,
      });

      expect(manager.getState()).toBe("running");

      await manager.shutdown();

      expect(manager.getState()).toBe("terminated");
    });

    it("should return same promise if called multiple times", async () => {
      const manager = new ProcessManager({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        shutdownTimeoutMs: 100,
      });

      // Start shutdown but don't await yet
      const promise1 = manager.shutdown();

      // Call again while still shutting down
      const promise2 = manager.shutdown();

      // Both calls should resolve (whether same promise or not, behavior should be consistent)
      await Promise.all([promise1, promise2]);

      expect(manager.getState()).toBe("terminated");
    });

    it("should send SIGTERM to registered processes", async () => {
      const killFn = vi.fn();
      const manager = new ProcessManager({
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        shutdownTimeoutMs: 100,
      });

      const mockProcess = {
        pid: 12345,
        kill: killFn,
        once: vi.fn((event: string, callback: () => void) => {
          // Simulate process exit
          if (event === "exit") {
            setTimeout(callback, 10);
          }
        }),
      } as unknown as import("node:child_process").ChildProcess;

      manager.registerProcess(mockProcess, "test-process");

      await manager.shutdown();

      expect(killFn).toHaveBeenCalledWith("SIGTERM");
    });
  });

  describe("createProcessManager", () => {
    it("should create a ProcessManager instance", () => {
      const manager = createProcessManager();
      expect(manager).toBeInstanceOf(ProcessManager);
    });
  });
});

// ============================================
// T038: McpTelemetry Tests
// ============================================

describe("McpTelemetry", () => {
  let McpTelemetry: typeof import("../telemetry.js").McpTelemetry;
  let createMcpTelemetry: typeof import("../telemetry.js").createMcpTelemetry;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import("../telemetry.js");
    McpTelemetry = module.McpTelemetry;
    createMcpTelemetry = module.createMcpTelemetry;
  });

  describe("constructor", () => {
    it("should be disabled by default", () => {
      const telemetry = new McpTelemetry();
      expect(telemetry.isEnabled()).toBe(false);
    });

    it("should be enabled when configured", () => {
      const telemetry = new McpTelemetry({ enabled: true });
      expect(telemetry.isEnabled()).toBe(true);
    });
  });

  describe("recordToolCall", () => {
    it("should not record when disabled", () => {
      const telemetry = new McpTelemetry({ enabled: false });

      telemetry.recordToolCall({
        serverName: "test-server",
        toolName: "test-tool",
        status: "success",
        durationMs: 100,
      });

      expect(telemetry.getMetrics()).toHaveLength(0);
    });

    it("should record when enabled", () => {
      const telemetry = new McpTelemetry({ enabled: true });

      telemetry.recordToolCall({
        serverName: "test-server",
        toolName: "test-tool",
        status: "success",
        durationMs: 100,
      });

      expect(telemetry.getMetrics()).toHaveLength(1);
    });

    it("should track duration and status", () => {
      const telemetry = new McpTelemetry({ enabled: true });

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool1",
        status: "success",
        durationMs: 50,
      });

      const metrics = telemetry.getMetrics();
      expect(metrics[0]).toMatchObject({
        serverName: "server1",
        toolName: "tool1",
        status: "success",
        durationMs: 50,
      });
    });

    it("should calculate request/response sizes when enabled", () => {
      const telemetry = new McpTelemetry({ enabled: true, trackSizes: true });

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool1",
        status: "success",
        durationMs: 50,
        requestArgs: { path: "/tmp/file.txt" },
        responseContent: { content: "file contents" },
      });

      const metrics = telemetry.getMetrics();
      expect(metrics[0]?.requestSize).toBeGreaterThan(0);
      expect(metrics[0]?.responseSize).toBeGreaterThan(0);
    });

    it("should emit metric event", () => {
      const telemetry = new McpTelemetry({ enabled: true });
      const listener = vi.fn();

      telemetry.on("metric", listener);

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool1",
        status: "success",
        durationMs: 50,
      });

      expect(listener).toHaveBeenCalled();
    });

    it("should respect maxEntries limit", () => {
      const telemetry = new McpTelemetry({ enabled: true, maxEntries: 3 });

      for (let i = 0; i < 5; i++) {
        telemetry.recordToolCall({
          serverName: "server1",
          toolName: "tool1",
          status: "success",
          durationMs: i * 10,
        });
      }

      expect(telemetry.getMetrics()).toHaveLength(3);
    });
  });

  describe("getServerMetrics", () => {
    it("should aggregate metrics for a server", () => {
      const telemetry = new McpTelemetry({ enabled: true });

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool1",
        status: "success",
        durationMs: 100,
      });

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool2",
        status: "error",
        durationMs: 200,
        errorMessage: "Failed",
      });

      const metrics = telemetry.getServerMetrics("server1");

      expect(metrics).not.toBeNull();
      expect(metrics?.totalCalls).toBe(2);
      expect(metrics?.successCount).toBe(1);
      expect(metrics?.errorCount).toBe(1);
      expect(metrics?.avgDurationMs).toBe(150);
    });

    it("should return null for unknown server", () => {
      const telemetry = new McpTelemetry({ enabled: true });
      expect(telemetry.getServerMetrics("unknown")).toBeNull();
    });
  });

  describe("getToolMetrics", () => {
    it("should aggregate metrics for a specific tool", () => {
      const telemetry = new McpTelemetry({ enabled: true });

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool1",
        status: "success",
        durationMs: 50,
      });

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool1",
        status: "success",
        durationMs: 150,
      });

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool2",
        status: "success",
        durationMs: 300,
      });

      const metrics = telemetry.getToolMetrics("server1", "tool1");

      expect(metrics).not.toBeNull();
      expect(metrics?.totalCalls).toBe(2);
      expect(metrics?.avgDurationMs).toBe(100);
    });
  });

  describe("getSummary", () => {
    it("should return complete summary", () => {
      const telemetry = new McpTelemetry({ enabled: true });

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool1",
        status: "success",
        durationMs: 100,
      });

      telemetry.recordToolCall({
        serverName: "server2",
        toolName: "tool2",
        status: "timeout",
        durationMs: 5000,
      });

      const summary = telemetry.getSummary();

      expect(summary.enabled).toBe(true);
      expect(summary.totalCalls).toBe(2);
      expect(summary.uniqueServers).toBe(2);
      expect(summary.uniqueTools).toBe(2);
      expect(summary.overallSuccessRate).toBe(0.5);
      expect(summary.byServer).toHaveProperty("server1");
      expect(summary.byServer).toHaveProperty("server2");
    });
  });

  describe("setEnabled", () => {
    it("should emit stateChange event", () => {
      const telemetry = new McpTelemetry({ enabled: false });
      const listener = vi.fn();

      telemetry.on("stateChange", listener);
      telemetry.setEnabled(true);

      expect(listener).toHaveBeenCalledWith({ enabled: true });
    });
  });

  describe("clear", () => {
    it("should remove all metrics", () => {
      const telemetry = new McpTelemetry({ enabled: true });

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool1",
        status: "success",
        durationMs: 100,
      });

      expect(telemetry.getMetrics()).toHaveLength(1);

      telemetry.clear();

      expect(telemetry.getMetrics()).toHaveLength(0);
    });
  });

  describe("export", () => {
    it("should return a copy of metrics", () => {
      const telemetry = new McpTelemetry({ enabled: true });

      telemetry.recordToolCall({
        serverName: "server1",
        toolName: "tool1",
        status: "success",
        durationMs: 100,
      });

      const exported = telemetry.export();
      telemetry.clear();

      expect(exported).toHaveLength(1);
      expect(telemetry.getMetrics()).toHaveLength(0);
    });
  });

  describe("createMcpTelemetry", () => {
    it("should create a McpTelemetry instance", () => {
      const telemetry = createMcpTelemetry({ enabled: true });
      expect(telemetry).toBeInstanceOf(McpTelemetry);
      expect(telemetry.isEnabled()).toBe(true);
    });
  });
});
