/**
 * Shell Execution Helpers
 *
 * Provides cross-platform shell command execution with
 * timeout support, abort signals, and structured results.
 *
 * @module builtin/utils/shell-helpers
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { homedir, platform } from "node:os";
import * as path from "node:path";

import { sanitizeEnvironment } from "@vellum/sandbox";

/** Timeout before sending SIGKILL after SIGTERM (ms) */
const SIGKILL_TIMEOUT_MS = 5000;

/**
 * Kills a process tree (the process and all its descendants).
 *
 * - Windows: Uses `taskkill /pid <pid> /f /t` to kill tree
 * - Unix: Uses `process.kill(-pid, signal)` to kill process group
 *
 * Implements graceful shutdown: SIGTERM → wait timeout → SIGKILL
 *
 * @param pid - Process ID to kill
 * @param options - Kill options
 * @param options.timeout - Time to wait before SIGKILL (default: 5000ms)
 * @returns Promise that resolves when the process tree is killed
 */
export async function killProcessTree(
  pid: number,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = SIGKILL_TIMEOUT_MS } = options;
  const isWindows = platform() === "win32";

  if (isWindows) {
    // Windows: taskkill /T kills the entire process tree
    // /f = force, /t = tree (kill child processes)
    spawnSync("taskkill", ["/pid", String(pid), "/f", "/t"], {
      stdio: "ignore",
    });
    return;
  }

  // Unix: Kill the process group using negative PID
  // First try SIGTERM for graceful shutdown
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Process may already be dead, ignore ESRCH errors
    return;
  }

  // Wait for graceful shutdown, then force kill if still alive
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      try {
        // Check if process group still exists and force kill
        process.kill(-pid, "SIGKILL");
      } catch {
        // Process already dead, ignore
      }
      resolve();
    }, timeout);
  });
}

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

  /** Run as background process (detached, non-blocking) */
  isBackground?: boolean;

  /**
   * If true, timeout resets on each stdout/stderr output (inactivity-based timeout).
   * If false (default), timeout is absolute from command start.
   */
  inactivityTimeout?: boolean;
}

/**
 * Result of a shell command execution.
 */
export interface ShellResult {
  /** Standard output from the command */
  stdout: string;

  /** Standard error from the command */
  stderr: string;

  /** Exit code of the process (null if killed by signal or background) */
  exitCode: number | null;

  /** Whether the process was killed (by timeout or abort) */
  killed: boolean;

  /** Signal that killed the process, if any */
  signal: NodeJS.Signals | null;

  /** Execution duration in milliseconds */
  duration: number;

  /** Whether stdout/stderr was truncated due to buffer limit */
  truncated?: boolean;

  /** Path to saved full output file when truncated */
  savedOutputPath?: string;

  /** Process ID (set for background processes) */
  pid?: number;

  /** Whether the process is running in background */
  isBackground?: boolean;
}

/** Default maximum buffer size: 10MB */
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Manages truncated output persistence.
 *
 * When shell output is truncated due to buffer limits, saves the full output
 * to a file for later inspection. Includes automatic cleanup of old files.
 */
export namespace TruncatedOutputManager {
  /** Default output directory */
  const DEFAULT_DIR = path.join(homedir(), ".vellum", "tool-output");

  /** Retention period for saved outputs (7 days) */
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

  /** Custom output directory (for testing/configuration) */
  let customDir: string | undefined;

  /**
   * Sets a custom output directory.
   * @param dir - Custom directory path, or undefined to use default
   */
  export function setOutputDir(dir: string | undefined): void {
    customDir = dir;
  }

  /**
   * Gets the current output directory.
   * @returns The configured output directory path
   */
  export function getOutputDir(): string {
    return customDir ?? DEFAULT_DIR;
  }

