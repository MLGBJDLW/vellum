/**
 * Auth Commands Integration Tests
 *
 * Tests for auth migration including:
 * - /login returns interactive prompt for API key
 * - /login --store keychain uses specified store
 * - /logout without --force returns confirmation prompt
 * - /logout --force returns success
 * - /credentials lists available stores
 *
 * @module cli/commands/__tests__/auth
 */

import { describe, expect, it, vi } from "vitest";

import {
  fromSlashCommandResult,
  type LegacySlashCommandResult,
  toSlashCommandResult,
  wrapLegacyHandler,
} from "../adapters.js";
import { authCommand, credentialsCommand } from "../auth.js";
import type {
  CommandContext,
  CommandError,
  CommandInteractive,
  CommandResult,
  CommandSuccess,
  ParsedArgs,
} from "../types.js";
import { extractCommandName, isSlashCommand, maskValue, parseCommandInput } from "../utils.js";

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Mock context options for testing
 */
interface MockContextOptions {
  parsedArgs?: Partial<ParsedArgs>;
  session?: Partial<CommandContext["session"]>;
}

/**
 * Create a mock CommandContext for testing
 */
function createMockContext(options: MockContextOptions = {}): CommandContext {
  const { parsedArgs = {}, session = {} } = options;
  return {
    session: {
      id: session.id ?? "test-session",
      provider: session.provider ?? "anthropic",
      cwd: session.cwd ?? "/test",
    },
    credentials: {
      resolve: vi.fn(),
      store: vi.fn().mockResolvedValue({
        ok: true,
        value: { source: "keychain", provider: "anthropic" },
      }),
      delete: vi.fn().mockResolvedValue({ ok: true, value: 1 }),
      list: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          { provider: "anthropic", source: "keychain", type: "api_key", maskedHint: "sk-1...xyz" },
        ],
      }),
      exists: vi.fn().mockResolvedValue({ ok: true, value: false }),
      getStoreAvailability: vi.fn().mockResolvedValue({
        env: true,
        keychain: true,
        "encrypted-file": false,
      }),
    } as unknown as CommandContext["credentials"],
    toolRegistry: {
      get: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["toolRegistry"],
    parsedArgs: {
      command: parsedArgs.command ?? "test",
      positional: parsedArgs.positional ?? [],
      named: parsedArgs.named ?? {},
      raw: parsedArgs.raw ?? "/test",
    },
    emit: vi.fn(),
  };
}

// =============================================================================
// T032: toSlashCommandResult Tests
// =============================================================================

describe("toSlashCommandResult", () => {
  it("should convert success result to legacy format", () => {
    const result: CommandSuccess = {
      kind: "success",
      message: "Operation completed",
      data: { foo: "bar" },
    };

    const legacy = toSlashCommandResult(result);

    expect(legacy.success).toBe(true);
    expect(legacy.message).toBe("Operation completed");
    expect(legacy.data).toEqual({ foo: "bar" });
  });

  it("should convert error result to legacy format", () => {
    const result: CommandError = {
      kind: "error",
      code: "INVALID_ARGUMENT",
      message: "Invalid input",
      suggestions: ["Try again"],
    };

    const legacy = toSlashCommandResult(result);

    expect(legacy.success).toBe(false);
    expect(legacy.message).toBe("Invalid input");
    expect(legacy.data?.code).toBe("INVALID_ARGUMENT");
  });

  it("should convert interactive result to legacy promptForInput", () => {
    const handler = vi.fn().mockResolvedValue({ kind: "success" });
    const result: CommandInteractive = {
      kind: "interactive",
      prompt: {
        inputType: "password",
        message: "Enter API key",
        placeholder: "sk-...",
        provider: "anthropic",
        handler,
      },
    };

    const legacy = toSlashCommandResult(result);

    expect(legacy.success).toBe(true);
    expect(legacy.message).toBe("Enter API key");
    expect(legacy.promptForInput).toBeDefined();
    expect(legacy.promptForInput?.type).toBe("api_key");
    expect(legacy.promptForInput?.provider).toBe("anthropic");
  });

  it("should handle confirm interactive without promptForInput", () => {
    const result: CommandInteractive = {
      kind: "interactive",
      prompt: {
        inputType: "confirm",
        message: "Are you sure?",
        handler: vi.fn(),
      },
    };

    const legacy = toSlashCommandResult(result);

    expect(legacy.success).toBe(true);
    expect(legacy.message).toBe("Are you sure?");
    expect(legacy.promptForInput).toBeUndefined();
  });
});

