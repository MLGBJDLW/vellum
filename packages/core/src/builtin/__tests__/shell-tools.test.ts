/**
 * @module builtin/__tests__/shell-tools.test
 */

import { platform } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../../types/index.js";
import { bashTool } from "../bash.js";
import { shellTool } from "../shell.js";

// Mock os.platform
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    platform: vi.fn(() => "linux"),
  };
});

// Mock executeShell
vi.mock("../utils/index.js", async () => {
  const actual = await vi.importActual<typeof import("../utils/index.js")>("../utils/index.js");
  return {
    ...actual,
    executeShell: vi.fn().mockResolvedValue({
      stdout: "test output",
      stderr: "",
      exitCode: 0,
      killed: false,
      signal: null,
      duration: 100,
    }),
    detectShell: vi.fn(() => ({ shell: "/bin/bash", shellArgs: ["-c"] })),
  };
});

const mockContext: ToolContext = {
  workingDir: "/test/dir",
  sessionId: "test-session",
  messageId: "test-message",
  callId: "test-call",
  abortSignal: new AbortController().signal,
  checkPermission: vi.fn().mockResolvedValue(true),
};

describe("bashTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to Unix
    vi.mocked(platform).mockReturnValue("linux");
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(bashTool.definition.name).toBe("bash");
    });

    it("should have correct kind", () => {
      expect(bashTool.definition.kind).toBe("shell");
    });

    it("should have description", () => {
      expect(bashTool.definition.description).toBeTruthy();
    });
  });

  describe("execute", () => {
    it("should execute bash command on Unix", async () => {
      const result = await bashTool.execute({ command: "echo hello", timeout: 5000 }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.stdout).toBe("test output");
        expect(result.output.exitCode).toBe(0);
      }
    });

    it("should fail on Windows", async () => {
      vi.mocked(platform).mockReturnValue("win32");

      const result = await bashTool.execute({ command: "echo hello", timeout: 5000 }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("only available on Unix");
      }
    });

    it("should fail when permission denied", async () => {
      vi.mocked(mockContext.checkPermission).mockResolvedValueOnce(false);

      const result = await bashTool.execute({ command: "echo hello", timeout: 5000 }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });

    it("should fail when aborted", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await bashTool.execute(
        { command: "echo hello", timeout: 5000 },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should require confirmation for shell commands", () => {
      expect(bashTool.shouldConfirm?.({ command: "echo hello", timeout: 5000 }, mockContext)).toBe(
        true
      );
    });
  });
});

describe("shell execution scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should capture exit code correctly", async () => {
    const { executeShell } = vi.mocked(await import("../utils/index.js"));
    executeShell.mockResolvedValueOnce({
      stdout: "",
      stderr: "Error occurred",
      exitCode: 1,
      killed: false,
      signal: null,
      duration: 50,
    });

    const result = await shellTool.execute(
      { command: "failing-command", timeout: 5000 },
      mockContext
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.exitCode).toBe(1);
      expect(result.output.stderr).toBe("Error occurred");
    }
  });

  it("should capture stderr separately from stdout", async () => {
    const { executeShell } = vi.mocked(await import("../utils/index.js"));
    executeShell.mockResolvedValueOnce({
      stdout: "standard output",
      stderr: "standard error",
      exitCode: 0,
      killed: false,
      signal: null,
      duration: 50,
    });

    const result = await shellTool.execute({ command: "mixed-output", timeout: 5000 }, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.stdout).toBe("standard output");
      expect(result.output.stderr).toBe("standard error");
      expect(result.output.stdout).not.toContain("standard error");
      expect(result.output.stderr).not.toContain("standard output");
    }
  });

  it("should handle timeout killing the process", async () => {
    const { executeShell } = vi.mocked(await import("../utils/index.js"));
    executeShell.mockResolvedValueOnce({
      stdout: "partial output",
      stderr: "",
      exitCode: null,
      killed: true,
      signal: "SIGTERM",
      duration: 5000,
    });

    const result = await shellTool.execute({ command: "sleep 100", timeout: 5000 }, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.killed).toBe(true);
      expect(result.output.exitCode).toBe(null);
    }
  });

  it("should auto-detect PowerShell on Windows", async () => {
    const { detectShell } = vi.mocked(await import("../utils/index.js"));
    vi.mocked(platform).mockReturnValue("win32");
    detectShell.mockReturnValue({
      shell: "pwsh",
      shellArgs: ["-NoProfile", "-NonInteractive", "-Command"],
    });

    const result = await shellTool.execute({ command: "echo hello", timeout: 5000 }, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.shell).toBe("pwsh");
    }
  });

  it("should auto-detect bash on Unix", async () => {
    const { detectShell } = vi.mocked(await import("../utils/index.js"));
    vi.mocked(platform).mockReturnValue("linux");
    detectShell.mockReturnValue({ shell: "/bin/bash", shellArgs: ["-c"] });

    const result = await shellTool.execute({ command: "echo hello", timeout: 5000 }, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output.shell).toBe("/bin/bash");
    }
  });
});

describe("shellTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("definition", () => {
    it("should have correct name", () => {
      expect(shellTool.definition.name).toBe("shell");
    });

    it("should have correct kind", () => {
      expect(shellTool.definition.kind).toBe("shell");
    });

    it("should have description", () => {
      expect(shellTool.definition.description).toBeTruthy();
    });
  });

  describe("execute", () => {
    it("should execute shell command", async () => {
      const result = await shellTool.execute({ command: "echo hello", timeout: 5000 }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.stdout).toBe("test output");
        expect(result.output.exitCode).toBe(0);
        expect(result.output.shell).toBe("/bin/bash");
      }
    });

    it("should use custom working directory", async () => {
      const { executeShell } = await import("../utils/index.js");

      await shellTool.execute({ command: "pwd", timeout: 5000, cwd: "/custom/dir" }, mockContext);

      expect(vi.mocked(executeShell)).toHaveBeenCalledWith(
        "pwd",
        expect.objectContaining({ cwd: "/custom/dir" })
      );
    });

    it("should fail when permission denied", async () => {
      vi.mocked(mockContext.checkPermission).mockResolvedValueOnce(false);

      const result = await shellTool.execute({ command: "echo hello", timeout: 5000 }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Permission denied");
      }
    });

    it("should fail when aborted", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await shellTool.execute(
        { command: "echo hello", timeout: 5000 },
        { ...mockContext, abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("cancelled");
      }
    });
  });

  describe("shouldConfirm", () => {
    it("should require confirmation for shell commands", () => {
      expect(shellTool.shouldConfirm?.({ command: "echo hello", timeout: 5000 }, mockContext)).toBe(
        true
      );
    });
  });
});