  /**
   * Ensures the output directory exists.
   * @returns Promise resolving to the directory path
   */
  async function ensureDir(): Promise<string> {
    const dir = getOutputDir();
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * Cleans up output files older than the retention period.
   * Runs asynchronously, errors are silently ignored.
   */
  export async function cleanup(): Promise<void> {
    try {
      const dir = getOutputDir();
      const files = await fs.readdir(dir).catch(() => []);
      const now = Date.now();

      for (const file of files) {
        if (!file.startsWith("output-") || !file.endsWith(".txt")) {
          continue;
        }

        const filepath = path.join(dir, file);
        try {
          const stat = await fs.stat(filepath);
          if (now - stat.mtimeMs > RETENTION_MS) {
            await fs.unlink(filepath);
          }
        } catch {
          // Ignore errors for individual files
        }
      }
    } catch {
      // Silently ignore cleanup errors
    }
  }

  /**
   * Saves truncated output content to a file.
   *
   * @param content - The full output content to save
   * @returns Promise resolving to the saved file path
   */
  export async function save(content: string): Promise<string> {
    const dir = await ensureDir();
    const filename = `output-${Date.now()}.txt`;
    const filepath = path.join(dir, filename);

    await fs.writeFile(filepath, content, "utf-8");

    // Trigger cleanup in background (non-blocking)
    cleanup().catch(() => {});

    return filepath;
  }
}

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
    isBackground = false,
    inactivityTimeout = false,
  } = options;

  const startTime = Date.now();
  const { shell, shellArgs } = customShell
    ? { shell: customShell, shellArgs: ["-c"] }
    : detectShell();

  // Background process: spawn detached, unref, return immediately
  if (isBackground) {
    const childProcess = spawn(shell, [...shellArgs, command], {
      cwd,
      env: sanitizeEnvironment({ ...process.env, ...env }),
      stdio: "ignore", // Detach all stdio
      detached: true,
    });

    const pid = childProcess.pid;
    childProcess.unref(); // Allow parent to exit independently

    return {
      stdout: pid
        ? `Background process started with PID: ${pid}`
        : "Failed to start background process",
      stderr: "",
      exitCode: null,
      killed: false,
      signal: null,
      duration: Date.now() - startTime,
      pid,
      isBackground: true,
    };
  }

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
    let fullStdout = ""; // Track full output for saving when truncated
    let fullStderr = "";
    let killed = false;
    let killSignal: NodeJS.Signals | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let childProcess: ChildProcess | undefined;
    let stdoutDroppedBytes = 0;
    let stderrDroppedBytes = 0;

    // Handle abort signal
    const abortHandler = () => {
      if (childProcess?.pid && !childProcess.killed) {
        killed = true;
        killSignal = "SIGTERM";
        // Kill the entire process tree, not just the parent
        killProcessTree(childProcess.pid).catch(() => {
          // Ignore errors - process may already be dead
        });
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

    // Spawn the process with detached: true to create a new process group
    // This allows killing the entire process tree on timeout/abort
    const isWindows = platform() === "win32";
    childProcess = spawn(shell, [...shellArgs, command], {
      cwd,
      env: sanitizeEnvironment({ ...process.env, ...env }),
      stdio: ["pipe", "pipe", "pipe"],
      detached: !isWindows, // Unix: create new process group; Windows: handled by taskkill /t
    });

    // Helper to reset/set timeout (used for inactivity-based timeout)
    const resetTimeout = () => {
      if (timeout === undefined || timeout <= 0) return;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (childProcess?.pid && !childProcess.killed) {
          killed = true;
          killSignal = "SIGTERM";
          // Kill the entire process tree, not just the parent
          killProcessTree(childProcess.pid).catch(() => {
            // Ignore errors - process may already be dead
          });
        }
      }, timeout);
    };

    // Collect stdout and stream to callback
    childProcess.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      fullStdout += chunk; // Always track full output
      if (stdout.length + data.length <= maxBuffer) {
        stdout += chunk;
      } else {
        // Track dropped bytes when buffer is full
        const availableSpace = Math.max(0, maxBuffer - stdout.length);
        if (availableSpace > 0) {
          stdout += chunk.slice(0, availableSpace);
        }
        stdoutDroppedBytes += data.length - availableSpace;
      }
      // Stream chunk to callback if provided
      if (onStdout) {
        onStdout(chunk);
      }
      // Reset timeout on output if inactivity mode is enabled
      if (inactivityTimeout) {
        resetTimeout();
      }
    });

    // Collect stderr and stream to callback
    childProcess.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      fullStderr += chunk; // Always track full output
      if (stderr.length + data.length <= maxBuffer) {
        stderr += chunk;
      } else {
        // Track dropped bytes when buffer is full
        const availableSpace = Math.max(0, maxBuffer - stderr.length);
        if (availableSpace > 0) {
          stderr += chunk.slice(0, availableSpace);
        }
        stderrDroppedBytes += data.length - availableSpace;
      }
      // Stream chunk to callback if provided
      if (onStderr) {
        onStderr(chunk);
      }
      // Reset timeout on output if inactivity mode is enabled
      if (inactivityTimeout) {
        resetTimeout();
      }
    });

    // Set up initial timeout
    if (timeout !== undefined && timeout > 0) {
      resetTimeout();
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

      // Check if output was truncated and append warning
      const totalDroppedBytes = stdoutDroppedBytes + stderrDroppedBytes;
      const truncated = totalDroppedBytes > 0;

      // Helper to finalize and resolve
      const finalizeResult = (savedPath?: string) => {
        if (truncated) {
          const bufferMB = maxBuffer / (1024 * 1024);
          const pathInfo = savedPath ? ` Full output saved to: ${savedPath}.` : "";
          const warning = `\n[WARNING: Output truncated. Buffer limit is ${bufferMB}MB. ${totalDroppedBytes} bytes dropped.${pathInfo} Use 'cat' or 'grep' to view.]`;
          stdout += warning;
        }

        resolve({
          stdout,
          stderr,
          // When explicitly killed (timeout/abort), exit code should be null
          // Windows taskkill reports exit code 1, normalize to null for cross-platform consistency
          exitCode: killed ? null : exitCode,
          killed,
          signal: signal ?? killSignal,
          duration: Date.now() - startTime,
          truncated,
          savedOutputPath: savedPath,
        });
      };

      // If truncated, save full output to file (non-blocking)
      if (truncated) {
        const fullContent = `=== STDOUT ===\n${fullStdout}\n\n=== STDERR ===\n${fullStderr}`;
        TruncatedOutputManager.save(fullContent)
          .then((savedPath) => finalizeResult(savedPath))
          .catch(() => finalizeResult(undefined));
      } else {
        finalizeResult();
      }
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
