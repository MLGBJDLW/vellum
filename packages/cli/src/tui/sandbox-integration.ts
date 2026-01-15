/**
 * Sandbox Integration
 *
 * Wires the @vellum/sandbox package to shell tool execution,
 * providing secure command execution with platform-specific sandboxing.
 *
 * @module cli/tui/sandbox-integration
 */

import {
  detectSandboxBackend,
  type SandboxConfig,
  type SandboxExecutionOptions,
  SandboxExecutor,
  type SandboxResult,
} from "@vellum/sandbox";

import { SANDBOX_DENIED_PATHS, SANDBOX_PERMISSIONS, SANDBOX_RESOURCES } from "./config/index.js";

// =============================================================================
// Types
// =============================================================================

export interface SandboxIntegrationOptions {
  /** Working directory for command execution */
  workingDirectory?: string;
  /** Allow network access in sandbox */
  allowNetwork?: boolean;
  /** Allow file system access */
  allowFileSystem?: boolean;
  /** Maximum execution time in milliseconds */
  timeoutMs?: number;
  /** Maximum output size in bytes */
  maxOutputBytes?: number;
  /** Environment variables */
  environment?: Record<string, string>;
}

export interface SandboxedExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Exit code (null if terminated) */
  exitCode: number | null;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Whether the command was terminated */
  terminated: boolean;
  /** Reason for termination if terminated */
  terminationReason?: string;
}

// =============================================================================
// Sandbox Integration
// =============================================================================

/**
 * Global sandbox executor instance
 */
let sandboxExecutor: SandboxExecutor | null = null;

/**
 * Initialize the sandbox executor with the given options.
 *
 * @param options - Sandbox configuration options
 * @returns The initialized sandbox executor
 *
 * @example
 * ```typescript
 * const executor = initializeSandbox({
 *   workingDirectory: process.cwd(),
 *   allowNetwork: false,
 *   allowFileSystem: true,
 * });
 * ```
 */
export function initializeSandbox(options: SandboxIntegrationOptions = {}): SandboxExecutor {
  const {
    workingDirectory = process.cwd(),
    allowNetwork = SANDBOX_PERMISSIONS.ALLOW_NETWORK,
    allowFileSystem = SANDBOX_PERMISSIONS.ALLOW_FILE_SYSTEM,
    timeoutMs = SANDBOX_RESOURCES.TIMEOUT_MS,
    maxOutputBytes = SANDBOX_RESOURCES.MAX_OUTPUT_BYTES,
    environment = {},
  } = options;

  const config: SandboxConfig = {
    id: `sandbox-${Date.now()}`,
    strategy: "subprocess",
    workingDir: workingDirectory,
    environment,
    enableAudit: SANDBOX_PERMISSIONS.ENABLE_AUDIT,
    resources: {
      cpuTimeMs: timeoutMs,
      wallTimeMs: timeoutMs + SANDBOX_RESOURCES.WALL_TIME_BUFFER_MS,
      memoryBytes: SANDBOX_RESOURCES.MEMORY_BYTES,
      maxFileDescriptors: SANDBOX_RESOURCES.MAX_FILE_DESCRIPTORS,
      maxProcesses: SANDBOX_RESOURCES.MAX_PROCESSES,
      maxOutputBytes,
      maxFileSizeBytes: SANDBOX_RESOURCES.MAX_FILE_SIZE_BYTES,
    },
    network: {
      allowNetwork,
      allowedHosts: [],
      allowedPorts: [],
      blockDns: !allowNetwork,
    },
    filesystem: {
      rootDir: workingDirectory,
      readOnlyPaths: [],
      readWritePaths: allowFileSystem ? [workingDirectory] : [],
      deniedPaths: [...SANDBOX_DENIED_PATHS],
      useOverlay: SANDBOX_PERMISSIONS.USE_OVERLAY,
      maxDiskUsageBytes: SANDBOX_RESOURCES.MAX_DISK_USAGE_BYTES,
    },
  };

  const backend = detectSandboxBackend();
  sandboxExecutor = new SandboxExecutor(config, backend);

  return sandboxExecutor;
}

/**
 * Get the current sandbox executor, initializing if needed.
 *
 * @returns The sandbox executor instance
 */
export function getSandboxExecutor(): SandboxExecutor {
  if (!sandboxExecutor) {
    sandboxExecutor = initializeSandbox();
  }
  return sandboxExecutor;
}

/**
 * Execute a command in the sandbox.
 *
 * @param command - The command to execute
 * @param args - Command arguments
 * @param options - Execution options
 * @returns The execution result
 *
 * @example
 * ```typescript
 * const result = await executeSandboxed("ls", ["-la"], {
 *   cwd: "/project",
 *   timeoutMs: 5000,
 * });
 * if (result.success) {
 *   console.log(result.stdout);
 * }
 * ```
 */
