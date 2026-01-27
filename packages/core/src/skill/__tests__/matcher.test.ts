// ============================================
// Skill Matcher Tests - T042
// ============================================

import { beforeEach, describe, expect, it } from "vitest";

import { type MatchContext, SkillMatcher } from "../matcher.js";
import { type SkillScan, type SkillSource, TRIGGER_TYPE_MULTIPLIERS } from "../types.js";

// =============================================================================
// Test Fixtures
// =============================================================================

function createSkillScan(
  name: string,
  triggers: SkillScan["triggers"],
  priority: number = 50,
  source: SkillSource = "workspace"
): SkillScan {
  return {
    name,
    description: `Skill ${name}`,
    triggers,
    dependencies: [],
    source,
    path: `/skills/${name}`,
    version: "1.0.0",
    priority,
    tags: [],
  };
}

function createContext(overrides: Partial<MatchContext> = {}): MatchContext {
  return {
    request: "",
    files: [],
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("SkillMatcher", () => {
  let matcher: SkillMatcher;

  beforeEach(() => {
    matcher = new SkillMatcher();
  });

  // ===========================================================================
  // Trigger Type Multipliers Tests
  // ===========================================================================

  describe("trigger type multipliers", () => {
    it("should have correct multiplier values", () => {
      expect(TRIGGER_TYPE_MULTIPLIERS.command).toBe(100);
      expect(TRIGGER_TYPE_MULTIPLIERS.keyword).toBe(10);
      expect(TRIGGER_TYPE_MULTIPLIERS.mode).toBe(8);
      expect(TRIGGER_TYPE_MULTIPLIERS.file_pattern).toBe(5);
      expect(TRIGGER_TYPE_MULTIPLIERS.context).toBe(3);
      expect(TRIGGER_TYPE_MULTIPLIERS.always).toBe(1);
    });

    it("should maintain priority ordering", () => {
      expect(TRIGGER_TYPE_MULTIPLIERS.command).toBeGreaterThan(TRIGGER_TYPE_MULTIPLIERS.keyword);
      expect(TRIGGER_TYPE_MULTIPLIERS.keyword).toBeGreaterThan(TRIGGER_TYPE_MULTIPLIERS.mode);
      expect(TRIGGER_TYPE_MULTIPLIERS.mode).toBeGreaterThan(TRIGGER_TYPE_MULTIPLIERS.file_pattern);
      expect(TRIGGER_TYPE_MULTIPLIERS.file_pattern).toBeGreaterThan(
        TRIGGER_TYPE_MULTIPLIERS.context
      );
      expect(TRIGGER_TYPE_MULTIPLIERS.context).toBeGreaterThan(TRIGGER_TYPE_MULTIPLIERS.always);
    });
  });

  // ===========================================================================
  // "always" Trigger Tests
  // ===========================================================================

  describe("always trigger", () => {
    it("should always match", () => {
      const skill = createSkillScan("always-skill", [{ type: "always" }]);
      const context = createContext({ request: "anything" });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
      expect(match?.matchedTrigger.type).toBe("always");
    });

    it("should match even with empty context", () => {
      const skill = createSkillScan("always-skill", [{ type: "always" }]);
      const context = createContext();

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should calculate score as priority × always_multiplier", () => {
      const skill = createSkillScan("always-skill", [{ type: "always" }], 50);
      const context = createContext();

      const match = matcher.matchSkill(skill, context);

      expect(match?.score).toBe(50 * TRIGGER_TYPE_MULTIPLIERS.always);
    });
  });

  // ===========================================================================
  // "command" Trigger Tests
  // ===========================================================================

  describe("command trigger", () => {
    it("should match exact command", () => {
      const skill = createSkillScan("test-skill", [{ type: "command", pattern: "test" }]);
      const context = createContext({ command: "test" });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
      expect(match?.matchedTrigger.type).toBe("command");
    });

    it("should match command case-insensitively", () => {
      const skill = createSkillScan("test-skill", [{ type: "command", pattern: "TEST" }]);
      const context = createContext({ command: "test" });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should strip leading slashes from pattern", () => {
      const skill = createSkillScan("test-skill", [{ type: "command", pattern: "/test" }]);
      const context = createContext({ command: "test" });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should strip leading slashes from command", () => {
      const skill = createSkillScan("test-skill", [{ type: "command", pattern: "test" }]);
      const context = createContext({ command: "/test" });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should not match different commands", () => {
      const skill = createSkillScan("test-skill", [{ type: "command", pattern: "test" }]);
      const context = createContext({ command: "lint" });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should not match when no command provided", () => {
      const skill = createSkillScan("test-skill", [{ type: "command", pattern: "test" }]);
      const context = createContext({ command: undefined });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should calculate score as priority × command_multiplier", () => {
      const skill = createSkillScan("test-skill", [{ type: "command", pattern: "test" }], 50);
      const context = createContext({ command: "test" });

      const match = matcher.matchSkill(skill, context);

      expect(match?.score).toBe(50 * TRIGGER_TYPE_MULTIPLIERS.command);
    });
  });

  // ===========================================================================
  // "keyword" Trigger Tests
  // ===========================================================================

  describe("keyword trigger", () => {
    it("should match regex pattern", () => {
      const skill = createSkillScan("test-skill", [{ type: "keyword", pattern: "test|testing" }]);
      const context = createContext({ request: "I want to write tests" });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
      expect(match?.matchedTrigger.type).toBe("keyword");
    });

    it("should match case-insensitively", () => {
      const skill = createSkillScan("test-skill", [{ type: "keyword", pattern: "TEST" }]);
      const context = createContext({ request: "run the test suite" });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should support complex regex patterns", () => {
      const skill = createSkillScan("test-skill", [
        { type: "keyword", pattern: "unit\\s+test|integration\\s+test" },
      ]);
      const context = createContext({ request: "write unit tests for auth" });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should fall back to literal match for invalid regex", () => {
      const skill = createSkillScan("test-skill", [
        { type: "keyword", pattern: "[unclosed" }, // Invalid regex
      ]);
      const context = createContext({ request: "something with [unclosed bracket" });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should not match when pattern not found", () => {
      const skill = createSkillScan("test-skill", [{ type: "keyword", pattern: "deploy" }]);
      const context = createContext({ request: "write some code" });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should not match empty request", () => {
      const skill = createSkillScan("test-skill", [{ type: "keyword", pattern: "test" }]);
      const context = createContext({ request: "" });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should calculate score as priority × keyword_multiplier", () => {
      const skill = createSkillScan("test-skill", [{ type: "keyword", pattern: "test" }], 50);
      const context = createContext({ request: "run tests" });

      const match = matcher.matchSkill(skill, context);

      expect(match?.score).toBe(50 * TRIGGER_TYPE_MULTIPLIERS.keyword);
    });
  });

  // ===========================================================================
  // "mode" Trigger Tests
  // ===========================================================================

  describe("mode trigger", () => {
    it("should match exact mode", () => {
      const skill = createSkillScan("test-skill", [{ type: "mode", pattern: "code" }]);
      const context = createContext({ mode: "code" });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
      expect(match?.matchedTrigger.type).toBe("mode");
    });

    it("should not match different mode", () => {
      const skill = createSkillScan("test-skill", [{ type: "mode", pattern: "code" }]);
      const context = createContext({ mode: "plan" });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should not match when no mode provided", () => {
      const skill = createSkillScan("test-skill", [{ type: "mode", pattern: "code" }]);
      const context = createContext({});

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should calculate score as priority × mode_multiplier", () => {
      const skill = createSkillScan("test-skill", [{ type: "mode", pattern: "spec" }], 50);
      const context = createContext({ mode: "spec" });

      const match = matcher.matchSkill(skill, context);

      expect(match?.score).toBe(50 * TRIGGER_TYPE_MULTIPLIERS.mode);
    });
  });

  // ===========================================================================
  // "file_pattern" Trigger Tests
  // ===========================================================================

  describe("file_pattern trigger", () => {
    it("should match glob pattern", () => {
      const skill = createSkillScan("test-skill", [
        { type: "file_pattern", pattern: "**/*.test.ts" },
      ]);
      const context = createContext({ files: ["src/utils/helper.test.ts"] });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
      expect(match?.matchedTrigger.type).toBe("file_pattern");
    });

    it("should match any file in the list", () => {
      const skill = createSkillScan("test-skill", [{ type: "file_pattern", pattern: "*.ts" }]);
      const context = createContext({
        files: ["README.md", "package.json", "index.ts"],
      });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should handle Windows-style paths", () => {
      const skill = createSkillScan("test-skill", [
        { type: "file_pattern", pattern: "**/*.test.ts" },
      ]);
      const context = createContext({
        files: ["src\\utils\\helper.test.ts"], // Windows path
      });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should match complex glob patterns", () => {
      const skill = createSkillScan("test-skill", [
        { type: "file_pattern", pattern: "src/**/components/**/*.tsx" },
      ]);
      const context = createContext({
        files: ["src/features/auth/components/LoginForm/LoginForm.tsx"],
      });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should not match when no file matches", () => {
      const skill = createSkillScan("test-skill", [
        { type: "file_pattern", pattern: "**/*.test.ts" },
      ]);
      const context = createContext({ files: ["src/index.ts", "package.json"] });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should not match with empty files array", () => {
      const skill = createSkillScan("test-skill", [{ type: "file_pattern", pattern: "**/*.ts" }]);
      const context = createContext({ files: [] });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should handle invalid glob patterns gracefully", () => {
      const skill = createSkillScan("test-skill", [
        { type: "file_pattern", pattern: "[invalid" }, // Invalid glob
      ]);
      const context = createContext({ files: ["src/file.ts"] });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull(); // Should not crash, just not match
    });

    it("should calculate score as priority × file_pattern_multiplier", () => {
      const skill = createSkillScan(
        "test-skill",
        [{ type: "file_pattern", pattern: "**/*.ts" }],
        50
      );
      const context = createContext({ files: ["index.ts"] });

      const match = matcher.matchSkill(skill, context);

      expect(match?.score).toBe(50 * TRIGGER_TYPE_MULTIPLIERS.file_pattern);
    });
  });

  // ===========================================================================
  // "context" Trigger Tests
  // ===========================================================================

  describe("context trigger", () => {
    it("should match key:value pattern", () => {
      const skill = createSkillScan("react-skill", [
        { type: "context", pattern: "framework:react" },
      ]);
      const context = createContext({
        projectContext: { framework: "react", language: "typescript" },
      });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
      expect(match?.matchedTrigger.type).toBe("context");
    });

    it("should match case-insensitively", () => {
      const skill = createSkillScan("react-skill", [
        { type: "context", pattern: "framework:REACT" },
      ]);
      const context = createContext({
        projectContext: { framework: "react" },
      });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should support regex value patterns", () => {
      const skill = createSkillScan("typescript-skill", [
        { type: "context", pattern: "language:type.*" },
      ]);
      const context = createContext({
        projectContext: { language: "typescript" },
      });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should check key existence when no value provided", () => {
      const skill = createSkillScan("test-skill", [{ type: "context", pattern: "framework" }]);
      const context = createContext({
        projectContext: { framework: "any-framework" },
      });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should not match when key missing", () => {
      const skill = createSkillScan("react-skill", [
        { type: "context", pattern: "framework:react" },
      ]);
      const context = createContext({
        projectContext: { language: "typescript" },
      });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should not match when value differs", () => {
      const skill = createSkillScan("react-skill", [
        { type: "context", pattern: "framework:react" },
      ]);
      const context = createContext({
        projectContext: { framework: "vue" },
      });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should not match without projectContext", () => {
      const skill = createSkillScan("react-skill", [
        { type: "context", pattern: "framework:react" },
      ]);
      const context = createContext({ projectContext: undefined });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should calculate score as priority × context_multiplier", () => {
      const skill = createSkillScan(
        "react-skill",
        [{ type: "context", pattern: "framework:react" }],
        50
      );
      const context = createContext({
        projectContext: { framework: "react" },
      });

      const match = matcher.matchSkill(skill, context);

      expect(match?.score).toBe(50 * TRIGGER_TYPE_MULTIPLIERS.context);
    });
  });

  // ===========================================================================
  // Multiple Triggers Tests
  // ===========================================================================

  describe("multiple triggers", () => {
    it("should use best matching trigger", () => {
      const skill = createSkillScan("test-skill", [
        { type: "always" },
        { type: "keyword", pattern: "test" },
        { type: "command", pattern: "test" },
      ]);
      const context = createContext({ request: "run tests", command: "test" });

      const match = matcher.matchSkill(skill, context);

      // Command has highest multiplier
      expect(match?.matchedTrigger.type).toBe("command");
    });

    it("should fall back to lower priority trigger", () => {
      const skill = createSkillScan("test-skill", [
        { type: "always" },
        { type: "keyword", pattern: "test" },
        { type: "command", pattern: "lint" }, // Won't match
      ]);
      const context = createContext({ request: "run tests", command: "other" });

      const match = matcher.matchSkill(skill, context);

      // Keyword matches, command doesn't
      expect(match?.matchedTrigger.type).toBe("keyword");
    });

    it("should still match with always as fallback", () => {
      const skill = createSkillScan("test-skill", [
        { type: "always" },
        { type: "command", pattern: "specific" },
      ]);
      const context = createContext({ command: "other" });

      const match = matcher.matchSkill(skill, context);

      expect(match?.matchedTrigger.type).toBe("always");
    });
  });

  // ===========================================================================
  // matchAll Tests
  // ===========================================================================

  describe("matchAll", () => {
    it("should match multiple skills", () => {
      const skills = [
        createSkillScan("skill-a", [{ type: "keyword", pattern: "test" }]),
        createSkillScan("skill-b", [{ type: "keyword", pattern: "test" }]),
        createSkillScan("skill-c", [{ type: "keyword", pattern: "other" }]),
      ];
      const context = createContext({ request: "run tests" });

      const matches = matcher.matchAll(skills, context);

      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.skill.scan.name)).toContain("skill-a");
      expect(matches.map((m) => m.skill.scan.name)).toContain("skill-b");
    });

    it("should sort by score descending", () => {
      const skills = [
        createSkillScan("low-priority", [{ type: "always" }], 10),
        createSkillScan("high-priority", [{ type: "always" }], 100),
        createSkillScan("medium-priority", [{ type: "always" }], 50),
      ];
      const context = createContext();

      const matches = matcher.matchAll(skills, context);

      expect(matches[0]?.skill.scan.name).toBe("high-priority");
      expect(matches[1]?.skill.scan.name).toBe("medium-priority");
      expect(matches[2]?.skill.scan.name).toBe("low-priority");
    });

    it("should handle empty skills array", () => {
      const context = createContext({ request: "test" });

      const matches = matcher.matchAll([], context);

      expect(matches).toHaveLength(0);
    });

    it("should return empty when no skills match", () => {
      const skills = [
        createSkillScan("skill-a", [{ type: "command", pattern: "specific" }]),
        createSkillScan("skill-b", [{ type: "keyword", pattern: "unique" }]),
      ];
      const context = createContext({ request: "something else" });

      const matches = matcher.matchAll(skills, context);

      expect(matches).toHaveLength(0);
    });
  });

  // ===========================================================================
  // evaluateTrigger Tests
  // ===========================================================================

  describe("evaluateTrigger", () => {
    it("should return multiplier for matched trigger", () => {
      const context = createContext({ request: "test" });

      const score = matcher.evaluateTrigger({ type: "keyword", pattern: "test" }, context);

      expect(score).toBe(TRIGGER_TYPE_MULTIPLIERS.keyword);
    });

    it("should return 0 for unmatched trigger", () => {
      const context = createContext({ request: "something" });

      const score = matcher.evaluateTrigger({ type: "keyword", pattern: "other" }, context);

      expect(score).toBe(0);
    });
  });

  // ===========================================================================
  // Edge Cases Tests
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle skill with no triggers", () => {
      const skill = createSkillScan("no-trigger-skill", []);
      const context = createContext({ request: "anything" });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should handle skill with undefined pattern", () => {
      const skill = createSkillScan("undefined-pattern", [
        // biome-ignore lint/suspicious/noExplicitAny: Intentionally testing undefined pattern
        { type: "keyword", pattern: undefined as any },
      ]);
      const context = createContext({ request: "test" });

      const match = matcher.matchSkill(skill, context);

      expect(match).toBeNull();
    });

    it("should handle very long request text", () => {
      const longRequest = "test ".repeat(10000);
      const skill = createSkillScan("test-skill", [{ type: "keyword", pattern: "test" }]);
      const context = createContext({ request: longRequest });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });

    it("should handle many files in context", () => {
      const manyFiles = Array.from({ length: 1000 }, (_, i) => `file${i}.ts`);
      const skill = createSkillScan("test-skill", [
        { type: "file_pattern", pattern: "file999.ts" },
      ]);
      const context = createContext({ files: manyFiles });

      const match = matcher.matchSkill(skill, context);

      expect(match).not.toBeNull();
    });
  });
});
