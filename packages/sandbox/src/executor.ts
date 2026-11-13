/**
 * Sandbox executor.
 *
 * This implementation uses subprocess execution with conservative limits.
 * Platform-specific sandboxing can be layered on later.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { sanitizeEnvironment } from "./hardening.js";
import { detectPlatformBackend } from "./platforms/index.js";
import { killProcessTree } from "./process-tree.js";
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
      const stdoutDecoder = new StringDecoder("utf8");
      const stderrDecoder = new StringDecoder("utf8");
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let killed = false;
      let terminationReason: SandboxResult["terminationReason"];
      let killSignal: NodeJS.Signals | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let childProcess: ChildProcess | undefined;
      let termination: Promise<void> | undefined;

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
        detached: process.platform !== "win32",
        windowsHide: true,
      });

      const terminate = (reason: "aborted" | "timeout") => {
        if (killed || !childProcess?.pid) return;
        killed = true;
        terminationReason = reason;
        killSignal = "SIGTERM";
        termination = killProcessTree(childProcess.pid).catch((error: unknown) => {
          stderr += `\nProcess-tree termination failed: ${error instanceof Error ? error.message : String(error)}`;
          // Fall back to the owned child and close inherited pipes, so a failed
          // platform utility cannot leave cancellation waiting on descendants.
          childProcess?.kill("SIGKILL");
          childProcess?.stdout?.destroy();
          childProcess?.stderr?.destroy();
        });
      };
      const abortHandler = () => terminate("aborted");

      if (abortSignal) {
        abortSignal.addEventListener("abort", abortHandler, { once: true });
        if (abortSignal.aborted) abortHandler();
      }

      // Always close stdin, including absent/empty input. Otherwise readers hang.
      // A child may exit without consuming its input; EPIPE is not a host crash.
      childProcess.stdin?.on("error", () => {});
      childProcess.stdin?.end(options.input);

      childProcess.stdout?.on("data", (data: Buffer) => {
        const kept = Math.min(data.length, Math.max(0, maxOutputBytes - stdoutBytes));
        if (kept > 0) stdout += stdoutDecoder.write(data.subarray(0, kept));
        stdoutBytes += kept;
        stdoutTruncated ||= kept < data.length;
      });

      childProcess.stderr?.on("data", (data: Buffer) => {
        const kept = Math.min(data.length, Math.max(0, maxOutputBytes - stderrBytes));
        if (kept > 0) stderr += stderrDecoder.write(data.subarray(0, kept));
        stderrBytes += kept;
        stderrTruncated ||= kept < data.length;
      });

      if (options.timeoutMs && options.timeoutMs > 0) {
        timeoutId = setTimeout(() => terminate("timeout"), options.timeoutMs);
      }

      childProcess.on("close", (exitCode, signal) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (abortSignal) {
          abortSignal.removeEventListener("abort", abortHandler);
        }
        if (!stdoutTruncated) stdout += stdoutDecoder.end();
        if (!stderrTruncated) stderr += stderrDecoder.end();

        void Promise.resolve(termination).then(() =>
          resolve({
            exitCode: killed ? null : exitCode,
            signal: signal ?? killSignal,
            stdout,
            stderr,
            durationMs: Date.now() - startTime,
            peakMemoryBytes: 0,
            cpuTimeMs: 0,
            terminated: killed,
            terminationReason,
            modifiedFiles: [],
          })
        );
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
