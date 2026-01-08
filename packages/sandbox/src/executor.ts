/**
 * Sandbox executor.
 *
 * This implementation uses subprocess execution with conservative limits.
 * Platform-specific sandboxing can be layered on later.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { sanitizeEnvironment } from "./hardening.js";
import { detectPlatformBackend } from "./platforms/index.js";
import type {
  SandboxBackend,
  SandboxConfig,
  SandboxExecutionOptions,
  SandboxResult,
} from "./types.js";

export class SandboxExecutor {
  private readonly config: SandboxConfig;
  // TODO: Use backend for platform-specific sandboxing
  // private readonly backend: SandboxBackend;

  constructor(config: SandboxConfig, _backend?: SandboxBackend) {
    this.config = config;
    // this.backend = backend ?? detectSandboxBackend();
  }

  async execute(
    command: string,
    args: string[] = [],
    options: SandboxExecutionOptions = {}
  ): Promise<SandboxResult> {
    const startTime = Date.now();
    const cwd = options.cwd ?? this.config.workingDir;
    const maxOutputBytes = options.maxOutputBytes ?? this.config.resources.maxOutputBytes;
    const env = this.buildEnvironment(options.env);
    const abortSignal = options.abortSignal;

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;
      let killSignal: NodeJS.Signals | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let childProcess: ChildProcess | undefined;

      if (abortSignal?.aborted) {
        resolve({
          exitCode: null,
          signal: "SIGTERM",
          stdout: "",
          stderr: "Operation aborted",
          durationMs: Date.now() - startTime,
          peakMemoryBytes: 0,
          cpuTimeMs: 0,
          terminated: true,
          terminationReason: "aborted",
          modifiedFiles: [],
        });
        return;
      }

      childProcess = spawn(command, args, {
        cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const abortHandler = () => {
        if (childProcess && !childProcess.killed) {
          killed = true;
          killSignal = "SIGTERM";
          childProcess.kill("SIGTERM");
        }
      };

      if (abortSignal) {
        abortSignal.addEventListener("abort", abortHandler, { once: true });
      }

      if (options.input && childProcess.stdin) {
        childProcess.stdin.write(options.input);
        childProcess.stdin.end();
      }

      childProcess.stdout?.on("data", (data: Buffer) => {
        if (stdout.length + data.length <= maxOutputBytes) {
          stdout += data.toString();
        }
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        if (stderr.length + data.length <= maxOutputBytes) {
          stderr += data.toString();
        }
      });

      if (options.timeoutMs && options.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          if (childProcess && !childProcess.killed) {
            killed = true;
            killSignal = "SIGTERM";
            childProcess.kill("SIGTERM");
            setTimeout(() => {
              if (childProcess && !childProcess.killed) {
                killSignal = "SIGKILL";
                childProcess.kill("SIGKILL");
              }
            }, 5000);
          }
        }, options.timeoutMs);
      }

      childProcess.on("close", (exitCode, signal) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (abortSignal) {
          abortSignal.removeEventListener("abort", abortHandler);
        }

        resolve({
          exitCode,
          signal: signal ?? killSignal,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
          peakMemoryBytes: 0,
          cpuTimeMs: 0,
          terminated: killed,
          terminationReason: killed ? "timeout" : undefined,
          modifiedFiles: [],
        });
      });

      childProcess.on("error", (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (abortSignal) {
          abortSignal.removeEventListener("abort", abortHandler);
        }

        resolve({
          exitCode: null,
          signal: null,
          stdout,
          stderr: stderr || error.message,
          durationMs: Date.now() - startTime,
          peakMemoryBytes: 0,
          cpuTimeMs: 0,
          terminated: false,
          modifiedFiles: [],
        });
      });
    });
  }

  async cleanup(): Promise<void> {
    // No-op for subprocess backend.
  }

  private buildEnvironment(overrides?: Record<string, string>): Record<string, string> {
    const baseEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") {
        baseEnv[key] = value;
      }
    }

    const merged = {
      ...baseEnv,
      ...this.config.environment,
      ...(overrides ?? {}),
    };

    return sanitizeEnvironment(merged);
  }
}

export function detectSandboxBackend(): SandboxBackend {
  return detectPlatformBackend();
}
