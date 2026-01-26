// ============================================
// Skill Permission Tests
// ============================================
// Tests for checkSkillPermission function.

import { describe, expect, it } from "vitest";

import { checkSkillPermission } from "../permission.js";
import type { SkillPermissionRule } from "../types.js";

describe("checkSkillPermission", () => {
  // ===========================================================================
  // Default Behavior Tests
  // ===========================================================================

  describe("default behavior", () => {
    it("should return 'allow' with empty rules array", () => {
      const result = checkSkillPermission("any-skill", []);
      expect(result).toBe("allow");
    });

    it("should return 'allow' when rules is undefined", () => {
      const result = checkSkillPermission("any-skill", undefined);
      expect(result).toBe("allow");
    });

    it("should return custom default permission when no rules match", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "other-*", permission: "deny" }];
      const result = checkSkillPermission("my-skill", rules, "ask");
      expect(result).toBe("ask");
    });

    it("should return 'allow' as default when no defaultPermission provided", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "other-*", permission: "deny" }];
      const result = checkSkillPermission("my-skill", rules);
      expect(result).toBe("allow");
    });
  });

  // ===========================================================================
  // Permission Level Tests
  // ===========================================================================

  describe("permission levels", () => {
    it("should return 'allow' for matching allow rule", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "safe-*", permission: "allow" }];
      const result = checkSkillPermission("safe-tool", rules);
      expect(result).toBe("allow");
    });

    it("should return 'deny' for matching deny rule", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "dangerous-*", permission: "deny" }];
      const result = checkSkillPermission("dangerous-tool", rules);
      expect(result).toBe("deny");
    });

    it("should return 'ask' for matching ask rule", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "internal-*", permission: "ask" }];
      const result = checkSkillPermission("internal-tool", rules);
      expect(result).toBe("ask");
    });
  });

  // ===========================================================================
  // First Match Wins (Rule Priority) Tests
  // ===========================================================================

  describe("first match wins (rule ordering)", () => {
    it("should use first matching rule when multiple rules match", () => {
      const rules: SkillPermissionRule[] = [
        { pattern: "test-*", permission: "deny" },
        { pattern: "test-*", permission: "allow" },
      ];
      const result = checkSkillPermission("test-skill", rules);
      expect(result).toBe("deny"); // First match wins
    });

    it("should stop at first match and ignore later rules", () => {
      const rules: SkillPermissionRule[] = [
        { pattern: "specific-tool", permission: "ask" },
        { pattern: "specific-*", permission: "deny" },
        { pattern: "*", permission: "allow" },
      ];
      const result = checkSkillPermission("specific-tool", rules);
      expect(result).toBe("ask"); // Exact match first
    });

    it("should fallback to default if no rules match", () => {
      const rules: SkillPermissionRule[] = [
        { pattern: "foo-*", permission: "deny" },
        { pattern: "bar-*", permission: "ask" },
      ];
      const result = checkSkillPermission("baz-skill", rules, "allow");
      expect(result).toBe("allow");
    });
  });

  // ===========================================================================
  // Glob Pattern Tests
  // ===========================================================================

  describe("glob patterns", () => {
    it("should match single wildcard (*)", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "test-*", permission: "deny" }];

      expect(checkSkillPermission("test-abc", rules)).toBe("deny");
      expect(checkSkillPermission("test-", rules)).toBe("deny");
      expect(checkSkillPermission("test-123-456", rules)).toBe("deny");
      expect(checkSkillPermission("other-abc", rules)).toBe("allow");
    });

    it("should match double wildcard (**) for nested paths", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "workspace/**", permission: "ask" }];

      expect(checkSkillPermission("workspace/skill", rules)).toBe("ask");
      expect(checkSkillPermission("workspace/deep/nested/skill", rules)).toBe("ask");
      expect(checkSkillPermission("other/skill", rules)).toBe("allow");
    });

    it("should match single character wildcard (?)", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "skill-?", permission: "deny" }];

      expect(checkSkillPermission("skill-a", rules)).toBe("deny");
      expect(checkSkillPermission("skill-1", rules)).toBe("deny");
      expect(checkSkillPermission("skill-ab", rules)).toBe("allow");
      expect(checkSkillPermission("skill-", rules)).toBe("allow");
    });

    it("should match exact patterns without wildcards", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "exact-match", permission: "deny" }];

      expect(checkSkillPermission("exact-match", rules)).toBe("deny");
      expect(checkSkillPermission("exact-match-extra", rules)).toBe("allow");
      expect(checkSkillPermission("not-exact-match", rules)).toBe("allow");
    });

    it("should match catch-all pattern (*)", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "*", permission: "ask" }];

      expect(checkSkillPermission("anything", rules)).toBe("ask");
      expect(checkSkillPermission("skill-name", rules)).toBe("ask");
      expect(checkSkillPermission("x", rules)).toBe("ask");
    });

    it("should match brace expansion patterns", () => {
      const rules: SkillPermissionRule[] = [
        { pattern: "skill-{alpha,beta,gamma}", permission: "deny" },
      ];

      expect(checkSkillPermission("skill-alpha", rules)).toBe("deny");
      expect(checkSkillPermission("skill-beta", rules)).toBe("deny");
      expect(checkSkillPermission("skill-gamma", rules)).toBe("deny");
      expect(checkSkillPermission("skill-delta", rules)).toBe("allow");
    });
  });

  // ===========================================================================
  // Case Insensitivity Tests
  // ===========================================================================

  describe("case insensitivity", () => {
    it("should match case-insensitively by default", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "TEST-*", permission: "deny" }];

      expect(checkSkillPermission("test-skill", rules)).toBe("deny");
      expect(checkSkillPermission("TEST-skill", rules)).toBe("deny");
      expect(checkSkillPermission("Test-Skill", rules)).toBe("deny");
      expect(checkSkillPermission("TeSt-SkIlL", rules)).toBe("deny");
    });

    it("should match skill names with mixed case patterns", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "MySkill-*", permission: "ask" }];

      expect(checkSkillPermission("myskill-test", rules)).toBe("ask");
      expect(checkSkillPermission("MYSKILL-TEST", rules)).toBe("ask");
      expect(checkSkillPermission("MySkill-Test", rules)).toBe("ask");
    });
  });

  // ===========================================================================
  // Complex Scenario Tests
  // ===========================================================================

  describe("complex scenarios", () => {
    it("should handle realistic permission configuration", () => {
      const rules: SkillPermissionRule[] = [
        { pattern: "dangerous-*", permission: "deny" },
        { pattern: "internal-*", permission: "ask" },
        { pattern: "workspace/**", permission: "allow" },
        { pattern: "builtin-*", permission: "allow" },
      ];

      expect(checkSkillPermission("dangerous-tool", rules)).toBe("deny");
      expect(checkSkillPermission("internal-api", rules)).toBe("ask");
      expect(checkSkillPermission("workspace/my-skill", rules)).toBe("allow");
      expect(checkSkillPermission("builtin-search", rules)).toBe("allow");
      expect(checkSkillPermission("random-skill", rules, "allow")).toBe("allow");
    });

    it("should handle empty skill name (picomatch * requires at least one char)", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "*", permission: "deny" }];

      // picomatch's * requires at least one character, so empty string falls to default
      expect(checkSkillPermission("", rules)).toBe("allow");
      expect(checkSkillPermission("x", rules)).toBe("deny");
    });

    it("should handle special characters in skill names", () => {
      const rules: SkillPermissionRule[] = [{ pattern: "skill@v*", permission: "ask" }];

      expect(checkSkillPermission("skill@v1", rules)).toBe("ask");
      expect(checkSkillPermission("skill@v2.0.0", rules)).toBe("ask");
      expect(checkSkillPermission("skill-v1", rules)).toBe("allow");
    });
  });
});
