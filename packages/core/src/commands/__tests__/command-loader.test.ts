// ============================================
// CommandLoader Unit Tests
// ============================================

/**
 * Unit tests for the CommandLoader class.
 *
 * Tests cover:
 * - Load all commands from .vellum/commands/
 * - Load single command by name
 * - Handle missing .vellum/commands/ gracefully
 * - Parse frontmatter correctly
 * - Detect conflicts with builtin commands
 * - Cache clearing works
 *
 * @module @vellum/core/commands/__tests__/command-loader
 * @see T039
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandLoader } from "../command-loader.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a temporary test directory.
 */
function createTempDir(prefix: string): string {
  const dir = join(
    tmpdir(),
    `vellum-cmd-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Create a valid command file with frontmatter.
 */
function createValidCommandFile(
  dir: string,
  name: string,
  options?: { description?: string; badge?: string; triggers?: string }
): string {
  const commandsDir = join(dir, ".vellum", "commands");
  mkdirSync(commandsDir, { recursive: true });

  const filePath = join(commandsDir, `${name}.md`);
  const frontmatter = `---
name: ${name}
description: ${options?.description ?? `Test command ${name}`}
${options?.badge ? `badge: "${options.badge}"` : ""}
${options?.triggers ?? ""}
---
This is the content for the ${name} command.

Do something useful.`;

  writeFileSync(filePath, frontmatter);
  return filePath;
}

/**
 * Create a command file with trigger patterns.
 */
function createCommandWithTriggers(
  dir: string,
  name: string,
  triggers: Array<{ pattern: string; type: string }>
): string {
  const commandsDir = join(dir, ".vellum", "commands");
  mkdirSync(commandsDir, { recursive: true });

  const triggersYaml = triggers
    .map((t) => `  - pattern: ${JSON.stringify(t.pattern)}\n    type: ${t.type}`)
    .join("\n");

  const filePath = join(commandsDir, `${name}.md`);
  const content = `---
name: ${name}
description: "Command with triggers"
triggers:
${triggersYaml}
---
Command body with triggers.`;

  writeFileSync(filePath, content);
  return filePath;
}

/**
 * Create a corrupt command file (invalid YAML).
 */
function createCorruptCommandFile(dir: string, name: string): string {
  const commandsDir = join(dir, ".vellum", "commands");
  mkdirSync(commandsDir, { recursive: true });

  const filePath = join(commandsDir, `${name}.md`);
  writeFileSync(
    filePath,
    `---
name: ${name}
description: [unclosed bracket
invalid: yaml: syntax
---
Content here.`
  );
  return filePath;
}

// =============================================================================
// CommandLoader Tests
// =============================================================================

describe("CommandLoader", () => {
  let tempWorkspace: string;
  let loader: CommandLoader;

  beforeEach(() => {
    tempWorkspace = createTempDir("loader");
    loader = new CommandLoader({
      cwd: tempWorkspace,
      loadUserCommands: false, // Disable user commands for isolated tests
    });
  });

  afterEach(() => {
    try {
      rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  // ===========================================================================
  // T039.1: Load all commands from .vellum/commands/
  // ===========================================================================
  describe("loadAll", () => {
    it("loads all command files from .vellum/commands/", async () => {
      // Create multiple command files
      createValidCommandFile(tempWorkspace, "review", {
        description: "Run code review",
      });
      createValidCommandFile(tempWorkspace, "deploy", {
        description: "Deploy to production",
      });
      createValidCommandFile(tempWorkspace, "test-cmd", {
        description: "Run tests",
      });

      const commands = await loader.loadAll();

      expect(commands).toHaveLength(3);

      const names = commands.map((c) => c.name).sort();
      expect(names).toEqual(["deploy", "review", "test-cmd"]);
    });

    it("returns empty array when no commands exist", async () => {
      const commands = await loader.loadAll();
      expect(commands).toHaveLength(0);
    });

    it("ignores non-markdown files", async () => {
      const commandsDir = join(tempWorkspace, ".vellum", "commands");
      mkdirSync(commandsDir, { recursive: true });

      // Create a valid command
      createValidCommandFile(tempWorkspace, "valid");

      // Create non-markdown files that should be ignored
      writeFileSync(join(commandsDir, "config.json"), "{}");
      writeFileSync(join(commandsDir, "notes.txt"), "Some notes");
      writeFileSync(join(commandsDir, "README"), "Read me");

      const commands = await loader.loadAll();

      expect(commands).toHaveLength(1);
      expect(commands[0]?.name).toBe("valid");
    });

    it("sets correct source for project commands", async () => {
      createValidCommandFile(tempWorkspace, "my-cmd");

      const commands = await loader.loadAll();

      expect(commands[0]?.source).toBe("project");
    });

    it("includes absolute path to source file", async () => {
      createValidCommandFile(tempWorkspace, "pathtest");

      const commands = await loader.loadAll();

      expect(commands[0]?.path).toContain(".vellum");
      expect(commands[0]?.path).toContain("commands");
      expect(commands[0]?.path).toContain("pathtest.md");
    });
  });

  // ===========================================================================
  // T039.2: Load single command by name
  // ===========================================================================
  describe("load", () => {
    it("loads a specific command by name", async () => {
      createValidCommandFile(tempWorkspace, "review");
      createValidCommandFile(tempWorkspace, "deploy");

      const command = await loader.load("review");

      expect(command).not.toBeNull();
      expect(command?.name).toBe("review");
      expect(command?.description).toBe("Test command review");
    });

    it("returns null for non-existent command", async () => {
      const command = await loader.load("nonexistent");
      expect(command).toBeNull();
    });

    it("caches loaded commands", async () => {
      createValidCommandFile(tempWorkspace, "cached");

      // First load
      const cmd1 = await loader.load("cached");

      // Delete the file
      const commandsDir = join(tempWorkspace, ".vellum", "commands");
      rmSync(join(commandsDir, "cached.md"));

      // Second load should return cached version
      const cmd2 = await loader.load("cached");

      expect(cmd1).toEqual(cmd2);
    });
  });

  // ===========================================================================
  // T039.3: Handle missing .vellum/commands/ gracefully
  // ===========================================================================
  describe("missing directory", () => {
    it("handles missing .vellum/commands/ directory gracefully", async () => {
      // Don't create any directories
      const commands = await loader.loadAll();
      expect(commands).toHaveLength(0);
    });

    it("handles .vellum existing but commands/ missing", async () => {
      mkdirSync(join(tempWorkspace, ".vellum"), { recursive: true });
      // Don't create commands subdirectory

      const commands = await loader.loadAll();
      expect(commands).toHaveLength(0);
    });

    it("returns null when loading single command from missing directory", async () => {
      const command = await loader.load("any-name");
      expect(command).toBeNull();
    });
  });

  // ===========================================================================
  // T039.4: Parse frontmatter correctly
  // ===========================================================================
  describe("frontmatter parsing", () => {
    it("parses name from frontmatter", async () => {
      createValidCommandFile(tempWorkspace, "named-cmd", {
        description: "A named command",
      });

      const commands = await loader.loadAll();

      expect(commands[0]?.name).toBe("named-cmd");
    });

    it("parses description from frontmatter", async () => {
      createValidCommandFile(tempWorkspace, "described", {
        description: "This command does amazing things",
      });

      const commands = await loader.loadAll();

      expect(commands[0]?.description).toBe("This command does amazing things");
    });

    it("parses badge from frontmatter", async () => {
      createValidCommandFile(tempWorkspace, "badged", {
        description: "Badged command",
        badge: "[pro]",
      });

      const commands = await loader.loadAll();

      expect(commands[0]?.badge).toBe("[pro]");
    });

    it("uses default badge when not specified", async () => {
      createValidCommandFile(tempWorkspace, "default-badge", {
        description: "No badge specified",
      });

      const commands = await loader.loadAll();

      expect(commands[0]?.badge).toBe("[custom]");
    });

    it("parses triggers from frontmatter", async () => {
      createCommandWithTriggers(tempWorkspace, "triggered", [
        { pattern: "review", type: "keyword" },
        { pattern: "^fix\\s", type: "regex" },
      ]);

      const commands = await loader.loadAll();

      expect(commands[0]?.triggers).toHaveLength(2);
      expect(commands[0]?.triggers?.[0]).toEqual({
        pattern: "review",
        type: "keyword",
      });
      expect(commands[0]?.triggers?.[1]).toEqual({
        pattern: "^fix\\s",
        type: "regex",
      });
    });

    it("extracts content body from markdown", async () => {
      createValidCommandFile(tempWorkspace, "body-test", {
        description: "Test body extraction",
      });

      const commands = await loader.loadAll();

      expect(commands[0]?.content).toContain("This is the content");
      expect(commands[0]?.content).toContain("Do something useful");
    });

    it("skips commands with invalid frontmatter", async () => {
      createValidCommandFile(tempWorkspace, "valid");
      createCorruptCommandFile(tempWorkspace, "corrupt");

      const commands = await loader.loadAll();

      expect(commands).toHaveLength(1);
      expect(commands[0]?.name).toBe("valid");
    });
  });

  // ===========================================================================
  // T039.5: Detect conflicts with builtin commands
  // ===========================================================================
  describe("builtin conflicts", () => {
    it("detects when custom command overrides a builtin", async () => {
      // Create command that conflicts with builtin "help"
      const commandsDir = join(tempWorkspace, ".vellum", "commands");
      mkdirSync(commandsDir, { recursive: true });

      writeFileSync(
        join(commandsDir, "help.md"),
        `---
name: help
description: Custom help command
---
My custom help.`
      );

      await loader.loadAll();
      const conflicts = loader.getConflicts();

      expect(conflicts).toContain("help");
    });

    it("detects multiple builtin conflicts", async () => {
      const commandsDir = join(tempWorkspace, ".vellum", "commands");
      mkdirSync(commandsDir, { recursive: true });

      // Create commands that conflict with builtins
      for (const name of ["clear", "exit", "mode"]) {
        writeFileSync(
          join(commandsDir, `${name}.md`),
          `---
name: ${name}
description: Custom ${name}
---
Custom ${name} content.`
        );
      }

      await loader.loadAll();
      const conflicts = loader.getConflicts();

      expect(conflicts).toContain("clear");
      expect(conflicts).toContain("exit");
      expect(conflicts).toContain("mode");
    });

    it("returns empty conflicts for non-conflicting commands", async () => {
      createValidCommandFile(tempWorkspace, "my-custom-cmd");
      createValidCommandFile(tempWorkspace, "another-cmd");

      await loader.loadAll();
      const conflicts = loader.getConflicts();

      expect(conflicts).toHaveLength(0);
    });

    it("still loads conflicting commands (override behavior)", async () => {
      const commandsDir = join(tempWorkspace, ".vellum", "commands");
      mkdirSync(commandsDir, { recursive: true });

      writeFileSync(
        join(commandsDir, "help.md"),
        `---
name: help
description: Custom help
---
Custom help content.`
      );

      const commands = await loader.loadAll();

      // Command should still be loaded (allows override)
      expect(commands.some((c) => c.name === "help")).toBe(true);
    });
  });

  // ===========================================================================
  // T039.6: Cache clearing works
  // ===========================================================================
  describe("clearCache", () => {
    it("clears the loaded command cache", async () => {
      createValidCommandFile(tempWorkspace, "cached-cmd");

      // Load to populate cache
      await loader.load("cached-cmd");

      // Clear cache
      loader.clearCache();

      // Delete the file
      const commandsDir = join(tempWorkspace, ".vellum", "commands");
      rmSync(join(commandsDir, "cached-cmd.md"));

      // Load again - should not find it since cache is cleared
      const command = await loader.load("cached-cmd");

      expect(command).toBeNull();
    });

    it("clears conflicts list", async () => {
      const commandsDir = join(tempWorkspace, ".vellum", "commands");
      mkdirSync(commandsDir, { recursive: true });

      writeFileSync(
        join(commandsDir, "help.md"),
        `---
name: help
description: Custom help
---
Help content.`
      );

      await loader.loadAll();
      expect(loader.getConflicts()).toContain("help");

      loader.clearCache();

      expect(loader.getConflicts()).toHaveLength(0);
    });

    it("allows reloading after cache clear", async () => {
      createValidCommandFile(tempWorkspace, "reloadable", {
        description: "First version",
      });

      // Load first version
      let commands = await loader.loadAll();
      expect(commands[0]?.description).toBe("First version");

      // Update the file
      const commandsDir = join(tempWorkspace, ".vellum", "commands");
      writeFileSync(
        join(commandsDir, "reloadable.md"),
        `---
name: reloadable
description: Second version
---
Updated content.`
      );

      // Clear cache and reload
      loader.clearCache();
      commands = await loader.loadAll();

      expect(commands[0]?.description).toBe("Second version");
    });
  });

  // ===========================================================================
  // Additional Edge Cases
  // ===========================================================================
  describe("edge cases", () => {
    it("handles empty markdown files", async () => {
      const commandsDir = join(tempWorkspace, ".vellum", "commands");
      mkdirSync(commandsDir, { recursive: true });

      writeFileSync(join(commandsDir, "empty.md"), "");

      const commands = await loader.loadAll();

      // Should skip invalid/empty files
      expect(commands).toHaveLength(0);
    });

    it("handles file without frontmatter delimiters", async () => {
      const commandsDir = join(tempWorkspace, ".vellum", "commands");
      mkdirSync(commandsDir, { recursive: true });

      writeFileSync(
        join(commandsDir, "no-frontmatter.md"),
        "Just some content without any YAML frontmatter."
      );

      const commands = await loader.loadAll();

      // Should skip files without valid frontmatter
      expect(commands).toHaveLength(0);
    });

    it("handles command names with hyphens", async () => {
      createValidCommandFile(tempWorkspace, "multi-word-command");

      const commands = await loader.loadAll();

      expect(commands[0]?.name).toBe("multi-word-command");
    });

    it("handles concurrent loadAll calls", async () => {
      createValidCommandFile(tempWorkspace, "cmd1");
      createValidCommandFile(tempWorkspace, "cmd2");

      // Call loadAll concurrently
      const [result1, result2] = await Promise.all([loader.loadAll(), loader.loadAll()]);

      // Both should return same results
      expect(result1.length).toBe(result2.length);
    });
  });
});
