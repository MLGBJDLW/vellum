import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SandboxExecutor } from "../executor.js";
import { killProcessTree } from "../process-tree.js";
import { configFromTrustPreset } from "../profiles/index.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));
vi.mock("../process-tree.js", () => ({ killProcessTree: vi.fn() }));

afterEach(() => vi.resetAllMocks());

describe("sandbox output decoding", () => {
  it("reports process-tree termination failures and closes inherited output pipes", async () => {
    const child = Object.assign(new EventEmitter(), {
      pid: 12345,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => {
        queueMicrotask(() => child.emit("close", null, "SIGKILL"));
        return true;
      }),
    });
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);
    vi.mocked(killProcessTree).mockRejectedValue(new Error("termination utility unavailable"));
    const controller = new AbortController();
    const executor = new SandboxExecutor(configFromTrustPreset("default", process.cwd()));
    const pending = executor.execute("unused", [], { abortSignal: controller.signal });
    controller.abort();
    const result = await pending;
    expect(result.stderr).toContain(
      "Process-tree termination failed: termination utility unavailable"
    );
    expect(result.terminationReason).toBe("aborted");
    expect(child.stdout.destroyed).toBe(true);
    expect(child.stderr.destroyed).toBe(true);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it.each([4, 100])("keeps a UTF-8 prefix within %s bytes", async (maxOutputBytes) => {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);
    const executor = new SandboxExecutor(configFromTrustPreset("default", process.cwd()));
    const pending = executor.execute("unused", [], { maxOutputBytes });
    for (const byte of Buffer.from("中文🙂")) {
      child.stdout.emit("data", Buffer.from([byte]));
      child.stderr.emit("data", Buffer.from([byte]));
    }
    child.emit("close", 0, null);
    const result = await pending;
    expect(result.stdout).toBe(maxOutputBytes === 4 ? "中" : "中文🙂");
    expect(result.stderr).toBe(result.stdout);
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(maxOutputBytes);
  });
});
