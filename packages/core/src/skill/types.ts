// ============================================
// Skill Types
// ============================================
// Core type definitions for the Skills System.
// Implements progressive loading levels (L1 → L2 → L3).
// @see REQ-001

import type { SkillFrontmatter, SkillTrigger, SkillTriggerType } from "@vellum/shared";

// Re-export shared types for convenience
export type { SkillFrontmatter, SkillTrigger, SkillTriggerType };

// ============================================
// Source Types
// ============================================

/**
 * Source of skill files.
 * Determines loading priority and override behavior.
 */
export type SkillSource = "workspace" | "user" | "global" | "plugin" | "builtin";

/**
 * Priority values for skill sources (higher = more precedence).
 * Used for deduplication when same skill exists in multiple sources.
 */
export const SKILL_SOURCE_PRIORITY: Record<SkillSource, number> = {
  workspace: 100, // .vellum/skills/ - highest priority
  user: 75, // ~/.vellum/skills/
  global: 50, // .github/skills/ (Claude compat)
  plugin: 40, // Plugin skills - between global and builtin
  builtin: 25, // Built-in skills - lowest priority
};

/**
 * Location of a discovered skill directory.
 */
export interface SkillLocation {
  /** Absolute path to skill directory */
  path: string;
  /** Absolute path to SKILL.md file */
  manifestPath: string;
  /** Source category */
  source: SkillSource;
  /** Priority for override resolution */
  priority: number;
}

// ============================================
// Progressive Loading Levels
// ============================================

/**
 * L1 Scan result: lightweight metadata (~50-100 tokens).
 * Contains only what's needed for trigger matching and listing.
 * This is the minimum data loaded for all discovered skills.
 */
export interface SkillScan {
  /** Unique skill identifier */
  name: string;
  /** Brief description of the skill */
  description: string;
  /** Trigger patterns for activation */
  triggers: SkillTrigger[];
  /** Dependencies on other skills (by name) */
  dependencies: string[];
  /** Source category where skill was found */
  source: SkillSource;
  /** Absolute path to skill directory */
  path: string;
  /** Skill version (if specified) */
  version?: string;
  /** Priority for skill activation */
  priority: number;
  /** Tags for categorization */
  tags: string[];
}

/**
 * L2 Load result: full SKILL.md content (~500-2000 tokens).
 * Contains parsed sections for prompt injection.
 * Loaded on-demand when skill is activated.
 */
export interface SkillLoaded extends SkillScan {
  /** Full parsed frontmatter */
  frontmatter: SkillFrontmatter;
  /** ## Rules section content */
  rules: string;
  /** ## Patterns section content */
  patterns: string;
  /** ## Anti-Patterns section content */
  antiPatterns: string;
  /** ## Examples section content */
  examples: string;
  /** ## References section content (markdown links/descriptions) */
  referencesSection: string;
  /** Raw SKILL.md content for fallback */
  raw: string;
  /** Timestamp when skill was loaded */
  loadedAt: Date;
}

/**
 * Resource file in skill directory (scripts/, references/, assets/).
 */
export interface SkillResource {
  /** Absolute path to resource */
  path: string;
  /** Path relative to skill directory */
  relativePath: string;
  /** Type of resource */
  type: "script" | "reference" | "asset";
  /** File size in bytes */
  size: number;
  /** Content (loaded on demand) */
  content?: string;
}

/**
 * L3 Access result: resource metadata (variable tokens).
 * Includes scripts, reference files, and assets from skill directory.
 * Actual content is loaded only when explicitly requested.
 */
export interface SkillAccessed extends SkillLoaded {
  /** Script files in scripts/ directory */
  scripts: SkillResource[];
  /** Reference files in references/ directory */
  references: SkillResource[];
  /** Asset files in assets/ directory */
  assets: SkillResource[];
  /** Timestamp when resources were accessed */
  accessedAt: Date;
}

// ============================================
// Unified Skill Type
// ============================================

/**
 * Unified skill state with progressive loading levels.
 * Always has L1 (scan), optionally has L2 (loaded) and L3 (accessed).
 */
export interface Skill {
  /** L1: Always present - lightweight metadata */
  scan: SkillScan;
  /** L2: Present after full load - parsed content */
  loaded?: SkillLoaded;
  /** L3: Present after resource access - file metadata */
  accessed?: SkillAccessed;
}

// ============================================
// Matching Types
// ============================================

/**
 * Result of trigger matching with score.
 * Used to rank skills by relevance to current context.
 */
export interface SkillMatch {
  /** The matched skill */
  skill: Skill;
  /** Match score (higher = more relevant) */
  score: number;
  /** The trigger(s) that matched */
  matchedTrigger: SkillTrigger;
}

/**
 * Trigger type scoring multipliers.
 * Used to calculate match scores based on trigger type.
 */
export const TRIGGER_TYPE_MULTIPLIERS: Record<SkillTriggerType, number> = {
  command: 100, // Explicit slash command - highest priority
  keyword: 10, // Regex pattern match on request text
  file_pattern: 5, // Glob match on context files
  context: 3, // Key:value match on project context
  always: 1, // Always active - lowest priority
};

// ============================================
// Execution Types
// ============================================

/**
 * Result from skill tool execution.
 */
export interface SkillExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Output content (skill rules, patterns, etc.) */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Additional metadata */
  metadata?: SkillResultMetadata;
}

/**
 * Metadata about skill execution.
 */
export interface SkillResultMetadata {
  /** Name of the loaded skill */
  skillName: string;
  /** Source where skill was found */
  source: SkillSource;
  /** When skill was loaded */
  loadedAt: Date;
  /** Estimated token count */
  tokenEstimate: number;
}

// ============================================
// Permission Types
// ============================================

/**
 * Permission levels for skill loading.
 */
export type SkillPermission = "allow" | "ask" | "deny";

/**
 * Permission rule matching pattern to permission level.
 */
export interface SkillPermissionRule {
  /** Glob pattern for skill name */
  pattern: string;
  /** Permission level for matching skills */
  permission: SkillPermission;
}

/**
 * Skill configuration from vellum.config.ts.
 */
export interface SkillConfig {
  /** Permission settings */
  permissions?: {
    /** Default permission for unmatched skills */
    default: SkillPermission;
    /** Rules for specific skill patterns */
    rules?: SkillPermissionRule[];
  };
  /** Maximum number of skills active at once */
  maxActiveSkills?: number;
  /** Source enablement settings */
  sources?: {
    workspace?: boolean;
    user?: boolean;
    global?: boolean;
    builtin?: boolean;
  };
}

// ============================================
// Parse Result Types
// ============================================

/**
 * Result from parsing a SKILL.md file.
 */
export interface SkillParseResult {
  /** L1 scan data (if parsing succeeded) */
  scan: SkillScan | null;
  /** L2 loaded data (if full parse succeeded) */
  loaded: SkillLoaded | null;
  /** Non-fatal warnings encountered */
  warnings: string[];
  /** Fatal errors encountered */
  errors: Error[];
}
