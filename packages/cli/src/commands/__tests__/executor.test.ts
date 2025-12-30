/**
 * CommandExecutor Unit Tests
 *
 * Tests for the command executor including:
 * - Successful command execution
 * - Unknown command handling with suggestions
 * - Argument validation (required, type)
 * - Context creation
 *
 * @module cli/commands/__tests__/executor
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { type CommandContextProvider, CommandExecutor } from "../executor.js";
import { CommandRegistry } from "../registry.js";
import type {
  CommandCategory,
  CommandContext,
  CommandKind,
  ParsedArgs,
  SlashCommand,
} from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock SlashCommand for testing
 */
function createMockCommand(overrides: Partial<SlashCommand> & { name: string }): SlashCommand {
  return {
    description: `Mock command: ${overrides.name}`,
    kind: "builtin" as CommandKind,
    category: "system" as CommandCategory,
    execute: async () => ({ kind: "success" as const }),
    ...overrides,
  };
}

/**
 * Create a mock CommandContextProvider
 */
function createMockContextProvider(): CommandContextProvider {
  return {
    createContext(parsedArgs: ParsedArgs, signal?: AbortSignal): CommandContext {
      return {
        session: {
          id: "test-session",
          provider: "anthropic",
          cwd: "/test/cwd",
        },
        credentials: {} as CommandContext["credentials"],
        toolRegistry: {} as CommandContext["toolRegistry"],
        parsedArgs,
        signal,
        emit: vi.fn(),
      };
    },
  };
}

// =============================================================================
// CommandExecutor Tests
// =============================================================================

