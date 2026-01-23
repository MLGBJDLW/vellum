// ============================================
// User Command Loader Tests
// ============================================

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CommandTrustStore,
  createUserCommandLoader,
  DefaultCommandTrustStore,
  getTypeScriptCommandTemplate,
  getYamlCommandTemplate,
  type TypeScriptCommand,
  UserCommandLoader,
  type YamlShellCommand,
  YamlUserCommandSchema,
} from "../user-command-loader.js";

// =============================================================================
// Test Setup
// =============================================================================

const TEST_DIR = path.join(os.tmpdir(), "vellum-user-command-tests");
const PROJECT_DIR = path.join(TEST_DIR, "project");
const PROJECT_COMMANDS_DIR = path.join(PROJECT_DIR, ".vellum", "commands");
const USER_HOME_DIR = path.join(TEST_DIR, "user");
const USER_COMMANDS_DIR = path.join(USER_HOME_DIR, ".vellum", "commands");

async function setupTestDirs(): Promise<void> {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(PROJECT_COMMANDS_DIR, { recursive: true });
  await fs.mkdir(USER_COMMANDS_DIR, { recursive: true });
}

async function cleanupTestDirs(): Promise<void> {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
}

beforeEach(async () => {
  await setupTestDirs();
});

afterEach(async () => {
  await cleanupTestDirs();
});

// =============================================================================
// YAML Schema Tests
// =============================================================================

describe("YamlUserCommandSchema", () => {
  it("should validate a valid shell command", () => {
    const command = {
      name: "deploy",
      description: "Deploy to production",
      shell: "pnpm run deploy",
    };

    const result = YamlUserCommandSchema.safeParse(command);
    expect(result.success).toBe(true);
  });

  it("should validate a valid prompt command", () => {
    const command = {
      name: "review",
      description: "Review the current code",
      prompt: "Please review the code in this file.",
    };

    const result = YamlUserCommandSchema.safeParse(command);
    expect(result.success).toBe(true);
  });

  it("should validate command with aliases", () => {
    const command = {
      name: "test-all",
      description: "Run all tests",
      alias: ["ta", "tests"],
      shell: "pnpm test --run",
    };

    const result = YamlUserCommandSchema.safeParse(command);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alias).toEqual(["ta", "tests"]);
    }
  });

  it("should reject command without shell or prompt", () => {
    const command = {
      name: "invalid",
      description: "Invalid command",
    };

    const result = YamlUserCommandSchema.safeParse(command);
    expect(result.success).toBe(false);
  });

  it("should reject command with both shell and prompt", () => {
    const command = {
      name: "invalid",
      description: "Invalid command",
      shell: "echo hello",
      prompt: "Say hello",
    };

    const result = YamlUserCommandSchema.safeParse(command);
    expect(result.success).toBe(false);
  });

  it("should reject invalid command name format", () => {
    const command = {
      name: "Invalid_Name",
      description: "Invalid name format",
      shell: "echo hello",
    };

    const result = YamlUserCommandSchema.safeParse(command);
    expect(result.success).toBe(false);
  });

  it("should default category to tools", () => {
    const command = {
      name: "my-cmd",
      description: "My command",
      shell: "echo hello",
    };

    const result = YamlUserCommandSchema.safeParse(command);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("tools");
    }
  });
});

// =============================================================================
// UserCommandLoader Tests
// =============================================================================

