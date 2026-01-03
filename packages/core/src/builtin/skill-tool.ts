/**
 * Skill Tool
 *
 * Loads a skill by name with permission checking.
 * Returns skill content (rules, patterns, examples) for prompt injection.
 *
 * @module builtin/skill-tool
 */

import { z } from "zod";

import type { SkillManager } from "../skill/manager.js";
import type { SkillConfig, SkillExecutionResult, SkillPermission } from "../skill/types.js";
import { defineTool, fail, ok } from "../types/index.js";

// ============================================
// Skill Tool Parameters
// ============================================

/**
 * Schema for skill tool parameters.
 */
export const skillParamsSchema = z.object({
  /** Name of the skill to load */
  name: z.string().min(1).describe("The name of the skill to load"),
});

/** Inferred type for skill parameters */
export type SkillParams = z.infer<typeof skillParamsSchema>;

/** Output type for skill tool */
export type SkillOutput = SkillExecutionResult;

// ============================================
// Shared Skill Manager Instance
// ============================================

/** Shared skill manager instance (lazy initialized) */
let sharedManager: SkillManager | null = null;

/** Skill configuration for permission checking */
let skillConfig: SkillConfig | null = null;

/**
 * Set the shared skill manager instance.
 * Should be called during agent initialization.
 *
 * @param manager - SkillManager instance to use
 */
export function setSkillManager(manager: SkillManager): void {
  sharedManager = manager;
}

/**
 * Get the shared skill manager instance.
 *
 * @returns The shared SkillManager or null if not set
 */
export function getSkillManager(): SkillManager | null {
  return sharedManager;
}

/**
 * Set the skill configuration for permission checking.
 *
 * @param config - SkillConfig to use for permissions
 */
export function setSkillConfig(config: SkillConfig): void {
  skillConfig = config;
}

/**
 * Check permission for loading a skill.
 *
 * @param skillName - Name of the skill to check
 * @returns Permission level for the skill
 */
function checkPermission(skillName: string): SkillPermission {
  if (!skillConfig?.permissions) {
    return "allow"; // Default to allow if no config
  }

  const { rules = [], default: defaultPermission = "allow" } = skillConfig.permissions;

  // Check rules in order (first match wins)
  for (const rule of rules) {
    // Simple glob matching (supports * and ?)
    const pattern = rule.pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape regex special chars except * and ?
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");

    const regex = new RegExp(`^${pattern}$`, "i");
    if (regex.test(skillName)) {
      return rule.permission;
    }
  }

  return defaultPermission;
}

/**
 * Estimate token count for skill content.
 *
 * @param content - Content to estimate
 * @returns Estimated token count
 */
function estimateTokens(content: string): number {
  // Rough estimate: ~4 chars per token for English text
  return Math.ceil(content.length / 4);
}

// ============================================
// Skill Tool Implementation
// ============================================

/**
 * Skill tool implementation.
 *
 * Loads a skill by name and returns its content (rules, patterns, examples).
 * Performs permission checking before loading.
 *
 * @example
 * ```typescript
 * // Load a skill
 * const result = await skillTool.execute(
 *   { name: "python-testing" },
 *   ctx
 * );
 *
 * if (result.ok && result.value.success) {
 *   console.log(result.value.output); // Skill content
 * }
 * ```
 */
export const skillTool = defineTool<typeof skillParamsSchema, SkillOutput>({
  name: "skill",
  description:
    "Load a skill by name to get specialized rules, patterns, and examples for the current task. " +
    "Skills provide domain-specific knowledge that helps produce better results.",
  parameters: skillParamsSchema,
  kind: "read",
  category: "skill",

  async execute(input, ctx) {
    // Check for cancellation
    if (ctx.abortSignal.aborted) {
      return fail("Operation was cancelled");
    }

    const { name } = input;

    // Check permission
    const permission = checkPermission(name);

    if (permission === "deny") {
      return ok({
        success: false,
        error: `Permission denied: Skill '${name}' is not allowed by configuration`,
      });
    }

    if (permission === "ask") {
      // For 'ask' permission, we need user confirmation
      // This should be handled by the permission system
      const allowed = await ctx.checkPermission(`load skill: ${name}`);
      if (!allowed) {
        return ok({
          success: false,
          error: `Permission denied: User declined to load skill '${name}'`,
        });
      }
    }

    // Get or create skill manager
    if (!sharedManager) {
      return ok({
        success: false,
        error: "Skill system not initialized. SkillManager not available.",
      });
    }

    // Ensure manager is initialized
    if (!sharedManager.isInitialized()) {
      try {
        await sharedManager.initialize();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return ok({
          success: false,
          error: `Failed to initialize skill system: ${message}`,
        });
      }
    }

    // Load the skill
    const loaded = await sharedManager.loadSkill(name);

    if (!loaded) {
      return ok({
        success: false,
        error: `Skill not found: '${name}'`,
      });
    }

    // Build output content
    const sections: string[] = [];

    sections.push(`# Skill: ${loaded.name}`);
    sections.push("");
    sections.push(`**Description:** ${loaded.description}`);
    sections.push("");

    if (loaded.rules?.trim()) {
      sections.push("## Rules");
      sections.push("");
      sections.push(loaded.rules);
      sections.push("");
    }

    if (loaded.patterns?.trim()) {
      sections.push("## Patterns");
      sections.push("");
      sections.push(loaded.patterns);
      sections.push("");
    }

    if (loaded.antiPatterns?.trim()) {
      sections.push("## Anti-Patterns");
      sections.push("");
      sections.push(loaded.antiPatterns);
      sections.push("");
    }

    if (loaded.examples?.trim()) {
      sections.push("## Examples");
      sections.push("");
      sections.push(loaded.examples);
      sections.push("");
    }

    if (loaded.referencesSection?.trim()) {
      sections.push("## References");
      sections.push("");
      sections.push(loaded.referencesSection);
      sections.push("");
    }

    const output = sections.join("\n").trim();

    return ok({
      success: true,
      output,
      metadata: {
        skillName: loaded.name,
        source: loaded.source,
        loadedAt: loaded.loadedAt,
        tokenEstimate: estimateTokens(output),
      },
    });
  },

  shouldConfirm(_input, _ctx) {
    // Read-only tool, no confirmation needed by default
    return false;
  },
});