// =============================================================================
// T033: fromSlashCommandResult Tests
// =============================================================================

describe("fromSlashCommandResult", () => {
  it("should convert legacy success to new format", () => {
    const legacy: LegacySlashCommandResult = {
      success: true,
      message: "Done",
      data: { key: "value" },
    };

    const result = fromSlashCommandResult(legacy);

    expect(result.kind).toBe("success");
    expect((result as CommandSuccess).message).toBe("Done");
    expect((result as CommandSuccess).data).toEqual({ key: "value" });
  });

  it("should convert legacy error to new format", () => {
    const legacy: LegacySlashCommandResult = {
      success: false,
      message: "Failed",
      data: { code: "INVALID_ARGUMENT" },
    };

    const result = fromSlashCommandResult(legacy);

    expect(result.kind).toBe("error");
    expect((result as CommandError).code).toBe("INVALID_ARGUMENT");
    expect((result as CommandError).message).toBe("Failed");
  });

  it("should convert legacy promptForInput to interactive", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true, message: "Saved" });
    const legacy: LegacySlashCommandResult = {
      success: true,
      message: "Enter API key",
      promptForInput: {
        type: "api_key",
        provider: "anthropic",
        placeholder: "sk-...",
        onSubmit,
      },
    };

    const result = fromSlashCommandResult(legacy);

    expect(result.kind).toBe("interactive");
    const interactive = result as CommandInteractive;
    expect(interactive.prompt.inputType).toBe("password");
    expect(interactive.prompt.message).toBe("Enter API key");
    expect(interactive.prompt.provider).toBe("anthropic");

    // Test handler calls through to onSubmit
    const handlerResult = await interactive.prompt.handler("test-key");
    expect(onSubmit).toHaveBeenCalledWith("test-key");
    expect(handlerResult.kind).toBe("success");
  });
});

// =============================================================================
// T034A: wrapLegacyHandler Tests
// =============================================================================

describe("wrapLegacyHandler", () => {
  it("should wrap legacy handler and convert result", async () => {
    const legacyHandler = vi.fn().mockResolvedValue({
      success: true,
      message: "Legacy success",
    });

    const wrappedHandler = wrapLegacyHandler(legacyHandler);
    const ctx = createMockContext({
      parsedArgs: { positional: ["anthropic"] },
    });

    const result = await wrappedHandler(ctx);

    expect(legacyHandler).toHaveBeenCalledWith(
      ["anthropic"],
      expect.objectContaining({
        currentProvider: "anthropic",
      })
    );
    expect(result.kind).toBe("success");
    expect((result as CommandSuccess).message).toBe("Legacy success");
  });

  it("should pass credentials from context to legacy handler", async () => {
    const legacyHandler = vi.fn().mockResolvedValue({
      success: true,
      message: "Done",
    });

    const wrappedHandler = wrapLegacyHandler(legacyHandler);
    const ctx = createMockContext();

    await wrappedHandler(ctx);

    expect(legacyHandler).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        credentialManager: ctx.credentials,
      })
    );
  });
});

// =============================================================================
// T034B: isSlashCommand Tests
// =============================================================================

