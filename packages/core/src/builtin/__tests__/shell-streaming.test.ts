import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { unlink } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeShell } from "../utils/shell-helpers.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

describe("shell output decoding", () => {
  it("retains command output when a streaming display observer throws", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);
    const onOutput = () => {
      throw new Error("Display unavailable");
    };
    const pending = executeShell("unused", { onStdout: onOutput, onStderr: onOutput });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    expect(() => child.stdout.emit("data", Buffer.from("stdout"))).not.toThrow();
    expect(() => child.stderr.emit("data", Buffer.from("stderr"))).not.toThrow();
    child.emit("close", 0, null);
    expect(await pending).toMatchObject({ exitCode: 0, stdout: "stdout", stderr: "stderr" });
  });

  it.each([undefined, 4])("preserves UTF-8 across chunks with byte limit %s", async (maxBuffer) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);
    const onStdout = vi.fn();
    const onStderr = vi.fn();
    const pending = executeShell("unused", { maxBuffer, onStdout, onStderr });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    const bytes = Buffer.from("中文🙂");
    for (const byte of bytes) {
      child.stdout.emit("data", Buffer.from([byte]));
      child.stderr.emit("data", Buffer.from([byte]));
    }
    child.emit("close", 0, null);
    const result = await pending;
    try {
      expect(onStdout.mock.calls.map(([text]) => text).join("")).toBe("中文🙂");
      expect(onStderr.mock.calls.map(([text]) => text).join("")).toBe("中文🙂");
      expect(result.stdout.split("\n[WARNING:")[0]).toBe(maxBuffer ? "中" : "中文🙂");
      expect(result.stderr).toBe(maxBuffer ? "中" : "中文🙂");
      expect(result.truncated).toBe(maxBuffer !== undefined);
    } finally {
      if (result.savedOutputPath) await unlink(result.savedOutputPath);
    }
  });
});
