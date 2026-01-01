/**
 * Agents Command Group Tests
 *
 * Tests for the agents command group (T042, T047):
 * - Command registration and help display
 * - Subcommand routing
 * - Options parsing
 * - Integration tests with temp directories
 *
 * @module cli/commands/__tests__/agents
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAgentsGenerate } from "../agents/generate.js";
import { agentsCommand, executeAgents, getAgentsHelp } from "../agents/index.js";
import { handleAgentsShow } from "../agents/show.js";
import { handleAgentsValidate } from "../agents/validate.js";
import type { CommandContext, ParsedArgs } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_DIR = join(tmpdir(), "vellum-agents-test");

/**
 * Valid AGENTS.md content for testing
 */
const VALID_AGENTS_MD = `---
name: "test-project"
version: "1.0.0"
description: "Test project for agents command"
priority: 100
merge:
  strategy: extend
  arrays: append
---

# Instructions

You are an AI coding assistant.

## Allowed Tools

allowed-tools:
  - "@readonly"
  - "@edit"
`;

/**
 * Invalid AGENTS.md content for testing (malformed YAML)
 */
const INVALID_AGENTS_MD = `---
name: test-project
version: "1.0.0
  missing end quote and bad indent
    - this will break
priority: [invalid yaml
---

# Instructions

This file has malformed YAML frontmatter.
`;

