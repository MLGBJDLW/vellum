// ============================================
// Agents Config Merge
// ============================================
// Implements hierarchical configuration merging for AGENTS.md files.
// Covers REQ-008 (merge), REQ-009 (strategy), REQ-010 (scope).

import picomatch from "picomatch";
import type { AgentsParseResult } from "./parser.js";
import type {
  AgentsConfig,
  AgentsMergeConfig,
  AgentsScopeConfig,
  AgentsWarning,
  ToolPermission,
} from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Options for the merge operation.
 */
export interface MergeOptions {
  /** Current file path for scope filtering (relative or absolute) */
  currentFile?: string;
  /** Whether to throw on type mismatch in strict mode */
  strict?: boolean;
}

/**
 * Result of merging multiple AGENTS.md configurations.
 */
export interface MergedAgentsConfig {
  /** Final merged configuration */
  config: AgentsConfig;
  /** File paths that contributed to this configuration */
  sources: string[];
  /** Scope patterns that matched the current file */
  appliedScopes: string[];
  /** Warnings generated during merge */
  warnings: AgentsWarning[];
}

// ============================================
// Default Values
// ============================================

/**
 * Default merge configuration.
 */
const DEFAULT_MERGE_CONFIG: AgentsMergeConfig = {
  strategy: "extend",
  arrays: "append",
};

/**
 * Default scope configuration (applies to all files).
 */
const DEFAULT_SCOPE_CONFIG: AgentsScopeConfig = {
  include: [],
  exclude: [],
};

/**
 * Creates a default empty AgentsConfig.
 */
function createDefaultConfig(): AgentsConfig {
  return {
    name: undefined,
    description: undefined,
    version: undefined,
    priority: 0,
    allowedTools: [],
    instructions: "",
    merge: { ...DEFAULT_MERGE_CONFIG },
    scope: { ...DEFAULT_SCOPE_CONFIG },
    sources: [],
  };
}

// ============================================
// Scope Filtering (T027)
// ============================================

/**
 * Normalizes a file path for consistent matching.
 * Converts backslashes to forward slashes and removes leading ./
 *
 * @param filePath - Path to normalize
 * @returns Normalized path
 */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Checks if a file matches a set of scope patterns.
 *
 * @param filePath - File path to check
 * @param scope - Scope configuration with include/exclude patterns
 * @returns True if the file matches the scope
 *
 * @example
 * ```typescript
 * matchesScope('src/utils/helper.ts', {
 *   include: ['src/**\/*.ts'],
 *   exclude: ['**\/*.test.ts']
 * }); // true
 *
 * matchesScope('src/utils/helper.test.ts', {
 *   include: ['src/**\/*.ts'],
 *   exclude: ['**\/*.test.ts']
 * }); // false (excluded)
 * ```
 */
export function matchesScope(filePath: string | undefined, scope: AgentsScopeConfig): boolean {
  // No file specified - config applies
  if (!filePath) {
    return true;
  }

  const normalizedPath = normalizePath(filePath);
  const includePatterns = scope.include ?? [];
  const excludePatterns = scope.exclude ?? [];

  // If no include patterns, treat as "include all"
  let included = true;
  if (includePatterns.length > 0) {
    included = includePatterns.some((pattern) =>
      picomatch.isMatch(normalizedPath, pattern, { dot: true })
    );
  }

  // Check exclusions (exclusions take precedence)
  if (excludePatterns.length > 0) {
    const excluded = excludePatterns.some((pattern) =>
      picomatch.isMatch(normalizedPath, pattern, { dot: true })
    );
    if (excluded) {
      return false;
    }
  }

  return included;
}

/**
 * Gets matched include patterns for a file.
 *
 * @param filePath - File path to check
 * @param includePatterns - Include patterns from scope
 * @returns Array of matched patterns
 */
function getMatchedPatterns(filePath: string | undefined, includePatterns: string[]): string[] {
  // No include patterns means "match all"
  if (includePatterns.length === 0) {
    return ["*"];
  }

  // No file path to match
  if (!filePath) {
    return ["*"];
  }

  const normalizedPath = normalizePath(filePath);
  const matched: string[] = [];

  for (const pattern of includePatterns) {
    if (picomatch.isMatch(normalizedPath, pattern, { dot: true })) {
      matched.push(pattern);
    }
  }

  return matched.length > 0 ? matched : ["*"];
}

/**
 * Filters configs based on scope matching for a specific file.
 *
 * @param configs - Array of parsed configs
 * @param currentFile - Current file path for scope matching
 * @returns Configs that apply to the current file, with match info
 */
