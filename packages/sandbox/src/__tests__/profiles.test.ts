/**
 * Sandbox profiles tests
 *
 * Tests for trust preset configurations and config merging.
 */

import { describe, expect, it } from "vitest";
import { configFromTrustPreset, mergeSandboxConfig } from "../profiles/index.js";
import type { SandboxConfig, TrustPreset } from "../types.js";

describe("configFromTrustPreset", () => {
  const workingDir = "/test/workspace";

  describe("paranoid preset", () => {
    it("creates config with strict limits", () => {
      const config = configFromTrustPreset("paranoid", workingDir);

      expect(config.id).toBeDefined();
      expect(config.strategy).toBe("subprocess");
      expect(config.workingDir).toBe(workingDir);
      expect(config.enableAudit).toBe(true);
    });

    it("restricts process count", () => {
      const config = configFromTrustPreset("paranoid", workingDir);

      expect(config.resources.maxProcesses).toBe(4);
    });

    it("limits output size", () => {
      const config = configFromTrustPreset("paranoid", workingDir);

      expect(config.resources.maxOutputBytes).toBe(2 * 1024 * 1024);
    });

    it("blocks network and DNS", () => {
      const config = configFromTrustPreset("paranoid", workingDir);

      expect(config.network.allowNetwork).toBe(false);
      expect(config.network.blockDns).toBe(true);
    });

    it("sets filesystem to read-only", () => {
      const config = configFromTrustPreset("paranoid", workingDir);

      expect(config.filesystem.rootDir).toBe(workingDir);
      expect(config.filesystem.readOnlyPaths).toContain(workingDir);
    });
  });

  describe("cautious preset", () => {
    it("creates config with moderate limits", () => {
      const config = configFromTrustPreset("cautious", workingDir);

      expect(config.strategy).toBe("subprocess");
      expect(config.enableAudit).toBe(true);
    });

    it("allows more processes than paranoid", () => {
      const config = configFromTrustPreset("cautious", workingDir);

      expect(config.resources.maxProcesses).toBe(8);
    });

    it("blocks network but allows filesystem write", () => {
      const config = configFromTrustPreset("cautious", workingDir);

      expect(config.network.allowNetwork).toBe(false);
      expect(config.filesystem.readWritePaths).toContain(workingDir);
    });
  });

  describe("default preset", () => {
    it("creates balanced config", () => {
      const config = configFromTrustPreset("default", workingDir);

      expect(config.strategy).toBe("subprocess");
      expect(config.enableAudit).toBe(true);
    });

    it("allows network access", () => {
      const config = configFromTrustPreset("default", workingDir);

      expect(config.network.allowNetwork).toBe(true);
      expect(config.network.blockDns).toBe(false);
    });

    it("uses default resource limits", () => {
      const config = configFromTrustPreset("default", workingDir);

      expect(config.resources.cpuTimeMs).toBe(60_000);
      expect(config.resources.wallTimeMs).toBe(120_000);
      expect(config.resources.memoryBytes).toBe(512 * 1024 * 1024);
      expect(config.resources.maxProcesses).toBe(32);
    });
  });

  describe("relaxed preset", () => {
    it("creates permissive config", () => {
      const config = configFromTrustPreset("relaxed", workingDir);

      expect(config.enableAudit).toBe(false);
    });

    it("allows network access", () => {
      const config = configFromTrustPreset("relaxed", workingDir);

      expect(config.network.allowNetwork).toBe(true);
      expect(config.network.blockDns).toBe(false);
    });
  });

  describe("yolo preset", () => {
    it("creates most permissive config", () => {
      const config = configFromTrustPreset("yolo", workingDir);

      expect(config.enableAudit).toBe(false);
    });

    it("allows larger output", () => {
      const config = configFromTrustPreset("yolo", workingDir);

      expect(config.resources.maxOutputBytes).toBe(50 * 1024 * 1024);
    });

    it("allows full network access", () => {
      const config = configFromTrustPreset("yolo", workingDir);

      expect(config.network.allowNetwork).toBe(true);
      expect(config.network.blockDns).toBe(false);
    });
  });

  describe("unique IDs", () => {
    it("generates unique ID for each config", () => {
      const config1 = configFromTrustPreset("default", workingDir);
      const config2 = configFromTrustPreset("default", workingDir);

      expect(config1.id).not.toBe(config2.id);
    });
  });

  describe("all presets", () => {
    const presets: TrustPreset[] = ["paranoid", "cautious", "default", "relaxed", "yolo"];

    it.each(presets)("%s preset has valid structure", (preset) => {
      const config = configFromTrustPreset(preset, workingDir);

      expect(config).toHaveProperty("id");
      expect(config).toHaveProperty("strategy");
      expect(config).toHaveProperty("resources");
      expect(config).toHaveProperty("network");
      expect(config).toHaveProperty("filesystem");
      expect(config).toHaveProperty("environment");
      expect(config).toHaveProperty("workingDir");
      expect(config).toHaveProperty("enableAudit");
    });

    it.each(presets)("%s preset has required resource limits", (preset) => {
      const config = configFromTrustPreset(preset, workingDir);

      expect(config.resources.cpuTimeMs).toBeGreaterThan(0);
      expect(config.resources.wallTimeMs).toBeGreaterThan(0);
      expect(config.resources.memoryBytes).toBeGreaterThan(0);
      expect(config.resources.maxFileDescriptors).toBeGreaterThan(0);
      expect(config.resources.maxProcesses).toBeGreaterThan(0);
      expect(config.resources.maxOutputBytes).toBeGreaterThan(0);
    });
  });
});

