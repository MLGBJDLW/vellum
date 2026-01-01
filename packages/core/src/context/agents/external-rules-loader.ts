// ============================================
// External Rules Loader
// ============================================
// Loads mode-specific and global rules from .vellum/rules/ directories.
// Implements REQ-020, REQ-021, REQ-022.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { FrontmatterParser, type ModeRulesFrontmatter, modeRulesSchema } from "@vellum/shared";
import picomatch from "picomatch";
import type { AgentsWarning } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Represents a loaded external rule with its metadata and content.
 */
export interface ExternalRule {
  /** Absolute path to the rule file */
  filePath: string;
  /** Relative path from project root */
  relativePath: string;
  /** Rule content (markdown body) */
  content: string;
  /** Priority for ordering (higher = more precedence) */
  priority: number;
  /** Glob patterns that trigger this rule */
  triggers?: string[];
  /** Modes this rule applies to (empty = all modes) */
  modes?: string[];
  /** File pattern matching configuration */
  applyTo?: {
    include?: string[];
    exclude?: string[];
  };
  /** Whether this rule is enabled */
  enabled: boolean;
  /** Human-readable description */
  description?: string;
  /** Source mode directory (null for global rules) */
  sourceMode: string | null;
}

/**
 * Result of loading external rules.
 */
export interface ExternalRulesResult {
  /** Successfully loaded rules */
  rules: ExternalRule[];
  /** Non-fatal warnings encountered during loading */
  warnings: AgentsWarning[];
}

/**
 * Options for ExternalRulesLoader.
 */
export interface ExternalRulesLoaderOptions {
  /** Maximum file size in bytes (default: 100KB) */
  maxFileSize?: number;
}

// ============================================
// Constants
// ============================================

/** Default maximum file size: 100KB */
const DEFAULT_MAX_FILE_SIZE = 100 * 1024;

/** Global rules directory name */
const GLOBAL_RULES_DIR = "rules";

/** Mode-specific rules directory prefix */
const MODE_RULES_PREFIX = "rules-";

/** Config directory name */
const CONFIG_DIR = ".vellum";

// ============================================
// ExternalRulesLoader Class
// ============================================

/**
 * Loads external rules from `.vellum/rules/` and `.vellum/rules-{mode}/` directories.
 *
 * Features:
 * - Global rules apply to all modes
 * - Mode-specific rules override global rules
 * - Priority-based sorting
 * - Trigger pattern filtering for file context
 *
 * @example
 * ```typescript
 * const loader = new ExternalRulesLoader();
 *
 * // Load global rules
 * const globalResult = await loader.loadGlobalRules('/project');
 *
 * // Load mode-specific rules with global rules merged
 * const modeResult = await loader.loadModeRules('/project', 'coder');
 *
 * // Get rules applicable to a specific file
 * const applicableRules = loader.getRulesForFile(
 *   modeResult.rules,
 *   'src/components/Button.tsx'
 * );
 * ```
 */
export class ExternalRulesLoader {
  private readonly frontmatterParser: FrontmatterParser<typeof modeRulesSchema>;
  private readonly maxFileSize: number;

  /**
   * Creates a new ExternalRulesLoader.
   *
   * @param options - Loader configuration options
   */
  constructor(options: ExternalRulesLoaderOptions = {}) {
    this.frontmatterParser = new FrontmatterParser(modeRulesSchema);
    this.maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  }

  /**
   * Loads global rules from `.vellum/rules/` directory.
   *
   * @param rootPath - Project root directory path
   * @returns Loaded rules sorted by priority, plus warnings
   *
   * @example
   * ```typescript
   * const { rules, warnings } = await loader.loadGlobalRules('/project');
   * for (const rule of rules) {
   *   console.log(rule.filePath, rule.priority);
   * }
   * ```
   */
  public async loadGlobalRules(rootPath: string): Promise<ExternalRulesResult> {
    const rulesDir = path.join(rootPath, CONFIG_DIR, GLOBAL_RULES_DIR);
    return this.loadRulesFromDirectory(rulesDir, rootPath, null);
  }

