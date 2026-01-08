// ============================================
// Watcher Presets
// ============================================
// Pre-configured watcher settings for common use cases.
// Provides standardized watching for config, agents, and skills.
// @see REQ-036: General file watching system

import type { WatcherPreset } from "./types.js";

// ============================================
// Configuration Watcher Preset
// ============================================

/**
 * Preset for watching configuration files.
 * Watches vellum.json, vellum.yaml, and related config files.
 */
export const configWatcherPreset: WatcherPreset = {
  id: "config",
  name: "Config Watcher",
  description: "Watches configuration files for changes",
  include: [
    "vellum.json",
    "vellum.yaml",
    "vellum.yml",
    ".vellum/config.json",
    ".vellum/config.yaml",
    ".vellum/settings.json",
    "package.json", // For vellum config in package.json
  ],
  ignore: [],
  debounceMs: 300,
  recursive: false,
};

// ============================================
// AGENTS.md Watcher Preset
// ============================================

/**
 * Preset for watching AGENTS.md files.
 * Supports hot-reload of agent configuration.
 */
export const agentsWatcherPreset: WatcherPreset = {
  id: "agents",
  name: "Agents Watcher",
  description: "Watches AGENTS.md files for hot-reload support",
  include: ["AGENTS.md", ".vellum/AGENTS.md", ".github/AGENTS.md", "**/AGENTS.md"],
  ignore: ["**/node_modules/**", "**/.git/**"],
  debounceMs: 300,
  recursive: true,
};

// ============================================
// Skills Watcher Preset
// ============================================

/**
 * Preset for watching skill files.
 * Monitors SKILL.md files for cache invalidation.
 */
export const skillsWatcherPreset: WatcherPreset = {
  id: "skills",
  name: "Skills Watcher",
  description: "Watches SKILL.md files for skill system changes",
  include: [
    ".vellum/skills/**/SKILL.md",
    ".github/skills/**/SKILL.md",
    ".vellum/skills-*/**/SKILL.md",
    ".github/skills-*/**/SKILL.md",
  ],
  ignore: ["**/node_modules/**", "**/.git/**"],
  debounceMs: 300,
  recursive: true,
};

// ============================================
// Source Code Watcher Preset
// ============================================

/**
 * Preset for watching source code files.
 * Common patterns for TypeScript/JavaScript projects.
 */
export const sourceWatcherPreset: WatcherPreset = {
  id: "source",
  name: "Source Watcher",
  description: "Watches source code files for changes",
  include: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.mts", "**/*.mjs"],
  ignore: [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/*.d.ts",
    "**/*.test.ts",
    "**/*.spec.ts",
  ],
  debounceMs: 200,
  recursive: true,
};

// ============================================
// Test Files Watcher Preset
// ============================================

/**
 * Preset for watching test files.
 */
export const testWatcherPreset: WatcherPreset = {
  id: "tests",
  name: "Test Watcher",
  description: "Watches test files for changes",
  include: [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/*.test.tsx",
    "**/*.spec.tsx",
    "**/__tests__/**/*.ts",
    "**/__tests__/**/*.tsx",
  ],
  ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
  debounceMs: 200,
  recursive: true,
};

// ============================================
// Documentation Watcher Preset
// ============================================

/**
 * Preset for watching documentation files.
 */
export const docsWatcherPreset: WatcherPreset = {
  id: "docs",
  name: "Docs Watcher",
  description: "Watches documentation files for changes",
  include: ["**/*.md", "**/*.mdx", "**/docs/**"],
  ignore: ["**/node_modules/**", "**/.git/**", "**/CHANGELOG.md"],
  debounceMs: 500,
  recursive: true,
};

// ============================================
// All Presets Map
// ============================================

/**
 * Map of all available watcher presets.
 */
export const WATCHER_PRESETS: Record<string, WatcherPreset> = {
  config: configWatcherPreset,
  agents: agentsWatcherPreset,
  skills: skillsWatcherPreset,
  source: sourceWatcherPreset,
  tests: testWatcherPreset,
  docs: docsWatcherPreset,
};

/**
 * Get a watcher preset by ID.
 *
 * @param id - Preset ID
 * @returns The preset or undefined if not found
 */
export function getWatcherPreset(id: string): WatcherPreset | undefined {
  return WATCHER_PRESETS[id];
}

/**
 * Get all available preset IDs.
 */
export function getWatcherPresetIds(): string[] {
  return Object.keys(WATCHER_PRESETS);
}
