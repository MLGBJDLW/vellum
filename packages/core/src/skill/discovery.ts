// ============================================
// Skill Discovery
// ============================================
// Discovers skill directories from multiple source locations.
// Implements priority-based deduplication for same-named skills.
// @see REQ-002

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { Logger } from "../logger/logger.js";
import { SKILL_MANIFEST_FILENAME } from "./parser.js";
import { SKILL_SOURCE_PRIORITY, type SkillLocation, type SkillSource } from "./types.js";

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

  constructor(options: SkillDiscoveryOptions = {}) {
    this.workspacePath = options.workspacePath;
    this.logger = options.logger;
    this.followSymlinks = options.followSymlinks ?? true;
    this.customPaths = options.customPaths ?? {};
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
    };

    // Discover from each source
    const sources: SkillSource[] = ["workspace", "user", "global", "builtin"];

    for (const source of sources) {
      try {
        const locations = await this.discoverSource(source);
        result.locations.push(...locations);
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
    });

    return result;
  }

  /**
   * Discover skills from a specific source.
   *
   * @param source - The source to discover from
   * @returns Array of discovered skill locations
   */
  async discoverSource(source: SkillSource): Promise<SkillLocation[]> {
    const basePath = this.getSourcePath(source);

    if (!basePath) {
      this.logger?.debug(`Skipping ${source} source: no path configured`);
      return [];
    }

    // Check if directory exists
    const exists = await this.directoryExists(basePath);
    if (!exists) {
      this.logger?.debug(`Skills directory does not exist: ${basePath}`);
      return [];
    }

    return this.scanDirectory(basePath, source);
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
        // Builtin skills are handled separately by the loader
        // They're bundled in the package, not discovered from filesystem
        return null;

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
   * @returns Array of discovered skill locations
   */
  private async scanDirectory(basePath: string, source: SkillSource): Promise<SkillLocation[]> {
    const locations: SkillLocation[] = [];

    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden and special directories
        if (entry.name.startsWith(".") || entry.name.startsWith("_")) {
          this.logger?.debug(`Skipping hidden/special directory: ${entry.name}`);
          continue;
        }

        const entryPath = path.join(basePath, entry.name);

        // Handle directory or symbolic link to directory
        let isDir = entry.isDirectory();

        if (!isDir && entry.isSymbolicLink() && this.followSymlinks) {
          try {
            const stat = await fs.stat(entryPath);
            isDir = stat.isDirectory();
          } catch (error) {
            this.logger?.warn(`Failed to follow symlink: ${entryPath}`, { error });
            continue;
          }
        }

        if (!isDir) {
          continue;
        }

        // Check for SKILL.md manifest
        const manifestPath = path.join(entryPath, SKILL_MANIFEST_FILENAME);
        const hasManifest = await this.fileExists(manifestPath);

        if (!hasManifest) {
          this.logger?.debug(`No SKILL.md found in: ${entryPath}`);
          continue;
        }

        locations.push({
          path: entryPath,
          manifestPath,
          source,
          priority: SKILL_SOURCE_PRIORITY[source],
        });

        this.logger?.debug(`Discovered skill: ${entry.name} from ${source}`);
      }
    } catch (error) {
      this.logger?.error(`Failed to scan directory: ${basePath}`, { error });
      throw error;
    }

    return locations;
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
