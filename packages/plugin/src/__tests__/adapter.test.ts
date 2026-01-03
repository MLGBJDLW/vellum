/**
 * Unit tests for Command Adapter
 *
 * Tests for T016 - adapter functionality
 *
 * @module plugin/__tests__/adapter.test
 */

import { describe, expect, it } from "vitest";

import {
  adaptCommands,
  adaptToSlashCommand,
  type CommandContext,
  createCommandExecutor,
  resolveCommandName,
  type SlashCommand,
  substituteArguments,
} from "../commands/adapter.js";
import type { ParsedCommand } from "../commands/parser.js";

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a minimal ParsedCommand for testing
 */
function createParsedCommand(overrides: Partial<ParsedCommand> = {}): ParsedCommand {
  return {
    name: "test-cmd",
    description: "Test command description",
    content: "Test content with $ARGUMENTS placeholder",
    filePath: "/plugins/test-plugin/commands/test-cmd.md",
    hasArgumentsVariable: true,
    ...overrides,
  };
}

/**
 * Creates a minimal CommandContext for testing
 */
function createCommandContext(rawArgs: string = ""): CommandContext {
  return {
    rawArgs,
    parsedArgs: {
      positional: [],
      named: {},
    },
  };
}

// =============================================================================
// substituteArguments Tests
// =============================================================================

describe("substituteArguments", () => {
  it("should replace $ARGUMENTS with provided args", () => {
    const content = "Analyze: $ARGUMENTS";
    const result = substituteArguments(content, "src/*.ts");
    expect(result).toBe("Analyze: src/*.ts");
  });

  it("should replace multiple $ARGUMENTS occurrences", () => {
    const content = "First: $ARGUMENTS, Second: $ARGUMENTS";
    const result = substituteArguments(content, "value");
    expect(result).toBe("First: value, Second: value");
  });

  it("should trim whitespace from args", () => {
    const content = "Analyze: $ARGUMENTS";
    const result = substituteArguments(content, "  src/*.ts  ");
    expect(result).toBe("Analyze: src/*.ts");
  });

  it("should replace $ARGUMENTS with empty string when args is empty", () => {
    const content = "Analyze: $ARGUMENTS end";
    const result = substituteArguments(content, "");
    expect(result).toBe("Analyze:  end");
  });

  it("should handle content without $ARGUMENTS", () => {
    const content = "No placeholders here";
    const result = substituteArguments(content, "ignored");
    expect(result).toBe("No placeholders here");
  });
});

// =============================================================================
// resolveCommandName Tests
// =============================================================================

describe("resolveCommandName", () => {
  it("should return original name when no collision", () => {
    const existing = new Map<string, SlashCommand>();
    const result = resolveCommandName("deploy", "my-plugin", existing);
    expect(result).toBe("deploy");
  });

  it("should return namespaced name on collision", () => {
    const existing = new Map<string, SlashCommand>([["init", { name: "init" } as SlashCommand]]);
    const result = resolveCommandName("init", "my-plugin", existing);
    expect(result).toBe("my-plugin:init");
  });

  it("should namespace with correct plugin name", () => {
    const existing = new Map<string, SlashCommand>([["build", { name: "build" } as SlashCommand]]);
    const result = resolveCommandName("build", "custom-plugin", existing);
    expect(result).toBe("custom-plugin:build");
  });

  it("should handle empty existing map", () => {
    const existing = new Map<string, SlashCommand>();
    const result = resolveCommandName("any-command", "plugin", existing);
    expect(result).toBe("any-command");
  });
});

// =============================================================================
// adaptToSlashCommand Tests
// =============================================================================

describe("adaptToSlashCommand", () => {
  it("should set kind to 'plugin'", () => {
    const parsed = createParsedCommand();
    const command = adaptToSlashCommand(parsed, "test-plugin");
    expect(command.kind).toBe("plugin");
  });

  it("should set category to 'plugin'", () => {
    const parsed = createParsedCommand();
    const command = adaptToSlashCommand(parsed, "test-plugin");
    expect(command.category).toBe("plugin");
  });

  it("should set source to plugin name", () => {
    const parsed = createParsedCommand();
    const command = adaptToSlashCommand(parsed, "my-custom-plugin");
    expect(command.source).toBe("my-custom-plugin");
  });

  it("should preserve command name", () => {
    const parsed = createParsedCommand({ name: "review" });
    const command = adaptToSlashCommand(parsed, "test-plugin");
    expect(command.name).toBe("review");
  });

  it("should preserve command description", () => {
    const parsed = createParsedCommand({ description: "Review code changes" });
    const command = adaptToSlashCommand(parsed, "test-plugin");
    expect(command.description).toBe("Review code changes");
  });

  it("should preserve argumentHint when present", () => {
    const parsed = createParsedCommand({ argumentHint: "<branch-name>" });
    const command = adaptToSlashCommand(parsed, "test-plugin");
    expect(command.argumentHint).toBe("<branch-name>");
  });

  it("should not set argumentHint when not present", () => {
    const parsed = createParsedCommand({ argumentHint: undefined });
    const command = adaptToSlashCommand(parsed, "test-plugin");
    expect(command.argumentHint).toBeUndefined();
  });

  it("should create executable command", () => {
    const parsed = createParsedCommand();
    const command = adaptToSlashCommand(parsed, "test-plugin");
    expect(typeof command.execute).toBe("function");
  });

  it("should produce valid SlashCommand shape", () => {
    const parsed = createParsedCommand({
      name: "deploy",
      description: "Deploy to production",
      argumentHint: "<env>",
    });

    const command = adaptToSlashCommand(parsed, "deploy-plugin");

    // Verify all required SlashCommand properties
    expect(command).toHaveProperty("name");
    expect(command).toHaveProperty("description");
    expect(command).toHaveProperty("kind");
    expect(command).toHaveProperty("category");
    expect(command).toHaveProperty("execute");

    // Verify types
    expect(typeof command.name).toBe("string");
    expect(typeof command.description).toBe("string");
    expect(typeof command.kind).toBe("string");
    expect(typeof command.category).toBe("string");
    expect(typeof command.execute).toBe("function");
  });
});

