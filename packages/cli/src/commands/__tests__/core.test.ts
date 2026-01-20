/**
 * Core Commands Integration Tests
 *
 * Tests for help, clear, and exit commands including:
 * - Help command output formatting
 * - Clear command clearScreen flag
 * - Exit command immediate exit behavior
 *
 * @module cli/commands/__tests__/core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearCommand, exitCommand, helpCommand, setHelpRegistry } from "../core/index.js";
import { CommandRegistry } from "../registry.js";
import type { CommandContext, CommandSuccess, ParsedArgs, SlashCommand } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock CommandContext for testing
 */
function createMockContext(overrides: Partial<ParsedArgs> = {}): CommandContext {
  return {
    session: {
      id: "test-session",
      provider: "anthropic",
      cwd: "/test",
    },
    credentials: {
      resolve: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["credentials"],
    toolRegistry: {
      get: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["toolRegistry"],
    parsedArgs: {
      command: overrides.command ?? "test",
      positional: overrides.positional ?? [],
      named: overrides.named ?? {},
      raw: overrides.raw ?? "/test",
    },
    emit: vi.fn(),
  };
}

/**
 * Create a mock SlashCommand for testing
 */
function createMockCommand(overrides: Partial<SlashCommand> & { name: string }): SlashCommand {
  return {
    description: `Mock command: ${overrides.name}`,
    kind: "builtin",
    category: "system",
    execute: async () => ({ kind: "success" as const }),
    ...overrides,
  };
}

// =============================================================================
// T031: Help Command Tests
// =============================================================================

describe("helpCommand", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
    setHelpRegistry(registry);
  });

  describe("/help (no arguments)", () => {
    it("should return list of all commands grouped by category", async () => {
      // Register some test commands
      registry.register(
        createMockCommand({
          name: "test1",
          category: "system",
          description: "Test system command",
        })
      );
      registry.register(
        createMockCommand({
          name: "login",
          category: "auth",
          description: "Login to a provider",
        })
      );

      const ctx = createMockContext({
        command: "help",
        positional: [],
      });

      const result = await helpCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const successResult = result as CommandSuccess;
      expect(successResult.message).toContain("Available Commands");
      expect(successResult.message).toContain("System:");
      expect(successResult.message).toContain("/test1");
      expect(successResult.message).toContain("Authentication:");
      expect(successResult.message).toContain("/login");
      expect(successResult.data).toEqual({
        type: "help-list",
        categories: expect.any(Array),
      });
    });

    it("should show command aliases", async () => {
      registry.register(
        createMockCommand({
          name: "help",
          aliases: ["h", "?"],
          description: "Show help",
        })
      );

      const ctx = createMockContext({
        command: "help",
        positional: [],
      });

      const result = await helpCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const successResult = result as CommandSuccess;
      expect(successResult.message).toContain("(h, ?)");
    });
  });

  describe("/help <command>", () => {
    it("should return detailed help for a specific command", async () => {
      registry.register(
        createMockCommand({
          name: "login",
          description: "Login to a provider",
          category: "auth",
          aliases: ["signin"],
          positionalArgs: [
            {
              name: "provider",
              type: "string",
              description: "Provider name",
              required: true,
            },
          ],
          namedArgs: [
            {
              name: "store",
              shorthand: "s",
              type: "string",
              description: "Credential store",
              required: false,
              default: "keychain",
            },
          ],
          examples: ["/login anthropic", "/login openai --store file"],
        })
      );

      const ctx = createMockContext({
        command: "help",
        positional: ["login"],
      });

      const result = await helpCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const successResult = result as CommandSuccess;
      expect(successResult.message).toContain("/login");
      expect(successResult.message).toContain("Login to a provider");
      expect(successResult.message).toContain("Aliases: /signin");
      expect(successResult.message).toContain("Category: Authentication");
      expect(successResult.message).toContain("Usage:");
      expect(successResult.message).toContain("<provider>");
      expect(successResult.message).toContain("Arguments:");
      expect(successResult.message).toContain("Options:");
      expect(successResult.message).toContain("--store");
      expect(successResult.message).toContain("-s");
      expect(successResult.message).toContain("Examples:");
      expect(successResult.data).toEqual({
        type: "help-command",
        command: "login",
      });
    });

    it("should resolve command by alias", async () => {
      registry.register(
        createMockCommand({
          name: "help",
          aliases: ["h"],
          description: "Show help",
        })
      );

      const ctx = createMockContext({
        command: "help",
        positional: ["h"],
      });

      const result = await helpCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const successResult = result as CommandSuccess;
      expect(successResult.message).toContain("/help");
      expect(successResult.data).toEqual({
        type: "help-command",
        command: "help",
      });
    });
  });

  describe("/help <category>", () => {
    it("should return commands in the specified category", async () => {
      registry.register(
        createMockCommand({
          name: "login",
          category: "auth",
          description: "Login",
        })
      );
      registry.register(
        createMockCommand({
          name: "logout",
          category: "auth",
          description: "Logout",
        })
      );

      const ctx = createMockContext({
        command: "help",
        positional: ["auth"],
      });

      const result = await helpCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const successResult = result as CommandSuccess;
      expect(successResult.message).toContain("Authentication Commands");
      expect(successResult.message).toContain("/login");
      expect(successResult.message).toContain("/logout");
      expect(successResult.data).toEqual({
        type: "help-category",
        category: "auth",
      });
    });
  });

  describe("error handling", () => {
    it("should return error for unknown command", async () => {
      const ctx = createMockContext({
        command: "help",
        positional: ["nonexistent"],
      });

      const result = await helpCommand.execute(ctx);

      expect(result.kind).toBe("error");
      expect(result).toMatchObject({
        kind: "error",
        code: "COMMAND_NOT_FOUND",
        message: expect.stringContaining("nonexistent"),
      });
    });

    it("should suggest similar commands when not found", async () => {
      registry.register(
        createMockCommand({
          name: "login",
          description: "Login",
        })
      );
      registry.register(
        createMockCommand({
          name: "logout",
          description: "Logout",
        })
      );

      const ctx = createMockContext({
        command: "help",
        positional: ["log"],
      });

      const result = await helpCommand.execute(ctx);

      expect(result.kind).toBe("error");
      expect(result).toMatchObject({
        kind: "error",
        code: "COMMAND_NOT_FOUND",
        suggestions: expect.arrayContaining(["/login", "/logout"]),
      });
    });
  });
});