describe("mergeSandboxConfig", () => {
  const baseConfig = configFromTrustPreset("default", "/base");

  it("returns base config when no overrides", () => {
    const merged = mergeSandboxConfig(baseConfig);

    expect(merged).toEqual(baseConfig);
  });

  it("returns base config when overrides is undefined", () => {
    const merged = mergeSandboxConfig(baseConfig, undefined);

    expect(merged).toEqual(baseConfig);
  });

  it("merges top-level properties", () => {
    const merged = mergeSandboxConfig(baseConfig, {
      workingDir: "/new/dir",
      enableAudit: false,
    });

    expect(merged.workingDir).toBe("/new/dir");
    expect(merged.enableAudit).toBe(false);
    expect(merged.id).toBe(baseConfig.id);
  });

  it("deep merges resources", () => {
    const merged = mergeSandboxConfig(baseConfig, {
      resources: {
        cpuTimeMs: 30_000,
        maxProcesses: 16,
      },
    } as Partial<SandboxConfig>);

    expect(merged.resources.cpuTimeMs).toBe(30_000);
    expect(merged.resources.maxProcesses).toBe(16);
    expect(merged.resources.memoryBytes).toBe(baseConfig.resources.memoryBytes);
  });

  it("deep merges network rules", () => {
    const merged = mergeSandboxConfig(baseConfig, {
      network: {
        allowNetwork: false,
        allowedHosts: ["localhost"],
      },
    } as Partial<SandboxConfig>);

    expect(merged.network.allowNetwork).toBe(false);
    expect(merged.network.allowedHosts).toEqual(["localhost"]);
    expect(merged.network.blockDns).toBe(baseConfig.network.blockDns);
  });

  it("deep merges filesystem rules", () => {
    const merged = mergeSandboxConfig(baseConfig, {
      filesystem: {
        deniedPaths: ["/etc", "/var"],
        useOverlay: true,
      },
    } as Partial<SandboxConfig>);

    expect(merged.filesystem.deniedPaths).toEqual(["/etc", "/var"]);
    expect(merged.filesystem.useOverlay).toBe(true);
    expect(merged.filesystem.rootDir).toBe(baseConfig.filesystem.rootDir);
  });

  it("merges environment variables", () => {
    const configWithEnv: SandboxConfig = {
      ...baseConfig,
      environment: { FOO: "bar", BAZ: "qux" },
    };

    const merged = mergeSandboxConfig(configWithEnv, {
      environment: { FOO: "override", NEW: "value" },
    });

    expect(merged.environment).toEqual({
      FOO: "override",
      BAZ: "qux",
      NEW: "value",
    });
  });

  it("overrides syscalls completely", () => {
    const baseWithSyscalls: SandboxConfig = {
      ...baseConfig,
      syscalls: {
        mode: "allow",
        syscalls: ["read", "write"],
        allowExec: true,
        allowFork: true,
        allowPtrace: false,
      },
    };

    const merged = mergeSandboxConfig(baseWithSyscalls, {
      syscalls: {
        mode: "deny",
        syscalls: ["fork"],
        allowExec: false,
        allowFork: false,
        allowPtrace: false,
      },
    });

    expect(merged.syscalls?.mode).toBe("deny");
    expect(merged.syscalls?.syscalls).toEqual(["fork"]);
    expect(merged.syscalls?.allowExec).toBe(false);
  });

  it("preserves base syscalls when not overridden", () => {
    const baseWithSyscalls: SandboxConfig = {
      ...baseConfig,
      syscalls: {
        mode: "allow",
        syscalls: ["read"],
        allowExec: true,
        allowFork: true,
        allowPtrace: false,
      },
    };

    const merged = mergeSandboxConfig(baseWithSyscalls, {
      workingDir: "/other",
    });

    expect(merged.syscalls).toEqual(baseWithSyscalls.syscalls);
  });
});
