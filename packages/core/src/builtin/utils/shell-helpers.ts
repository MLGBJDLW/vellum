/**
 * Shell Execution Helpers
 *
 * Provides cross-platform shell command execution with
 * timeout support, abort signals, and structured results.
 *
 * @module builtin/utils/shell-helpers
 */

import { type ChildProcess, spawn } from "node:child_process";
import { platform } from "node:os";
import {
  configFromTrustPreset,
  detectSandboxBackend,
  mergeSandboxConfig,
  type SandboxBackend,
  type SandboxConfig,
  SandboxExecutor,
} from "@vellum/sandbox";
import type { ToolContext } from "../../types/tool.js";

/**
 * Options for shell command execution.
 */
export interface ShellOptions {
  /** Working directory for the command */
  cwd?: string;

  /** Timeout in milliseconds (undefined = no timeout) */
  timeout?: number;

  /** AbortSignal for cancellation support */
  abortSignal?: AbortSignal;

  /** Environment variables to set */
  env?: Record<string, string>;

  /** Maximum buffer size for stdout/stderr in bytes (default: 10MB) */
  maxBuffer?: number;

  /** Shell to use (auto-detected if not specified) */
  shell?: string;

  /** Optional sandbox execution options */
  sandbox?: {
    enabled?: boolean;
    config?: SandboxConfig;
    backend?: SandboxBackend;
  };

  /** Callback for streaming stdout chunks (optional) */
  onStdout?: (chunk: string) => void;

  /** Callback for streaming stderr chunks (optional) */
  onStderr?: (chunk: string) => void;
}

/**
 * Result of a shell command execution.
 */
export interface ShellResult {
  /** Standard output from the command */
  stdout: string;

  /** Standard error from the command */
  stderr: string;

  /** Exit code of the process (null if killed by signal) */
  exitCode: number | null;

  /** Whether the process was killed (by timeout or abort) */
  killed: boolean;

  /** Signal that killed the process, if any */
  signal: NodeJS.Signals | null;

  /** Execution duration in milliseconds */
  duration: number;
}

/** Default maximum buffer size: 10MB */
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Detects the appropriate shell for the current platform.
 *
 * @returns The shell command and arguments for the current OS
 */
export function detectShell(): { shell: string; shellArgs: string[] } {
  const isWindows = platform() === "win32";

  if (isWindows) {
    // Check for PowerShell Core first (pwsh), then Windows PowerShell
    const pwshPath = process.env.PWSH_PATH ?? "pwsh";
    return {
      shell: pwshPath,
      shellArgs: ["-NoProfile", "-NonInteractive", "-Command"],
    };
  }

  // Unix-like systems: prefer bash, fall back to sh
  const bashPath = process.env.BASH_PATH ?? "/bin/bash";
  return {
    shell: bashPath,
    shellArgs: ["-c"],
  };
}

/**
 * Executes a shell command with timeout and abort support.
 *
 * Features:
 * - Cross-platform (PowerShell on Windows, bash on Unix)
 * - Timeout support (kills process after N ms)
 * - AbortSignal for external cancellation
 * - Captures stdout, stderr, and exit code
 * - Returns structured result object
 *
 * @param command - The shell command to execute
 * @param options - Execution options
 * @returns Promise resolving to the execution result
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await executeShell('echo "Hello"');
 * console.log(result.stdout); // "Hello\n"
 *
 * // With timeout
 * const result = await executeShell('sleep 10', { timeout: 1000 });
 * if (result.killed) {
 *   console.log('Command timed out');
 * }
 *
 * // With abort signal
 * const controller = new AbortController();
 * const promise = executeShell('long-running-command', {
 *   abortSignal: controller.signal
 * });
 * // Later: controller.abort();
 * ```
 */