describe("UserCommandLoader", () => {
  describe("constructor", () => {
    it("should create loader with default options", () => {
      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      expect(loader.getProjectCommandsDir()).toBe(PROJECT_COMMANDS_DIR);
    });

    it("should use factory function", () => {
      const loader = createUserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      expect(loader).toBeInstanceOf(UserCommandLoader);
    });
  });

  describe("directoryExists", () => {
    it("should return true for existing directory", async () => {
      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      expect(await loader.directoryExists(PROJECT_COMMANDS_DIR)).toBe(true);
    });

    it("should return false for non-existing directory", async () => {
      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      expect(await loader.directoryExists(path.join(TEST_DIR, "this-does-not-exist-xyz123"))).toBe(
        false
      );
    });
  });

  describe("load - YAML commands", () => {
    it("should load a valid YAML shell command", async () => {
      const yamlContent = `
name: deploy
description: Deploy to production
shell: pnpm run deploy --env=prod
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "deploy.yaml"), yamlContent);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.errors).toHaveLength(0);
      expect(result.commands).toHaveLength(1);

      const cmd = result.commands.at(0);
      expect(cmd?.name).toBe("deploy");
      expect(cmd?.type).toBe("yaml");

      const yamlCmd = cmd as YamlShellCommand;
      expect(yamlCmd.commandType).toBe("shell");
      expect(yamlCmd.shell).toBe("pnpm run deploy --env=prod");
    });

    it("should load a valid YAML prompt command", async () => {
      const yamlContent = `
name: review
description: Review the current code
prompt: |
  Please review the code in this file.
  Focus on security and performance.
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "review.yaml"), yamlContent);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.errors).toHaveLength(0);
      expect(result.commands).toHaveLength(1);

      const cmd = result.commands.at(0);
      expect(cmd?.name).toBe("review");
      expect(cmd?.type).toBe("yaml");
    });

    it("should load command with aliases", async () => {
      const yamlContent = `
name: test-all
description: Run all tests
alias:
  - ta
  - tests
shell: pnpm test --run
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "test-all.yaml"), yamlContent);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.errors).toHaveLength(0);
      expect(result.commands).toHaveLength(1);

      const cmd = result.commands.at(0);
      expect(cmd?.aliases).toEqual(["ta", "tests"]);
    });

    it("should report error for invalid YAML", async () => {
      const invalidYaml = `
name: invalid
description: "unclosed quote
shell: echo hello
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "invalid.yaml"), invalidYaml);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.code).toBe("PARSE_ERROR");
    });

    it("should report error for schema validation failure", async () => {
      const invalidSchema = `
name: invalid
# Missing description
shell: echo hello
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "invalid.yaml"), invalidSchema);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it("should load .yml extension", async () => {
      const yamlContent = `
name: build
description: Build the project
shell: pnpm build
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "build.yml"), yamlContent);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.commands).toHaveLength(1);

      const cmd = result.commands.at(0);
      expect(cmd?.name).toBe("build");
    });
  });

  describe("load - TypeScript commands", () => {
    it("should identify TypeScript commands as pending trust", async () => {
      const tsContent = `
export default {
  name: 'custom',
  description: 'Custom TypeScript command',
  execute: async () => ({ success: true }),
};
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "custom.ts"), tsContent);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.pendingTrust).toHaveLength(1);

      const cmd = result.pendingTrust.at(0);
      expect(cmd?.type).toBe("typescript");
      expect(cmd?.trusted).toBe(false);
    });

    it("should load trusted TypeScript command with autoTrust", async () => {
      const tsContent = `
export default {
  name: 'custom',
  description: 'Custom TypeScript command',
  execute: async () => ({ success: true, message: 'Hello!' }),
};
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "custom.ts"), tsContent);

      const loader = new UserCommandLoader({
        cwd: PROJECT_DIR,
        autoTrust: true,
        userHomeDir: USER_HOME_DIR,
      });
      const result = await loader.load();

      expect(result.pendingTrust).toHaveLength(0);
      expect(result.commands).toHaveLength(1);

      const cmd = result.commands.at(0);
      expect(cmd?.name).toBe("custom");
      expect(cmd?.type).toBe("typescript");

      const tsCmd = cmd as TypeScriptCommand;
      expect(tsCmd.trusted).toBe(true);
      expect(tsCmd.execute).toBeDefined();
    });

    it("should load .mts extension", async () => {
      const tsContent = `
export default {
  name: 'esm-cmd',
  description: 'ESM TypeScript command',
  execute: async () => ({ success: true }),
};
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "esm-cmd.mts"), tsContent);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.pendingTrust).toHaveLength(1);

      const cmd = result.pendingTrust.at(0);
      expect(cmd?.filePath).toContain("esm-cmd.mts");
    });
  });

  describe("load - directory priority", () => {
    it("should prefer project commands over user commands", async () => {
      const projectYaml = `
name: deploy
description: Project deploy
shell: pnpm deploy:prod
`;
      const userYaml = `
name: deploy
description: User deploy
shell: pnpm deploy:staging
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "deploy.yaml"), projectYaml);
      await fs.writeFile(path.join(USER_COMMANDS_DIR, "deploy.yaml"), userYaml);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.commands).toHaveLength(1);

      const cmd = result.commands.at(0);
      expect(cmd?.source).toBe("project");
      expect(cmd?.description).toBe("Project deploy");
    });

    it("should load user commands when no project commands exist", async () => {
      const userYaml = `
name: user-cmd
description: User command
shell: echo user
`;
      await fs.writeFile(path.join(USER_COMMANDS_DIR, "user-cmd.yaml"), userYaml);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.commands).toHaveLength(1);

      const cmd = result.commands.at(0);
      expect(cmd?.source).toBe("user");
    });

    it("should skip user commands when loadUserCommands is false", async () => {
      const userYaml = `
name: user-cmd
description: User command
shell: echo user
`;
      await fs.writeFile(path.join(USER_COMMANDS_DIR, "user-cmd.yaml"), userYaml);

      const loader = new UserCommandLoader({
        cwd: PROJECT_DIR,
        loadUserCommands: false,
        userHomeDir: USER_HOME_DIR,
      });
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
    });
  });

  describe("load - empty/missing directories", () => {
    it("should return empty result for non-existent project directory", async () => {
      await fs.rm(PROJECT_COMMANDS_DIR, { recursive: true, force: true });
      await fs.rm(USER_COMMANDS_DIR, { recursive: true, force: true });

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.commands).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.scanned).toBe(0);
    });

    it("should skip unsupported file extensions", async () => {
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "readme.md"), "# Commands");
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "config.json"), "{}");

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.scanned).toBe(0);
    });
  });

  describe("load - content hash", () => {
    it("should compute content hash for YAML commands", async () => {
      const yamlContent = `
name: hash-test
description: Hash test command
shell: echo test
`;
      await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "hash-test.yaml"), yamlContent);

      const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
      const result = await loader.load();

      expect(result.commands).toHaveLength(1);

      const cmd = result.commands.at(0);
      expect(cmd?.contentHash).toBeDefined();
      expect(cmd?.contentHash?.length).toBe(64); // SHA-256 hex
    });
  });
});

