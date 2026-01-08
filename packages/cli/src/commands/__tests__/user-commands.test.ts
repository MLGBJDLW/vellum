/**
 * User Commands Tests
 *
 * Tests for user-defined command loading:
 * - Directory scanning
 * - Command validation
 * - Registry integration
 * - Error handling
 *
 * @module cli/commands/__tests__/user-commands
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandRegistry } from "../registry.js";
import type { CommandError, CommandResult, CommandSuccess } from "../types.js";
import {
  ensureCommandsDirectory,
  getCommandTemplate,
  registerUserCommands,
  UserCommandLoader,
} from "../user-commands.js";

// =============================================================================
// Test Setup
// =============================================================================

const TEST_DIR = path.join(os.tmpdir(), "vellum-user-commands-test");
const COMMANDS_DIR = path.join(TEST_DIR, "commands");

/**
 * Type assertion helpers
 */
function assertSuccess(result: CommandResult): asserts result is CommandSuccess {
  expect(result.kind).toBe("success");
}

function assertError(result: CommandResult): asserts result is CommandError {
  expect(result.kind).toBe("error");
}

/**
 * Valid command file content (JavaScript)
 */
const VALID_COMMAND_JS = `
export default {
  name: '/test-cmd',
  description: 'A test command',
  execute: async (args, context) => {
    return {
      success: true,
      message: 'Test executed: ' + args.raw,
      data: { args, context },
    };
  },
};
`;

/**
 * Valid command with aliases
 */
const VALID_COMMAND_WITH_ALIASES = `
export default {
  name: '/greet',
  description: 'Greeting command',
  aliases: ['g', 'hello'],
  category: 'tools',
  execute: async (args) => {
    const name = args.positional[0] || 'World';
    return {
      success: true,
      message: 'Hello, ' + name + '!',
    };
  },
};
`;

/**
 * Command that returns error
 */
const ERROR_COMMAND = `
export default {
  name: '/fail',
  description: 'A command that fails',
  execute: async () => {
    return {
      success: false,
      error: 'Intentional failure',
    };
  },
};
`;

/**
 * Command that throws
 */
const THROWING_COMMAND = `
export default {
  name: '/throws',
  description: 'A command that throws',
  execute: async () => {
    throw new Error('Unexpected error');
  },
};
`;

/**
 * Invalid: missing name
 */
const INVALID_NO_NAME = `
export default {
  description: 'Missing name',
  execute: async () => ({ success: true }),
};
`;

/**
 * Invalid: missing description
 */
const INVALID_NO_DESCRIPTION = `
export default {
  name: '/no-desc',
  execute: async () => ({ success: true }),
};
`;

/**
 * Invalid: missing execute
 */
const INVALID_NO_EXECUTE = `
export default {
  name: '/no-exec',
  description: 'Missing execute',
};
`;

/**
 * Invalid: name doesn't start with /
 */
const INVALID_NAME_FORMAT = `
export default {
  name: 'bad-name',
  description: 'Name without slash',
  execute: async () => ({ success: true }),
};
`;

/**
 * Invalid: bad category
 */
const INVALID_CATEGORY = `
export default {
  name: '/bad-cat',
  description: 'Invalid category',
  category: 'invalid-category',
  execute: async () => ({ success: true }),
};
`;

/**
 * Invalid: no default export
 */
const NO_DEFAULT_EXPORT = `
export const command = {
  name: '/no-default',
  description: 'No default export',
  execute: async () => ({ success: true }),
};
`;

/**
 * Write test command file
 */
