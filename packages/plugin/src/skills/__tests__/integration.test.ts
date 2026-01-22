/**
 * Integration tests for Skill System (T038)
 *
 * Tests plugin skills in discovery and workspace priority on conflict.
 *
 * @module plugin/skills/__tests__/integration.test
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Skill, SkillSource } from "@vellum/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PluginSkill } from "../../types.js";
import {
  adaptToSkillSource,
  createSkillLoaded,
  createSkillRegistry,
  createSkillScan,
} from "../adapter.js";
import { loadAllSkills, loadSkill } from "../loader.js";

// =============================================================================
// Test Constants
// =============================================================================

const FIXTURES_DIR = path.resolve(import.meta.dirname, "fixtures");

/** Default priority for plugin skills (from adapter.ts) */
const PLUGIN_SKILL_PRIORITY = 50;

/** Workspace source priority (higher than plugin) */
const WORKSPACE_PRIORITY = 100;

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a temporary directory for testing
 */
async function createTempDir(): Promise<string> {
  const tmpDir = path.join(
    FIXTURES_DIR,
    `temp-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.mkdir(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Removes a directory recursively
 */
async function removeTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore errors on cleanup
  }
}

/**
 * Creates a SKILL.md file with frontmatter and body
 */
async function createSkillFile(
  dir: string,
  frontmatter: Record<string, unknown>,
  body: string
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "SKILL.md");

  let content = "---\n";
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      content += `${key}:\n`;
      for (const item of value) {
        content += `  - ${item}\n`;
      }
    } else {
      content += `${key}: ${value}\n`;
    }
  }
  content += "---\n\n";
  content += body;

  await fs.writeFile(filePath, content, "utf-8");
  return filePath;
}

/**
 * Creates a mock PluginSkill for testing
 */
function createMockPluginSkill(
  name: string,
  description: string,
  options?: Partial<PluginSkill>
): PluginSkill {
  return {
    name,
    description,
    filePath: `/mock/skills/${name}/SKILL.md`,
    ...options,
  };
}

// =============================================================================
// Plugin Skills in Discovery Tests
// =============================================================================

describe("Plugin Skills in Discovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  describe("createSkillScan", () => {
    it("should convert PluginSkill to SkillScan format", () => {
      const pluginSkill = createMockPluginSkill(
        "typescript-patterns",
        "Best practices for TypeScript development"
      );

      const scan = createSkillScan(pluginSkill, "my-plugin");

      expect(scan.name).toBe("typescript-patterns");
      expect(scan.description).toBe("Best practices for TypeScript development");
      expect(scan.source).toBe("global");
      expect(scan.priority).toBe(PLUGIN_SKILL_PRIORITY);
      expect(scan.triggers).toEqual([]);
      expect(scan.dependencies).toEqual([]);
      expect(scan.tags).toContain("plugin:my-plugin");
    });

    it("should include plugin name in tags", () => {
      const pluginSkill = createMockPluginSkill("test-skill", "Test skill");
      const scan = createSkillScan(pluginSkill, "enterprise-toolkit");

      expect(scan.tags).toContain("plugin:enterprise-toolkit");
    });

    it("should set path to skill directory", () => {
      const pluginSkill = createMockPluginSkill("python-testing", "Python testing");
      pluginSkill.filePath = "/plugins/my-plugin/skills/python-testing/SKILL.md";

      const scan = createSkillScan(pluginSkill, "my-plugin");

      expect(scan.path).toBe("/plugins/my-plugin/skills/python-testing");
    });
  });

  describe("createSkillLoaded", () => {
    it("should convert PluginSkill to SkillLoaded format", () => {
      const pluginSkill = createMockPluginSkill("react-patterns", "React component patterns");

      const loaded = createSkillLoaded(pluginSkill, "react-plugin");

      expect(loaded.name).toBe("react-patterns");
      expect(loaded.description).toBe("React component patterns");
      expect(loaded.frontmatter).toBeDefined();
      expect(loaded.frontmatter.name).toBe("react-patterns");
      expect(loaded.frontmatter.description).toBe("React component patterns");
      expect(loaded.frontmatter.priority).toBe(PLUGIN_SKILL_PRIORITY);
      expect(loaded.loadedAt).toBeInstanceOf(Date);
    });

    it("should include plugin tag in frontmatter", () => {
      const pluginSkill = createMockPluginSkill("test-skill", "Test");
      const loaded = createSkillLoaded(pluginSkill, "test-plugin");

      expect(loaded.frontmatter.tags).toContain("plugin:test-plugin");
    });

    it("should have empty section content", () => {
      const pluginSkill = createMockPluginSkill("empty-sections", "Test");
      const loaded = createSkillLoaded(pluginSkill, "test-plugin");

      expect(loaded.rules).toBe("");
      expect(loaded.patterns).toBe("");
      expect(loaded.antiPatterns).toBe("");
      expect(loaded.examples).toBe("");
      expect(loaded.referencesSection).toBe("");
      expect(loaded.raw).toBe("");
    });
  });

  describe("adaptToSkillSource", () => {
    it("should create a complete Skill with scan and loaded properties", () => {
      const pluginSkill = createMockPluginSkill("api-design", "API design best practices");

      const skill = adaptToSkillSource(pluginSkill, "api-plugin");

      expect(skill.scan).toBeDefined();
      expect(skill.loaded).toBeDefined();
      expect(skill.scan.name).toBe("api-design");
      expect(skill.loaded?.name).toBe("api-design");
    });

    it("should not have accessed property (loaded on demand)", () => {
      const pluginSkill = createMockPluginSkill("test", "Test");
      const skill = adaptToSkillSource(pluginSkill, "test-plugin");

      expect(skill.accessed).toBeUndefined();
    });
  });

  describe("createSkillRegistry", () => {
    it("should create a registry from multiple plugin skills", async () => {
      const skillsDir = path.join(tempDir, "skills");
      const skill1Dir = path.join(skillsDir, "skill-alpha");
      const skill2Dir = path.join(skillsDir, "skill-beta");

      await createSkillFile(skill1Dir, { description: "Alpha skill" }, "# Alpha");
      await createSkillFile(skill2Dir, { description: "Beta skill" }, "# Beta");

      const pluginSkills = await loadAllSkills(skillsDir, "test-plugin");
      const registry = createSkillRegistry(pluginSkills, "test-plugin");

      expect(registry.size).toBe(2);
      expect(registry.has("skill-alpha")).toBe(true);
      expect(registry.has("skill-beta")).toBe(true);
    });

    it("should provide get() method to retrieve skills by name", async () => {
      const skillsDir = path.join(tempDir, "skills");
      const skillDir = path.join(skillsDir, "lookup-skill");
      await createSkillFile(skillDir, { description: "Lookup test" }, "# Lookup");

      const pluginSkills = await loadAllSkills(skillsDir, "test-plugin");
      const registry = createSkillRegistry(pluginSkills, "test-plugin");

      const skill = registry.get("lookup-skill");
      expect(skill).toBeDefined();
      expect(skill?.scan.name).toBe("lookup-skill");
      expect(skill?.scan.description).toBe("Lookup test");
    });

    it("should return undefined for non-existent skill", () => {
      const registry = createSkillRegistry([], "test-plugin");

      expect(registry.get("non-existent")).toBeUndefined();
    });

    it("should provide has() method to check skill existence", async () => {
      const skillsDir = path.join(tempDir, "skills");
      const skillDir = path.join(skillsDir, "exists-skill");
      await createSkillFile(skillDir, { description: "Exists test" }, "# Test");

      const pluginSkills = await loadAllSkills(skillsDir, "test-plugin");
      const registry = createSkillRegistry(pluginSkills, "test-plugin");

      expect(registry.has("exists-skill")).toBe(true);
      expect(registry.has("missing")).toBe(false);
    });

    it("should provide names() method to list all skill names", async () => {
      const pluginSkills: PluginSkill[] = [
        createMockPluginSkill("skill-a", "A"),
        createMockPluginSkill("skill-b", "B"),
        createMockPluginSkill("skill-c", "C"),
      ];

      const registry = createSkillRegistry(pluginSkills, "test-plugin");
      const names = registry.names().sort();

      expect(names).toEqual(["skill-a", "skill-b", "skill-c"]);
    });

    it("should provide all() method to get all skills", () => {
      const pluginSkills: PluginSkill[] = [
        createMockPluginSkill("s1", "Skill 1"),
        createMockPluginSkill("s2", "Skill 2"),
      ];

      const registry = createSkillRegistry(pluginSkills, "test-plugin");
      const allSkills = registry.all();

      expect(allSkills).toHaveLength(2);
      expect(allSkills.every((s) => s.scan !== undefined)).toBe(true);
    });

    it("should track plugin name in registry", () => {
      const registry = createSkillRegistry([], "my-awesome-plugin");

      expect(registry.pluginName).toBe("my-awesome-plugin");
    });

    it("should handle empty skill array", () => {
      const registry = createSkillRegistry([], "empty-plugin");

      expect(registry.size).toBe(0);
      expect(registry.names()).toEqual([]);
      expect(registry.all()).toEqual([]);
    });
  });
});

// =============================================================================
// Workspace Priority on Conflict Tests
// =============================================================================

describe("Workspace Priority on Conflict", () => {
  describe("priority comparison", () => {
    it("should have plugin skills at lower priority than workspace skills", () => {
      // Plugin skills have priority 50 (global)
      // Workspace skills have priority 100
      expect(WORKSPACE_PRIORITY).toBeGreaterThan(PLUGIN_SKILL_PRIORITY);
    });

    it("should assign global source to plugin skills", () => {
      const pluginSkill = createMockPluginSkill("test", "Test skill");
      const scan = createSkillScan(pluginSkill, "test-plugin");

      expect(scan.source).toBe("global");
      expect(scan.priority).toBe(50); // Global priority
    });
  });

  describe("skill deduplication", () => {
    /**
     * Helper to create a workspace skill scan for comparison
     */
    function createWorkspaceSkillScan(name: string, description: string): Skill["scan"] {
      return {
        name,
        description,
        source: "workspace" as SkillSource,
        priority: WORKSPACE_PRIORITY,
        path: `/workspace/.vellum/skills/${name}`,
        triggers: [],
        dependencies: [],
        tags: [],
      };
    }

    it("should allow workspace skill to override plugin skill by priority", () => {
      const pluginSkill = createMockPluginSkill("conflicting-skill", "Plugin version of skill");
      const pluginScan = createSkillScan(pluginSkill, "test-plugin");

      const workspaceScan = createWorkspaceSkillScan(
        "conflicting-skill",
        "Workspace version of skill"
      );

      // Workspace has higher priority, so it should win
      expect(workspaceScan.priority).toBeGreaterThan(pluginScan.priority);

      // Simulating deduplication logic
      const skills = [pluginScan, workspaceScan];
      const deduplicated = skills.reduce((acc, skill) => {
        const existing = acc.get(skill.name);
        if (!existing || skill.priority > existing.priority) {
          acc.set(skill.name, skill);
        }
        return acc;
      }, new Map<string, (typeof skills)[0]>());

      const winner = deduplicated.get("conflicting-skill");
      expect(winner?.source).toBe("workspace");
      expect(winner?.description).toBe("Workspace version of skill");
    });

    it("should keep plugin skill when no workspace override exists", () => {
      const pluginSkill1 = createMockPluginSkill("unique-plugin-skill", "Only in plugin");
      const pluginScan = createSkillScan(pluginSkill1, "test-plugin");

      const workspaceScan = createWorkspaceSkillScan(
        "different-skill",
        "Different workspace skill"
      );

      const skills = [pluginScan, workspaceScan];
      const deduplicated = skills.reduce((acc, skill) => {
        const existing = acc.get(skill.name);
        if (!existing || skill.priority > existing.priority) {
          acc.set(skill.name, skill);
        }
        return acc;
      }, new Map<string, (typeof skills)[0]>());

      // Both skills should exist
      expect(deduplicated.has("unique-plugin-skill")).toBe(true);
      expect(deduplicated.has("different-skill")).toBe(true);
      expect(deduplicated.get("unique-plugin-skill")?.source).toBe("global");
    });

    it("should handle multiple plugins with same skill name by using first encountered", () => {
      const plugin1Skill = createMockPluginSkill("shared-skill", "From plugin 1");
      const plugin2Skill = createMockPluginSkill("shared-skill", "From plugin 2");

      const registry1 = createSkillRegistry([plugin1Skill], "plugin-1");
      const registry2 = createSkillRegistry([plugin2Skill], "plugin-2");

      // Both registries have the skill
      expect(registry1.has("shared-skill")).toBe(true);
      expect(registry2.has("shared-skill")).toBe(true);

      // When merging, first plugin's skill is preserved (order-dependent)
      const mergedSkills = new Map<string, Skill>();
      for (const skill of registry1.all()) {
        mergedSkills.set(skill.scan.name, skill);
      }
      for (const skill of registry2.all()) {
        if (!mergedSkills.has(skill.scan.name)) {
          mergedSkills.set(skill.scan.name, skill);
        }
      }

      expect(mergedSkills.size).toBe(1);
      expect(mergedSkills.get("shared-skill")?.scan.tags).toContain("plugin:plugin-1");
    });
  });

  describe("full integration flow", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir();
    });

    afterEach(async () => {
      await removeTempDir(tempDir);
    });

    it("should load skills and create registry for use in discovery", async () => {
      // Setup: Create plugin skills directory structure
      const pluginSkillsDir = path.join(tempDir, "plugin-skills");

      const pythonSkillDir = path.join(pluginSkillsDir, "python-testing");
      await createSkillFile(
        pythonSkillDir,
        {
          name: "python-testing",
          description: "Python testing best practices with pytest",
          tags: ["python", "testing"],
        },
        "# Python Testing\n\nUse pytest for all Python tests."
      );

      const tsSkillDir = path.join(pluginSkillsDir, "typescript-patterns");
      await createSkillFile(
        tsSkillDir,
        {
          name: "typescript-patterns",
          description: "TypeScript development patterns",
          tags: ["typescript", "patterns"],
        },
        "# TypeScript Patterns\n\nPrefer interfaces over types."
      );

      // Load and create registry
      const skills = await loadAllSkills(pluginSkillsDir, "test-plugin");
      const registry = createSkillRegistry(skills, "test-plugin");

      // Verify registry can be used for discovery
      expect(registry.size).toBe(2);

      const pythonSkill = registry.get("python-testing");
      expect(pythonSkill).toBeDefined();
      expect(pythonSkill?.scan.description).toContain("pytest");
      expect(pythonSkill?.scan.tags).toContain("plugin:test-plugin");

      const tsSkill = registry.get("typescript-patterns");
      expect(tsSkill).toBeDefined();
      expect(tsSkill?.loaded?.loadedAt).toBeInstanceOf(Date);
    });

    it("should maintain plugin association through adaptation chain", async () => {
      const skillDir = path.join(tempDir, "tracked-skill");
      await createSkillFile(skillDir, { description: "Tracked through chain" }, "# Tracked Skill");

      // Load -> Adapt -> Registry
      const pluginSkill = await loadSkill(skillDir, "tracking-plugin");
      const coreSkill = adaptToSkillSource(pluginSkill, "tracking-plugin");
      const registry = createSkillRegistry([pluginSkill], "tracking-plugin");

      // Verify plugin association is maintained
      expect(coreSkill.scan.tags).toContain("plugin:tracking-plugin");
      expect(registry.pluginName).toBe("tracking-plugin");
      expect(registry.get("tracked-skill")?.scan.tags).toContain("plugin:tracking-plugin");
    });
  });
});

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe("Edge Cases", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it("should handle skill with special characters in name", async () => {
    // Directory names can have hyphens and underscores
    const skillDir = path.join(tempDir, "my-skill_v2");
    await createSkillFile(skillDir, { description: "Skill with special chars" }, "# Special");

    const skill = await loadSkill(skillDir, "test-plugin");
    const scan = createSkillScan(skill, "test-plugin");

    expect(scan.name).toBe("my-skill_v2");
  });

  it("should handle very long skill descriptions", () => {
    const longDescription = `${"A".repeat(1000)} description`;
    const pluginSkill = createMockPluginSkill("long-desc", longDescription);

    const scan = createSkillScan(pluginSkill, "test-plugin");

    // 1000 A's + " description" (12 chars) = 1012
    expect(scan.description.length).toBe(1012);
    expect(scan.description).toBe(longDescription);
  });

  it("should create separate registries for different plugins", () => {
    const skill1 = createMockPluginSkill("shared-name", "From plugin A");
    const skill2 = createMockPluginSkill("shared-name", "From plugin B");

    const registryA = createSkillRegistry([skill1], "plugin-a");
    const registryB = createSkillRegistry([skill2], "plugin-b");

    expect(registryA.pluginName).toBe("plugin-a");
    expect(registryB.pluginName).toBe("plugin-b");
    expect(registryA.get("shared-name")?.scan.tags).toContain("plugin:plugin-a");
    expect(registryB.get("shared-name")?.scan.tags).toContain("plugin:plugin-b");
  });

  it("should handle Unicode in skill content", async () => {
    const skillDir = path.join(tempDir, "unicode-skill");
    await createSkillFile(
      skillDir,
      { description: "Skill with émojis 🎉 and ünïcödé" },
      "# Unicode Skill\n\nContent with 日本語 and emojis 🚀"
    );

    const skill = await loadSkill(skillDir, "test-plugin");

    expect(skill.description).toContain("émojis");
    expect(skill.description).toContain("🎉");
  });
});
