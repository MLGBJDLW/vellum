/**
 * Shell Completion Generator Tests (T-047)
 *
 * @module cli/commands/__tests__/completion.test
 */

import { describe, expect, it } from "vitest";

import {
  BashCompletionGenerator,
  FishCompletionGenerator,
  generateCompletionFromCommands,
  getAvailableShells,
  getGenerator,
  isValidShell,
  PowerShellCompletionGenerator,
  type ShellType,
  ZshCompletionGenerator,
} from "../completion/index.js";
import type { SlashCommand } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const mockCommands: SlashCommand[] = [
  {
    name: "help",
    description: "Display help information",
    kind: "builtin",
    category: "system",
    namedArgs: [
      { name: "verbose", type: "boolean", description: "Show verbose output", required: false },
    ],
    execute: async () => ({ kind: "success" }),
  },
  {
    name: "login",
    description: "Login to a provider",
    kind: "builtin",
    category: "auth",
    namedArgs: [
      { name: "provider", type: "string", description: "Provider name", required: true },
      { name: "store", type: "string", description: "Credential store", required: false },
    ],
    execute: async () => ({ kind: "success" }),
  },
  {
    name: "clear",
    description: "Clear the screen",
    kind: "builtin",
    category: "system",
    execute: async () => ({ kind: "success" }),
  },
];

// =============================================================================
// Shell Type Utilities Tests
// =============================================================================

describe("Shell Type Utilities", () => {
  describe("getAvailableShells", () => {
    it("should return all supported shells", () => {
      const shells = getAvailableShells();
      expect(shells).toContain("bash");
      expect(shells).toContain("zsh");
      expect(shells).toContain("fish");
      expect(shells).toContain("powershell");
    });
  });

  describe("isValidShell", () => {
    it("should return true for valid shells", () => {
      expect(isValidShell("bash")).toBe(true);
      expect(isValidShell("zsh")).toBe(true);
      expect(isValidShell("fish")).toBe(true);
      expect(isValidShell("powershell")).toBe(true);
    });

    it("should return false for invalid shells", () => {
      expect(isValidShell("cmd")).toBe(false);
      expect(isValidShell("sh")).toBe(false);
      expect(isValidShell("")).toBe(false);
    });
  });

  describe("getGenerator", () => {
    it("should return correct generator for each shell", () => {
      expect(getGenerator("bash")).toBeInstanceOf(BashCompletionGenerator);
      expect(getGenerator("zsh")).toBeInstanceOf(ZshCompletionGenerator);
      expect(getGenerator("fish")).toBeInstanceOf(FishCompletionGenerator);
      expect(getGenerator("powershell")).toBeInstanceOf(PowerShellCompletionGenerator);
    });

    it("should throw for unsupported shell", () => {
      expect(() => getGenerator("invalid" as ShellType)).toThrow("Unsupported shell");
    });
  });
});

// =============================================================================
// Bash Completion Generator Tests
// =============================================================================

describe("BashCompletionGenerator", () => {
  const generator = new BashCompletionGenerator();

  it("should have correct shell type", () => {
    expect(generator.shell).toBe("bash");
  });

  it("should generate bash completion script", () => {
    const script = generator.generate(mockCommands, "vellum");

    expect(script).toContain("# Bash completion for vellum");
    expect(script).toContain("_vellum_completions");
    expect(script).toContain('commands="help login clear"');
    expect(script).toContain("complete -F _vellum_completions vellum");
  });

  it("should include command flags", () => {
    const script = generator.generate(mockCommands, "vellum");

    expect(script).toContain("--verbose");
    expect(script).toContain("--provider");
    expect(script).toContain("--store");
  });
});

// =============================================================================
// Zsh Completion Generator Tests
// =============================================================================

describe("ZshCompletionGenerator", () => {
  const generator = new ZshCompletionGenerator();

  it("should have correct shell type", () => {
    expect(generator.shell).toBe("zsh");
  });

  it("should generate zsh completion script", () => {
    const script = generator.generate(mockCommands, "vellum");

    expect(script).toContain("#compdef vellum");
    expect(script).toContain("_vellum()");
    expect(script).toContain("/help:Display help information");
    expect(script).toContain("/login:Login to a provider");
  });

  it("should include flag descriptions", () => {
    const script = generator.generate(mockCommands, "vellum");

    expect(script).toContain("--verbose");
    expect(script).toContain("--provider");
  });
});

// =============================================================================
// Fish Completion Generator Tests
// =============================================================================

describe("FishCompletionGenerator", () => {
  const generator = new FishCompletionGenerator();

  it("should have correct shell type", () => {
    expect(generator.shell).toBe("fish");
  });

  it("should generate fish completion script", () => {
    const script = generator.generate(mockCommands, "vellum");

    expect(script).toContain("# Fish completion for vellum");
    expect(script).toContain("complete -c vellum -f");
    expect(script).toContain('/help" -d');
    expect(script).toContain("Display help information");
  });

  it("should include flag completions", () => {
    const script = generator.generate(mockCommands, "vellum");

    expect(script).toContain("-l verbose");
    expect(script).toContain("-l provider");
  });
});

// =============================================================================
// PowerShell Completion Generator Tests
// =============================================================================

describe("PowerShellCompletionGenerator", () => {
  const generator = new PowerShellCompletionGenerator();

  it("should have correct shell type", () => {
    expect(generator.shell).toBe("powershell");
  });

  it("should generate powershell completion script", () => {
    const script = generator.generate(mockCommands, "vellum");

    expect(script).toContain("# PowerShell completion for vellum");
    expect(script).toContain("$vellumCommands");
    expect(script).toContain("Register-ArgumentCompleter");
    expect(script).toContain("/help");
  });

  it("should include flags array", () => {
    const script = generator.generate(mockCommands, "vellum");

    expect(script).toContain("'--verbose'");
    expect(script).toContain("'--provider'");
    expect(script).toContain("'--store'");
  });
});

// =============================================================================
// generateCompletionFromCommands Tests
// =============================================================================

describe("generateCompletionFromCommands", () => {
  it("should generate completion for specified shell", () => {
    const script = generateCompletionFromCommands(
      { shell: "bash", programName: "test-cli" },
      mockCommands
    );

    expect(script).toContain("# Bash completion for test-cli");
    expect(script).toContain("help login clear");
  });

  it("should use program name in output", () => {
    const shells: ShellType[] = ["bash", "zsh", "fish", "powershell"];

    for (const shell of shells) {
      const script = generateCompletionFromCommands({ shell, programName: "myapp" }, mockCommands);
      expect(script).toContain("myapp");
    }
  });
});