describe("isSlashCommand", () => {
  it("should return true for valid slash commands", () => {
    expect(isSlashCommand("/help")).toBe(true);
    expect(isSlashCommand("/login")).toBe(true);
    expect(isSlashCommand("  /login")).toBe(true);
    expect(isSlashCommand("/a")).toBe(true);
    expect(isSlashCommand("//comment")).toBe(true);
  });

  it("should return false for empty or whitespace", () => {
    expect(isSlashCommand("")).toBe(false);
    expect(isSlashCommand("   ")).toBe(false);
  });

  it("should return false for just slash", () => {
    expect(isSlashCommand("/")).toBe(false);
    expect(isSlashCommand("  /  ")).toBe(false);
  });

  it("should return false for non-slash input", () => {
    expect(isSlashCommand("hello")).toBe(false);
    expect(isSlashCommand("hello /world")).toBe(false);
  });

  it("should handle edge cases", () => {
    expect(isSlashCommand(null as unknown as string)).toBe(false);
    expect(isSlashCommand(undefined as unknown as string)).toBe(false);
    expect(isSlashCommand("/ space")).toBe(false);
  });
});

describe("extractCommandName", () => {
  it("should extract command name from slash command", () => {
    expect(extractCommandName("/help")).toBe("help");
    expect(extractCommandName("/login anthropic")).toBe("login");
    expect(extractCommandName("  /logout  ")).toBe("logout");
  });

  it("should return null for non-slash input", () => {
    expect(extractCommandName("hello")).toBeNull();
    expect(extractCommandName("")).toBeNull();
  });
});

describe("parseCommandInput", () => {
  it("should parse command and args", () => {
    const result = parseCommandInput("/login anthropic --store keychain");

    expect(result).toEqual({
      command: "login",
      args: ["anthropic", "--store", "keychain"],
    });
  });

  it("should return null for invalid input", () => {
    expect(parseCommandInput("not a command")).toBeNull();
  });
});

describe("maskValue", () => {
  it("should mask long values", () => {
    expect(maskValue("sk-1234567890abcdef")).toBe("sk-1...cdef");
  });

  it("should fully mask short values", () => {
    expect(maskValue("short")).toBe("*****");
    expect(maskValue("ab")).toBe("****");
  });
});

// =============================================================================
// T034: Enhanced Credentials Command Tests
// =============================================================================

describe("credentialsCommand", () => {
  it("should have correct metadata", () => {
    expect(credentialsCommand.name).toBe("credentials");
    expect(credentialsCommand.kind).toBe("builtin");
    expect(credentialsCommand.category).toBe("auth");
    expect(credentialsCommand.aliases).toContain("creds");
  });

  it("should list available stores", async () => {
    const ctx = createMockContext({
      parsedArgs: { positional: [], named: {} },
    });

    const result = await credentialsCommand.execute(ctx);

    expect(result.kind).toBe("success");
    const success = result as CommandSuccess;
    expect(success.message).toContain("Storage Backends");
    expect(success.message).toContain("keychain");
    expect(success.data).toHaveProperty("availability");
  });

  it("should list credentials", async () => {
    const ctx = createMockContext({
      parsedArgs: { positional: [], named: {} },
    });

    const result = await credentialsCommand.execute(ctx);

    expect(result.kind).toBe("success");
    const success = result as CommandSuccess;
    expect(success.message).toContain("anthropic");
    expect(success.data).toHaveProperty("credentials");
  });

  it("should filter by provider when specified", async () => {
    const ctx = createMockContext({
      parsedArgs: { positional: ["anthropic"], named: {} },
    });

    await credentialsCommand.execute(ctx);

    expect(ctx.credentials.list).toHaveBeenCalledWith("anthropic");
  });

  it("should show message when no credentials found", async () => {
    const ctx = createMockContext({
      parsedArgs: { positional: [], named: {} },
    });
    (ctx.credentials.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      value: [],
    });

    const result = await credentialsCommand.execute(ctx);

    expect(result.kind).toBe("success");
    const success = result as CommandSuccess;
    expect(success.message).toContain("No credentials stored");
  });
});

// =============================================================================
// T035: Unified Auth Command Tests
// =============================================================================

