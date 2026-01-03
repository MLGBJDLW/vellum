/**
 * Custom Agents CLI Command Tests (T024)
 *
 * Integration tests for custom agents CLI commands:
 * - list (T020)
 * - create (T021)
 * - validate (T022)
 * - info (T023)
 * - export (T020a)
 * - import (T020b)
 *
 * @module cli/commands/custom-agents/__tests__
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CommandContext,
  CommandError,
  CommandInteractive,
  CommandResult,
  CommandSuccess,
  ParsedArgs,
} from "../../types.js";
import { handleCreate } from "../create.js";
import { handleExport } from "../export.js";
import { handleImport } from "../import.js";
import { customAgentsCommand, executeCustomAgents, getCustomAgentsHelp } from "../index.js";
import { handleInfo } from "../info.js";
import { handleList, type ListJsonOutput } from "../list.js";
import { handleValidate } from "../validate.js";

// =============================================================================
// Test Setup
// =============================================================================

const TEST_DIR = path.join(os.tmpdir(), "vellum-custom-agents-test");
const AGENTS_DIR = path.join(TEST_DIR, ".vellum", "agents");

/**
 * Type assertion helpers for CommandResult
 */
function assertSuccess(result: CommandResult): asserts result is CommandSuccess {
  expect(result.kind).toBe("success");
}

function assertError(result: CommandResult): asserts result is CommandError {
  expect(result.kind).toBe("error");
}

function assertInteractive(result: CommandResult): asserts result is CommandInteractive {
  expect(result.kind).toBe("interactive");
}

/**
 * Valid agent YAML content
 */
const VALID_AGENT_YAML = `slug: test-agent
name: "Test Agent"
mode: code
description: "A test agent for unit tests"
icon: "🧪"
tags:
  - test
  - example
`;

/**
 * Valid agent Markdown content
 */
const VALID_AGENT_MD = `---
slug: test-agent-md
name: "Test Agent MD"
mode: code
description: "A test agent in markdown format"
icon: "📝"
---

# Test Agent

You are a test agent.

## Instructions

Help with testing.
`;

/**
 * Invalid agent (missing required fields)
 */
const INVALID_AGENT_YAML = `name: "Invalid Agent"
# Missing slug
`;

/**
 * Create mock CommandContext
 */
function createMockContext(overrides: Partial<ParsedArgs> = {}): CommandContext {
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
    } as unknown as CommandContext["credentials"],
    toolRegistry: {
      get: vi.fn(),
      list: vi.fn(),
    } as unknown as CommandContext["toolRegistry"],
    parsedArgs: {
      command: overrides.command ?? "custom-agents",
      positional: overrides.positional ?? [],
      named: overrides.named ?? {},
      raw: overrides.raw ?? "/custom-agents",
    },
    emit: vi.fn(),
  };
}

/**
 * Write test agent file
 */
