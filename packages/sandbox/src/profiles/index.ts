/**
 * Sandbox profile helpers.
 */

import { randomUUID } from "node:crypto";
import type { FileSystemRules, NetworkRules, SandboxConfig, TrustPreset } from "../types.js";

const DEFAULT_RESOURCES = {
  cpuTimeMs: 60_000,
  wallTimeMs: 120_000,
  memoryBytes: 512 * 1024 * 1024,
  maxFileDescriptors: 256,
  maxProcesses: 32,
  maxOutputBytes: 10 * 1024 * 1024,
  maxFileSizeBytes: 50 * 1024 * 1024,
} as const;

const DEFAULT_NETWORK: NetworkRules = {
  allowNetwork: false,
  allowedHosts: [],
  allowedPorts: [],
  blockDns: true,
};

const DEFAULT_FILESYSTEM: FileSystemRules = {
  rootDir: ".",
  readOnlyPaths: [],
  readWritePaths: [],
  deniedPaths: [],
  useOverlay: false,
  maxDiskUsageBytes: 512 * 1024 * 1024,
};

/**
 * Build a sandbox config from a trust preset.
 */
export function configFromTrustPreset(preset: TrustPreset, workingDir: string): SandboxConfig {
  switch (preset) {
    case "paranoid":
      return {
        id: randomUUID(),
        strategy: "subprocess",
        resources: { ...DEFAULT_RESOURCES, maxProcesses: 4, maxOutputBytes: 2 * 1024 * 1024 },
        network: { ...DEFAULT_NETWORK, allowNetwork: false, blockDns: true },
        filesystem: {
          ...DEFAULT_FILESYSTEM,
          rootDir: workingDir,
          readOnlyPaths: [workingDir],
        },
        environment: {},
        workingDir,
        enableAudit: true,
      };
    case "cautious":
      return {
        id: randomUUID(),
        strategy: "subprocess",
        resources: { ...DEFAULT_RESOURCES, maxProcesses: 8 },
        network: { ...DEFAULT_NETWORK, allowNetwork: false, blockDns: true },
        filesystem: {
          ...DEFAULT_FILESYSTEM,
          rootDir: workingDir,
          readWritePaths: [workingDir],
        },
        environment: {},
        workingDir,
        enableAudit: true,
      };
    case "relaxed":
      return {
        id: randomUUID(),
        strategy: "subprocess",
        resources: { ...DEFAULT_RESOURCES },
        network: { ...DEFAULT_NETWORK, allowNetwork: true, blockDns: false },
        filesystem: {
          ...DEFAULT_FILESYSTEM,
          rootDir: workingDir,
          readWritePaths: [workingDir],
        },
        environment: {},
        workingDir,
        enableAudit: false,
      };
    case "yolo":
      return {
        id: randomUUID(),
        strategy: "subprocess",
        resources: { ...DEFAULT_RESOURCES, maxOutputBytes: 50 * 1024 * 1024 },
        network: { ...DEFAULT_NETWORK, allowNetwork: true, blockDns: false },
        filesystem: {
          ...DEFAULT_FILESYSTEM,
          rootDir: workingDir,
          readWritePaths: [workingDir],
        },
        environment: {},
        workingDir,
        enableAudit: false,
      };
    default:
      return {
        id: randomUUID(),
        strategy: "subprocess",
        resources: { ...DEFAULT_RESOURCES },
        network: { ...DEFAULT_NETWORK, allowNetwork: true, blockDns: false },
        filesystem: {
          ...DEFAULT_FILESYSTEM,
          rootDir: workingDir,
          readWritePaths: [workingDir],
        },
        environment: {},
        workingDir,
        enableAudit: true,
      };
  }
}

/**
 * Merge a base sandbox config with optional overrides.
 */
export function mergeSandboxConfig(
  base: SandboxConfig,
  overrides?: Partial<SandboxConfig>
): SandboxConfig {
  if (!overrides) {
    return base;
  }

  return {
    ...base,
    ...overrides,
    resources: { ...base.resources, ...overrides.resources },
    network: { ...base.network, ...overrides.network },
    filesystem: { ...base.filesystem, ...overrides.filesystem },
    syscalls: overrides.syscalls ?? base.syscalls,
    environment: { ...base.environment, ...overrides.environment },
  };
}