async function writeCommand(filename: string, content: string): Promise<string> {
  const filePath = path.join(COMMANDS_DIR, filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

/**
 * Create mock command context
 */
function createMockContext() {
  return {
    session: {
      id: "test-session",
      provider: "anthropic",
      cwd: TEST_DIR,
    },
    credentials: {
      resolve: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    },
    toolRegistry: {
      get: vi.fn(),
      list: vi.fn(),
    },
    parsedArgs: {
      command: "test",
      positional: [] as string[],
      named: {} as Record<string, string | boolean>,
      raw: "/test",
    },
    emit: vi.fn(),
  };
}

// =============================================================================
// Setup/Teardown
// =============================================================================

beforeEach(async () => {
  await fs.mkdir(COMMANDS_DIR, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  vi.restoreAllMocks();
});

// =============================================================================
// UserCommandLoader Tests
// =============================================================================

describe("UserCommandLoader", () => {
  describe("constructor", () => {
    it("should use default ~/.vellum path when no baseDir provided", () => {
      const loader = new UserCommandLoader();
      const expectedDir = path.join(os.homedir(), ".vellum", "commands");
      expect(loader.getCommandsDir()).toBe(expectedDir);
    });

    it("should use custom baseDir when provided", () => {
      const loader = new UserCommandLoader(TEST_DIR);
      expect(loader.getCommandsDir()).toBe(COMMANDS_DIR);
    });
  });

  describe("directoryExists", () => {
    it("should return true when directory exists", async () => {
      const loader = new UserCommandLoader(TEST_DIR);
      const exists = await loader.directoryExists();
      expect(exists).toBe(true);
    });

    it("should return false when directory does not exist", async () => {
      const loader = new UserCommandLoader(path.join(TEST_DIR, "nonexistent"));
      const exists = await loader.directoryExists();
      expect(exists).toBe(false);
    });
  });

  describe("load", () => {
    it("should return empty result when directory does not exist", async () => {
      const loader = new UserCommandLoader(path.join(TEST_DIR, "nonexistent"));
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.scanned).toBe(0);
    });

    it("should return empty result when directory is empty", async () => {
      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.scanned).toBe(0);
    });

    it("should load valid .js command file", async () => {
      await writeCommand("test-cmd.js", VALID_COMMAND_JS);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.scanned).toBe(1);

      const cmd = result.commands[0]!;
      expect(cmd.name).toBe("test-cmd");
      expect(cmd.description).toBe("A test command");
      expect(cmd.kind).toBe("user");
      expect(cmd.category).toBe("tools");
    });

    it("should load valid .mjs command file", async () => {
      await writeCommand("test-cmd.mjs", VALID_COMMAND_JS);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it("should load command with aliases", async () => {
      await writeCommand("greet.js", VALID_COMMAND_WITH_ALIASES);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(1);
      const cmd = result.commands[0]!;
      expect(cmd.name).toBe("greet");
      expect(cmd.aliases).toEqual(["g", "hello"]);
      expect(cmd.category).toBe("tools");
    });

    it("should ignore non-command files", async () => {
      await writeCommand("test-cmd.js", VALID_COMMAND_JS);
      await fs.writeFile(path.join(COMMANDS_DIR, "readme.txt"), "Not a command");
      await fs.writeFile(path.join(COMMANDS_DIR, "data.json"), "{}");

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(1);
      expect(result.scanned).toBe(1);
    });

    it("should load multiple command files", async () => {
      await writeCommand("cmd1.js", VALID_COMMAND_JS);
      await writeCommand("greet.mjs", VALID_COMMAND_WITH_ALIASES);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.scanned).toBe(2);
    });
  });

  describe("validation errors", () => {
    it("should report error for missing name", async () => {
      await writeCommand("invalid-no-name.js", INVALID_NO_NAME);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain("name");
    });

    it("should report error for missing description", async () => {
      await writeCommand("invalid-no-desc.js", INVALID_NO_DESCRIPTION);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain("description");
    });

    it("should report error for missing execute", async () => {
      await writeCommand("invalid-no-exec.js", INVALID_NO_EXECUTE);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain("execute");
    });

    it("should report error for name not starting with /", async () => {
      await writeCommand("invalid-name-format.js", INVALID_NAME_FORMAT);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain("must start with");
    });

    it("should report error for invalid category", async () => {
      await writeCommand("invalid-category.js", INVALID_CATEGORY);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain("Invalid category");
    });

    it("should report error for no default export", async () => {
      await writeCommand("invalid-no-default.js", NO_DEFAULT_EXPORT);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain("No default export");
    });

    it("should report error for syntax errors in file", async () => {
      await writeCommand("invalid.js", "export default { invalid syntax");

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      // Error message will be from the parser
    });
  });

  describe("command execution", () => {
    it("should execute loaded command successfully", async () => {
      await writeCommand("test-cmd.js", VALID_COMMAND_JS);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      expect(result.commands).toHaveLength(1);

      const cmd = result.commands[0]!;
      const ctx = createMockContext();
      ctx.parsedArgs.raw = "/test-cmd hello world";

      const execResult = await cmd.execute(ctx as any);
      assertSuccess(execResult);
      expect(execResult.message).toContain("Test executed");
      expect(execResult.message).toContain("hello world");
    });

    it("should pass context to command", async () => {
      await writeCommand("test-cmd.js", VALID_COMMAND_JS);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      const cmd = result.commands[0]!;
      const ctx = createMockContext();
      ctx.session.cwd = "/my/cwd";
      ctx.session.id = "my-session";
      ctx.session.provider = "openai";

      const execResult = await cmd.execute(ctx as any);
      assertSuccess(execResult);

      const data = execResult.data as {
        context: { cwd: string; sessionId: string; provider: string };
      };
      expect(data.context.cwd).toBe("/my/cwd");
      expect(data.context.sessionId).toBe("my-session");
      expect(data.context.provider).toBe("openai");
    });

    it("should handle command that returns error", async () => {
      await writeCommand("fail.js", ERROR_COMMAND);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      const cmd = result.commands[0]!;
      const ctx = createMockContext();

      const execResult = await cmd.execute(ctx as any);
      assertError(execResult);
      expect(execResult.message).toBe("Intentional failure");
    });

    it("should handle command that throws", async () => {
      await writeCommand("throws.js", THROWING_COMMAND);

      const loader = new UserCommandLoader(TEST_DIR);
      const result = await loader.load();

      const cmd = result.commands[0]!;
      const ctx = createMockContext();

      const execResult = await cmd.execute(ctx as any);
      assertError(execResult);
      expect(execResult.message).toBe("Unexpected error");
    });
  });
});

// =============================================================================
// Registry Integration Tests
// =============================================================================

describe("registerUserCommands", () => {
  it("should register commands in registry", async () => {
    await writeCommand("test-cmd.js", VALID_COMMAND_JS);
    await writeCommand("greet.js", VALID_COMMAND_WITH_ALIASES);

    const registry = new CommandRegistry();
    const result = await registerUserCommands(registry, { baseDir: TEST_DIR });

    expect(result.commands).toHaveLength(2);
    expect(registry.size).toBe(2);
    expect(registry.has("test-cmd")).toBe(true);
    expect(registry.has("greet")).toBe(true);
    // Check alias
    expect(registry.has("g")).toBe(true);
    expect(registry.has("hello")).toBe(true);
  });

  it("should return errors for invalid commands", async () => {
    await writeCommand("valid.js", VALID_COMMAND_JS);
    await writeCommand("invalid.js", INVALID_NO_NAME);

    const registry = new CommandRegistry();
    const result = await registerUserCommands(registry, { baseDir: TEST_DIR });

    expect(result.commands).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(registry.size).toBe(1);
  });

  it("should work with empty directory", async () => {
    const registry = new CommandRegistry();
    const result = await registerUserCommands(registry, { baseDir: TEST_DIR });

    expect(result.commands).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(registry.size).toBe(0);
  });

  it("should work with non-existent directory", async () => {
    const registry = new CommandRegistry();
    const result = await registerUserCommands(registry, {
      baseDir: path.join(TEST_DIR, "nonexistent"),
    });

    expect(result.commands).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(registry.size).toBe(0);
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe("ensureCommandsDirectory", () => {
  it("should create commands directory", async () => {
    const newDir = path.join(TEST_DIR, "new-vellum");
    const commandsDir = await ensureCommandsDirectory(newDir);

    expect(commandsDir).toBe(path.join(newDir, "commands"));

    const stat = await fs.stat(commandsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("should not fail if directory already exists", async () => {
    const commandsDir = await ensureCommandsDirectory(TEST_DIR);
    // Call again
    const commandsDir2 = await ensureCommandsDirectory(TEST_DIR);

    expect(commandsDir).toBe(commandsDir2);
  });
});

describe("getCommandTemplate", () => {
  it("should return valid template string", () => {
    const template = getCommandTemplate();

    expect(template).toContain("export default");
    expect(template).toContain("name:");
    expect(template).toContain("description:");
    expect(template).toContain("execute:");
    expect(template).toContain("/my-command");
  });
});
