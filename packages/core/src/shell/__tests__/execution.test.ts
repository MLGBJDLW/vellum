import { existsSync } from "node:fs";
import { platform } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectExecutionShell } from "../execution.js";

vi.mock("node:fs", () => ({ existsSync: vi.fn() }));
vi.mock("node:os", () => ({ platform: vi.fn() }));

describe("execution shell", () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
    vi.mocked(platform).mockReturnValue("win32");
    vi.stubEnv("PATH", "C:\\Tools");
    vi.stubEnv("SystemRoot", "C:\\Windows");
    vi.stubEnv("PWSH_PATH", "");
    vi.stubEnv("BASH_PATH", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uses installed PowerShell 7 instead of an inherited Git Bash login shell", () => {
    vi.stubEnv("SHELL", "/bin/bash");
    vi.mocked(existsSync).mockImplementation((path) => path === "C:\\Tools\\pwsh.exe");
    expect(detectExecutionShell()).toEqual({
      shell: "C:\\Tools\\pwsh.exe",
      shellArgs: ["-NoProfile", "-NonInteractive", "-Command"],
    });
    vi.mocked(existsSync).mockClear();
    detectExecutionShell();
    expect(existsSync).not.toHaveBeenCalled();
  });

  it("falls back to Windows PowerShell when pwsh is absent", () => {
    vi.stubEnv("PATH", "C:\\NoPowerShell7");
    expect(detectExecutionShell().shell).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
    );
  });

  it("honors explicit executor overrides without replacing them with a login shell", () => {
    vi.stubEnv("PWSH_PATH", "D:\\Custom\\pwsh.exe");
    expect(detectExecutionShell().shell).toBe("D:\\Custom\\pwsh.exe");
    vi.mocked(platform).mockReturnValue("linux");
    vi.stubEnv("BASH_PATH", "/custom/bash");
    expect(detectExecutionShell().shell).toBe("/custom/bash");
  });

  it("uses sh on minimal Unix hosts without bash", () => {
    vi.mocked(platform).mockReturnValue("linux");
    vi.stubEnv("PATH", "/usr/bin");
    expect(detectExecutionShell()).toEqual({ shell: "/bin/sh", shellArgs: ["-c"] });
  });
});