export async function executeShell(
  command: string,
  options: ShellOptions = {}
): Promise<ShellResult> {
  const {
    cwd = process.cwd(),
    timeout,
    abortSignal,
    env,
    maxBuffer = DEFAULT_MAX_BUFFER,
    shell: customShell,
    sandbox,
    onStdout,
    onStderr,
  } = options;

  const startTime = Date.now();
  const { shell, shellArgs } = customShell
    ? { shell: customShell, shellArgs: ["-c"] }
    : detectShell();

  if (sandbox?.enabled && sandbox.config) {
    const executor = new SandboxExecutor(
      {
        ...sandbox.config,
        workingDir: cwd,
        resources: {
          ...sandbox.config.resources,
          maxOutputBytes: maxBuffer,
        },
        environment: {
          ...sandbox.config.environment,
          ...(env ?? {}),
        },
      },
      sandbox.backend ?? detectSandboxBackend()
    );

    try {
      const result = await executor.execute(shell, [...shellArgs, command], {
        timeoutMs: timeout,
        abortSignal,
        maxOutputBytes: maxBuffer,
        cwd,
        env: env ?? {},
      });

      await executor.cleanup();

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        killed: result.terminated,
        signal: result.signal as NodeJS.Signals | null,
        duration: result.durationMs,
      };
    } catch (error) {
      await executor.cleanup();
      const message = error instanceof Error ? error.message : String(error);
      return {
        stdout: "",
        stderr: message,
        exitCode: null,
        killed: false,
        signal: null,
        duration: Date.now() - startTime,
      };
    }
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let killed = false;
    let killSignal: NodeJS.Signals | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let childProcess: ChildProcess | undefined;

    // Handle abort signal
    const abortHandler = () => {
      if (childProcess && !childProcess.killed) {
        killed = true;
        killSignal = "SIGTERM";
        childProcess.kill("SIGTERM");
      }
    };

    // Set up abort listener
    if (abortSignal) {
      if (abortSignal.aborted) {
        // Already aborted before we started
        resolve({
          stdout: "",
          stderr: "Operation aborted",
          exitCode: null,
          killed: true,
          signal: "SIGTERM",
          duration: Date.now() - startTime,
        });
        return;
      }
      abortSignal.addEventListener("abort", abortHandler, { once: true });
    }

    // Spawn the process
    childProcess = spawn(shell, [...shellArgs, command], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Collect stdout and stream to callback
    childProcess.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length + data.length <= maxBuffer) {
        stdout += chunk;
      }
      // Stream chunk to callback if provided
      if (onStdout) {
        onStdout(chunk);
      }
    });

    // Collect stderr and stream to callback
    childProcess.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length + data.length <= maxBuffer) {
        stderr += chunk;
      }
      // Stream chunk to callback if provided
      if (onStderr) {
        onStderr(chunk);
      }
    });

    // Set up timeout
    if (timeout !== undefined && timeout > 0) {
      timeoutId = setTimeout(() => {
        if (childProcess && !childProcess.killed) {
          killed = true;
          killSignal = "SIGTERM";
          childProcess.kill("SIGTERM");

          // Force kill after 5 seconds if still running
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              killSignal = "SIGKILL";
              childProcess.kill("SIGKILL");
            }
          }, 5000);
        }
      }, timeout);
    }

    // Handle process exit
    childProcess.on("close", (exitCode, signal) => {
      // Clean up
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortSignal) {
        abortSignal.removeEventListener("abort", abortHandler);
      }

      resolve({
        stdout,
        stderr,
        exitCode,
        killed,
        signal: signal ?? killSignal,
        duration: Date.now() - startTime,
      });
    });

    // Handle spawn errors
    childProcess.on("error", (error) => {
      // Clean up
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (abortSignal) {
        abortSignal.removeEventListener("abort", abortHandler);
      }

      resolve({
        stdout,
        stderr: stderr || error.message,
        exitCode: null,
        killed: false,
        signal: null,
        duration: Date.now() - startTime,
      });
    });
  });
}

/**
 * Build sandbox options from a ToolContext.
 */
export function getSandboxOptions(ctx: ToolContext): ShellOptions["sandbox"] | undefined {
  if (ctx.bypassSandbox || ctx.trustPreset === "yolo") {
    return undefined;
  }

  const preset = ctx.trustPreset ?? "default";
  const baseConfig = configFromTrustPreset(preset, ctx.workingDir);
  const mergedConfig = mergeSandboxConfig(baseConfig, ctx.sandboxConfig);

  return {
    enabled: true,
    config: mergedConfig,
  };
}

/**
 * Checks if a shell result indicates successful execution.
 *
 * @param result - The shell result to check
 * @returns `true` if command succeeded (exit code 0, not killed)
 */
export function isShellSuccess(result: ShellResult): boolean {
  return result.exitCode === 0 && !result.killed;
}
