// ============================================
// Skill Manager Tests - T043
// ============================================

import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import type { SkillLoader } from "../loader.js";
import { SkillManager } from "../manager.js";
import type { MatchContext, SkillMatcher } from "../matcher.js";
import type { SkillConfig, SkillLoaded, SkillMatch, SkillScan, SkillSource } from "../types.js";

// =============================================================================
// Mock modules
// =============================================================================

vi.mock("../loader.js");
vi.mock("../matcher.js");

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockScan(
  name: string,
  triggers: SkillScan["triggers"] = [{ type: "always" }],
  source: SkillSource = "workspace"
): SkillScan {
  return {
    name,
    description: `Description for ${name}`,
    triggers,
    dependencies: [],
    source,
    path: `/skills/${name}`,
    version: "1.0.0",
    priority: 50,
    tags: ["test"],
  };
}

function createMockLoaded(
  name: string,
  source: SkillSource = "workspace",
  options: Partial<{
    rules: string;
    patterns: string;
    antiPatterns: string;
    examples: string;
    referencesSection: string;
    compatibility: { tools?: string[]; denyTools?: string[] };
  }> = {}
): SkillLoaded {
  return {
    ...createMockScan(name, [{ type: "always" }], source),
    frontmatter: {
      name,
      description: `Description for ${name}`,
      triggers: [{ type: "always" }],
      dependencies: [],
      priority: 50,
      tags: ["test"],
      compatibility: options.compatibility,
    },
    rules: options.rules ?? `Rules for ${name}`,
    patterns: options.patterns ?? `Patterns for ${name}`,
    antiPatterns: options.antiPatterns ?? `Anti-patterns for ${name}`,
    examples: options.examples ?? `Examples for ${name}`,
    referencesSection: options.referencesSection ?? `References for ${name}`,
    raw: `Raw content for ${name}`,
    loadedAt: new Date(),
  };
}