async function writeTestAgent(filename: string, content: string): Promise<string> {
  const filePath = path.join(AGENTS_DIR, filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

// =============================================================================
// Setup/Teardown
// =============================================================================

beforeEach(async () => {
  // Create test directory
  await fs.mkdir(AGENTS_DIR, { recursive: true });
  // Mock cwd
  vi.spyOn(process, "cwd").mockReturnValue(TEST_DIR);
});

afterEach(async () => {
  // Clean up test directory
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore errors during cleanup
  }
  vi.restoreAllMocks();
});

// =============================================================================
// T020: Command Definition Tests
// =============================================================================

describe("customAgentsCommand", () => {
  describe("command definition", () => {
    it("should have correct name and aliases", () => {
      expect(customAgentsCommand.name).toBe("custom-agents");
      expect(customAgentsCommand.aliases).toContain("ca");
      expect(customAgentsCommand.aliases).toContain("custom-agent");
    });

    it("should be a builtin config command", () => {
      expect(customAgentsCommand.kind).toBe("builtin");
      expect(customAgentsCommand.category).toBe("config");
    });

    it("should define subcommand positional argument", () => {
      const subArg = customAgentsCommand.positionalArgs?.find((a) => a.name === "subcommand");
      expect(subArg).toBeDefined();
      expect(subArg?.required).toBe(false);
    });

    it("should define expected named arguments", () => {
      const namedArgs = customAgentsCommand.namedArgs ?? [];
      expect(namedArgs.some((a) => a.name === "json")).toBe(true);
      expect(namedArgs.some((a) => a.name === "global")).toBe(true);
      expect(namedArgs.some((a) => a.name === "local")).toBe(true);
      expect(namedArgs.some((a) => a.name === "template")).toBe(true);
      expect(namedArgs.some((a) => a.name === "strict")).toBe(true);
      expect(namedArgs.some((a) => a.name === "show-prompt")).toBe(true);
      expect(namedArgs.some((a) => a.name === "output")).toBe(true);
      expect(namedArgs.some((a) => a.name === "format")).toBe(true);
    });
  });

  describe("help text", () => {
    it("should show help when no subcommand provided", async () => {
      const ctx = createMockContext({ positional: [] });
      const result = await executeCustomAgents(ctx);

      assertSuccess(result);
      expect(result.message).toContain("Custom Agents Commands");
      expect(result.message).toContain("list");
      expect(result.message).toContain("create");
      expect(result.message).toContain("validate");
      expect(result.message).toContain("info");
      expect(result.message).toContain("export");
      expect(result.message).toContain("import");
    });

    it("should return same help from getCustomAgentsHelp", () => {
      const help = getCustomAgentsHelp();
      expect(help).toContain("Custom Agents Commands");
    });
  });
});

// =============================================================================
// T020: List Command Tests
// =============================================================================

describe("handleList", () => {
  it("should return success with empty list when no agents", async () => {
    const result = await handleList({});

    assertSuccess(result);
    expect(result.message).toContain("(none)");
  });

  it("should list agents grouped by scope", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleList({});

    assertSuccess(result);
    expect(result.message).toContain("test-agent");
    expect(result.message).toContain("Project Agents");
  });

  it("should output JSON when --json flag is set", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleList({ json: true });

    assertSuccess(result);
    const json = JSON.parse(result.message ?? "{}") as ListJsonOutput;
    expect(json.success).toBe(true);
    expect(json.agents.project).toBeDefined();
    expect(json.agents.user).toBeDefined();
    expect(json.agents.system).toBeDefined();
  });

  it("should filter to project scope with --local flag", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleList({ local: true });

    assertSuccess(result);
    expect(result.message).toContain("Project Agents");
    expect(result.message).not.toContain("User Agents");
    expect(result.message).not.toContain("System Agents");
  });

  it("should filter to user scope with --global flag", async () => {
    const result = await handleList({ global: true });

    assertSuccess(result);
    expect(result.message).toContain("User Agents");
    expect(result.message).not.toContain("Project Agents");
  });
});

// =============================================================================
// T021: Create Command Tests
// =============================================================================

describe("handleCreate", () => {
  it("should require slug when no-interactive", async () => {
    const result = await handleCreate(undefined, { noInteractive: true });

    assertError(result);
    expect(result.code).toBe("MISSING_ARGUMENT");
  });

  it("should reject invalid slug", async () => {
    const result = await handleCreate("Invalid_Slug!", {});

    assertError(result);
    expect(result.code).toBe("INVALID_ARGUMENT");
  });

  it("should create agent with basic template", async () => {
    const result = await handleCreate("my-test-agent", {
      template: "basic",
    });

    assertSuccess(result);
    expect(result.message).toContain("Created agent");

    // Verify file was created
    const filePath = path.join(AGENTS_DIR, "my-test-agent.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("slug: my-test-agent");
    expect(content).toContain('name: "My Test Agent"');
  });

  it("should create agent with advanced template", async () => {
    const result = await handleCreate("advanced-agent", {
      template: "advanced",
    });

    assertSuccess(result);

    const filePath = path.join(AGENTS_DIR, "advanced-agent.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("toolGroups:");
    expect(content).toContain("restrictions:");
  });

  it("should create agent with orchestrator template", async () => {
    const result = await handleCreate("orchestrator-agent", {
      template: "orchestrator",
    });

    assertSuccess(result);

    const filePath = path.join(AGENTS_DIR, "orchestrator-agent.md");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("coordination:");
    expect(content).toContain("level: orchestrator");
  });

  it("should reject duplicate slug", async () => {
    // Create first agent
    await handleCreate("duplicate-agent", {});

    // Try to create again
    const result = await handleCreate("duplicate-agent", {});

    assertError(result);
    expect(result.code).toBe("OPERATION_NOT_ALLOWED");
    expect(result.message).toContain("already exists");
  });

  it("should reject unknown template", async () => {
    const result = await handleCreate("my-agent", {
      template: "unknown-template",
    });

    assertError(result);
    expect(result.code).toBe("INVALID_ARGUMENT");
    expect(result.message).toContain("Unknown template");
  });
});

// =============================================================================
// T022: Validate Command Tests
// =============================================================================

describe("handleValidate", () => {
  it("should return success message when no agents to validate", async () => {
    const result = await handleValidate({});

    assertSuccess(result);
    expect(result.message).toContain("No custom agents found");
  });

  it("should validate all agents", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleValidate({});

    assertSuccess(result);
    expect(result.message).toContain("valid");
    expect(result.message).toContain("test-agent");
  });

  it("should validate specific agent by slug", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleValidate({ target: "test-agent" });

    assertSuccess(result);
    expect(result.message).toContain("test-agent");
  });

  it("should validate specific agent by file path", async () => {
    const filePath = await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleValidate({ target: filePath });

    assertSuccess(result);
  });

  it("should report errors for invalid agent", async () => {
    const filePath = await writeTestAgent("invalid-agent.yaml", INVALID_AGENT_YAML);

    // Validate the specific file to catch parse errors
    const result = await handleValidate({ target: filePath });

    // Should fail validation due to missing slug
    assertError(result);
    expect(result.message).toContain("invalid");
  });

  it("should fail in strict mode with warnings", async () => {
    // Create agent without description (generates warning)
    const agentWithoutDesc = `slug: minimal-agent
name: "Minimal Agent"
`;
    await writeTestAgent("minimal.yaml", agentWithoutDesc);

    const result = await handleValidate({ strict: true });

    // Should fail due to warnings in strict mode
    assertError(result);
    expect(result.message).toContain("warning");
  });

  it("should return error for non-existent agent", async () => {
    const result = await handleValidate({ target: "non-existent" });

    assertError(result);
    expect(result.code).toBe("RESOURCE_NOT_FOUND");
  });
});

