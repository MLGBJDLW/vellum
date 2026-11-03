import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ServerInstaller } from "../installer.js";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));

describe("language server installation output", () => {
  it("keeps package-manager output out of the terminal and retains bounded failure details", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    });
    spawn.mockReturnValue(child);
    const installer = new ServerInstaller();
    const result = installer.install("fixture", {
      command: "fixture",
      args: [],
      fileExtensions: ["fixture"],
      filePatterns: [],
      rootPatterns: [],
      enabled: true,
      transport: "stdio",
      install: { method: "npm", package: "fixture" },
    });
    const failure = expect(result).rejects.toThrow();
    child.stderr.write("x".repeat(100_000));
    child.stderr.write("\nregistry unavailable");
    child.emit("close", 1);
    await failure;
    expect(spawn.mock.calls[0]?.[2]).toMatchObject({
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  });
});