// =============================================================================
// T031: Clear Command Tests
// =============================================================================

describe("clearCommand", () => {
  it("should return success with clearScreen: true", async () => {
    const ctx = createMockContext({
      command: "clear",
      positional: [],
    });

    const result = await clearCommand.execute(ctx);

    expect(result.kind).toBe("success");
    expect(result).toMatchObject({
      kind: "success",
      clearScreen: true,
    });
  });

  it("should have correct metadata", () => {
    expect(clearCommand.name).toBe("clear");
    expect(clearCommand.kind).toBe("builtin");
    expect(clearCommand.category).toBe("system");
    expect(clearCommand.aliases).toContain("cls");
  });
});

// =============================================================================
// T031: Exit Command Tests
// =============================================================================

describe("exitCommand", () => {
  it("should emit app:exit event and return success immediately", async () => {
    const ctx = createMockContext({
      command: "exit",
      positional: [],
      named: {},
    });

    const result = await exitCommand.execute(ctx);

    expect(result.kind).toBe("success");
    expect(ctx.emit).toHaveBeenCalledWith("app:exit", {
      reason: "user-command",
    });
    expect(result).toMatchObject({
      kind: "success",
      data: { exit: true },
    });
  });

  it("should have correct metadata", () => {
    expect(exitCommand.name).toBe("exit");
    expect(exitCommand.kind).toBe("builtin");
    expect(exitCommand.category).toBe("system");
    expect(exitCommand.aliases).toContain("quit");
    expect(exitCommand.aliases).toContain("q");
  });
});