function createMockMatch(skill: SkillScan, score: number = 100): SkillMatch {
  return {
    skill: { scan: skill },
    score,
    // biome-ignore lint/style/noNonNullAssertion: Test helper with known trigger
    matchedTrigger: skill.triggers[0]!,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("SkillManager", () => {
  let manager: SkillManager;
  let mockLoader: MockedObject<SkillLoader>;
  let mockMatcher: MockedObject<SkillMatcher>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock loader
    mockLoader = {
      initialize: vi.fn().mockResolvedValue(3),
      reinitialize: vi.fn(),
      loadL2: vi.fn(),
      accessL3: vi.fn(),
      getAllScans: vi.fn().mockReturnValue([]),
      getSkillNames: vi.fn().mockReturnValue([]),
      hasSkill: vi.fn(),
      getSkill: vi.fn(),
      getCacheEntry: vi.fn(),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      getCacheStats: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
      setWorkspacePath: vi.fn(),
      scanL1: vi.fn(),
      resolveDependencies: vi.fn(),
      loadWithDependencies: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
    } as any;

    // Setup mock matcher
    mockMatcher = {
      matchAll: vi.fn().mockReturnValue([]),
      matchSkill: vi.fn(),
      evaluateTrigger: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
    } as any;

    manager = new SkillManager({
      loaderInstance: mockLoader,
      matcherInstance: mockMatcher,
    });
  });

  // ===========================================================================
  // Initialization Tests
  // ===========================================================================

  describe("initialization", () => {
    it("should initialize loader", async () => {
      const count = await manager.initialize();

      expect(count).toBe(3);
      expect(mockLoader.initialize).toHaveBeenCalledTimes(1);
      expect(manager.isInitialized()).toBe(true);
    });

    it("should throw if not initialized", () => {
      const uninitManager = new SkillManager({
        // biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
        loaderInstance: { ...mockLoader, isInitialized: vi.fn().mockReturnValue(false) } as any,
        matcherInstance: mockMatcher,
      });

      // Access method that requires initialization
      expect(() => uninitManager.getAllSkills()).toThrow("SkillManager not initialized");
    });
  });

  // ===========================================================================
  // getActiveSkills Tests
  // ===========================================================================

  describe("getActiveSkills", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should return matched and loaded skills", async () => {
      const scans = [createMockScan("skill-a"), createMockScan("skill-b")];
      // biome-ignore lint/style/noNonNullAssertion: Test data with known values
      const matches = [createMockMatch(scans[0]!), createMockMatch(scans[1]!)];

      mockLoader.getAllScans.mockReturnValue(scans);
      mockMatcher.matchAll.mockReturnValue(matches);
      mockLoader.loadL2
        .mockResolvedValueOnce({ status: "success", skill: createMockLoaded("skill-a") })
        .mockResolvedValueOnce({ status: "success", skill: createMockLoaded("skill-b") });

      const context: MatchContext = {
        request: "test something",
        files: [],
      };

      const skills = await manager.getActiveSkills(context);

      expect(skills).toHaveLength(2);
      expect(mockMatcher.matchAll).toHaveBeenCalledWith(scans, context);
      expect(mockLoader.loadL2).toHaveBeenCalledTimes(2);
    });

    it("should handle skills that fail to load", async () => {
      const scans = [createMockScan("skill-a"), createMockScan("skill-b")];
      // biome-ignore lint/style/noNonNullAssertion: Test data with known values
      const matches = [createMockMatch(scans[0]!), createMockMatch(scans[1]!)];

      mockLoader.getAllScans.mockReturnValue(scans);
      mockMatcher.matchAll.mockReturnValue(matches);
      mockLoader.loadL2
        .mockResolvedValueOnce({ status: "success", skill: createMockLoaded("skill-a") })
        .mockResolvedValueOnce({ status: "error", skillId: "skill-b", error: "Parse error" }); // skill-b fails to load

      const context: MatchContext = { request: "test", files: [] };

      const skills = await manager.getActiveSkills(context);

      expect(skills).toHaveLength(1);
      expect(skills[0]?.name).toBe("skill-a");
    });

    it("should return empty array when no matches", async () => {
      mockLoader.getAllScans.mockReturnValue([createMockScan("skill-a")]);
      mockMatcher.matchAll.mockReturnValue([]);

      const context: MatchContext = { request: "no match", files: [] };

      const skills = await manager.getActiveSkills(context);

      expect(skills).toHaveLength(0);
    });
  });

  // ===========================================================================
  // loadSkill Tests
  // ===========================================================================

  describe("loadSkill", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should load skill by name", async () => {
      const loaded = createMockLoaded("test-skill");
      mockLoader.loadL2.mockResolvedValue({ status: "success", skill: loaded });

      const result = await manager.loadSkill("test-skill");

      expect(result).toBe(loaded);
      expect(mockLoader.loadL2).toHaveBeenCalledWith("test-skill");
    });

    it("should return null for unknown skill", async () => {
      mockLoader.loadL2.mockResolvedValue({ status: "not-found", skillId: "unknown" });

      const result = await manager.loadSkill("unknown");

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getAllSkills / getSkill Tests
  // ===========================================================================

  describe("skill access", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should return all skills", () => {
      const scans = [createMockScan("skill-a"), createMockScan("skill-b")];
      mockLoader.getAllScans.mockReturnValue(scans);

      const result = manager.getAllSkills();

      expect(result).toBe(scans);
    });

    it("should find skill by name", () => {
      const scans = [createMockScan("skill-a"), createMockScan("skill-b")];
      mockLoader.getAllScans.mockReturnValue(scans);

      const result = manager.getSkill("skill-a");

      expect(result?.name).toBe("skill-a");
    });

    it("should return undefined for unknown skill", () => {
      mockLoader.getAllScans.mockReturnValue([createMockScan("skill-a")]);

      const result = manager.getSkill("unknown");

      expect(result).toBeUndefined();
    });
  });

  // ===========================================================================
  // buildPromptSections Tests
  // ===========================================================================

  describe("buildPromptSections", () => {
    it("should build sections from loaded skills", () => {
      const skills = [createMockLoaded("skill-a")];

      const sections = manager.buildPromptSections(skills);

      expect(sections.length).toBeGreaterThan(0);

      // Verify section types
      const sectionNames = sections.map((s) => s.name);
      expect(sectionNames).toContain("rules");
      expect(sectionNames).toContain("patterns");
      expect(sectionNames).toContain("antiPatterns");
    });

    it("should sort sections by priority", () => {
      const skills = [createMockLoaded("skill-a")];

      const sections = manager.buildPromptSections(skills);

      // Rules (100) should come before antiPatterns (90) before patterns (50)
      const rulesIndex = sections.findIndex((s) => s.name === "rules");
      const antiPatternsIndex = sections.findIndex((s) => s.name === "antiPatterns");
      const patternsIndex = sections.findIndex((s) => s.name === "patterns");

      expect(rulesIndex).toBeLessThan(antiPatternsIndex);
      expect(antiPatternsIndex).toBeLessThan(patternsIndex);
    });

    it("should include skill name in sections", () => {
      const skills = [createMockLoaded("my-skill")];

      const sections = manager.buildPromptSections(skills);

      for (const section of sections) {
        expect(section.skillName).toBe("my-skill");
      }
    });

    it("should skip empty sections", () => {
      const skill = createMockLoaded("skill-with-empty", "workspace", {
        rules: "Some rules",
        patterns: "", // Empty
        antiPatterns: "  ", // Whitespace only
        examples: "Some examples",
        referencesSection: "",
      });

      const sections = manager.buildPromptSections([skill]);

      const sectionNames = sections.map((s) => s.name);
      expect(sectionNames).toContain("rules");
      expect(sectionNames).toContain("examples");
      expect(sectionNames).not.toContain("patterns");
      expect(sectionNames).not.toContain("antiPatterns");
      expect(sectionNames).not.toContain("references");
    });

    it("should merge sections from multiple skills", () => {
      const skills = [createMockLoaded("skill-a"), createMockLoaded("skill-b")];

      const sections = manager.buildPromptSections(skills);

      const rulesSections = sections.filter((s) => s.name === "rules");
      expect(rulesSections).toHaveLength(2);
      expect(rulesSections.map((s) => s.skillName)).toContain("skill-a");
      expect(rulesSections.map((s) => s.skillName)).toContain("skill-b");
    });

    it("should return empty array for empty skills", () => {
      const sections = manager.buildPromptSections([]);

      expect(sections).toHaveLength(0);
    });
  });

  // ===========================================================================
  // buildCombinedPrompt Tests
  // ===========================================================================

  describe("buildCombinedPrompt", () => {
    it("should format sections into single string", () => {
      const skills = [createMockLoaded("skill-a")];

      const prompt = manager.buildCombinedPrompt(skills);

      expect(prompt).toContain("## Rules");
      expect(prompt).toContain("Rules for skill-a");
    });

    it("should group by section type", () => {
      const skills = [createMockLoaded("skill-a"), createMockLoaded("skill-b")];

      const prompt = manager.buildCombinedPrompt(skills);

      // Should have section headers
      expect(prompt).toContain("## Rules");
      expect(prompt).toContain("## Patterns");

      // With multiple skills, should show source
      expect(prompt).toContain("### From: skill-a");
      expect(prompt).toContain("### From: skill-b");
    });

    it("should return empty string for no skills", () => {
      const prompt = manager.buildCombinedPrompt([]);

      expect(prompt).toBe("");
    });
  });

  // ===========================================================================
  // getMandatorySkillCheck Tests
  // ===========================================================================

  describe("getMandatorySkillCheck", () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it("should generate skill listing", () => {
      const scans = [
        createMockScan("test-skill", [{ type: "keyword", pattern: "test" }]),
        createMockScan("lint-skill", [{ type: "command", pattern: "lint" }]),
      ];
      mockLoader.getAllScans.mockReturnValue(scans);

      const block = manager.getMandatorySkillCheck();

      expect(block).toContain("## Available Skills");
      expect(block).toContain("### test-skill");
      expect(block).toContain("### lint-skill");
      expect(block).toContain("**Description:**");
      expect(block).toContain("**Triggers:**");
    });

    it("should show trigger patterns", () => {
      const scans = [createMockScan("skill-a", [{ type: "keyword", pattern: "test|spec" }])];
      mockLoader.getAllScans.mockReturnValue(scans);

      const block = manager.getMandatorySkillCheck();

      expect(block).toContain("keyword: `test|spec`");
    });

    it("should show always trigger", () => {
      const scans = [createMockScan("always-skill", [{ type: "always" }])];
      mockLoader.getAllScans.mockReturnValue(scans);

      const block = manager.getMandatorySkillCheck();

      expect(block).toContain("Always active");
    });

    it("should return comment when no skills", () => {
      mockLoader.getAllScans.mockReturnValue([]);

      const block = manager.getMandatorySkillCheck();

      expect(block).toContain("No skills available");
    });
  });

  // ===========================================================================
  // checkPermission Tests
  // ===========================================================================

  describe("checkPermission", () => {
    it("should return allow by default (no config)", () => {
      const result = manager.checkPermission("any-skill");

      expect(result).toBe("allow");
    });

    it("should use default permission from config", () => {
      const config: SkillConfig = {
        permissions: {
          default: "ask",
        },
      };
      manager.setConfig(config);

      const result = manager.checkPermission("any-skill");

      expect(result).toBe("ask");
    });

    it("should match glob patterns in rules", () => {
      const config: SkillConfig = {
        permissions: {
          default: "allow",
          rules: [
            { pattern: "dangerous-*", permission: "deny" },
            { pattern: "trusted-*", permission: "allow" },
          ],
        },
      };
      manager.setConfig(config);

      expect(manager.checkPermission("dangerous-tool")).toBe("deny");
      expect(manager.checkPermission("trusted-helper")).toBe("allow");
      expect(manager.checkPermission("other-skill")).toBe("allow"); // default
    });

    it("should use first matching rule", () => {
      const config: SkillConfig = {
        permissions: {
          default: "allow",
          rules: [
            { pattern: "skill-*", permission: "deny" },
            { pattern: "skill-special", permission: "allow" }, // Won't be reached
          ],
        },
      };
      manager.setConfig(config);

      // First rule matches
      expect(manager.checkPermission("skill-special")).toBe("deny");
    });

    it("should match case-insensitively", () => {
      const config: SkillConfig = {
        permissions: {
          default: "allow",
          rules: [{ pattern: "MySkill", permission: "deny" }],
        },
      };
      manager.setConfig(config);

      expect(manager.checkPermission("myskill")).toBe("deny");
      expect(manager.checkPermission("MYSKILL")).toBe("deny");
    });
  });

  // ===========================================================================
  // getToolRestrictions Tests
  // ===========================================================================

  describe("getToolRestrictions", () => {
    it("should return empty restrictions for no skills", () => {
      const restrictions = manager.getToolRestrictions([]);

      expect(restrictions.allowed).toHaveLength(0);
      expect(restrictions.denied).toHaveLength(0);
    });

    it("should collect allowed tools from skill", () => {
      const skill = createMockLoaded("skill-a", "workspace", {
        compatibility: { tools: ["read_file", "write_file"] },
      });

      const restrictions = manager.getToolRestrictions([skill]);

      expect(restrictions.allowed).toContain("read_file");
      expect(restrictions.allowed).toContain("write_file");
    });

    it("should collect denied tools from skill", () => {
      const skill = createMockLoaded("skill-a", "workspace", {
        compatibility: { denyTools: ["execute_command", "delete_file"] },
      });

      const restrictions = manager.getToolRestrictions([skill]);

      expect(restrictions.denied).toContain("execute_command");
      expect(restrictions.denied).toContain("delete_file");
    });

    it("should compute intersection for allowed tools across multiple skills", () => {
      const skillA = createMockLoaded("skill-a", "workspace", {
        compatibility: { tools: ["read_file", "write_file", "search"] },
      });
      const skillB = createMockLoaded("skill-b", "workspace", {
        compatibility: { tools: ["read_file", "search", "list_dir"] },
      });

      const restrictions = manager.getToolRestrictions([skillA, skillB]);

      // Only read_file and search are in both
      expect(restrictions.allowed).toContain("read_file");
      expect(restrictions.allowed).toContain("search");
      expect(restrictions.allowed).not.toContain("write_file");
      expect(restrictions.allowed).not.toContain("list_dir");
    });

    it("should compute union for denied tools across multiple skills", () => {
      const skillA = createMockLoaded("skill-a", "workspace", {
        compatibility: { denyTools: ["dangerous_tool"] },
      });
      const skillB = createMockLoaded("skill-b", "workspace", {
        compatibility: { denyTools: ["another_dangerous"] },
      });

      const restrictions = manager.getToolRestrictions([skillA, skillB]);

      // Both denied tools should be included
      expect(restrictions.denied).toContain("dangerous_tool");
      expect(restrictions.denied).toContain("another_dangerous");
    });

    it("should handle skills without compatibility field", () => {
      const skill = createMockLoaded("skill-a");
      // Remove compatibility
      // biome-ignore lint/suspicious/noExplicitAny: Intentionally testing undefined field
      (skill as any).frontmatter.compatibility = undefined;

      const restrictions = manager.getToolRestrictions([skill]);

      expect(restrictions.allowed).toHaveLength(0);
      expect(restrictions.denied).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Config Management Tests
  // ===========================================================================

  describe("config management", () => {
    it("should set and get config", () => {
      const config: SkillConfig = {
        permissions: { default: "deny" },
        maxActiveSkills: 5,
      };

      manager.setConfig(config);

      expect(manager.getConfig()).toBe(config);
    });

    it("should start with empty config", () => {
      const config = manager.getConfig();

      expect(config).toEqual({});
    });
  });
});