describe("authCommand", () => {
  it("should have correct metadata", () => {
    expect(authCommand.name).toBe("auth");
    expect(authCommand.kind).toBe("builtin");
    expect(authCommand.category).toBe("auth");
    expect(authCommand.subcommands).toHaveLength(3);
    expect(authCommand.subcommands?.map((s) => s.name)).toEqual(["status", "set", "clear"]);
  });

  describe("/auth status", () => {
    it("should show authentication status with /auth", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: [], named: {} },
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.message).toContain("Authentication Status");
      expect(success.message).toContain("Storage Backends");
      expect(success.message).toContain("Configured Providers");
    });

    it("should show authentication status with /auth status", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["status"], named: {} },
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("success");
      const success = result as CommandSuccess;
      expect(success.message).toContain("Authentication Status");
    });

    it("should filter by provider with /auth status <provider>", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["status", "anthropic"], named: {} },
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("success");
      expect(ctx.credentials.list).toHaveBeenCalledWith("anthropic");
    });
  });

  describe("/auth set", () => {
    it("should return interactive prompt for API key", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["set", "anthropic"], named: {} },
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("interactive");
      const interactive = result as CommandInteractive;
      expect(interactive.prompt.inputType).toBe("password");
      expect(interactive.prompt.message.toLowerCase()).toContain("anthropic");
      expect(interactive.prompt.provider).toBe("anthropic");
    });

    it("should return error when no provider specified", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["set"], named: {} },
        session: { id: "test", provider: "", cwd: "/" },
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("error");
      expect((result as CommandError).code).toBe("MISSING_ARGUMENT");
    });

    it("should use session provider when not specified", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["set"], named: {} },
        session: { provider: "openai" },
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("interactive");
      const interactive = result as CommandInteractive;
      expect(interactive.prompt.provider).toBe("openai");
    });
  });

  describe("/auth clear", () => {
    it("should return confirmation prompt without --force", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["clear", "anthropic"], named: { force: false } },
      });
      (ctx.credentials.exists as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: true,
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("interactive");
      const interactive = result as CommandInteractive;
      expect(interactive.prompt.inputType).toBe("confirm");
      expect(interactive.prompt.message).toContain("Are you sure");
    });

    it("should delete immediately with --force", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["clear", "anthropic"], named: { force: true } },
      });
      (ctx.credentials.exists as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: true,
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("success");
      expect(ctx.credentials.delete).toHaveBeenCalledWith("anthropic");
    });

    it("should return error when no provider specified", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["clear"], named: {} },
        session: { id: "test", provider: "", cwd: "/" },
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("error");
      expect((result as CommandError).code).toBe("MISSING_ARGUMENT");
    });

    it("should return error when credential not found", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["clear", "unknown"], named: { force: true } },
      });
      (ctx.credentials.exists as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: false,
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("error");
      expect((result as CommandError).code).toBe("CREDENTIAL_NOT_FOUND");
    });
  });

  describe("subcommand aliases", () => {
    it("should handle 'add' as alias for 'set'", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["add", "anthropic"], named: {} },
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("interactive");
    });

    it("should handle 'remove' as alias for 'clear'", async () => {
      const ctx = createMockContext({
        parsedArgs: { positional: ["remove", "anthropic"], named: { force: true } },
      });
      (ctx.credentials.exists as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        value: true,
      });

      const result = await authCommand.execute(ctx);

      expect(result.kind).toBe("success");
    });
  });
});

// =============================================================================
// Integration: Adapter Round-Trip Tests
// =============================================================================

describe("Adapter round-trip", () => {
  it("should preserve success data through conversion", () => {
    const original: CommandResult = {
      kind: "success",
      message: "Test message",
      data: { key: "value" },
    };

    const legacy = toSlashCommandResult(original);
    const converted = fromSlashCommandResult(legacy);

    expect(converted.kind).toBe("success");
    expect((converted as CommandSuccess).message).toBe("Test message");
  });

  it("should preserve error code through conversion", () => {
    const original: CommandResult = {
      kind: "error",
      code: "AUTHENTICATION_FAILED",
      message: "Auth error",
    };

    const legacy = toSlashCommandResult(original);
    const converted = fromSlashCommandResult(legacy);

    expect(converted.kind).toBe("error");
    expect((converted as CommandError).code).toBe("AUTHENTICATION_FAILED");
  });
});
