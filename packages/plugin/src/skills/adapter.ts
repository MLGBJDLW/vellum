/**
 * Skill Adapter for Plugin Skills
 *
 * Converts PluginSkill definitions to Phase 21 core Skill types.
 * Creates SkillSource registries for plugin skill integration.
 *
 * @module plugin/skills/adapter
 */

import * as path from "node:path";

import type { Skill, SkillLoaded, SkillScan, SkillSource } from "@vellum/core";

import type { PluginSkill } from "../types.js";

// =============================================================================
// Constants
// =============================================================================

/** Default priority for plugin skills */
const PLUGIN_SKILL_PRIORITY = 50;

/** Default source type for plugin skills */
const PLUGIN_SKILL_SOURCE: SkillSource = "global";

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Registry of skills from a plugin.
 * Provides lookup and iteration capabilities.
 */
export interface PluginSkillRegistry {
  /** Plugin that owns these skills */
  readonly pluginName: string;
  /** Map of skill name to Skill object */
  readonly skills: ReadonlyMap<string, Skill>;
  /** Get a skill by name */
  get(name: string): Skill | undefined;
  /** Check if a skill exists */
  has(name: string): boolean;
  /** Get all skill names */
  names(): string[];
  /** Get all skills as array */
  all(): Skill[];
  /** Number of skills in registry */
  readonly size: number;
}

// =============================================================================
// Adapter Functions
// =============================================================================

/**
 * Converts a PluginSkill to a Phase 21 SkillScan (L1 metadata).
 *
 * Creates a lightweight scan object suitable for skill discovery
 * and trigger matching without loading full content.
 *
 * @param skill - The PluginSkill to convert
 * @param pluginName - Name of the plugin that provides this skill
 * @returns SkillScan object compatible with core skill system
 *
 * @example
 * ```typescript
 * const pluginSkill: PluginSkill = {
 *   name: "python-testing",
 *   description: "Best practices for Python testing",
 *   filePath: "/path/to/SKILL.md"
 * };
 *
 * const scan = createSkillScan(pluginSkill, "my-plugin");
 * // scan.name === "python-testing"
 * // scan.source === "global"
 * ```
 */
export function createSkillScan(skill: PluginSkill, pluginName: string): SkillScan {
  const skillDir = path.dirname(skill.filePath);

  return {
    name: skill.name,
    description: skill.description,
    triggers: [], // Plugin skills don't have triggers by default
    dependencies: [],
    source: PLUGIN_SKILL_SOURCE,
    path: skillDir,
    priority: PLUGIN_SKILL_PRIORITY,
    tags: [`plugin:${pluginName}`],
  };
}

/**
 * Converts a PluginSkill to a Phase 21 SkillLoaded (L2 full content).
 *
 * Creates a fully loaded skill object with parsed sections.
 * Since PluginSkill doesn't have parsed sections, placeholder values are used.
 *
 * @param skill - The PluginSkill to convert
 * @param pluginName - Name of the plugin that provides this skill
 * @returns SkillLoaded object compatible with core skill system
 *
 * @example
 * ```typescript
 * const loaded = createSkillLoaded(pluginSkill, "my-plugin");
 * // loaded.loadedAt is set to current time
 * // loaded.frontmatter contains basic metadata
 * ```
 */
export function createSkillLoaded(skill: PluginSkill, pluginName: string): SkillLoaded {
  const scan = createSkillScan(skill, pluginName);

  return {
    ...scan,
    frontmatter: {
      name: skill.name,
      description: skill.description,
      priority: PLUGIN_SKILL_PRIORITY,
      triggers: [], // Plugin skills don't have triggers by default
      tags: [`plugin:${pluginName}`],
      dependencies: [],
    },
    rules: "",
    patterns: "",
    antiPatterns: "",
    examples: "",
    referencesSection: "",
    raw: "", // Raw content would be loaded separately if needed
    loadedAt: new Date(),
  };
}

/**
 * Adapts a PluginSkill to a unified Phase 21 Skill object.
 *
 * Creates a Skill with both L1 (scan) and L2 (loaded) data available.
 * This is the main conversion function for plugin skill integration.
 *
 * @param skill - The PluginSkill to adapt
 * @param pluginName - Name of the plugin that provides this skill
 * @returns Skill object with scan and loaded properties
 *
 * @example
 * ```typescript
 * const coreSkill = adaptToSkillSource(pluginSkill, "my-plugin");
 *
 * // Use in skill matching
 * console.log(coreSkill.scan.name);        // "python-testing"
 * console.log(coreSkill.scan.source);      // "global"
 * console.log(coreSkill.loaded?.loadedAt); // Date object
 * ```
 */
export function adaptToSkillSource(skill: PluginSkill, pluginName: string): Skill {
  const scan = createSkillScan(skill, pluginName);
  const loaded = createSkillLoaded(skill, pluginName);

  return {
    scan,
    loaded,
    // accessed is not populated - resources are loaded on demand
  };
}

/**
 * Creates a skill registry from an array of PluginSkills.
 *
 * The registry provides efficient lookup and iteration over skills
 * from a single plugin. Skills are converted to Phase 21 format.
 *
 * @param skills - Array of PluginSkill objects to register
 * @param pluginName - Name of the plugin that owns these skills
 * @returns PluginSkillRegistry with lookup capabilities
 *
 * @example
 * ```typescript
 * const skills = await loadAllSkills("/path/to/skills", "my-plugin");
 * const registry = createSkillRegistry(skills, "my-plugin");
 *
 * // Lookup by name
 * const skill = registry.get("python-testing");
 *
 * // Iterate all skills
 * for (const skill of registry.all()) {
 *   console.log(skill.scan.name);
 * }
 *
 * // Check existence
 * if (registry.has("python-testing")) {
 *   // ...
 * }
 * ```
 */
export function createSkillRegistry(
  skills: PluginSkill[],
  pluginName: string
): PluginSkillRegistry {
  const skillMap = new Map<string, Skill>();

  for (const skill of skills) {
    const adapted = adaptToSkillSource(skill, pluginName);
    skillMap.set(skill.name, adapted);
  }

  return {
    pluginName,
    skills: skillMap,
    get(name: string): Skill | undefined {
      return skillMap.get(name);
    },
    has(name: string): boolean {
      return skillMap.has(name);
    },
    names(): string[] {
      return Array.from(skillMap.keys());
    },
    all(): Skill[] {
      return Array.from(skillMap.values());
    },
    get size(): number {
      return skillMap.size;
    },
  };
}
