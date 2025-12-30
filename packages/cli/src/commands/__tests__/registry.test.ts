/**
 * CommandRegistry Unit Tests
 *
 * Tests for the command registry including:
 * - Registration and retrieval
 * - Alias resolution
 * - Category indexing
 * - Priority conflict resolution
 * - Search functionality
 *
 * @module cli/commands/__tests__/registry
 */

import { beforeEach, describe, expect, it } from "vitest";

import { CommandConflictError, CommandRegistry } from "../registry.js";
import type { CommandCategory, CommandKind, SlashCommand } from "../types.js";

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

// =============================================================================
// T012: CommandRegistry Tests
// =============================================================================

describe("CommandRegistry", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  // ===========================================================================
  // Basic Registration
  // ===========================================================================

  describe("register single command", () => {
    it("should register a command", () => {
      const cmd = createMockCommand({ name: "help" });

      registry.register(cmd);

      expect(registry.size).toBe(1);
    });

    it("should allow retrieving registered command", () => {
      const cmd = createMockCommand({ name: "help" });

      registry.register(cmd);
      const retrieved = registry.get("help");

      expect(retrieved).toBe(cmd);
    });

    it("should update category index on register", () => {
      const cmd = createMockCommand({
        name: "help",
        category: "system",
      });

      registry.register(cmd);
      const systemCmds = registry.getByCategory("system");

      expect(systemCmds.size).toBe(1);
      expect(systemCmds.has(cmd)).toBe(true);
    });

    it("should update alias index on register", () => {
      const cmd = createMockCommand({
        name: "help",
        aliases: ["h", "?"],
      });

      registry.register(cmd);

      expect(registry.get("h")).toBe(cmd);
      expect(registry.get("?")).toBe(cmd);
    });
  });

  // ===========================================================================
  // Get by Name
  // ===========================================================================

  describe("get by name", () => {
    it("should return command by exact name", () => {
      const cmd = createMockCommand({ name: "login" });
      registry.register(cmd);

      expect(registry.get("login")).toBe(cmd);
    });

    it("should return undefined for unknown name", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    it("should be case-sensitive", () => {
      const cmd = createMockCommand({ name: "Login" });
      registry.register(cmd);

      expect(registry.get("Login")).toBe(cmd);
      expect(registry.get("login")).toBeUndefined();
    });
  });

  // ===========================================================================
  // Get by Alias
  // ===========================================================================

  describe("get by alias", () => {
    it("should resolve alias to command", () => {
      const cmd = createMockCommand({
        name: "credentials",
        aliases: ["creds", "cred"],
      });
      registry.register(cmd);

      expect(registry.get("creds")).toBe(cmd);
      expect(registry.get("cred")).toBe(cmd);
    });

    it("should prefer direct name over alias", () => {
      const cmd1 = createMockCommand({ name: "creds" });
      const cmd2 = createMockCommand({
        name: "credentials",
        aliases: ["creds"],
        kind: "plugin", // lower priority, will be ignored
      });

      registry.register(cmd1);
      registry.register(cmd2);

      // "creds" should resolve to cmd1 (direct match), not cmd2's alias
      expect(registry.get("creds")).toBe(cmd1);
    });

    it("should return undefined for unknown alias", () => {
      const cmd = createMockCommand({
        name: "help",
        aliases: ["h"],
      });
      registry.register(cmd);

      expect(registry.get("unknown")).toBeUndefined();
    });
  });

  // ===========================================================================
  // Search (Fuzzy Match)
  // ===========================================================================

  describe("search fuzzy match", () => {
    beforeEach(() => {
      registry.register(createMockCommand({ name: "login", category: "auth" }));
      registry.register(createMockCommand({ name: "logout", category: "auth" }));
      registry.register(createMockCommand({ name: "help", category: "system" }));
      registry.register(createMockCommand({ name: "history", category: "session" }));
    });

    it("should find commands containing query", () => {
      const results = registry.search("log");

      expect(results).toHaveLength(2);
      expect(results.map((c) => c.name).sort()).toEqual(["login", "logout"]);
    });

    it("should be case-insensitive", () => {
      const results = registry.search("LOG");

      expect(results).toHaveLength(2);
    });

    it("should return empty array for no matches", () => {
      const results = registry.search("xyz");

      expect(results).toEqual([]);
    });

    it("should find partial matches", () => {
      const results = registry.search("hist");

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("history");
    });

    it("should find single character matches", () => {
      const results = registry.search("h");

      expect(results.map((c) => c.name).sort()).toEqual(["help", "history"]);
    });
  });

  // ===========================================================================
  // Priority Conflict - Lower Priority Wins
  // ===========================================================================

  describe("priority conflict (lower priority wins)", () => {
    it("should keep builtin when plugin tries to override", () => {
      const builtin = createMockCommand({ name: "help", kind: "builtin" });
      const plugin = createMockCommand({ name: "help", kind: "plugin" });

      registry.register(builtin);
      registry.register(plugin); // should be ignored

      expect(registry.get("help")).toBe(builtin);
      expect(registry.size).toBe(1);
    });

    it("should replace plugin with builtin", () => {
      const plugin = createMockCommand({ name: "help", kind: "plugin" });
      const builtin = createMockCommand({ name: "help", kind: "builtin" });

      registry.register(plugin);
      registry.register(builtin); // should replace

      expect(registry.get("help")).toBe(builtin);
      expect(registry.size).toBe(1);
    });

    it("should keep plugin when mcp tries to override", () => {
      const plugin = createMockCommand({ name: "tools", kind: "plugin" });
      const mcp = createMockCommand({ name: "tools", kind: "mcp" });

      registry.register(plugin);
      registry.register(mcp); // should be ignored

      expect(registry.get("tools")).toBe(plugin);
    });

    it("should keep mcp when user tries to override", () => {
      const mcp = createMockCommand({ name: "custom", kind: "mcp" });
      const user = createMockCommand({ name: "custom", kind: "user" });

      registry.register(mcp);
      registry.register(user); // should be ignored

      expect(registry.get("custom")).toBe(mcp);
    });

    it("should replace user with mcp", () => {
      const user = createMockCommand({ name: "custom", kind: "user" });
      const mcp = createMockCommand({ name: "custom", kind: "mcp" });

      registry.register(user);
      registry.register(mcp); // should replace

      expect(registry.get("custom")).toBe(mcp);
    });

    it("should update category index when replacing command", () => {
      const plugin = createMockCommand({
        name: "help",
        kind: "plugin",
        category: "system",
      });
      const builtin = createMockCommand({
        name: "help",
        kind: "builtin",
        category: "system",
      });

      registry.register(plugin);
      registry.register(builtin);

      const systemCmds = registry.getByCategory("system");
      expect(systemCmds.size).toBe(1);
      expect(Array.from(systemCmds)[0]).toBe(builtin);
    });

    it("should update alias index when replacing command", () => {
      const plugin = createMockCommand({
        name: "help",
        kind: "plugin",
        aliases: ["h"],
      });
      const builtin = createMockCommand({
        name: "help",
        kind: "builtin",
        aliases: ["?"],
      });

      registry.register(plugin);
      registry.register(builtin);

      expect(registry.get("?")).toBe(builtin);
      // Old alias should be removed when command is replaced
      expect(registry.get("h")).toBeUndefined();
    });
  });

  // ===========================================================================
  // Same Priority Throws Error
  // ===========================================================================

  describe("same priority throws error", () => {
    it("should throw CommandConflictError for two builtins", () => {
      const cmd1 = createMockCommand({ name: "help", kind: "builtin" });
      const cmd2 = createMockCommand({ name: "help", kind: "builtin" });

      registry.register(cmd1);

      expect(() => registry.register(cmd2)).toThrow(CommandConflictError);
    });

    it("should throw CommandConflictError for two plugins", () => {
      const cmd1 = createMockCommand({ name: "custom", kind: "plugin" });
      const cmd2 = createMockCommand({ name: "custom", kind: "plugin" });

      registry.register(cmd1);

      expect(() => registry.register(cmd2)).toThrow(CommandConflictError);
    });

    it("should throw CommandConflictError for two mcp commands", () => {
      const cmd1 = createMockCommand({ name: "mcp-cmd", kind: "mcp" });
      const cmd2 = createMockCommand({ name: "mcp-cmd", kind: "mcp" });

      registry.register(cmd1);

      expect(() => registry.register(cmd2)).toThrow(CommandConflictError);
    });

    it("should throw CommandConflictError for two user commands", () => {
      const cmd1 = createMockCommand({ name: "user-cmd", kind: "user" });
      const cmd2 = createMockCommand({ name: "user-cmd", kind: "user" });

      registry.register(cmd1);

      expect(() => registry.register(cmd2)).toThrow(CommandConflictError);
    });

    it("should include command info in error", () => {
      const cmd1 = createMockCommand({ name: "help", kind: "builtin" });
      const cmd2 = createMockCommand({ name: "help", kind: "builtin" });

      registry.register(cmd1);

      try {
        registry.register(cmd2);
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(CommandConflictError);
        const error = e as CommandConflictError;
        expect(error.existingCommand).toBe("help");
        expect(error.incomingCommand).toBe("help");
        expect(error.priority).toBe("builtin");
      }
    });
  });

  // ===========================================================================
  // Unregister
  // ===========================================================================

  describe("unregister removes from all indexes", () => {
    it("should remove command from registry", () => {
      const cmd = createMockCommand({ name: "help" });
      registry.register(cmd);

      const result = registry.unregister("help");

      expect(result).toBe(true);
      expect(registry.get("help")).toBeUndefined();
      expect(registry.size).toBe(0);
    });

    it("should return false for unknown command", () => {
      const result = registry.unregister("nonexistent");

      expect(result).toBe(false);
    });

    it("should remove from category index", () => {
      const cmd = createMockCommand({
        name: "help",
        category: "system",
      });
      registry.register(cmd);

      registry.unregister("help");

      const systemCmds = registry.getByCategory("system");
      expect(systemCmds.size).toBe(0);
    });

    it("should remove from alias index", () => {
      const cmd = createMockCommand({
        name: "help",
        aliases: ["h", "?"],
      });
      registry.register(cmd);

      registry.unregister("help");

      expect(registry.get("h")).toBeUndefined();
      expect(registry.get("?")).toBeUndefined();
    });

    it("should allow re-registering after unregister", () => {
      const cmd1 = createMockCommand({ name: "help", kind: "builtin" });
      const cmd2 = createMockCommand({ name: "help", kind: "builtin" });

      registry.register(cmd1);
      registry.unregister("help");
      registry.register(cmd2);

      expect(registry.get("help")).toBe(cmd2);
    });
  });

  // ===========================================================================
  // GetByCategory
  // ===========================================================================

  describe("getByCategory returns correct commands", () => {
    beforeEach(() => {
      registry.register(createMockCommand({ name: "help", category: "system" }));
      registry.register(createMockCommand({ name: "clear", category: "system" }));
      registry.register(createMockCommand({ name: "login", category: "auth" }));
      registry.register(createMockCommand({ name: "logout", category: "auth" }));
      registry.register(createMockCommand({ name: "history", category: "session" }));
    });

    it("should return all commands in system category", () => {
      const cmds = registry.getByCategory("system");

      expect(cmds.size).toBe(2);
      const names = Array.from(cmds).map((c) => c.name);
      expect(names.sort()).toEqual(["clear", "help"]);
    });

    it("should return all commands in auth category", () => {
      const cmds = registry.getByCategory("auth");

      expect(cmds.size).toBe(2);
      const names = Array.from(cmds).map((c) => c.name);
      expect(names.sort()).toEqual(["login", "logout"]);
    });

    it("should return empty set for category with no commands", () => {
      const cmds = registry.getByCategory("debug");

      expect(cmds.size).toBe(0);
    });

    it("should return set that can be iterated", () => {
      const cmds = registry.getByCategory("session");
      const names: string[] = [];

      for (const cmd of cmds) {
        names.push(cmd.name);
      }

      expect(names).toEqual(["history"]);
    });
  });

  // ===========================================================================
  // List
  // ===========================================================================

  describe("list", () => {
    it("should return empty array when no commands", () => {
      expect(registry.list()).toEqual([]);
    });

    it("should return all registered commands", () => {
      registry.register(createMockCommand({ name: "a" }));
      registry.register(createMockCommand({ name: "b" }));
      registry.register(createMockCommand({ name: "c" }));

      const all = registry.list();

      expect(all).toHaveLength(3);
      expect(all.map((c) => c.name).sort()).toEqual(["a", "b", "c"]);
    });
  });

  // ===========================================================================
  // Has
  // ===========================================================================

  describe("has", () => {
    it("should return true for registered command", () => {
      registry.register(createMockCommand({ name: "help" }));

      expect(registry.has("help")).toBe(true);
    });

    it("should return true for alias", () => {
      registry.register(createMockCommand({ name: "help", aliases: ["h"] }));

      expect(registry.has("h")).toBe(true);
    });

    it("should return false for unknown name", () => {
      expect(registry.has("nonexistent")).toBe(false);
    });
  });

  // ===========================================================================
  // Clear
  // ===========================================================================

  describe("clear", () => {
    it("should remove all commands", () => {
      registry.register(createMockCommand({ name: "a", category: "system" }));
      registry.register(createMockCommand({ name: "b", category: "auth", aliases: ["bb"] }));

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.get("a")).toBeUndefined();
      expect(registry.get("b")).toBeUndefined();
      expect(registry.get("bb")).toBeUndefined();
      expect(registry.getByCategory("system").size).toBe(0);
      expect(registry.getByCategory("auth").size).toBe(0);
    });
  });
});
