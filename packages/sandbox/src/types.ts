/**
 * Sandbox core types.
 *
 * Provides configuration and result shapes used by the sandbox executor.
 */

export type SandboxStrategy = "subprocess" | "container" | "vm" | "wasm";

export type SandboxBackend = "subprocess" | "platform" | "container";

export type TrustPreset = "paranoid" | "cautious" | "default" | "relaxed" | "yolo";

/**
 * Resource limits for sandboxed execution.
 */
export interface ResourceLimits {
  cpuTimeMs: number;
  wallTimeMs: number;
  memoryBytes: number;
  maxFileDescriptors: number;
  maxProcesses: number;
  maxOutputBytes: number;
  maxFileSizeBytes: number;
}

/**
 * Network isolation rules.
 */
export interface NetworkRules {
  allowNetwork: boolean;
  allowedHosts: string[];
  allowedPorts: number[];
  blockDns: boolean;
}

/**
 * File system access rules.
 */
export interface FileSystemRules {
  rootDir: string;
  readOnlyPaths: string[];
  readWritePaths: string[];
  deniedPaths: string[];
  useOverlay: boolean;
  maxDiskUsageBytes: number;
}

/**
 * System call filtering rules.
 */
export interface SyscallRules {
  mode: "allow" | "deny";
  syscalls: string[];
  allowExec: boolean;
  allowFork: boolean;
  allowPtrace: boolean;
}

/**
 * Security violation event.
 */
export interface SecurityViolation {
  type: "syscall" | "network" | "filesystem" | "resource";
  timestamp: Date;
  details: string;
  blocked: boolean;
  sandboxId: string;
}

/**
 * Complete sandbox configuration.
 */
export interface SandboxConfig {
  id: string;
  strategy: SandboxStrategy;
  resources: ResourceLimits;
  network: NetworkRules;
  filesystem: FileSystemRules;
  syscalls?: SyscallRules;
  environment: Record<string, string>;
  workingDir: string;
  user?: string | number;
  group?: string | number;
  enableAudit: boolean;
  onViolation?: (violation: SecurityViolation) => void;
}

/**
 * Result of sandboxed execution.
 */
export interface SandboxResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  peakMemoryBytes: number;
  cpuTimeMs: number;
  terminated: boolean;
  terminationReason?: string;
  modifiedFiles: string[];
}

/**
 * Execution options for the sandbox executor.
 */
export interface SandboxExecutionOptions {
  input?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  env?: Record<string, string>;
  maxOutputBytes?: number;
  cwd?: string;
}