export function filterByScope(
  configs: AgentsParseResult[],
  currentFile?: string
): { config: AgentsParseResult; matchedPatterns: string[] }[] {
  const results: { config: AgentsParseResult; matchedPatterns: string[] }[] = [];

  for (const config of configs) {
    const scope = config.frontmatter?.scope ?? DEFAULT_SCOPE_CONFIG;
    const normalizedScope: AgentsScopeConfig = {
      include: scope.include ?? [],
      exclude: scope.exclude ?? [],
    };

    if (matchesScope(currentFile, normalizedScope)) {
      const matchedPatterns = getMatchedPatterns(currentFile, normalizedScope.include);
      results.push({ config, matchedPatterns });
    }
  }

  return results;
}

// ============================================
// Array Merging Utilities
// ============================================

/**
 * Merges two arrays of tool permissions based on merge strategy.
 *
 * @param parent - Parent tool permissions
 * @param child - Child tool permissions
 * @param arrayStrategy - How to merge arrays
 * @returns Merged tool permissions
 */
function mergeToolPermissions(
  parent: ToolPermission[],
  child: ToolPermission[],
  arrayStrategy: AgentsMergeConfig["arrays"]
): ToolPermission[] {
  if (arrayStrategy === "replace") {
    return [...child];
  }
  // Default: append
  return [...parent, ...child];
}

/**
 * Merges two instruction strings.
 *
 * @param parent - Parent instructions
 * @param child - Child instructions
 * @param strategy - Merge strategy
 * @returns Merged instructions
 */
function mergeInstructions(
  parent: string,
  child: string,
  strategy: "extend" | "replace" | "strict"
): string {
  if (strategy === "replace") {
    return child;
  }

  // For extend and strict, concatenate with newlines
  const parts = [parent.trim(), child.trim()].filter(Boolean);
  return parts.join("\n\n");
}

// ============================================
// Config Merging (T025, T026)
// ============================================

/**
 * Merges a child configuration into a parent configuration.
 *
 * @param parent - Base configuration
 * @param child - Configuration to merge in
 * @param childMergeSettings - Merge settings from child's frontmatter
 * @returns Merged configuration
 */
function mergeConfigPair(
  parent: AgentsConfig,
  child: AgentsParseResult,
  childMergeSettings: AgentsMergeConfig
): AgentsConfig {
  const { strategy, arrays } = childMergeSettings;

  // Strategy: replace - completely replace parent
  if (strategy === "replace") {
    return {
      name: child.frontmatter?.name ?? undefined,
      description: child.frontmatter?.description ?? undefined,
      version: child.frontmatter?.version ?? undefined,
      priority: child.frontmatter?.priority ?? 0,
      allowedTools: [...child.allowedTools],
      instructions: child.instructions,
      merge: childMergeSettings,
      scope: {
        include: child.frontmatter?.scope?.include ?? [],
        exclude: child.frontmatter?.scope?.exclude ?? [],
      },
      sources: [...parent.sources, child.filePath],
    };
  }

  // Strategy: extend or strict - merge values
  const merged: AgentsConfig = {
    // Scalar values: child overrides parent (last wins)
    name: child.frontmatter?.name ?? parent.name,
    description: child.frontmatter?.description ?? parent.description,
    version: child.frontmatter?.version ?? parent.version,
    priority: child.frontmatter?.priority ?? parent.priority,

    // Additive: instructions appended
    instructions: mergeInstructions(parent.instructions, child.instructions, strategy),

    // Additive: tools merged according to array strategy
    allowedTools: mergeToolPermissions(parent.allowedTools, child.allowedTools, arrays),

    // Exclusive: merge and scope are replaced entirely
    merge: childMergeSettings,
    scope: {
      include: child.frontmatter?.scope?.include ?? parent.scope.include,
      exclude: child.frontmatter?.scope?.exclude ?? parent.scope.exclude,
    },

    // Track sources
    sources: [...parent.sources, child.filePath],
  };

  return merged;
}

/**
 * Extracts merge config from a parsed result.
 * Normalizes schema values to runtime types.
 *
 * @param result - Parsed AGENTS.md result
 * @returns Merge configuration with defaults applied
 */
function getMergeConfig(result: AgentsParseResult): AgentsMergeConfig {
  const merge = result.frontmatter?.merge;

  // Normalize arrays strategy - schema supports more values than runtime type
  // Convert extended values to their runtime equivalents
  let arrays: AgentsMergeConfig["arrays"] = DEFAULT_MERGE_CONFIG.arrays;
  if (merge?.arrays) {
    // The schema allows "prepend" and "unique" which we map to "append" for compatibility
    arrays = merge.arrays === "replace" ? "replace" : "append";
  }

  return {
    strategy: merge?.strategy ?? DEFAULT_MERGE_CONFIG.strategy,
    arrays,
  };
}

/**
 * Validates type compatibility in strict mode.
 *
 * @param parent - Parent configuration
 * @param child - Child parse result
 * @param warnings - Warning array to append to
 * @returns True if types are compatible
 */