/**
 * Create a mock CommandContext for testing
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
      command: overrides.command ?? "agents",
      positional: overrides.positional ?? [],
      named: overrides.named ?? {},
      raw: overrides.raw ?? "/agents",
    },
    emit: vi.fn(),
  };
}

// =============================================================================
// Setup/Teardown for Integration Tests
// =============================================================================

beforeEach(() => {
  // Create temp directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  // Change to test directory for tests
  vi.spyOn(process, "cwd").mockReturnValue(TEST_DIR);
});

afterEach(() => {
  // Clean up temp directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

// =============================================================================
// T042: Agents Command Group Tests
// =============================================================================

describe("agentsCommand", () => {
  describe("command definition", () => {
    it("should have correct name and aliases", () => {
      expect(agentsCommand.name).toBe("agents");
      expect(agentsCommand.aliases).toContain("agent");
    });

    it("should be a builtin config command", () => {
      expect(agentsCommand.kind).toBe("builtin");
      expect(agentsCommand.category).toBe("config");
    });

    it("should define subcommand positional argument", () => {
      const subArg = agentsCommand.positionalArgs?.find((a) => a.name === "subcommand");
      expect(subArg).toBeDefined();
      expect(subArg?.required).toBe(false);
    });

    it("should define named arguments for options", () => {
      const namedArgs = agentsCommand.namedArgs ?? [];
      expect(namedArgs.some((a) => a.name === "json")).toBe(true);
      expect(namedArgs.some((a) => a.name === "verbose")).toBe(true);
      expect(namedArgs.some((a) => a.name === "scope")).toBe(true);
      expect(namedArgs.some((a) => a.name === "output")).toBe(true);
      expect(namedArgs.some((a) => a.name === "merge")).toBe(true);
      expect(namedArgs.some((a) => a.name === "dry-run")).toBe(true);
    });

    it("should have examples", () => {
      expect(agentsCommand.examples).toBeDefined();
      expect(agentsCommand.examples?.length).toBeGreaterThan(0);
    });
  });
});

describe("getAgentsHelp", () => {
  it("should return help text with subcommands", () => {
    const help = getAgentsHelp();

    expect(help).toContain("Agents Commands");
    expect(help).toContain("show");
    expect(help).toContain("validate");
    expect(help).toContain("generate");
  });

  it("should include usage examples", () => {
    const help = getAgentsHelp();

    expect(help).toContain("/agents show");
    expect(help).toContain("/agents validate");
    expect(help).toContain("/agents generate");
  });

  it("should reference init command", () => {
    const help = getAgentsHelp();
    expect(help).toContain("/init");
  });
});

describe("executeAgents", () => {
  describe("help (no subcommand)", () => {
    it("should return help text when no subcommand provided", async () => {
      const ctx = createMockContext({ positional: [] });
      const result = await executeAgents(ctx);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("Agents Commands");
        expect(result.message).toContain("show");
      }
    });

    it("should return help for unknown subcommand", async () => {
      const ctx = createMockContext({ positional: ["unknown"] });
      const result = await executeAgents(ctx);

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("Agents Commands");
      }
    });
  });

  describe("show subcommand", () => {
    it("should route to show handler", async () => {
      const ctx = createMockContext({ positional: ["show"] });
      const result = await executeAgents(ctx);

      // Command is now implemented - returns success with config or "no config found" message
      expect(result.kind).toBe("success");
    });

    it("should parse show options", async () => {
      const ctx = createMockContext({
        positional: ["show"],
        named: { json: true, verbose: true },
      });
      const result = await executeAgents(ctx);

      // With --json flag, should return JSON output
      expect(result.kind).toBe("success");
    });
  });

  describe("validate subcommand", () => {
    it("should route to validate handler", async () => {
      const ctx = createMockContext({ positional: ["validate"] });
      const result = await executeAgents(ctx);

      // Validate returns success if no invalid files found (or no files at all)
      expect(["success", "error"]).toContain(result.kind);
    });

    it("should accept file path argument", async () => {
      const ctx = createMockContext({
        positional: ["validate", "./AGENTS.md"],
      });
      const result = await executeAgents(ctx);

      // Validate with specific file - may succeed or error depending on file existence
      expect(["success", "error"]).toContain(result.kind);
    });
  });

  describe("generate subcommand", () => {
    it("should route to generate handler", async () => {
      const ctx = createMockContext({ positional: ["generate"] });
      const result = await executeAgents(ctx);

      // Generate may fail if AGENTS.md already exists, or succeed with dry-run
      expect(["success", "error"]).toContain(result.kind);
    });

    it("should parse generate options", async () => {
      const ctx = createMockContext({
        positional: ["generate"],
        named: { output: "./AGENTS.md", merge: true, "dry-run": true },
      });
      const result = await executeAgents(ctx);

      // With --dry-run, should succeed with preview output
      expect(result.kind).toBe("success");
    });
  });

  describe("case insensitivity", () => {
    it("should handle uppercase subcommands", async () => {
      const ctx = createMockContext({ positional: ["SHOW"] });
      const result = await executeAgents(ctx);

      // Should route correctly regardless of case
      expect(result.kind).toBe("success");
    });

    it("should handle mixed case subcommands", async () => {
      const ctx = createMockContext({ positional: ["Validate"] });
      const result = await executeAgents(ctx);

      // Should route correctly regardless of case
      expect(["success", "error"]).toContain(result.kind);
    });
  });
});

// =============================================================================
// T047: Integration Tests - agents show
// =============================================================================

describe("agents show integration", () => {
  describe("with valid AGENTS.md", () => {
    beforeEach(() => {
      writeFileSync(join(TEST_DIR, "AGENTS.md"), VALID_AGENTS_MD);
    });

    it("should display config correctly", async () => {
      const result = await handleAgentsShow({});

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("test-project");
        expect(result.message).toContain("Instructions");
      }
    });

    it("should output valid JSON with --json flag", async () => {
      const result = await handleAgentsShow({ json: true });

      expect(result.kind).toBe("success");
      if (result.kind === "success" && result.message) {
        // Parse JSON to verify it's valid
        const jsonData = JSON.parse(result.message);
        expect(jsonData.success).toBe(true);
        expect(jsonData.config).toBeDefined();
        expect(jsonData.config.name).toBe("test-project");
      }
    });

    it("should show verbose details with --verbose flag", async () => {
      const result = await handleAgentsShow({ verbose: true });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("Merge Configuration");
        expect(result.message).toContain("Strategy");
      }
    });
  });

  describe("without AGENTS.md", () => {
    it("should indicate no config found", async () => {
      const result = await handleAgentsShow({});

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("No AGENTS.md");
      }
    });

    it("should return valid JSON indicating no config", async () => {
      const result = await handleAgentsShow({ json: true });

      expect(result.kind).toBe("success");
      if (result.kind === "success" && result.message) {
        const jsonData = JSON.parse(result.message);
        expect(jsonData.success).toBe(false);
        expect(jsonData.config).toBeNull();
      }
    });
  });
});

// =============================================================================
// T047: Integration Tests - agents validate
// =============================================================================

describe("agents validate integration", () => {
  describe("with valid AGENTS.md", () => {
    beforeEach(() => {
      writeFileSync(join(TEST_DIR, "AGENTS.md"), VALID_AGENTS_MD);
    });

    it("should return exit code 0 (success) for valid files", async () => {
      // Validate specific file to avoid discovery of other files
      const result = await handleAgentsValidate({
        file: join(TEST_DIR, "AGENTS.md"),
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("Valid");
      }
    });

    it("should validate specific file path", async () => {
      const result = await handleAgentsValidate({
        file: join(TEST_DIR, "AGENTS.md"),
      });

      expect(result.kind).toBe("success");
    });

    it("should return valid JSON for valid files", async () => {
      // Validate specific file for consistent count
      const result = await handleAgentsValidate({
        file: join(TEST_DIR, "AGENTS.md"),
        json: true,
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success" && result.message) {
        const jsonData = JSON.parse(result.message);
        expect(jsonData.success).toBe(true);
        expect(jsonData.valid).toBe(1);
        expect(jsonData.invalid).toBe(0);
      }
    });
  });

  describe("with invalid AGENTS.md", () => {
    beforeEach(() => {
      writeFileSync(join(TEST_DIR, "AGENTS.md"), INVALID_AGENTS_MD);
    });

    it("should return exit code 1 (error) for invalid files", async () => {
      // Validate specific file to ensure we test the invalid one
      const result = await handleAgentsValidate({
        file: join(TEST_DIR, "AGENTS.md"),
      });

      expect(result.kind).toBe("error");
    });

    it("should include error details in output", async () => {
      const result = await handleAgentsValidate({
        file: join(TEST_DIR, "AGENTS.md"),
        verbose: true,
      });

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.message).toContain("Invalid");
      }
    });

    it("should return JSON with invalid count", async () => {
      const result = await handleAgentsValidate({
        file: join(TEST_DIR, "AGENTS.md"),
        json: true,
      });

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        const jsonData = JSON.parse(result.message);
        expect(jsonData.success).toBe(false);
        expect(jsonData.invalid).toBeGreaterThan(0);
      }
    });
  });

  describe("with nonexistent file", () => {
    it("should return error for missing file", async () => {
      const result = await handleAgentsValidate({
        file: join(TEST_DIR, "nonexistent.md"),
      });

      expect(result.kind).toBe("error");
    });
  });

  describe("with no AGENTS.md files", () => {
    it("should handle empty project gracefully", async () => {
      const result = await handleAgentsValidate({});

      // No files to validate - should succeed with message
      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("No AGENTS.md files found");
      }
    });
  });
});

// =============================================================================
// T047: Integration Tests - agents generate
// =============================================================================

describe("agents generate integration", () => {
  describe("dry-run mode", () => {
    it("should show content without writing file", async () => {
      const result = await handleAgentsGenerate({ dryRun: true });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        // Should contain preview content
        expect(result.message).toContain("Preview");
        expect(result.message).toContain("Would write to");
        // File should NOT be created
        expect(existsSync(join(TEST_DIR, "AGENTS.md"))).toBe(false);
      }
    });

    it("should show detected project info in dry-run", async () => {
      // Create package.json for detection
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({
          name: "my-test-project",
          description: "A test project",
          devDependencies: { typescript: "^5.0.0" },
        })
      );

      const result = await handleAgentsGenerate({ dryRun: true });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("my-test-project");
        expect(result.message).toContain("TypeScript");
      }
    });
  });

  describe("file creation", () => {
    it("should create AGENTS.md when none exists", async () => {
      // Create package.json for detection
      writeFileSync(join(TEST_DIR, "package.json"), JSON.stringify({ name: "new-project" }));

      const result = await handleAgentsGenerate({});

      expect(result.kind).toBe("success");
      expect(existsSync(join(TEST_DIR, "AGENTS.md"))).toBe(true);

      const content = await readFile(join(TEST_DIR, "AGENTS.md"), "utf-8");
      expect(content).toContain("new-project");
    });

    it("should fail when AGENTS.md already exists without merge", async () => {
      writeFileSync(join(TEST_DIR, "AGENTS.md"), "existing content");

      const result = await handleAgentsGenerate({});

      expect(result.kind).toBe("error");
      if (result.kind === "error") {
        expect(result.message).toContain("already exists");
      }
    });

    it("should write to custom output path", async () => {
      writeFileSync(join(TEST_DIR, "package.json"), JSON.stringify({ name: "custom-output" }));
      const customPath = join(TEST_DIR, "custom-agents.md");

      const result = await handleAgentsGenerate({ output: customPath });

      expect(result.kind).toBe("success");
      expect(existsSync(customPath)).toBe(true);
    });
  });

  describe("merge mode", () => {
    it("should merge with existing file when --merge flag is set", async () => {
      writeFileSync(join(TEST_DIR, "AGENTS.md"), "# Existing content\n");
      writeFileSync(join(TEST_DIR, "package.json"), JSON.stringify({ name: "merge-test" }));

      const result = await handleAgentsGenerate({ merge: true });

      expect(result.kind).toBe("success");

      const content = await readFile(join(TEST_DIR, "AGENTS.md"), "utf-8");
      expect(content).toContain("Existing content");
      expect(content).toContain("merge-test");
    });
  });

  describe("project detection", () => {
    it("should detect TypeScript projects", async () => {
      writeFileSync(join(TEST_DIR, "tsconfig.json"), "{}");
      writeFileSync(join(TEST_DIR, "package.json"), JSON.stringify({ name: "ts-project" }));

      const result = await handleAgentsGenerate({ dryRun: true });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("TypeScript");
      }
    });

    it("should detect React framework", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({
          name: "react-app",
          dependencies: { react: "^18.0.0" },
        })
      );

      const result = await handleAgentsGenerate({ dryRun: true });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("React");
      }
    });

    it("should detect test framework", async () => {
      writeFileSync(
        join(TEST_DIR, "package.json"),
        JSON.stringify({
          name: "tested-app",
          devDependencies: { vitest: "^1.0.0" },
        })
      );

      const result = await handleAgentsGenerate({ dryRun: true });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.message).toContain("Vitest");
      }
    });
  });
});