// =============================================================================
// T023: Info Command Tests
// =============================================================================

describe("handleInfo", () => {
  it("should require slug", async () => {
    const result = await handleInfo(undefined, {});

    assertError(result);
    expect(result.code).toBe("MISSING_ARGUMENT");
  });

  it("should show agent info", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleInfo("test-agent", {});

    assertSuccess(result);
    expect(result.message).toContain("Test Agent");
    expect(result.message).toContain("test-agent");
    expect(result.message).toContain("code");
  });

  it("should output JSON when --json flag is set", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleInfo("test-agent", { json: true });

    assertSuccess(result);
    const json = JSON.parse(result.message ?? "{}");
    expect(json.success).toBe(true);
    expect(json.agent.slug).toBe("test-agent");
    expect(json.agent.name).toBe("Test Agent");
  });

  it("should show full system prompt with --show-prompt", async () => {
    await writeTestAgent("test-agent.md", VALID_AGENT_MD);

    const result = await handleInfo("test-agent-md", { showPrompt: true });

    assertSuccess(result);
    expect(result.message).toContain("You are a test agent");
  });

  it("should return error for non-existent agent", async () => {
    const result = await handleInfo("non-existent", {});

    assertError(result);
    expect(result.code).toBe("RESOURCE_NOT_FOUND");
  });
});

// =============================================================================
// T020a: Export Command Tests
// =============================================================================