function validateStrictCompatibility(
  parent: AgentsConfig,
  child: AgentsParseResult,
  warnings: AgentsWarning[]
): boolean {
  // In strict mode, child must have compatible types
  // For now, we only warn if there are type mismatches

  const issues: string[] = [];

  // Check if child has values where parent doesn't (or vice versa) for non-additive fields
  if (parent.name !== undefined && child.frontmatter?.name === undefined) {
    // Parent has name, child doesn't - acceptable
  }

  // Version format should be consistent
  if (parent.version && child.frontmatter?.version) {
    const parentParts = parent.version.split(".").length;
    const childParts = child.frontmatter.version.split(".").length;
    if (parentParts !== childParts) {
      issues.push(
        `Version format mismatch: parent has ${parentParts} parts, child has ${childParts}`
      );
    }
  }

  // Report issues as warnings
  for (const issue of issues) {
    warnings.push({
      file: child.filePath,
      message: `Strict mode: ${issue}`,
      severity: "warn",
    });
  }

  return issues.length === 0;
}

/**
 * Merges multiple AGENTS.md configurations in order.
 *
 * Processes configs from root (first) to most specific (last).
 * Child values override parent values according to merge strategy.
 *
 * @param configs - Array of parsed AGENTS.md results, ordered root-first
 * @param options - Merge options
 * @returns Merged configuration result
 *
 * @example
 * ```typescript
 * // Configs ordered: project root > subdirectory > most specific
 * const configs = [
 *   await parser.parse('/project/AGENTS.md'),
 *   await parser.parse('/project/src/AGENTS.md'),
 *   await parser.parse('/project/src/utils/AGENTS.md'),
 * ];
 *
 * const result = mergeConfigs(configs, { currentFile: 'src/utils/helper.ts' });
 * console.log(result.config.instructions);
 * console.log(result.sources); // Files that contributed
 * ```
 */
export function mergeConfigs(
  configs: AgentsParseResult[],
  options: MergeOptions = {}
): MergedAgentsConfig {
  const warnings: AgentsWarning[] = [];
  const appliedScopes: string[] = [];

  // Handle empty configs
  if (configs.length === 0) {
    return {
      config: createDefaultConfig(),
      sources: [],
      appliedScopes: [],
      warnings: [],
    };
  }

  // Filter configs by scope if currentFile is provided
  const applicableConfigs = options.currentFile
    ? filterByScope(configs, options.currentFile)
    : configs.map((config) => ({ config, matchedPatterns: ["*"] }));

  // Handle no applicable configs after scope filtering
  if (applicableConfigs.length === 0) {
    warnings.push({
      file: options.currentFile ?? "unknown",
      message: `No configurations matched scope for file: ${options.currentFile}`,
      severity: "info",
    });
    return {
      config: createDefaultConfig(),
      sources: [],
      appliedScopes: [],
      warnings,
    };
  }

  // Collect matched patterns
  for (const { matchedPatterns } of applicableConfigs) {
    appliedScopes.push(...matchedPatterns);
  }

  // Start with default config
  let result = createDefaultConfig();

  // Process configs in order (root first, most specific last)
  for (const { config: parseResult } of applicableConfigs) {
    // Collect warnings from parse result
    warnings.push(...parseResult.warnings);

    // Get merge config for this level
    const mergeConfig = getMergeConfig(parseResult);

    // Validate strict mode
    if (mergeConfig.strategy === "strict" && options.strict) {
      validateStrictCompatibility(result, parseResult, warnings);
    }

    // Merge this config into result
    result = mergeConfigPair(result, parseResult, mergeConfig);
  }

  return {
    config: result,
    sources: result.sources,
    appliedScopes: [...new Set(appliedScopes)], // Deduplicate
    warnings,
  };
}

/**
 * Merges a single child config into a parent config.
 * Useful for incremental merging or testing.
 *
 * @param parent - Parent configuration
 * @param child - Child parse result to merge
 * @returns Merged configuration
 */
export function mergeSingleConfig(parent: AgentsConfig, child: AgentsParseResult): AgentsConfig {
  const mergeConfig = getMergeConfig(child);
  return mergeConfigPair(parent, child, mergeConfig);
}

/**
 * Creates a minimal config from a single parse result.
 *
 * @param result - Parsed AGENTS.md result
 * @returns AgentsConfig from the single result
 */
export function createConfigFromResult(result: AgentsParseResult): AgentsConfig {
  const mergeConfig = getMergeConfig(result);

  return {
    name: result.frontmatter?.name ?? undefined,
    description: result.frontmatter?.description ?? undefined,
    version: result.frontmatter?.version ?? undefined,
    priority: result.frontmatter?.priority ?? 0,
    allowedTools: [...result.allowedTools],
    instructions: result.instructions,
    merge: mergeConfig,
    scope: {
      include: result.frontmatter?.scope?.include ?? [],
      exclude: result.frontmatter?.scope?.exclude ?? [],
    },
    sources: [result.filePath],
  };
}
