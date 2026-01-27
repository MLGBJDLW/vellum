// ============================================
// Skill Discovery
// ============================================
// Discovers skill directories from multiple source locations.
// Implements priority-based deduplication for same-named skills.
// Supports mode-specific skills (skills-{mode}/) and symlinks.
// @see REQ-002

import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { Logger } from "../logger/logger.js";
import { SKILL_MANIFEST_FILENAME } from "./parser.js";
import { SKILL_SOURCE_PRIORITY, type SkillLocation, type SkillSource } from "./types.js";

// ============================================
// Skill Name Validation Constants
// ============================================

/**
 * Minimum length for skill names.
 */
export const SKILL_NAME_MIN_LENGTH = 1;

/**
 * Maximum length for skill names.
 */
export const SKILL_NAME_MAX_LENGTH = 64;

/**
 * Regex pattern for valid skill names.
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with hyphen
 * - Must not contain consecutive hyphens
 */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ============================================
// Skill Name Validation
// ============================================

/**
 * Validation result for skill names.
 */
export interface SkillNameValidation {
  /** Whether the name is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Validate a skill name according to the specification.
 *
 * Rules:
 * - 1-64 characters
 * - Lowercase letters, numbers, and hyphens only
 * - Must not start or end with hyphen
 * - Must not contain consecutive hyphens
 *
 * @param name - The skill name to validate
 * @returns Validation result with error message if invalid
 */
export function validateSkillName(name: string): SkillNameValidation {
  if (!name) {
    return { valid: false, error: "Skill name is required" };
  }

  if (name.length < SKILL_NAME_MIN_LENGTH) {
    return {
      valid: false,
      error: `Skill name must be at least ${SKILL_NAME_MIN_LENGTH} character`,
    };
  }

  if (name.length > SKILL_NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Skill name must be at most ${SKILL_NAME_MAX_LENGTH} characters (got ${name.length})`,
    };
  }

  if (!SKILL_NAME_PATTERN.test(name)) {
    // Provide specific error messages
    if (name !== name.toLowerCase()) {
      return { valid: false, error: "Skill name must be lowercase" };
    }
    if (name.startsWith("-") || name.endsWith("-")) {
      return { valid: false, error: "Skill name must not start or end with hyphen" };
    }
    if (name.includes("--")) {
      return { valid: false, error: "Skill name must not contain consecutive hyphens" };
    }
    if (/[^a-z0-9-]/.test(name)) {
      return {
        valid: false,
        error: "Skill name must contain only lowercase letters, numbers, and hyphens",
      };
    }
    return { valid: false, error: "Invalid skill name format" };
  }

  return { valid: true };
}

// ============================================
// Discovery Configuration
// ============================================

/**
 * Options for skill discovery.
 */
export interface SkillDiscoveryOptions {
  /** Workspace root path (for workspace and global sources) */
  workspacePath?: string;
  /** Optional logger for debugging */
  logger?: Logger;
  /** Whether to follow symbolic links (default: true) */
  followSymlinks?: boolean;
  /** Custom paths to override defaults */
  customPaths?: Partial<Record<SkillSource, string>>;
  /** Whether to validate skill names strictly (default: true) */
  validateNames?: boolean;
  /** Source enablement settings (undefined = all enabled) */
  sources?: {
    workspace?: boolean;
    user?: boolean;
    global?: boolean;
    builtin?: boolean;
  };
}

/**
 * Result of skill discovery.
 */
export interface SkillDiscoveryResult {
  /** All discovered skill locations */
  locations: SkillLocation[];
  /** Deduplicated locations (highest priority wins) */
  deduplicated: SkillLocation[];
  /** Errors encountered during discovery */
  errors: Error[];
  /** Skills that failed validation (name invalid) */
  validationErrors: Array<{ path: string; name: string; error: string }>;
}

/**
 * Extended skill location with mode information.
 */
export interface ModeSkillLocation extends SkillLocation {
  /** Mode this skill is specific to (undefined for general skills) */
  mode?: string;
}

/**
 * Result of combined mode + general skill discovery.
 */
export interface CombinedDiscoveryResult {
  /** All discovered skill locations (general + mode-specific) */
  locations: ModeSkillLocation[];
  /** Deduplicated locations with mode override resolution */
  deduplicated: ModeSkillLocation[];
  /** Errors encountered during discovery */
  errors: Error[];
  /** Skills that failed validation */
  validationErrors: Array<{ path: string; name: string; error: string }>;
}

// ============================================
// SkillDiscovery Class
// ============================================

/**
 * Discovers skill directories from multiple source locations.
 *
 * Source locations (in priority order):
 * - workspace: .vellum/skills/ (highest)
 * - user: ~/.vellum/skills/
 * - global: .github/skills/ (Claude compatibility)
 * - builtin: internal package (lowest)
 *
 * Skills with the same name are deduplicated by priority,
 * with higher priority sources taking precedence.
 *
 * Also supports:
 * - Mode-specific skills in skills-{mode}/ directories
 * - Symlinks for skill sharing
 * - Strict name validation per Agent Skills spec
 *
 * @example
 * ```typescript
 * const discovery = new SkillDiscovery({
 *   workspacePath: '/path/to/project',
 *   logger: logger
 * });
 *
 * const result = await discovery.discoverAll();
 * console.log(result.deduplicated); // Unique skills by name
 * ```
 */
export class SkillDiscovery {
  private workspacePath?: string;
  private logger?: Logger;
  private followSymlinks: boolean;
  private customPaths: Partial<Record<SkillSource, string>>;
  private validateNames: boolean;
  private builtinPath: string;
  private sources?: SkillDiscoveryOptions["sources"];

  constructor(options: SkillDiscoveryOptions = {}) {
    this.workspacePath = options.workspacePath;
    this.logger = options.logger;
    this.followSymlinks = options.followSymlinks ?? true;
    this.customPaths = options.customPaths ?? {};
    this.validateNames = options.validateNames ?? true;
    this.sources = options.sources;

    // Resolve builtin path relative to this module
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    this.builtinPath = path.join(currentDir, "builtin");
  }

  /**
   * Set the workspace path for discovery.
   */
  setWorkspacePath(workspacePath: string): void {
    this.workspacePath = workspacePath;
  }

  /**
   * Discover skills from all enabled sources.
   *
   * @returns Discovery result with all locations and deduplicated list
   */
  async discoverAll(): Promise<SkillDiscoveryResult> {
    const result: SkillDiscoveryResult = {
      locations: [],
      deduplicated: [],
      errors: [],
      validationErrors: [],
    };

    // Discover from each source, filtering by config (only explicit false disables)
    const allSources: SkillSource[] = ["workspace", "user", "global", "builtin"];
    const sources = allSources.filter(
      (source) => this.sources?.[source as keyof NonNullable<typeof this.sources>] !== false
    );

    for (const source of sources) {
      try {
        const { locations, validationErrors } = await this.discoverSource(source);
        result.locations.push(...locations);
        result.validationErrors.push(...validationErrors);
      } catch (error) {
        this.logger?.warn(`Failed to discover skills from ${source}`, { error });
        result.errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Deduplicate by name (highest priority wins)
    result.deduplicated = this.deduplicateByName(result.locations);

    this.logger?.debug("Skill discovery complete", {
      total: result.locations.length,
      unique: result.deduplicated.length,
      errors: result.errors.length,
      validationErrors: result.validationErrors.length,
    });

    return result;
  }

  /**
   * Discover skills from a specific source.
   *
   * @param source - The source to discover from
   * @returns Array of discovered skill locations and validation errors
   */
  async discoverSource(source: SkillSource): Promise<{
    locations: SkillLocation[];
    validationErrors: SkillDiscoveryResult["validationErrors"];
  }> {
    const basePath = this.getSourcePath(source);

    if (!basePath) {
      this.logger?.debug(`Skipping ${source} source: no path configured`);
      return { locations: [], validationErrors: [] };
    }

    // Check if directory exists
    const exists = await this.directoryExists(basePath);
    if (!exists) {
      this.logger?.debug(`Skills directory does not exist: ${basePath}`);
      return { locations: [], validationErrors: [] };
    }

    return this.scanDirectory(basePath, source);
  }

  /**
   * Discover skills for a specific mode, combining mode-specific and general skills.
   *
   * Priority order (highest to lowest):
   * 1. .vellum/skills-{mode}/     (project mode-specific)
   * 2. .vellum/skills/            (project general)
   * 3. ~/.vellum/skills-{mode}/   (global mode-specific)
   * 4. ~/.vellum/skills/          (global general)
   * 5. .github/skills-{mode}/     (Claude compat mode-specific)
   * 6. .github/skills/            (Claude compat general)
   *
   * Mode-specific skills override general skills with the same name at the same source level.
   *
   * @param mode - The mode to discover skills for
   * @returns Combined discovery result
   */
  async discoverForMode(mode: string): Promise<CombinedDiscoveryResult> {
    const result: CombinedDiscoveryResult = {
      locations: [],
      deduplicated: [],
      errors: [],
      validationErrors: [],
    };

    // Define directories in priority order (highest first)
    const directories = this.getModeDirectories(mode);

    for (const { dir, source, isMode } of directories) {
      try {
        const exists = await this.directoryExists(dir);
        if (!exists) {
          continue;
        }

        const { locations, validationErrors } = await this.scanDirectory(dir, source);

        // Add mode information to locations
        const modeLocations: ModeSkillLocation[] = locations.map((loc) => ({
          ...loc,
          mode: isMode ? mode : undefined,
          // Boost priority for mode-specific skills
          priority: loc.priority + (isMode ? 10 : 0),
        }));

        result.locations.push(...modeLocations);
        result.validationErrors.push(...validationErrors);
      } catch (error) {
        this.logger?.warn(`Failed to discover skills from ${dir}`, { error });
        result.errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Deduplicate with mode-aware resolution
    result.deduplicated = this.deduplicateModeSkills(result.locations);

    this.logger?.debug("Mode skill discovery complete", {
      mode,
      total: result.locations.length,
      unique: result.deduplicated.length,
      errors: result.errors.length,
    });

    return result;
  }

  /**
   * Get all directories to scan for a mode.
   * Returns directories in priority order (highest first).
   */
  private getModeDirectories(
    mode: string
  ): Array<{ dir: string; source: SkillSource; isMode: boolean }> {
    const dirs: Array<{ dir: string; source: SkillSource; isMode: boolean }> = [];
    const home = os.homedir();

    // Workspace directories (highest priority)
    if (this.workspacePath) {
      dirs.push({
        dir: path.join(this.workspacePath, ".vellum", `skills-${mode}`),
        source: "workspace",
        isMode: true,
      });
      dirs.push({
        dir: path.join(this.workspacePath, ".vellum", "skills"),
        source: "workspace",
        isMode: false,
      });
    }

    // User directories
    dirs.push({
      dir: path.join(home, ".vellum", `skills-${mode}`),
      source: "user",
      isMode: true,
    });
    dirs.push({
      dir: path.join(home, ".vellum", "skills"),
      source: "user",
      isMode: false,
    });

    // Global directories (Claude compatibility)
    if (this.workspacePath) {
      dirs.push({
        dir: path.join(this.workspacePath, ".github", `skills-${mode}`),
        source: "global",
        isMode: true,
      });
      dirs.push({
        dir: path.join(this.workspacePath, ".github", "skills"),
        source: "global",
        isMode: false,
      });
    }

    return dirs;
  }

  /**
   * Deduplicate mode skill locations.
   * Rules: project > global, mode-specific > generic, higher priority wins.
   */
  private deduplicateModeSkills(locations: ModeSkillLocation[]): ModeSkillLocation[] {
    // Sort by priority (highest first)
    const sorted = [...locations].sort((a, b) => b.priority - a.priority);

    // Keep first occurrence of each name (highest priority)
    const seen = new Set<string>();
    const deduplicated: ModeSkillLocation[] = [];

    for (const location of sorted) {
      const name = path.basename(location.path);
      if (!seen.has(name)) {
        seen.add(name);
        deduplicated.push(location);
      } else {
        this.logger?.debug(
          `Skipping duplicate skill: ${name} (mode: ${location.mode ?? "general"}, source: ${location.source})`
        );
      }
    }

    return deduplicated;
  }

  /**
   * Deduplicate skill locations by name.
   * Skills with higher priority take precedence.
   *
   * @param locations - All discovered locations
   * @returns Deduplicated locations (one per skill name)
   */
  deduplicateByName(locations: SkillLocation[]): SkillLocation[] {
    // Sort by priority (highest first)
    const sorted = [...locations].sort((a, b) => b.priority - a.priority);

    // Keep first occurrence of each name (highest priority)
    const seen = new Set<string>();
    const deduplicated: SkillLocation[] = [];

    for (const location of sorted) {
      const name = path.basename(location.path);
      if (!seen.has(name)) {
        seen.add(name);
        deduplicated.push(location);
      } else {
        this.logger?.debug(`Skipping duplicate skill: ${name} from ${location.source}`);
      }
    }

    return deduplicated;
  }

  /**
   * Get the base path for a skill source.
   */
  private getSourcePath(source: SkillSource): string | null {
    // Check for custom path override
    const customPath = this.customPaths[source];
    if (customPath) {
      return customPath;
    }

    switch (source) {
      case "workspace":
        return this.workspacePath ? path.join(this.workspacePath, ".vellum", "skills") : null;

      case "user":
        return path.join(os.homedir(), ".vellum", "skills");

      case "global":
        return this.workspacePath ? path.join(this.workspacePath, ".github", "skills") : null;

      case "builtin":
        // Return path to builtin skills directory (relative to this module)
        return this.builtinPath;

      default:
        return null;
    }
  }

  /**
   * Check if a directory exists.
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Scan a directory for skill subdirectories.
   *
   * @param basePath - The base skills directory path
   * @param source - The source category
   * @returns Array of discovered skill locations and validation errors
   */
  private async scanDirectory(
    basePath: string,
    source: SkillSource
  ): Promise<{
    locations: SkillLocation[];
    validationErrors: SkillDiscoveryResult["validationErrors"];
  }> {
    const locations: SkillLocation[] = [];
    const validationErrors: SkillDiscoveryResult["validationErrors"] = [];

    try {
      // Resolve symlinks for the base directory itself
      const realBasePath = await this.resolveSymlink(basePath);
      const entries = await fs.readdir(realBasePath, { withFileTypes: true });

      for (const entry of entries) {
        const result = await this.processDirectoryEntry(entry, realBasePath, source);
        if (result.location) {
          locations.push(result.location);
        }
        if (result.validationError) {
          validationErrors.push(result.validationError);
        }
      }
    } catch (error) {
      this.logger?.error(`Failed to scan directory: ${basePath}`, { error });
      throw error;
    }

    return { locations, validationErrors };
  }

  /**
   * Process a single directory entry during skill discovery.
   */
  private async processDirectoryEntry(
    entry: Dirent,
    basePath: string,
    source: SkillSource
  ): Promise<{
    location: SkillLocation | null;
    validationError: { path: string; name: string; error: string } | null;
  }> {
    // Skip hidden and special directories
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) {
      this.logger?.debug(`Skipping hidden/special directory: ${entry.name}`);
      return { location: null, validationError: null };
    }

    const entryPath = path.join(basePath, entry.name);

    // Resolve symlinks if needed
    const resolved = await this.resolveEntryPath(entry, entryPath);
    if (!resolved.isDirectory) {
      return { location: null, validationError: null };
    }

    // Validate skill name (use symlink name, not target name)
    const skillName = entry.name;
    if (this.validateNames) {
      const validation = validateSkillName(skillName);
      if (!validation.valid) {
        this.logger?.warn(`Invalid skill name: ${skillName}`, {
          error: validation.error,
          path: entryPath,
        });
        return {
          location: null,
          validationError: {
            path: entryPath,
            name: skillName,
            error: validation.error || "Invalid skill name",
          },
        };
      }
    }

    // Check for SKILL.md manifest
    const manifestPath = path.join(resolved.path, SKILL_MANIFEST_FILENAME);
    const hasManifest = await this.fileExists(manifestPath);

    if (!hasManifest) {
      this.logger?.debug(`No SKILL.md found in: ${entryPath}`);
      return { location: null, validationError: null };
    }

    this.logger?.debug(`Discovered skill: ${skillName} from ${source}`);

    return {
      location: {
        path: resolved.path,
        manifestPath,
        source,
        priority: SKILL_SOURCE_PRIORITY[source],
      },
      validationError: null,
    };
  }

  /**
   * Resolve an entry path, following symlinks if enabled.
   */
  private async resolveEntryPath(
    entry: Dirent,
    entryPath: string
  ): Promise<{ path: string; isDirectory: boolean }> {
    let isDir = entry.isDirectory();
    let resolvedPath = entryPath;

    if (!isDir && entry.isSymbolicLink() && this.followSymlinks) {
      try {
        resolvedPath = await this.resolveSymlink(entryPath);
        const stat = await fs.stat(resolvedPath);
        isDir = stat.isDirectory();
      } catch (error) {
        this.logger?.warn(`Failed to follow symlink: ${entryPath}`, { error });
        return { path: entryPath, isDirectory: false };
      }
    }

    return { path: resolvedPath, isDirectory: isDir };
  }

  /**
   * Resolve a symlink to its real path.
   */
  private async resolveSymlink(symlinkPath: string): Promise<string> {
    try {
      return await fs.realpath(symlinkPath);
    } catch {
      return symlinkPath;
    }
  }

  /**
   * Check if a file exists.
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }
}

// ============================================
// Mode-Specific Discovery
// ============================================

/**
 * Mode mapping for Roo Code compatibility.
 * Maps external mode names to internal skill directory names.
 */
export const ROO_CODE_MODE_MAPPINGS: Record<string, string> = {
  architect: "plan",
  ask: "chat",
};

/**
 * Options for mode-specific skill discovery.
 */
export interface ModeSkillDiscoveryOptions extends SkillDiscoveryOptions {
  /** Whether to apply Roo Code mode mappings (default: true) */
  applyRooCodeMappings?: boolean;
}

/**
 * Discover skills specific to a mode.
 *
 * Mode-specific skills are stored in `skills-{mode}/` directories
 * at each source location. For example:
 * - `.vellum/skills-code/` - workspace mode skills
 * - `~/.vellum/skills-chat/` - user mode skills
 *
 * Supports Roo Code mode mappings:
 * - "architect" mode → looks in skills-plan/
 * - "ask" mode → looks in skills-chat/
 *
 * @param mode - The mode to discover skills for
 * @param options - Discovery options
 * @returns Discovery result with mode-specific skills
 *
 * @example
 * ```typescript
 * // Discover skills for "code" mode
 * const result = await discoverModeSkills("code", {
 *   workspacePath: "/project"
 * });
 *
 * // Discover skills for "architect" mode (maps to "plan")
 * const archResult = await discoverModeSkills("architect", {
 *   workspacePath: "/project"
 * });
 * ```
 */
export async function discoverModeSkills(
  mode: string,
  options: ModeSkillDiscoveryOptions = {}
): Promise<SkillDiscoveryResult> {
  const { applyRooCodeMappings = true, ...discoveryOptions } = options;

  // Apply Roo Code mode mapping if enabled
  const mappedMode = applyRooCodeMappings ? (ROO_CODE_MODE_MAPPINGS[mode] ?? mode) : mode;

  // Create discovery instance with mode-specific paths
  const modeDiscovery = new ModeSkillDiscovery(mappedMode, discoveryOptions);

  return modeDiscovery.discoverAll();
}

/**
 * Internal class for mode-specific skill discovery.
 * Overrides source paths to look in skills-{mode}/ directories.
 */
class ModeSkillDiscovery extends SkillDiscovery {
  constructor(mode: string, options: SkillDiscoveryOptions = {}) {
    // Build custom paths for mode-specific directories
    const customPaths: Partial<Record<SkillSource, string>> = {};

    if (options.workspacePath) {
      customPaths.workspace = path.join(options.workspacePath, ".vellum", `skills-${mode}`);
      customPaths.global = path.join(options.workspacePath, ".github", `skills-${mode}`);
    }
    customPaths.user = path.join(os.homedir(), ".vellum", `skills-${mode}`);

    super({
      ...options,
      customPaths: { ...options.customPaths, ...customPaths },
    });
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Default SkillDiscovery instance for convenience.
 */
export const skillDiscovery = new SkillDiscovery();