export async function executeSandboxed(
  command: string,
  args: string[] = [],
  options: SandboxExecutionOptions = {}
): Promise<SandboxedExecutionResult> {
  const executor = getSandboxExecutor();

  const result: SandboxResult = await executor.execute(command, args, options);

  return {
    success: result.exitCode === 0 && !result.terminated,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    terminated: result.terminated,
    terminationReason: result.terminationReason,
  };
}

/**
 * Execute a shell command string in the sandbox.
 *
 * @param shellCommand - The shell command string to execute
 * @param options - Execution options
 * @returns The execution result
 *
 * @example
 * ```typescript
 * const result = await executeShellCommand("echo $HOME && pwd", {
 *   timeoutMs: 10000,
 * });
 * ```
 */
export async function executeShellCommand(
  shellCommand: string,
  options: SandboxExecutionOptions = {}
): Promise<SandboxedExecutionResult> {
  const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
  const shellArgs = process.platform === "win32" ? ["/c", shellCommand] : ["-c", shellCommand];

  return executeSandboxed(shell, shellArgs, options);
}

/**
 * Cleanup the sandbox executor.
 * Should be called on application shutdown.
 */
export async function cleanupSandbox(): Promise<void> {
  if (sandboxExecutor) {
    await sandboxExecutor.cleanup();
    sandboxExecutor = null;
  }
}

/**
 * Create a sandboxed executor bound to a specific working directory.
 *
 * @param workingDirectory - The working directory
 * @param options - Additional sandbox options
 * @returns An object with bound execute functions
 *
 * @example
 * ```typescript
 * const sandbox = createBoundSandbox("/project/dir");
 * await sandbox.execute("npm", ["install"]);
 * await sandbox.shell("npm run build && npm test");
 * ```
 */
export function createBoundSandbox(
  workingDirectory: string,
  options: Omit<SandboxIntegrationOptions, "workingDirectory"> = {}
): {
  execute: (
    command: string,
    args?: string[],
    execOptions?: Omit<SandboxExecutionOptions, "cwd">
  ) => Promise<SandboxedExecutionResult>;
  shell: (
    shellCommand: string,
    execOptions?: Omit<SandboxExecutionOptions, "cwd">
  ) => Promise<SandboxedExecutionResult>;
  cleanup: () => Promise<void>;
} {
  const timeoutMs = options.timeoutMs ?? SANDBOX_RESOURCES.TIMEOUT_MS;
  const allowNetwork = options.allowNetwork ?? SANDBOX_PERMISSIONS.ALLOW_NETWORK;
  const allowFileSystem = options.allowFileSystem ?? SANDBOX_PERMISSIONS.ALLOW_FILE_SYSTEM;
  const maxOutputBytes = options.maxOutputBytes ?? SANDBOX_RESOURCES.MAX_OUTPUT_BYTES;

  // Create a dedicated executor for this directory
  const config: SandboxConfig = {
    id: `sandbox-bound-${Date.now()}`,
    strategy: "subprocess",
    workingDir: workingDirectory,
    environment: options.environment ?? {},
    enableAudit: SANDBOX_PERMISSIONS.ENABLE_AUDIT,
    resources: {
      cpuTimeMs: timeoutMs,
      wallTimeMs: timeoutMs + SANDBOX_RESOURCES.WALL_TIME_BUFFER_MS,
      memoryBytes: SANDBOX_RESOURCES.MEMORY_BYTES,
      maxFileDescriptors: SANDBOX_RESOURCES.MAX_FILE_DESCRIPTORS,
      maxProcesses: SANDBOX_RESOURCES.MAX_PROCESSES,
      maxOutputBytes,
      maxFileSizeBytes: SANDBOX_RESOURCES.MAX_FILE_SIZE_BYTES,
    },
    network: {
      allowNetwork,
      allowedHosts: [],
      allowedPorts: [],
      blockDns: !allowNetwork,
    },
    filesystem: {
      rootDir: workingDirectory,
      readOnlyPaths: [],
      readWritePaths: allowFileSystem ? [workingDirectory] : [],
      deniedPaths: [],
      useOverlay: SANDBOX_PERMISSIONS.USE_OVERLAY,
      maxDiskUsageBytes: SANDBOX_RESOURCES.MAX_DISK_USAGE_BYTES,
    },
  };

  const backend = detectSandboxBackend();
  const executor = new SandboxExecutor(config, backend);

  return {
    execute: async (command, args = [], execOptions = {}) => {
      const result = await executor.execute(command, args, {
        ...execOptions,
        cwd: workingDirectory,
      });
      return {
        success: result.exitCode === 0 && !result.terminated,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        terminated: result.terminated,
        terminationReason: result.terminationReason,
      };
    },
    shell: async (shellCommand, execOptions = {}) => {
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
      const shellArgs = process.platform === "win32" ? ["/c", shellCommand] : ["-c", shellCommand];
      const result = await executor.execute(shell, shellArgs, {
        ...execOptions,
        cwd: workingDirectory,
      });
      return {
        success: result.exitCode === 0 && !result.terminated,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        terminated: result.terminated,
        terminationReason: result.terminationReason,
      };
    },
    cleanup: () => executor.cleanup(),
  };
}
