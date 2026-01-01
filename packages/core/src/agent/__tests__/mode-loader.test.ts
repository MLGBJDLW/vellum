import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentLevel } from "../level.js";
import {
  createModeLoader,
  ModeFileNotFoundError,
  type ModeLoader,
  ModeValidationError,
} from "../mode-loader.js";

const TEST_DIR = join(process.cwd(), ".test-mode-loader");
const MODES_DIR = join(TEST_DIR, "modes");

describe("ModeLoader", () => {
  let loader: ModeLoader;

  beforeEach(async () => {
    loader = createModeLoader();
    await mkdir(MODES_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("createModeLoader", () => {
    it("should create a ModeLoader instance", () => {
      const loader = createModeLoader();
      expect(loader).toBeDefined();
      expect(loader.loadFromFile).toBeInstanceOf(Function);
      expect(loader.loadFromDirectory).toBeInstanceOf(Function);
      expect(loader.discoverModes).toBeInstanceOf(Function);
    });
  });

  describe("loadFromFile", () => {
    it("should load a valid YAML mode configuration", async () => {
      const yamlContent = `
name: "Coder Agent"
slug: "coder"
level: "worker"
roleDefinition: "You are a coding expert."
tools:
  edit: true
  bash: true
`;
      const filePath = join(MODES_DIR, "coder.yaml");
      await writeFile(filePath, yamlContent);

      const mode = await loader.loadFromFile(filePath);

      expect(mode.name).toBe("coder");
      expect(mode.description).toBe("Coder Agent");
      expect(mode.level).toBe(AgentLevel.worker);
      expect(mode.prompt).toBe("You are a coding expert.");
      expect(mode.tools.edit).toBe(true);
      expect(mode.tools.bash).toBe(true);
    });

    it("should load mode with customInstructions appended to prompt", async () => {
      const yamlContent = `
name: "Architect"
slug: "architect"
level: "workflow"
roleDefinition: "You are a system architect."
customInstructions: "Always consider scalability."
`;
      const filePath = join(MODES_DIR, "architect.yaml");
      await writeFile(filePath, yamlContent);

      const mode = await loader.loadFromFile(filePath);

      expect(mode.prompt).toBe("You are a system architect.\n\nAlways consider scalability.");
    });

    it("should load mode with numeric level", async () => {
      const yamlContent = `
name: "Orchestrator"
slug: "orchestrator"
level: 0
roleDefinition: "You coordinate agents."
`;
      const filePath = join(MODES_DIR, "orchestrator.yaml");
      await writeFile(filePath, yamlContent);

      const mode = await loader.loadFromFile(filePath);

      expect(mode.level).toBe(AgentLevel.orchestrator);
    });

    it("should load mode with all optional fields", async () => {
      const yamlContent = `
name: "Full Mode"
slug: "full"
level: "orchestrator"
description: "A mode with all fields"
roleDefinition: "You are comprehensive."
customInstructions: "Be thorough."
tools:
  edit: true
  bash: "readonly"
  web: true
  mcp: false
temperature: 0.5
maxTokens: 4096
extendedThinking: true
canSpawnAgents:
  - "worker-a"
  - "worker-b"
fileRestrictions:
  - pattern: "src/**/*.ts"
    access: "write"
  - pattern: "*.config.js"
    access: "read"
toolGroups:
  - group: "filesystem"
    enabled: true
  - group: "network"
    enabled: false
parentMode: "base-orchestrator"
maxConcurrentSubagents: 5
`;
      const filePath = join(MODES_DIR, "full.yaml");
      await writeFile(filePath, yamlContent);

      const mode = await loader.loadFromFile(filePath);

      expect(mode.name).toBe("full");
      expect(mode.description).toBe("A mode with all fields");
      expect(mode.level).toBe(AgentLevel.orchestrator);
      expect(mode.tools.bash).toBe("readonly");
      expect(mode.tools.web).toBe(true);
      expect(mode.tools.mcp).toBe(false);
      expect(mode.temperature).toBe(0.5);
      expect(mode.maxTokens).toBe(4096);
      expect(mode.extendedThinking).toBe(true);
      expect(mode.canSpawnAgents).toEqual(["worker-a", "worker-b"]);
      expect(mode.fileRestrictions).toHaveLength(2);
      expect(mode.fileRestrictions?.[0]).toEqual({ pattern: "src/**/*.ts", access: "write" });
      expect(mode.toolGroups).toHaveLength(2);
      expect(mode.parentMode).toBe("base-orchestrator");
      expect(mode.maxConcurrentSubagents).toBe(5);
    });

    it("should throw ModeFileNotFoundError for non-existent file", async () => {
      const filePath = join(MODES_DIR, "non-existent.yaml");

      await expect(loader.loadFromFile(filePath)).rejects.toThrow(ModeFileNotFoundError);
      await expect(loader.loadFromFile(filePath)).rejects.toThrow(/Mode file not found/);
    });

    it("should throw ModeValidationError for invalid YAML syntax", async () => {
      const invalidYaml = `
name: "Bad YAML
slug: missing-quote
`;
      const filePath = join(MODES_DIR, "invalid-syntax.yaml");
      await writeFile(filePath, invalidYaml);

      await expect(loader.loadFromFile(filePath)).rejects.toThrow(ModeValidationError);
      await expect(loader.loadFromFile(filePath)).rejects.toThrow(/Invalid YAML syntax/);
    });

    it("should throw ModeValidationError for missing required fields", async () => {
      const yamlContent = `
name: "Missing Fields"
slug: "missing"
`;
      const filePath = join(MODES_DIR, "missing-fields.yaml");
      await writeFile(filePath, yamlContent);

      await expect(loader.loadFromFile(filePath)).rejects.toThrow(ModeValidationError);
    });

    it("should throw ModeValidationError for invalid level", async () => {
      const yamlContent = `
name: "Invalid Level"
slug: "invalid-level"
level: "super-agent"
roleDefinition: "Test"
`;
      const filePath = join(MODES_DIR, "invalid-level.yaml");
      await writeFile(filePath, yamlContent);

      await expect(loader.loadFromFile(filePath)).rejects.toThrow(ModeValidationError);
    });

    it("should load .yml extension files", async () => {
      const yamlContent = `
name: "YML Mode"
slug: "yml-mode"
level: "worker"
roleDefinition: "Test yml extension"
`;
      const filePath = join(MODES_DIR, "mode.yml");
      await writeFile(filePath, yamlContent);

      const mode = await loader.loadFromFile(filePath);

      expect(mode.name).toBe("yml-mode");
    });

    it("should default tools to false when not specified", async () => {
      const yamlContent = `
name: "No Tools"
slug: "no-tools"
level: "worker"
roleDefinition: "Minimal mode"
`;
      const filePath = join(MODES_DIR, "no-tools.yaml");
      await writeFile(filePath, yamlContent);

      const mode = await loader.loadFromFile(filePath);

      expect(mode.tools.edit).toBe(false);
      expect(mode.tools.bash).toBe(false);
    });
  });

  describe("loadFromDirectory", () => {
    it("should load all YAML files from directory", async () => {
      // Create multiple mode files
      await writeFile(
        join(MODES_DIR, "coder.yaml"),
        `
name: "Coder"
slug: "coder"
level: "worker"
roleDefinition: "Code mode"
`
      );
      await writeFile(
        join(MODES_DIR, "planner.yml"),
        `
name: "Planner"
slug: "planner"
level: "workflow"
roleDefinition: "Plan mode"
`
      );

      const modes = await loader.loadFromDirectory(MODES_DIR);

      expect(modes).toHaveLength(2);
      const slugs = modes.map((m) => m.name);
      expect(slugs).toContain("coder");
      expect(slugs).toContain("planner");
    });

    it("should ignore non-YAML files", async () => {
      await writeFile(
        join(MODES_DIR, "mode.yaml"),
        `
name: "Valid Mode"
slug: "valid"
level: "worker"
roleDefinition: "Test"
`
      );
      await writeFile(join(MODES_DIR, "readme.txt"), "This is a text file");
      await writeFile(join(MODES_DIR, "config.json"), '{"key": "value"}');

      const modes = await loader.loadFromDirectory(MODES_DIR);

      expect(modes).toHaveLength(1);
      expect(modes[0]?.name).toBe("valid");
    });

    it("should return empty array for empty directory", async () => {
      const modes = await loader.loadFromDirectory(MODES_DIR);

      expect(modes).toEqual([]);
    });

    it("should throw ModeFileNotFoundError for non-existent directory", async () => {
      const nonExistentDir = join(TEST_DIR, "non-existent");

      await expect(loader.loadFromDirectory(nonExistentDir)).rejects.toThrow(ModeFileNotFoundError);
    });

    it("should throw ModeFileNotFoundError when path is a file", async () => {
      const filePath = join(TEST_DIR, "file.txt");
      await writeFile(filePath, "content");

      await expect(loader.loadFromDirectory(filePath)).rejects.toThrow(ModeFileNotFoundError);
    });

    it("should propagate validation errors from individual files", async () => {
      await writeFile(
        join(MODES_DIR, "invalid.yaml"),
        `
name: "Invalid"
slug: "invalid"
`
      );

      await expect(loader.loadFromDirectory(MODES_DIR)).rejects.toThrow(ModeValidationError);
    });
  });

  describe("discoverModes", () => {
    it("should discover modes from multiple directories", async () => {
      const dir1 = join(TEST_DIR, "dir1");
      const dir2 = join(TEST_DIR, "dir2");
      await mkdir(dir1, { recursive: true });
      await mkdir(dir2, { recursive: true });

      await writeFile(
        join(dir1, "mode1.yaml"),
        `
name: "Mode 1"
slug: "mode-1"
level: "worker"
roleDefinition: "First mode"
`
      );
      await writeFile(
        join(dir2, "mode2.yaml"),
        `
name: "Mode 2"
slug: "mode-2"
level: "workflow"
roleDefinition: "Second mode"
`
      );

      const modes = await loader.discoverModes([dir1, dir2]);

      expect(modes).toHaveLength(2);
      const slugs = modes.map((m) => m.name);
      expect(slugs).toContain("mode-1");
      expect(slugs).toContain("mode-2");
    });

    it("should deduplicate modes by slug (later paths win)", async () => {
      const dir1 = join(TEST_DIR, "dir1");
      const dir2 = join(TEST_DIR, "dir2");
      await mkdir(dir1, { recursive: true });
      await mkdir(dir2, { recursive: true });

      // Same slug in both directories
      await writeFile(
        join(dir1, "coder.yaml"),
        `
name: "Coder V1"
slug: "coder"
level: "worker"
roleDefinition: "Version 1"
`
      );
      await writeFile(
        join(dir2, "coder.yaml"),
        `
name: "Coder V2"
slug: "coder"
level: "worker"
roleDefinition: "Version 2"
`
      );

      const modes = await loader.discoverModes([dir1, dir2]);

      expect(modes).toHaveLength(1);
      expect(modes[0]?.description).toBe("Coder V2");
      expect(modes[0]?.prompt).toBe("Version 2");
    });

    it("should skip non-existent paths silently", async () => {
      await writeFile(
        join(MODES_DIR, "valid.yaml"),
        `
name: "Valid"
slug: "valid"
level: "worker"
roleDefinition: "Test"
`
      );

      const modes = await loader.discoverModes([
        join(TEST_DIR, "non-existent-1"),
        MODES_DIR,
        join(TEST_DIR, "non-existent-2"),
      ]);

      expect(modes).toHaveLength(1);
      expect(modes[0]?.name).toBe("valid");
    });

    it("should handle mix of files and directories", async () => {
      const subDir = join(TEST_DIR, "subdir");
      await mkdir(subDir, { recursive: true });

      // Single file path
      const singleFile = join(TEST_DIR, "single.yaml");
      await writeFile(
        singleFile,
        `
name: "Single"
slug: "single"
level: "worker"
roleDefinition: "Single file"
`
      );

      // Directory with multiple files
      await writeFile(
        join(subDir, "multi1.yaml"),
        `
name: "Multi 1"
slug: "multi-1"
level: "workflow"
roleDefinition: "In directory"
`
      );
      await writeFile(
        join(subDir, "multi2.yaml"),
        `
name: "Multi 2"
slug: "multi-2"
level: "orchestrator"
roleDefinition: "Also in directory"
`
      );

      const modes = await loader.discoverModes([singleFile, subDir]);

      expect(modes).toHaveLength(3);
      const slugs = modes.map((m) => m.name);
      expect(slugs).toContain("single");
      expect(slugs).toContain("multi-1");
      expect(slugs).toContain("multi-2");
    });

    it("should skip non-YAML files in search paths", async () => {
      const txtFile = join(TEST_DIR, "readme.txt");
      await writeFile(txtFile, "Not a YAML file");

      const modes = await loader.discoverModes([txtFile]);

      expect(modes).toEqual([]);
    });

    it("should return empty array when all paths are non-existent", async () => {
      const modes = await loader.discoverModes([
        join(TEST_DIR, "a"),
        join(TEST_DIR, "b"),
        join(TEST_DIR, "c"),
      ]);

      expect(modes).toEqual([]);
    });

    it("should propagate errors from invalid files", async () => {
      await writeFile(
        join(MODES_DIR, "invalid.yaml"),
        `
name: "Missing Required"
slug: "invalid"
`
      );

      await expect(loader.discoverModes([MODES_DIR])).rejects.toThrow(ModeValidationError);
    });
  });
});
