/**
 * Built-in Skills
 *
 * This directory contains built-in skills that ship with Vellum.
 * These provide foundational guidance for common development patterns.
 *
 * Built-in skills have the lowest priority (25) and can be overridden
 * by workspace, user, or global skills with the same name.
 *
 * @module skill/builtin
 */

/**
 * List of built-in skill names
 */
export const BUILTIN_SKILL_NAMES = [
  "typescript-testing",
  "react-components",
  "api-design",
  "security-review",
] as const;

/**
 * Type for built-in skill names
 */
export type BuiltinSkillName = (typeof BUILTIN_SKILL_NAMES)[number];