describe("CommandExecutor", () => {
  let registry: CommandRegistry;
  let contextProvider: CommandContextProvider;
  let executor: CommandExecutor;

  beforeEach(() => {
    registry = new CommandRegistry();
    contextProvider = createMockContextProvider();
    executor = new CommandExecutor(registry, contextProvider);
  });

  // ===========================================================================
  // Basic Execution
  // ===========================================================================

  describe("execute known command", () => {
    it("should execute a simple command and return success", async () => {
      const helpCommand = createMockCommand({
        name: "help",
        execute: async () => ({ kind: "success", message: "Help displayed" }),
      });
      registry.register(helpCommand);

      const result = await executor.execute("/help");

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toBe("Help displayed");
      }
    });

    it("should pass parsed args to command", async () => {
      let capturedArgs: ParsedArgs | undefined;

      const loginCommand = createMockCommand({
        name: "login",
        positionalArgs: [
          { name: "provider", type: "string", description: "Provider", required: false },
        ],
        namedArgs: [
          { name: "store", shorthand: "s", type: "string", description: "Store", required: false },
        ],
        execute: async (ctx) => {
          capturedArgs = ctx.parsedArgs;
          return { kind: "success" };
        },
      });
      registry.register(loginCommand);

      await executor.execute("/login anthropic --store keychain");

      expect(capturedArgs).toBeDefined();
      expect(capturedArgs?.command).toBe("login");
      expect(capturedArgs?.positional[0]).toBe("anthropic");
      expect(capturedArgs?.named.store).toBe("keychain");
    });

    it("should pass abort signal to context", async () => {
      let capturedSignal: AbortSignal | undefined;

      const longCommand = createMockCommand({
        name: "long",
        execute: async (ctx) => {
          capturedSignal = ctx.signal;
          return { kind: "success" };
        },
      });
      registry.register(longCommand);

      const controller = new AbortController();
      await executor.execute("/long", controller.signal);

      expect(capturedSignal).toBe(controller.signal);
    });

    it("should return error result from command execution", async () => {
      const failingCommand = createMockCommand({
        name: "fail",
        execute: async () => ({
          kind: "error",
          code: "INTERNAL_ERROR",
          message: "Command failed",
        }),
      });
      registry.register(failingCommand);

      const result = await executor.execute("/fail");

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.code).toBe("INTERNAL_ERROR");
        expect(result.message).toBe("Command failed");
      }
    });

    it("should catch and wrap thrown errors", async () => {
      const throwingCommand = createMockCommand({
        name: "throw",
        execute: async () => {
          throw new Error("Unexpected error");
        },
      });
      registry.register(throwingCommand);

      const result = await executor.execute("/throw");

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.code).toBe("INTERNAL_ERROR");
        expect(result.message).toBe("Unexpected error");
      }
    });
  });

  // ===========================================================================
  // T020: Unknown Command Handling
  // ===========================================================================

  describe("unknown command handling", () => {
    beforeEach(() => {
      // Register some commands for suggestion testing
      registry.register(createMockCommand({ name: "help", aliases: ["h"] }));
      registry.register(createMockCommand({ name: "history" }));
      registry.register(createMockCommand({ name: "login" }));
      registry.register(createMockCommand({ name: "logout" }));
      registry.register(createMockCommand({ name: "list" }));
    });

    it("should return COMMAND_NOT_FOUND for unknown command", async () => {
      const result = await executor.execute("/unknown");

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.code).toBe("COMMAND_NOT_FOUND");
        expect(result.message).toContain("unknown");
      }
    });

    it("should include suggestions for similar commands", async () => {
      const result = await executor.execute("/hel");

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.code).toBe("COMMAND_NOT_FOUND");
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions).toContain("/help");
      }
    });

    it("should suggest commands with small edit distance", async () => {
      const result = await executor.execute("/logn");

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions?.some((s) => s === "/login" || s === "/logout")).toBe(true);
      }
    });

    it("should return at most 3 suggestions", async () => {
      const result = await executor.execute("/l");

      expect(result.kind).toBe("error");
      if (result.kind === "error" && result.suggestions) {
        expect(result.suggestions.length).toBeLessThanOrEqual(3);
      }
    });

    it("should include helpCommand in error", async () => {
      const result = await executor.execute("/xyz");

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.helpCommand).toBe("/help");
      }
    });
  });

  // ===========================================================================
  // T021: Argument Validation
  // ===========================================================================

  describe("argument validation", () => {
    describe("required positional arguments", () => {
      it("should return MISSING_ARGUMENT when required positional is missing", async () => {
        const command = createMockCommand({
          name: "test",
          positionalArgs: [
            { name: "target", type: "string", description: "Target", required: true },
          ],
        });
        registry.register(command);

        const result = await executor.execute("/test");

        expect(result.kind).toBe("error");
        if (result.kind === "error") {
          expect(result.code).toBe("MISSING_ARGUMENT");
          expect(result.message).toContain("target");
        }
      });

      it("should pass when required positional is provided", async () => {
        const command = createMockCommand({
          name: "test",
          positionalArgs: [
            { name: "target", type: "string", description: "Target", required: true },
          ],
        });
        registry.register(command);

        const result = await executor.execute("/test myvalue");

        expect(result.kind).toBe("success");
      });

      it("should use default when optional positional is missing", async () => {
        let capturedValue: unknown;

        const command = createMockCommand({
          name: "test",
          positionalArgs: [
            {
              name: "target",
              type: "string",
              description: "Target",
              required: false,
              default: "defaultval",
            },
          ],
          execute: async (ctx) => {
            capturedValue = ctx.parsedArgs.positional[0];
            return { kind: "success" };
          },
        });
        registry.register(command);

        await executor.execute("/test");

        expect(capturedValue).toBe("defaultval");
      });
    });

    describe("required named arguments", () => {
      it("should return MISSING_ARGUMENT when required named is missing", async () => {
        const command = createMockCommand({
          name: "test",
          namedArgs: [{ name: "config", type: "string", description: "Config", required: true }],
        });
        registry.register(command);

        const result = await executor.execute("/test");

        expect(result.kind).toBe("error");
        if (result.kind === "error") {
          expect(result.code).toBe("MISSING_ARGUMENT");
          expect(result.message).toContain("config");
        }
      });

      it("should pass when required named is provided", async () => {
        const command = createMockCommand({
          name: "test",
          namedArgs: [{ name: "config", type: "string", description: "Config", required: true }],
        });
        registry.register(command);

        const result = await executor.execute("/test --config myconfig");

        expect(result.kind).toBe("success");
      });

      it("should accept shorthand for named args", async () => {
        let capturedValue: unknown;

        const command = createMockCommand({
          name: "test",
          namedArgs: [
            {
              name: "config",
              shorthand: "c",
              type: "string",
              description: "Config",
              required: true,
            },
          ],
          execute: async (ctx) => {
            capturedValue = ctx.parsedArgs.named.config;
            return { kind: "success" };
          },
        });
        registry.register(command);

        await executor.execute("/test -c myconfig");

        expect(capturedValue).toBe("myconfig");
      });
    });

    describe("type validation", () => {
      it("should coerce number type", async () => {
        let capturedValue: unknown;

        const command = createMockCommand({
          name: "test",
          positionalArgs: [{ name: "count", type: "number", description: "Count", required: true }],
          execute: async (ctx) => {
            capturedValue = ctx.parsedArgs.positional[0];
            return { kind: "success" };
          },
        });
        registry.register(command);

        await executor.execute("/test 42");

        expect(capturedValue).toBe(42);
        expect(typeof capturedValue).toBe("number");
      });

      it("should coerce boolean type from string", async () => {
        let capturedValue: unknown;

        const command = createMockCommand({
          name: "test",
          namedArgs: [
            { name: "verbose", type: "boolean", description: "Verbose", required: false },
          ],
          execute: async (ctx) => {
            capturedValue = ctx.parsedArgs.named.verbose;
            return { kind: "success" };
          },
        });
        registry.register(command);

        await executor.execute("/test --verbose true");

        expect(capturedValue).toBe(true);
      });

      it("should validate path type as non-empty string", async () => {
        const command = createMockCommand({
          name: "test",
          positionalArgs: [{ name: "file", type: "path", description: "File", required: true }],
        });
        registry.register(command);

        const result = await executor.execute("/test /path/to/file");

        expect(result.kind).toBe("success");
      });

      it("should return ARGUMENT_TYPE_ERROR for invalid number", async () => {
        const command = createMockCommand({
          name: "test",
          positionalArgs: [{ name: "count", type: "number", description: "Count", required: true }],
        });
        registry.register(command);

        const result = await executor.execute("/test notanumber");

        expect(result.kind).toBe("error");
        if (result.kind === "error") {
          expect(result.code).toBe("ARGUMENT_TYPE_ERROR");
        }
      });
    });

    describe("help command reference", () => {
      it("should include helpCommand in validation errors", async () => {
        const command = createMockCommand({
          name: "mycommand",
          positionalArgs: [
            { name: "target", type: "string", description: "Target", required: true },
          ],
        });
        registry.register(command);

        const result = await executor.execute("/mycommand");

        expect(result.kind).toBe("error");
        if (result.kind === "error") {
          expect(result.helpCommand).toBe("/help mycommand");
        }
      });
    });
  });

  // ===========================================================================
  // Parse Errors
  // ===========================================================================

  describe("parse errors", () => {
    it("should return parse error for invalid input", async () => {
      const result = await executor.execute("not a command");

      expect(result.kind).toBe("error");
    });

    it("should return error for empty command", async () => {
      const result = await executor.execute("/");

      expect(result.kind).toBe("error");
    });
  });

  // ===========================================================================
  // Alias Resolution
  // ===========================================================================

  describe("alias resolution", () => {
    it("should execute command via alias", async () => {
      const helpCommand = createMockCommand({
        name: "help",
        aliases: ["h", "?"],
        execute: async () => ({ kind: "success", message: "Help via alias" }),
      });
      registry.register(helpCommand);

      const result = await executor.execute("/h");

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toBe("Help via alias");
      }
    });
  });
});
