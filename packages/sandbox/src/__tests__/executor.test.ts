/**
 * Sandbox executor tests
 *
 * Tests for command execution with sandboxing.
 */

import { describe, expect, it } from "vitest";
import { detectSandboxBackend, SandboxExecutor } from "../executor.js";
import { configFromTrustPreset } from "../profiles/index.js";

describe("SandboxExecutor", () => {
  const workingDir = process.cwd();
  const config = configFromTrustPreset("default", workingDir);

  describe("execute", () => {
    it("executes simple command and captures stdout", async () => {
      const executor = new SandboxExecutor(config);
      const result = await executor.execute("node", ["-e", "console.log('hello')"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("hello");
      expect(result.stderr).toBe("");
      expect(result.terminated).toBe(false);
    });

    it("captures stderr", async () => {
      const executor = new SandboxExecutor(config);
      const result = await executor.execute("node", ["-e", "console.error('error message')"]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr.trim()).toBe("error message");
    });

    it("returns exit code for failing command", async () => {
      const executor = new SandboxExecutor(config);
      const result = await executor.execute("node", ["-e", "process.exit(1)"]);

      expect(result.exitCode).toBe(1);
    });

    it("executes command with arguments", async () => {
      const executor = new SandboxExecutor(config);
      // When using node -e, the script is argv[1], so additional args start at argv[2]
      // But the actual behavior depends on node version. Use -- to separate args.
      const result = await executor.execute("node", [
        "-e",
        "console.log(process.argv.slice(1).pop())",
        "--",
        "arg1",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("arg1");
    });

    it("measures duration", async () => {
      const executor = new SandboxExecutor(config);
      const result = await executor.execute("node", ["-e", "/* quick command */"]);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("handles command not found", async () => {
      const executor = new SandboxExecutor(config);
      const result = await executor.execute("nonexistent-command-12345");

      expect(result.exitCode).toBeNull();
      expect(result.stderr).toBeTruthy();
    });
  });

  describe("timeout handling", () => {
    it("terminates command on timeout", async () => {
      const executor = new SandboxExecutor(config);
      const result = await executor.execute("node", ["-e", "setTimeout(() => {}, 10000)"], {
        timeoutMs: 100,
      });

      expect(result.terminated).toBe(true);
      expect(result.terminationReason).toBe("timeout");
    }, 5000);

    it("completes before timeout if fast enough", async () => {
      const executor = new SandboxExecutor(config);
      const result = await executor.execute("node", ["-e", "console.log('quick')"], {
        timeoutMs: 5000,
      });

      expect(result.terminated).toBe(false);
      expect(result.exitCode).toBe(0);
    });
  });

  describe("abort signal", () => {
    it("aborts immediately if signal already aborted", async () => {
      const executor = new SandboxExecutor(config);
      const controller = new AbortController();
      controller.abort();

      const result = await executor.execute("node", ["-e", "console.log('should not run')"], {
        abortSignal: controller.signal,
      });

      expect(result.terminated).toBe(true);
      expect(result.terminationReason).toBe("aborted");
      expect(result.stderr).toBe("Operation aborted");
    });

    it("aborts running command when signal fires", async () => {
      const executor = new SandboxExecutor(config);
      const controller = new AbortController();

      const resultPromise = executor.execute("node", ["-e", "setTimeout(() => {}, 10000)"], {
        abortSignal: controller.signal,
      });

      // Abort after a short delay
      setTimeout(() => controller.abort(), 50);

      const result = await resultPromise;

      expect(result.terminated).toBe(true);
    }, 5000);
  });

  describe("input handling", () => {
    it("writes input to stdin", async () => {
      const executor = new SandboxExecutor(config);
      const result = await executor.execute(
        "node",
        [
          "-e",
          "let d=''; process.stdin.on('data', c => d+=c); process.stdin.on('end', () => console.log(d.trim()))",
        ],
        { input: "test input" }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("test input");
    });
  });

  describe("output limits", () => {
    it("truncates stdout at maxOutputBytes", async () => {
      const smallConfig = {
        ...config,
        resources: { ...config.resources, maxOutputBytes: 100 },
      };
      const executor = new SandboxExecutor(smallConfig);

      const result = await executor.execute("node", ["-e", "console.log('x'.repeat(1000))"]);

      expect(result.stdout.length).toBeLessThanOrEqual(100);
    });

    it("uses option maxOutputBytes over config", async () => {
      const executor = new SandboxExecutor(config);

      const result = await executor.execute("node", ["-e", "console.log('x'.repeat(1000))"], {
        maxOutputBytes: 50,
      });

      expect(result.stdout.length).toBeLessThanOrEqual(50);
    });
  });

  describe("environment handling", () => {
    it("uses config environment variables", async () => {
      const envConfig = {
        ...config,
        environment: { TEST_VAR: "config_value" },
      };
      const executor = new SandboxExecutor(envConfig);

      const result = await executor.execute("node", ["-e", "console.log(process.env.TEST_VAR)"]);

      expect(result.stdout.trim()).toBe("config_value");
    });

    it("allows option env to override config", async () => {
      const envConfig = {
        ...config,
        environment: { TEST_VAR: "config_value" },
      };
      const executor = new SandboxExecutor(envConfig);

      const result = await executor.execute("node", ["-e", "console.log(process.env.TEST_VAR)"], {
        env: { TEST_VAR: "option_value" },
      });

      expect(result.stdout.trim()).toBe("option_value");
    });

    it("sanitizes dangerous environment variables", async () => {
      const executor = new SandboxExecutor(config);

      const result = await executor.execute(
        "node",
        ["-e", "console.log(process.env.LD_PRELOAD || 'sanitized')"],
        { env: { LD_PRELOAD: "/evil.so" } }
      );

      expect(result.stdout.trim()).toBe("sanitized");
    });
  });

  describe("working directory", () => {
    it("uses config workingDir by default", async () => {
      const executor = new SandboxExecutor(config);

      const result = await executor.execute("node", ["-e", "console.log(process.cwd())"]);

      expect(result.stdout.trim()).toBe(config.workingDir);
    });

    it("uses option cwd when provided", async () => {
      const executor = new SandboxExecutor(config);
      const customCwd = process.cwd();

      const result = await executor.execute("node", ["-e", "console.log(process.cwd())"], {
        cwd: customCwd,
      });

      expect(result.stdout.trim()).toBe(customCwd);
    });
  });

  describe("cleanup", () => {
    it("cleanup is a no-op for subprocess backend", async () => {
      const executor = new SandboxExecutor(config);

      await expect(executor.cleanup()).resolves.toBeUndefined();
    });
  });
});

describe("detectSandboxBackend", () => {
  it("returns a valid backend type", () => {
    const backend = detectSandboxBackend();

    expect(["subprocess", "platform", "container"]).toContain(backend);
  });

  it("returns subprocess on unsupported platforms", () => {
    // Platform stubs return false, so subprocess is expected
    const backend = detectSandboxBackend();

    expect(backend).toBe("subprocess");
  });
});
