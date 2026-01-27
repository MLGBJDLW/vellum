// ============================================
// Skill Permission Utilities
// ============================================
// Shared permission checking logic for skills.
// Uses picomatch for consistent glob pattern matching.

import picomatch from "picomatch";

import type { SkillPermission, SkillPermissionRule } from "./types.js";

/**
 * Check permission for loading a skill.
 * Uses picomatch for glob pattern matching against rules.
 * Rules are checked in order (first match wins).
 *
 * @param skillName - Name of the skill to check
 * @param rules - Permission rules to check against
 * @param defaultPermission - Default permission if no rules match
 * @returns Permission level for the skill
 *
 * @example
 * ```typescript
 * const rules = [
 *   { pattern: "dangerous-*", permission: "deny" },
 *   { pattern: "internal-*", permission: "ask" },
 * ];
 * checkSkillPermission("dangerous-tool", rules); // "deny"
 * checkSkillPermission("safe-tool", rules); // "allow" (default)
 * ```
 */
export function checkSkillPermission(
  skillName: string,
  rules: SkillPermissionRule[] = [],
  defaultPermission: SkillPermission = "allow"
): SkillPermission {
  // Check rules in order (first match wins)
  for (const rule of rules) {
    const isMatch = picomatch(rule.pattern, {
      nocase: true,
      bash: true,
    });

    if (isMatch(skillName)) {
      return rule.permission;
    }
  }

  return defaultPermission;
}