  /**
   * Loads mode-specific rules from `.vellum/rules-{mode}/` directory,
   * merged with global rules. Mode rules override global rules.
   *
   * @param rootPath - Project root directory path
   * @param mode - Mode name (e.g., "coder", "reviewer")
   * @returns Merged rules sorted by priority, plus warnings
   *
   * @example
   * ```typescript
   * const { rules, warnings } = await loader.loadModeRules('/project', 'coder');
   * // rules contains both global and coder-specific rules
   * // coder-specific rules with same name override global
   * ```
   */
  public async loadModeRules(rootPath: string, mode: string): Promise<ExternalRulesResult> {
    const warnings: AgentsWarning[] = [];

    // Load global rules first
    const globalResult = await this.loadGlobalRules(rootPath);
    warnings.push(...globalResult.warnings);

    // Load mode-specific rules
    const modeDir = path.join(rootPath, CONFIG_DIR, `${MODE_RULES_PREFIX}${mode}`);
    const modeResult = await this.loadRulesFromDirectory(modeDir, rootPath, mode);
    warnings.push(...modeResult.warnings);

    // Merge: mode rules override global rules by filename
    const mergedRules = this.mergeRules(globalResult.rules, modeResult.rules);

    return {
      rules: mergedRules,
      warnings,
    };
  }

  /**
   * Filters rules by trigger patterns matching a file path.
   *
   * @param rules - Rules to filter
   * @param filePath - File path to match against triggers
   * @returns Rules where triggers match the file path
   *
   * @example
   * ```typescript
   * const allRules = await loader.loadModeRules('/project', 'coder');
   * const applicableRules = loader.getRulesForFile(
   *   allRules.rules,
   *   'src/components/Button.tsx'
   * );
   * // Returns rules with triggers like "*.tsx", "src/**", etc.
   * ```
   */
  public getRulesForFile(rules: ExternalRule[], filePath: string): ExternalRule[] {
    const normalizedPath = this.normalizePath(filePath);

    return rules.filter((rule) => {
      // If no triggers specified, rule applies to all files
      if (!rule.triggers || rule.triggers.length === 0) {
        return true;
      }

      // Check if any trigger pattern matches
      return rule.triggers.some((pattern) => this.matchesPattern(normalizedPath, pattern));
    });
  }

  /**
   * Gets all applicable rules for a mode and file combination.
   *
   * @param rootPath - Project root directory path
   * @param mode - Mode name
   * @param filePath - Optional file path for trigger filtering
   * @returns Applicable rules sorted by priority
   */
  public async getApplicableRules(
    rootPath: string,
    mode: string,
    filePath?: string
  ): Promise<ExternalRulesResult> {
    const result = await this.loadModeRules(rootPath, mode);

    // Filter by triggers if file path provided
    if (filePath) {
      result.rules = this.getRulesForFile(result.rules, filePath);
    }

    // Filter by enabled status
    result.rules = result.rules.filter((rule) => rule.enabled);

    return result;
  }

  /**
   * Gets merged content from applicable rules.
   *
   * @param rootPath - Project root directory path
   * @param mode - Mode name
   * @param filePath - Optional file path for trigger filtering
   * @returns Concatenated rule content, separated by newlines
   */
  public async getMergedRulesContent(
    rootPath: string,
    mode: string,
    filePath?: string
  ): Promise<string> {
    const { rules } = await this.getApplicableRules(rootPath, mode, filePath);
    return rules.map((rule) => rule.content).join("\n\n");
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Loads rules from a specific directory.
   */
  private async loadRulesFromDirectory(
    dirPath: string,
    rootPath: string,
    sourceMode: string | null
  ): Promise<ExternalRulesResult> {
    const rules: ExternalRule[] = [];
    const warnings: AgentsWarning[] = [];

    // Check if directory exists
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return { rules: [], warnings: [] };
      }
    } catch {
      // Directory doesn't exist - return empty (not an error)
      return { rules: [], warnings: [] };
    }