describe("handleExport", () => {
  it("should require slug", async () => {
    const result = await handleExport(undefined, {});

    assertError(result);
    expect(result.code).toBe("MISSING_ARGUMENT");
  });

  it("should export agent to stdout as YAML by default", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleExport("test-agent", {});

    assertSuccess(result);
    expect(result.message).toContain("slug: test-agent");
    expect(result.message).toContain("name: Test Agent");
  });

  it("should export agent as JSON", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleExport("test-agent", { format: "json" });

    assertSuccess(result);
    expect(result.message).toContain('"slug": "test-agent"');
  });

  it("should export agent to file", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);
    const outputPath = path.join(TEST_DIR, "exported.yaml");

    const result = await handleExport("test-agent", { output: outputPath });

    assertSuccess(result);
    expect(result.message).toContain("Exported");

    // Verify file was written
    const content = await fs.readFile(outputPath, "utf-8");
    expect(content).toContain("slug: test-agent");
  });

  it("should return error for non-existent agent", async () => {
    const result = await handleExport("non-existent", {});

    assertError(result);
    expect(result.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("should reject invalid format", async () => {
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    const result = await handleExport("test-agent", {
      format: "xml" as "yaml",
    });

    assertError(result);
    expect(result.code).toBe("INVALID_ARGUMENT");
  });
});

// =============================================================================
// T020b: Import Command Tests
// =============================================================================

describe("handleImport", () => {
  it("should require file path", async () => {
    const result = await handleImport({ file: "" });

    assertError(result);
    expect(result.code).toBe("MISSING_ARGUMENT");
  });

  it("should return error for non-existent file", async () => {
    const result = await handleImport({ file: "/non/existent/file.yaml" });

    assertError(result);
    expect(result.code).toBe("FILE_NOT_FOUND");
  });

  it("should import valid YAML agent", async () => {
    // Write source file outside agents directory
    const sourceFile = path.join(TEST_DIR, "import-source.yaml");
    await fs.writeFile(sourceFile, VALID_AGENT_YAML, "utf-8");

    const result = await handleImport({ file: sourceFile });

    assertSuccess(result);
    expect(result.message).toContain("Imported");

    // Verify file was created in agents directory
    const destPath = path.join(AGENTS_DIR, "test-agent.md");
    const exists = await fs
      .access(destPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("should import valid Markdown agent", async () => {
    const sourceFile = path.join(TEST_DIR, "import-source.md");
    await fs.writeFile(sourceFile, VALID_AGENT_MD, "utf-8");

    const result = await handleImport({ file: sourceFile });

    assertSuccess(result);
    expect(result.message).toContain("Imported");
  });

  it("should reject invalid agent file", async () => {
    const sourceFile = path.join(TEST_DIR, "invalid.yaml");
    await fs.writeFile(sourceFile, INVALID_AGENT_YAML, "utf-8");

    const result = await handleImport({ file: sourceFile });

    assertError(result);
    expect(result.code).toBe("INVALID_ARGUMENT");
    expect(result.message.toLowerCase()).toContain("validation failed");
  });

  it("should prompt for confirmation on existing agent", async () => {
    // Create existing agent
    await writeTestAgent("test-agent.yaml", VALID_AGENT_YAML);

    // Try to import same slug
    const sourceFile = path.join(TEST_DIR, "import-source.yaml");
    await fs.writeFile(sourceFile, VALID_AGENT_YAML, "utf-8");

    const result = await handleImport({ file: sourceFile });

    // Should return interactive prompt
    assertInteractive(result);
    expect(result.prompt.inputType).toBe("confirm");
    expect(result.prompt.message).toContain("already exists");
  });
});

// =============================================================================
// Subcommand Routing Tests
// =============================================================================

describe("executeCustomAgents routing", () => {
  it("should route list subcommand", async () => {
    const ctx = createMockContext({
      positional: ["list"],
      named: { json: false },
    });

    const result = await executeCustomAgents(ctx);

    assertSuccess(result);
  });

  it("should route create subcommand with slug", async () => {
    const ctx = createMockContext({
      positional: ["create", "new-agent"],
      named: { template: "basic" },
    });

    const result = await executeCustomAgents(ctx);

    assertSuccess(result);
    expect(result.message).toContain("Created agent");
  });

  it("should route validate subcommand", async () => {
    const ctx = createMockContext({
      positional: ["validate"],
      named: {},
    });

    const result = await executeCustomAgents(ctx);

    assertSuccess(result);
  });

  it("should route info subcommand", async () => {
    const ctx = createMockContext({
      positional: ["info"],
      named: {},
    });

    const result = await executeCustomAgents(ctx);

    // Should error because slug is required
    assertError(result);
    expect(result.code).toBe("MISSING_ARGUMENT");
  });

  it("should route export subcommand", async () => {
    const ctx = createMockContext({
      positional: ["export"],
      named: {},
    });

    const result = await executeCustomAgents(ctx);

    // Should error because slug is required
    assertError(result);
    expect(result.code).toBe("MISSING_ARGUMENT");
  });

  it("should route import subcommand", async () => {
    const ctx = createMockContext({
      positional: ["import"],
      named: {},
    });

    const result = await executeCustomAgents(ctx);

    // Should error because file is required
    assertError(result);
    expect(result.code).toBe("MISSING_ARGUMENT");
  });

  it("should show help for unknown subcommand", async () => {
    const ctx = createMockContext({
      positional: ["unknown"],
      named: {},
    });

    const result = await executeCustomAgents(ctx);

    assertSuccess(result);
    expect(result.message).toContain("Custom Agents Commands");
  });
});