// =============================================================================
// createCommandExecutor Tests
// =============================================================================

describe("createCommandExecutor", () => {
  it("should return async function", () => {
    const parsed = createParsedCommand();
    const executor = createCommandExecutor(parsed);
    expect(typeof executor).toBe("function");
  });

  it("should substitute $ARGUMENTS when hasArgumentsVariable is true", async () => {
    const parsed = createParsedCommand({
      content: "Review branch: $ARGUMENTS",
      hasArgumentsVariable: true,
    });

    const executor = createCommandExecutor(parsed);
    const ctx = createCommandContext("feature/new-ui");
    const result = await executor(ctx);

    expect(result.kind).toBe("success");
    expect(result.message).toBe("Review branch: feature/new-ui");
  });

  it("should not substitute when hasArgumentsVariable is false", async () => {
    const parsed = createParsedCommand({
      content: "Fixed content without $ARGUMENTS",
      hasArgumentsVariable: false,
    });

    const executor = createCommandExecutor(parsed);
    const ctx = createCommandContext("ignored-args");
    const result = await executor(ctx);

    expect(result.kind).toBe("success");
    expect(result.message).toBe("Fixed content without $ARGUMENTS");
  });

  it("should include allowedTools from parsed command", async () => {
    const parsed = createParsedCommand({
      allowedTools: ["read_file", "grep_search"],
      content: "Test",
      hasArgumentsVariable: false,
    });

    const executor = createCommandExecutor(parsed);
    const ctx = createCommandContext();
    const result = await executor(ctx);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data).toHaveProperty("allowedTools", ["read_file", "grep_search"]);
    }
  });

  it("should fallback to context allowedTools when command has none", async () => {
    const parsed = createParsedCommand({
      allowedTools: undefined,
      content: "Test",
      hasArgumentsVariable: false,
    });

    const executor = createCommandExecutor(parsed);
    const ctx: CommandContext = {
      rawArgs: "",
      parsedArgs: { positional: [], named: {} },
      allowedTools: ["tool1", "tool2"],
    };
    const result = await executor(ctx);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data).toHaveProperty("allowedTools", ["tool1", "tool2"]);
    }
  });

  it("should include source file path in result data", async () => {
    const parsed = createParsedCommand({
      filePath: "/plugins/my-plugin/commands/review.md",
      content: "Test",
      hasArgumentsVariable: false,
    });

    const executor = createCommandExecutor(parsed);
    const ctx = createCommandContext();
    const result = await executor(ctx);

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data).toHaveProperty("source", "/plugins/my-plugin/commands/review.md");
    }
  });
});

// =============================================================================
// adaptCommands Tests
// =============================================================================

describe("adaptCommands", () => {
  it("should adapt multiple commands", () => {
    const parsed = [createParsedCommand({ name: "cmd1" }), createParsedCommand({ name: "cmd2" })];

    const existing = new Map<string, SlashCommand>();
    const commands = adaptCommands(parsed, "my-plugin", existing);

    expect(commands).toHaveLength(2);
    expect(commands[0]!.name).toBe("cmd1");
    expect(commands[1]!.name).toBe("cmd2");
  });

  it("should resolve name collisions with namespacing", () => {
    const parsed = [createParsedCommand({ name: "init" }), createParsedCommand({ name: "deploy" })];

    const existing = new Map<string, SlashCommand>([["init", { name: "init" } as SlashCommand]]);

    const commands = adaptCommands(parsed, "my-plugin", existing);

    expect(commands[0]!.name).toBe("my-plugin:init"); // Namespaced
    expect(commands[1]!.name).toBe("deploy"); // No collision
  });

  it("should set kind: plugin for all commands", () => {
    const parsed = [createParsedCommand({ name: "cmd1" }), createParsedCommand({ name: "cmd2" })];

    const existing = new Map<string, SlashCommand>();
    const commands = adaptCommands(parsed, "my-plugin", existing);

    for (const cmd of commands) {
      expect(cmd.kind).toBe("plugin");
    }
  });

  it("should set source for all commands", () => {
    const parsed = [createParsedCommand({ name: "cmd1" }), createParsedCommand({ name: "cmd2" })];

    const existing = new Map<string, SlashCommand>();
    const commands = adaptCommands(parsed, "custom-plugin", existing);

    for (const cmd of commands) {
      expect(cmd.source).toBe("custom-plugin");
    }
  });

  it("should handle empty command array", () => {
    const parsed: ParsedCommand[] = [];
    const existing = new Map<string, SlashCommand>();
    const commands = adaptCommands(parsed, "my-plugin", existing);

    expect(commands).toHaveLength(0);
  });

  it("should preserve all command properties after adaptation", () => {
    const parsed = [
      createParsedCommand({
        name: "review",
        description: "Review code",
        argumentHint: "<branch>",
        allowedTools: ["git", "read_file"],
      }),
    ];

    const existing = new Map<string, SlashCommand>();
    const commands = adaptCommands(parsed, "my-plugin", existing);

    expect(commands[0]!.name).toBe("review");
    expect(commands[0]!.description).toBe("Review code");
    expect(commands[0]!.argumentHint).toBe("<branch>");
    expect(commands[0]!.kind).toBe("plugin");
    expect(commands[0]!.category).toBe("plugin");
    expect(commands[0]!.source).toBe("my-plugin");
  });
});
