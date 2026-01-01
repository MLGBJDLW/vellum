// ============================================
// Context Agents Types
// ============================================
// Type definitions for AGENTS.md protocol implementation.
// These types represent the parsed and merged configuration
// from various agent instruction files.

/**
 * Tool permission parsed from the allowed-tools frontmatter field.
 * Supports glob patterns, @group references, and argument restrictions.
 *
 * @example
 * ```yaml
 * allowed-tools:
 *   - "@readonly"           # Group pattern
 *   - "!Bash"               # Negated pattern
 *   - "Bash(npm run *)"     # Pattern with args
 * ```
 */
export interface ToolPermission {
  /** Glob pattern or @group reference (e.g., "Read*", "@readonly", "Bash") */
  pattern: string;
  /** True if the pattern starts with ! (negation) */
  negated: boolean;
  /** Allowed argument patterns when specified with parentheses */
  args?: string[];
}

/**
 * Warning generated during AGENTS.md parsing.
 * Non-fatal issues that don't prevent configuration loading.
 */
export interface AgentsWarning {
  /** File path where the warning occurred */
  file: string;
  /** Line number in the file (1-indexed) */
  line?: number;
  /** Human-readable warning message */
  message: string;
  /** Warning severity level */
  severity: "warn" | "info";
}

/**
 * Merge configuration controlling how multiple AGENTS.md files combine.
 */
export interface AgentsMergeConfig {
  /**
   * Merge strategy for combining configurations:
   * - extend: Child extends parent (default)
   * - replace: Child completely replaces parent
   * - strict: No merging, use first matching file only
   */
  strategy: "extend" | "replace" | "strict";
  /**
   * Array merging behavior:
   * - append: Add child items after parent (default)
   * - replace: Child array replaces parent array
   */
  arrays: "append" | "replace";
}

/**
 * Scope configuration for conditional activation.
 * Defines which files/directories the configuration applies to.
 */
export interface AgentsScopeConfig {
  /** Glob patterns for files/directories to include */
  include: string[];
  /** Glob patterns for files/directories to exclude */
  exclude: string[];
}

/**
 * Fully loaded and merged agents configuration.
 * Represents the final configuration after all files are
 * discovered, parsed, and merged together.
 */
export interface AgentsConfig {
  /** Optional human-readable name for this configuration */
  name?: string;
  /** Optional description of what this configuration does */
  description?: string;
  /** Optional version string (e.g., "1.0.0") */
  version?: string;
  /** Priority level for merge ordering (higher = more precedence) */
  priority: number;
  /** Parsed tool permissions from allowed-tools field */
  allowedTools: ToolPermission[];
  /** Merged body content containing instructions/rules */
  instructions: string;
  /** Merge configuration controlling combination behavior */
  merge: AgentsMergeConfig;
  /** Scope configuration for conditional activation */
  scope: AgentsScopeConfig;
  /** File paths that contributed to this configuration */
  sources: string[];
}

/**
 * Result of an AGENTS.md loading operation.
 * Contains the configuration along with any warnings/errors
 * and cache metadata.
 */
export interface AgentsLoadResult {
  /** Merged configuration (null if all files failed to parse) */
  config: AgentsConfig | null;
  /** Non-fatal warnings from parsing */
  warnings: AgentsWarning[];
  /** Fatal errors that prevented file parsing */
  errors: Error[];
  /** Whether this result was served from cache */
  fromCache: boolean;
}

/**
 * Location of an AGENTS.md file with priority and source info.
 * Used during discovery to track where files came from.
 */
export interface AgentsFileLocation {
  /** Absolute or relative path to the file */
  path: string;
  /** Priority for merge ordering (higher = more precedence) */
  priority: number;
  /** Source category for the file location */
  source: "project" | "workspace" | "user" | "global";
}

/**
 * File type classification for different agent instruction formats.
 * Maps file patterns to their source tool/format.
 */
export type AgentsFileType =
  | "agents"
  | "claude"
  | "cursor"
  | "cline"
  | "roo"
  | "windsurf"
  | "gemini"
  | "copilot"
  | "custom";
