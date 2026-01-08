/**
 * Shell Detection Tests
 *
 * Tests for shell detection, configuration, and environment management.
 *
 * @module shell/__tests__
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  detectShell,
  EnvironmentManager,
  generateEnvScript,
  getPrimaryRcFile,
  getShellConfig,
  getSupportedShells,
  isShellSupported,
  ShellConfigPatcher,
} from "../index.js";
import { CONFIG_MARKERS } from "../types.js";

// =============================================================================
// Shell Detection Tests
// =============================================================================

describe("Shell Detection", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("detectShell", () => {
    it("should detect PowerShell from PSModulePath", () => {
      process.env.PSModulePath = "C:\\Program Files\\PowerShell\\Modules";
      delete process.env.SHELL;

      const result = detectShell();
      expect(result.shell).toBe("powershell");
    });

    it("should detect pwsh from POWERSHELL_DISTRIBUTION_CHANNEL", () => {
      process.env.PSModulePath = "/usr/local/share/powershell/Modules";
      process.env.POWERSHELL_DISTRIBUTION_CHANNEL = "PSCore";
      delete process.env.SHELL;

      const result = detectShell();
      expect(result.shell).toBe("pwsh");
    });

    it("should detect bash from SHELL env var", () => {
      delete process.env.PSModulePath;
      process.env.SHELL = "/bin/bash";

      const result = detectShell();
      expect(result.shell).toBe("bash");
    });

    it("should detect zsh from SHELL env var", () => {
      delete process.env.PSModulePath;
      process.env.SHELL = "/usr/bin/zsh";

      const result = detectShell();
      expect(result.shell).toBe("zsh");
    });

    it("should detect fish from SHELL env var", () => {
      delete process.env.PSModulePath;
      process.env.SHELL = "/usr/local/bin/fish";

      const result = detectShell();
      expect(result.shell).toBe("fish");
    });

    it("should return isDefault as true", () => {
      const result = detectShell();
      expect(result.isDefault).toBe(true);
    });
  });

  describe("getSupportedShells", () => {
    it("should return all supported shell types", () => {
      const shells = getSupportedShells();
      expect(shells).toContain("bash");
      expect(shells).toContain("zsh");
      expect(shells).toContain("fish");
      expect(shells).toContain("powershell");
      expect(shells).toContain("pwsh");
      expect(shells).toContain("cmd");
    });
  });

  describe("isShellSupported", () => {
    it("should return true for supported shells", () => {
      expect(isShellSupported("bash")).toBe(true);
      expect(isShellSupported("zsh")).toBe(true);
      expect(isShellSupported("fish")).toBe(true);
      expect(isShellSupported("powershell")).toBe(true);
    });

    it("should return false for unsupported shells", () => {
      expect(isShellSupported("tcsh")).toBe(false);
      expect(isShellSupported("csh")).toBe(false);
      expect(isShellSupported("unknown")).toBe(false);
    });
  });
});

// =============================================================================
// Shell Config Tests
// =============================================================================

describe("Shell Configuration", () => {
  describe("getShellConfig", () => {
    it("should return bash config", () => {
      const config = getShellConfig("bash");
      expect(config.shell).toBe("bash");
      expect(config.rcFiles).toContain(join(homedir(), ".bashrc"));
      expect(config.exportCommand).toBe("export");
      expect(config.commentPrefix).toBe("#");
    });

    it("should return zsh config", () => {
      const config = getShellConfig("zsh");
      expect(config.shell).toBe("zsh");
      expect(config.rcFiles).toContain(join(homedir(), ".zshrc"));
      expect(config.exportCommand).toBe("export");
    });

    it("should return fish config", () => {
      const config = getShellConfig("fish");
      expect(config.shell).toBe("fish");
      expect(config.rcFiles[0]).toContain("config.fish");
      expect(config.exportCommand).toBe("set -gx");
    });

    it("should return powershell config", () => {
      const config = getShellConfig("powershell");
      expect(config.shell).toBe("powershell");
      expect(config.exportCommand).toBe("$env:");
    });

    it("should throw for unsupported shell", () => {
      expect(() => getShellConfig("unknown" as "bash")).toThrow("Unsupported shell");
    });
  });

  describe("getPrimaryRcFile", () => {
    it("should return .bashrc for bash", () => {
      const rcFile = getPrimaryRcFile("bash");
      expect(rcFile).toBe(join(homedir(), ".bashrc"));
    });

    it("should return .zshrc for zsh", () => {
      const rcFile = getPrimaryRcFile("zsh");
      expect(rcFile).toBe(join(homedir(), ".zshrc"));
    });
  });
});

// =============================================================================
// Environment Manager Tests
// =============================================================================

describe("EnvironmentManager", () => {
  describe("generateScript", () => {
    it("should generate bash environment script", () => {
      const manager = new EnvironmentManager("/usr/local/bin/vellum");
      manager.addPatch(manager.createVellumPatch());

      const script = manager.generateScript("bash");
      expect(script).toContain("export PATH=");
      expect(script).toContain("/usr/local/bin");
    });

    it("should generate zsh environment script", () => {
      const manager = new EnvironmentManager("/usr/local/bin/vellum");
      manager.addPatch(manager.createVellumPatch());

      const script = manager.generateScript("zsh");
      expect(script).toContain("export PATH=");
    });

    it("should generate fish environment script", () => {
      const manager = new EnvironmentManager("/usr/local/bin/vellum");
      manager.addPatch(manager.createVellumPatch());

      const script = manager.generateScript("fish");
      expect(script).toContain("set -gx PATH");
    });

    it("should generate powershell environment script", () => {
      const manager = new EnvironmentManager("C:\\Program Files\\vellum\\vellum.exe");
      manager.addPatch(manager.createVellumPatch());

      const script = manager.generateScript("powershell");
      expect(script).toContain("$env:PATH");
    });
  });

  describe("addPatch/removePatch", () => {
    it("should add and remove patches", () => {
      const manager = new EnvironmentManager();

      manager.addPatch({
        id: "test-patch",
        description: "Test patch",
        entries: [{ name: "TEST_VAR", operation: "set", value: "test" }],
        targetShells: [],
      });

      expect(manager.getPatches()).toHaveLength(1);
      expect(manager.removePatch("test-patch")).toBe(true);
      expect(manager.getPatches()).toHaveLength(0);
    });

    it("should filter patches by shell", () => {
      const manager = new EnvironmentManager();

      manager.addPatch({
        id: "bash-only",
        entries: [{ name: "VAR", operation: "set", value: "1" }],
        targetShells: ["bash"],
      });

      manager.addPatch({
        id: "all-shells",
        entries: [{ name: "VAR2", operation: "set", value: "2" }],
        targetShells: [],
      });

      expect(manager.getPatchesForShell("bash")).toHaveLength(2);
      expect(manager.getPatchesForShell("zsh")).toHaveLength(1);
    });
  });
});

// =============================================================================
// Config Patcher Tests
// =============================================================================

describe("ShellConfigPatcher", () => {
  describe("generateConfigBlock", () => {
    it("should generate config block with markers", () => {
      const patcher = new ShellConfigPatcher();
      const block = patcher.generateConfigBlock("bash");

      expect(block).toContain(CONFIG_MARKERS.START);
      expect(block).toContain(CONFIG_MARKERS.END);
      expect(block).toContain(CONFIG_MARKERS.WARNING);
    });

    it("should include completion setup", () => {
      const patcher = new ShellConfigPatcher();
      const block = patcher.generateConfigBlock("bash", true);

      expect(block).toContain("vellum completion bash");
    });

    it("should not include completion setup when disabled", () => {
      const patcher = new ShellConfigPatcher();
      const block = patcher.generateConfigBlock("bash", false);

      expect(block).not.toContain("vellum completion");
    });
  });

  describe("hasVellumBlock", () => {
    it("should detect existing Vellum block", () => {
      const patcher = new ShellConfigPatcher();
      const content = `
# Some config
${CONFIG_MARKERS.START}
# Vellum config here
${CONFIG_MARKERS.END}
# More config
`;

      expect(patcher.hasVellumBlock(content, "bash")).toBe(true);
    });

    it("should return false when no block exists", () => {
      const patcher = new ShellConfigPatcher();
      const content = "# Just regular config\nexport PATH=/usr/bin";

      expect(patcher.hasVellumBlock(content, "bash")).toBe(false);
    });
  });

  describe("removeVellumBlock", () => {
    it("should remove Vellum block from content", () => {
      const patcher = new ShellConfigPatcher();
      const content = `# Before
${CONFIG_MARKERS.START}
# Vellum config
${CONFIG_MARKERS.END}
# After`;

      const result = patcher.removeVellumBlock(content, "bash");

      expect(result).not.toContain(CONFIG_MARKERS.START);
      expect(result).not.toContain(CONFIG_MARKERS.END);
      expect(result).toContain("# Before");
      expect(result).toContain("# After");
    });

    it("should return unchanged content if no block exists", () => {
      const patcher = new ShellConfigPatcher();
      const content = "# Just regular config";

      const result = patcher.removeVellumBlock(content, "bash");
      expect(result).toBe(content);
    });
  });

  describe("extractVellumBlock", () => {
    it("should extract Vellum block", () => {
      const patcher = new ShellConfigPatcher();
      const block = `${CONFIG_MARKERS.START}
# Config
${CONFIG_MARKERS.END}`;
      const content = `# Before\n${block}\n# After`;

      const extracted = patcher.extractVellumBlock(content, "bash");
      expect(extracted).toBe(block);
    });

    it("should return undefined if no block", () => {
      const patcher = new ShellConfigPatcher();
      const content = "# No vellum block";

      expect(patcher.extractVellumBlock(content, "bash")).toBeUndefined();
    });
  });
});

// =============================================================================
// Generate Env Script Tests
// =============================================================================

describe("generateEnvScript", () => {
  it("should generate script for bash", () => {
    const script = generateEnvScript("bash", "/usr/local/bin/vellum");
    expect(script).toContain("export PATH=");
  });

  it("should generate empty script without bin path", () => {
    const script = generateEnvScript("bash");
    // Script should be empty or minimal since no PATH to add
    expect(typeof script).toBe("string");
  });
});