    // Read directory contents
    let entries: string[];
    try {
      entries = await fs.readdir(dirPath);
    } catch (error) {
      warnings.push({
        file: dirPath,
        message: `Failed to read directory: ${error instanceof Error ? error.message : String(error)}`,
        severity: "warn",
      });
      return { rules, warnings };
    }

    // Process .md files
    const mdFiles = entries.filter((entry) => entry.endsWith(".md"));

    for (const file of mdFiles) {
      const filePath = path.join(dirPath, file);

      try {
        const rule = await this.loadRuleFile(filePath, rootPath, sourceMode);
        if (rule) {
          rules.push(rule);
        }
      } catch (error) {
        warnings.push({
          file: filePath,
          message: `Failed to load rule: ${error instanceof Error ? error.message : String(error)}`,
          severity: "warn",
        });
      }
    }

    // Sort by priority (descending)
    rules.sort((a, b) => b.priority - a.priority);

    return { rules, warnings };
  }

  /**
   * Loads a single rule file.
   */
  private async loadRuleFile(
    filePath: string,
    rootPath: string,
    sourceMode: string | null
  ): Promise<ExternalRule | null> {
    // Check file size
    const stat = await fs.stat(filePath);
    if (stat.size > this.maxFileSize) {
      throw new Error(`File exceeds maximum size of ${this.maxFileSize} bytes`);
    }

    // Read file content
    const content = await fs.readFile(filePath, "utf-8");

    // Parse frontmatter
    const parseResult = this.frontmatterParser.parse(content);

    // Handle parse failures gracefully
    let frontmatter: ModeRulesFrontmatter | null = null;
    if (parseResult.success) {
      frontmatter = parseResult.data;
    }

    // Skip disabled rules
    if (frontmatter?.enabled === false) {
      return null;
    }

    // Build ExternalRule
    const relativePath = path.relative(rootPath, filePath);

    return {
      filePath,
      relativePath,
      content: parseResult.body.trim(),
      priority: frontmatter?.priority ?? 0,
      triggers: frontmatter?.triggers,
      modes: frontmatter?.modes,
      applyTo: undefined, // Will be set from frontmatter if present
      enabled: frontmatter?.enabled ?? true,
      description: frontmatter?.description,
      sourceMode,
    };
  }

  /**
   * Merges global and mode-specific rules.
   * Mode rules override global rules with the same filename.
   */
  private mergeRules(globalRules: ExternalRule[], modeRules: ExternalRule[]): ExternalRule[] {
    const merged = new Map<string, ExternalRule>();

    // Add global rules
    for (const rule of globalRules) {
      const key = path.basename(rule.filePath);
      merged.set(key, rule);
    }

    // Mode rules override
    for (const rule of modeRules) {
      const key = path.basename(rule.filePath);
      merged.set(key, rule);
    }

    // Sort by priority (descending)
    const result = Array.from(merged.values());
    result.sort((a, b) => b.priority - a.priority);

    return result;
  }

  /**
   * Checks if a file path matches a glob pattern.
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Handle negation patterns
    if (pattern.startsWith("!")) {
      return !picomatch.isMatch(filePath, pattern.slice(1), { dot: true });
    }
    return picomatch.isMatch(filePath, pattern, { dot: true });
  }

  /**
   * Normalizes file path for consistent matching.
   */
  private normalizePath(filePath: string): string {
    // Convert backslashes to forward slashes for cross-platform matching
    return filePath.replace(/\\/g, "/");
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a new ExternalRulesLoader instance.
 *
 * @param options - Loader configuration options
 * @returns ExternalRulesLoader instance
 */
export function createExternalRulesLoader(
  options: ExternalRulesLoaderOptions = {}
): ExternalRulesLoader {
  return new ExternalRulesLoader(options);
}