// =============================================================================
// DefaultCommandTrustStore Tests
// =============================================================================

describe("DefaultCommandTrustStore", () => {
  const TRUST_FILE = path.join(TEST_DIR, "command-trust.json");

  it("should start with empty trust", async () => {
    const store = new DefaultCommandTrustStore(TRUST_FILE);
    await store.load();
    expect(store.getTrusted().size).toBe(0);
  });

  it("should trust and verify commands", async () => {
    const store = new DefaultCommandTrustStore(TRUST_FILE);
    await store.load();

    const filePath = "/path/to/command.ts";
    const hash = "abc123hash";

    expect(store.isTrusted(filePath, hash)).toBe(false);

    await store.trust(filePath, hash);
    expect(store.isTrusted(filePath, hash)).toBe(true);
  });

  it("should reject mismatched hash", async () => {
    const store = new DefaultCommandTrustStore(TRUST_FILE);
    await store.load();

    const filePath = "/path/to/command.ts";
    await store.trust(filePath, "original-hash");

    expect(store.isTrusted(filePath, "different-hash")).toBe(false);
  });

  it("should persist trust across instances", async () => {
    const store1 = new DefaultCommandTrustStore(TRUST_FILE);
    await store1.load();
    await store1.trust("/path/to/cmd.ts", "hash123");

    // New instance
    const store2 = new DefaultCommandTrustStore(TRUST_FILE);
    await store2.load();

    expect(store2.isTrusted("/path/to/cmd.ts", "hash123")).toBe(true);
  });

  it("should revoke trust", async () => {
    const store = new DefaultCommandTrustStore(TRUST_FILE);
    await store.load();

    await store.trust("/path/to/cmd.ts", "hash123");
    expect(store.isTrusted("/path/to/cmd.ts", "hash123")).toBe(true);

    await store.revoke("/path/to/cmd.ts");
    expect(store.isTrusted("/path/to/cmd.ts", "hash123")).toBe(false);
  });
});

// =============================================================================
// Template Tests
// =============================================================================

describe("Templates", () => {
  it("should generate valid YAML template", () => {
    const template = getYamlCommandTemplate();
    expect(template).toContain("name:");
    expect(template).toContain("description:");
    expect(template).toContain("shell:");
  });

  it("should generate valid TypeScript template", () => {
    const template = getTypeScriptCommandTemplate();
    expect(template).toContain("export default");
    expect(template).toContain("execute:");
    expect(template).toContain("UserCommandDefinition");
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("UserCommandLoader Integration", () => {
  it("should handle mixed command types", async () => {
    const yamlShell = `
name: build
description: Build project
shell: pnpm build
`;
    const yamlPrompt = `
name: explain
description: Explain the code
prompt: Please explain this code in detail.
`;
    const tsCommand = `
export default {
  name: 'analyze',
  description: 'Analyze codebase',
  execute: async () => ({ success: true }),
};
`;

    await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "build.yaml"), yamlShell);
    await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "explain.yml"), yamlPrompt);
    await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "analyze.ts"), tsCommand);

    const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
    const result = await loader.load();

    expect(result.scanned).toBe(3);
    expect(result.commands).toHaveLength(2); // YAML commands
    expect(result.pendingTrust).toHaveLength(1); // TS command
  });

  it("should track file paths correctly", async () => {
    const yamlContent = `
name: tracked
description: Track file path
shell: echo tracked
`;
    await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "tracked.yaml"), yamlContent);

    const loader = new UserCommandLoader({ cwd: PROJECT_DIR, userHomeDir: USER_HOME_DIR });
    const result = await loader.load();

    const cmd = result.commands.at(0);
    expect(cmd?.filePath).toBe(path.join(PROJECT_COMMANDS_DIR, "tracked.yaml"));
  });
});

// =============================================================================
// Custom Trust Store Tests
// =============================================================================

describe("Custom Trust Store", () => {
  it("should use provided trust store", async () => {
    const mockTrustStore: CommandTrustStore = {
      isTrusted: vi.fn().mockReturnValue(true),
      trust: vi.fn().mockResolvedValue(undefined),
      revoke: vi.fn().mockResolvedValue(undefined),
      getTrusted: vi.fn().mockReturnValue(new Map()),
    };

    const tsContent = `
export default {
  name: 'trusted-cmd',
  description: 'Trusted command',
  execute: async () => ({ success: true }),
};
`;
    await fs.writeFile(path.join(PROJECT_COMMANDS_DIR, "trusted.ts"), tsContent);

    const loader = new UserCommandLoader({
      cwd: PROJECT_DIR,
      trustStore: mockTrustStore,
      userHomeDir: USER_HOME_DIR,
    });
    const result = await loader.load();

    expect(mockTrustStore.isTrusted).toHaveBeenCalled();
    expect(result.commands).toHaveLength(1);
    expect(result.pendingTrust).toHaveLength(0);
  });
});
