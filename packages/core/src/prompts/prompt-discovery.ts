// ============================================
// Prompt Discovery
// ============================================

/**
 * Multi-source prompt discovery with priority-based deduplication.
 *
 * Discovers prompts from multiple source locations with configurable
 * priority ordering. Higher priority sources override lower priority
 * sources when prompts have the same name.
 *
 * @module @vellum/core/prompts/prompt-discovery
 * @see REQ-003, REQ-004, REQ-018
 */

import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PromptCategory, PromptLocation, PromptSource } from "./types.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Priority values for prompt sources.
 * Lower number = higher priority (takes precedence).
 *
 * Priority order:
 * 1. `.vellum/prompts/` (project) - highest priority
 * 2. `~/.vellum/prompts/` (user)
 * 3. `.github/prompts/` (project legacy)
 * 4. `.claude/prompts/` (legacy)
 * 5. `.roo/prompts/` (legacy)
 * 6. `.kilocode/prompts/` (legacy)
 * 99. `builtin` (package internals) - lowest priority
 */
export const PROMPT_SOURCE_PRIORITY: Record<string, number> = {
  project: 1,
  user: 2,
  github: 3,
  claude: 4,
  roo: 5,
  kilocode: 6,
  builtin: 99,
} as const;

/**
 * Directory paths for each prompt source (relative to workspace or home).
 */
const SOURCE_DIRECTORIES: Record<string, { base: "workspace" | "home" | "package"; path: string }> =
  {
    project: { base: "workspace", path: ".vellum/prompts" },
    user: { base: "home", path: ".vellum/prompts" },
    github: { base: "workspace", path: ".github/prompts" },
    claude: { base: "workspace", path: ".claude/prompts" },
    roo: { base: "workspace", path: ".roo/prompts" },
    kilocode: { base: "workspace", path: ".kilocode/prompts" },
    builtin: { base: "package", path: "prompts/markdown" },
  };

/**
 * Legacy source paths that emit deprecation warnings.
 */
const DEPRECATED_SOURCES = new Set(["claude", "roo", "kilocode"]);

/**
 * Prompt category subdirectory names.
 */
const CATEGORY_SUBDIRS: Record<PromptCategory, string> = {
  role: "roles",
  worker: "workers",
  spec: "spec",
  provider: "providers",
  custom: "custom",
};

// =============================================================================
// Types
// =============================================================================

/**
 * Options for configuring the PromptDiscovery instance.
 */
export interface PromptDiscoveryOptions {
  /**
   * Path to the workspace/project root directory.
   * Required for discovering project-level prompts.
   */
  workspacePath?: string;

  /**
   * Whether to emit deprecation warnings for legacy paths.
   * @default true
   */
  emitDeprecationWarnings?: boolean;

  /**
   * Whether to follow symlinks when scanning directories.
   * @default false
   */
  followSymlinks?: boolean;
}

/**
 * Internal source configuration for discovery.
 */
interface SourceConfig {
  source: string;
  priority: number;
  basePath: string | undefined;
  isDeprecated: boolean;
}

// =============================================================================
// PromptDiscovery Class
// =============================================================================

/**
 * Discovers prompts from multiple source directories with priority-based
 * deduplication.
 *
 * Scans the following locations in priority order:
 * 1. `.vellum/prompts/` - Project prompts (highest priority)
 * 2. `~/.vellum/prompts/` - User global prompts
 * 3. `.github/prompts/` - Legacy GitHub location
 * 4. `.claude/prompts/` - Legacy Claude location (deprecated)
 * 5. `.roo/prompts/` - Legacy Roo location (deprecated)
 * 6. `.kilocode/prompts/` - Legacy Kilo location (deprecated)
 * 7. Built-in prompts (lowest priority)
 *
 * When multiple prompts share the same name, the one from the highest
 * priority source is returned.
 *
 * @example
 * ```typescript
 * const discovery = new PromptDiscovery({
 *   workspacePath: '/path/to/project',
 * });
 *
 * // Discover all prompts
 * const allPrompts = await discovery.discoverAll();
 *
 * // Discover by category
 * const rolePrompts = await discovery.discoverByCategory('role');
 *
 * // Find specific prompt by name
 * const coderPrompt = await discovery.discoverByName('coder');
 * ```
 */
export class PromptDiscovery {
  private workspacePath?: string;
  private readonly emitDeprecationWarnings: boolean;
  private readonly builtinPath: string;
  private deprecationWarningsEmitted: Set<string> = new Set();

  /**
   * Creates a new PromptDiscovery instance.
   *
   * @param options - Configuration options
   */
  constructor(options: PromptDiscoveryOptions = {}) {
    this.workspacePath = options.workspacePath;
    this.emitDeprecationWarnings = options.emitDeprecationWarnings ?? true;

    // Resolve builtin path relative to this module
    const currentDir = dirname(fileURLToPath(import.meta.url));
    this.builtinPath = resolve(currentDir, "markdown");
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Sets the workspace path for project-level discovery.
   *
   * @param path - Absolute path to the workspace root
   */
  setWorkspacePath(path: string): void {
    this.workspacePath = path;
  }

  /**
   * Gets the current workspace path.
   *
   * @returns The workspace path or undefined if not set
   */
  getWorkspacePath(): string | undefined {
    return this.workspacePath;
  }

  /**
   * Discovers all prompts from all sources.
   *
   * Scans all configured source directories and returns discovered
   * prompt locations with deduplication by name (highest priority wins).
   *
   * @returns Array of discovered prompt locations, deduplicated by name
   */
  async discoverAll(): Promise<PromptLocation[]> {
    const allLocations: PromptLocation[] = [];
    const sourceConfigs = this.getSourceConfigs();

    for (const config of sourceConfigs) {
      if (!config.basePath) continue;

      const locations = await this.scanDirectory(config.basePath, config);
      allLocations.push(...locations);
    }

    return this.deduplicateByName(allLocations);
  }

  /**
   * Discovers prompts by category (role, worker, spec, provider, custom).
   *
   * Only scans the subdirectory matching the category within each source.
   *
   * @param category - The prompt category to discover
   * @returns Array of discovered prompt locations for the category
   */
  async discoverByCategory(category: PromptCategory): Promise<PromptLocation[]> {
    const allLocations: PromptLocation[] = [];
    const sourceConfigs = this.getSourceConfigs();
    const categorySubdir = CATEGORY_SUBDIRS[category];

    for (const config of sourceConfigs) {
      if (!config.basePath) continue;

      const categoryPath = join(config.basePath, categorySubdir);
      if (!this.directoryExists(categoryPath)) continue;

      const locations = await this.scanDirectory(categoryPath, config, category);
      allLocations.push(...locations);
    }

    return this.deduplicateByName(allLocations);
  }

  /**
   * Discovers a specific prompt by name.
   *
   * Searches all sources in priority order and returns the first
   * (highest priority) match found.
   *
   * @param name - The prompt name to find (without extension)
   * @returns The highest priority location, or null if not found
   */
  async discoverByName(name: string): Promise<PromptLocation | null> {
    const sourceConfigs = this.getSourceConfigs();

    // Search in priority order (already sorted)
    for (const config of sourceConfigs) {
      if (!config.basePath) continue;

      const location = await this.findPromptInSource(name, config);
      if (location) {
        return location;
      }
    }

    return null;
  }

  /**
   * Gets the builtin prompts directory path.
   *
   * @returns Absolute path to the builtin prompts directory
   */
  getBuiltinPath(): string {
    return this.builtinPath;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Gets all source configurations sorted by priority.
   */
  private getSourceConfigs(): SourceConfig[] {
    const configs: SourceConfig[] = [];
    const userHome = homedir();

    for (const [source, dirConfig] of Object.entries(SOURCE_DIRECTORIES)) {
      let basePath: string | undefined;

      switch (dirConfig.base) {
        case "workspace":
          basePath = this.workspacePath ? join(this.workspacePath, dirConfig.path) : undefined;
          break;
        case "home":
          basePath = join(userHome, dirConfig.path);
          break;
        case "package":
          basePath = this.builtinPath;
          break;
      }

      configs.push({
        source,
        priority: PROMPT_SOURCE_PRIORITY[source] ?? 99,
        basePath,
        isDeprecated: DEPRECATED_SOURCES.has(source),
      });
    }

    // Sort by priority (lower = higher priority)
    return configs.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Scans a directory for prompt files.
   */
  private async scanDirectory(
    dirPath: string,
    config: SourceConfig,
    category?: PromptCategory
  ): Promise<PromptLocation[]> {
    const locations: PromptLocation[] = [];

    if (!this.directoryExists(dirPath)) {
      return locations;
    }

    // Emit deprecation warning if needed
    if (config.isDeprecated) {
      this.emitDeprecationWarning(config.source, dirPath);
    }

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recurse into subdirectories
          const subLocations = await this.scanDirectory(fullPath, config, category);
          locations.push(...subLocations);
        } else if (entry.isFile() && this.isPromptFile(entry.name)) {
          locations.push({
            source: this.mapSourceToPromptSource(config.source),
            path: fullPath,
            priority: config.priority,
          });
        }
      }
    } catch {
      // Directory scan failed, skip silently
    }

    return locations;
  }

  /**
   * Finds a specific prompt in a source directory.
   */
  private async findPromptInSource(
    name: string,
    config: SourceConfig
  ): Promise<PromptLocation | null> {
    if (!config.basePath || !this.directoryExists(config.basePath)) {
      return null;
    }

    // Check in all category subdirectories
    for (const categorySubdir of Object.values(CATEGORY_SUBDIRS)) {
      const categoryPath = join(config.basePath, categorySubdir);
      const location = this.findPromptFile(categoryPath, name, config);
      if (location) {
        return location;
      }
    }

    // Also check root directory
    const rootLocation = this.findPromptFile(config.basePath, name, config);
    if (rootLocation) {
      return rootLocation;
    }

    return null;
  }

  /**
   * Finds a prompt file by name in a directory.
   */
  private findPromptFile(
    dirPath: string,
    name: string,
    config: SourceConfig
  ): PromptLocation | null {
    if (!this.directoryExists(dirPath)) {
      return null;
    }

    // Try with .md extension
    const mdPath = join(dirPath, `${name}.md`);
    if (this.fileExists(mdPath)) {
      if (config.isDeprecated) {
        this.emitDeprecationWarning(config.source, dirPath);
      }
      return {
        source: this.mapSourceToPromptSource(config.source),
        path: mdPath,
        priority: config.priority,
      };
    }

    return null;
  }

  /**
   * Checks if a file is a prompt file (has .md extension).
   */
  private isPromptFile(filename: string): boolean {
    return filename.endsWith(".md") && !filename.startsWith(".");
  }

  /**
   * Deduplicates locations by name, keeping highest priority (lowest number).
   */
  private deduplicateByName(locations: PromptLocation[]): PromptLocation[] {
    const byName = new Map<string, PromptLocation>();

    // Sort by priority first (lower = higher priority)
    const sorted = [...locations].sort((a, b) => a.priority - b.priority);

    for (const location of sorted) {
      const name = this.extractPromptName(location.path);
      // Only keep the first (highest priority) occurrence
      if (!byName.has(name)) {
        byName.set(name, location);
      }
    }

    return Array.from(byName.values());
  }

  /**
   * Extracts the prompt name from a file path.
   */
  private extractPromptName(filePath: string): string {
    const filename = filePath.split(/[\\/]/).pop() ?? "";
    return filename.replace(/\.md$/, "");
  }

  /**
   * Maps internal source string to PromptSource type.
   */
  private mapSourceToPromptSource(source: string): PromptSource {
    switch (source) {
      case "project":
      case "github":
        return "project";
      case "user":
        return "user";
      case "builtin":
        return "builtin";
      default:
        // Legacy sources map to "legacy"
        return "legacy";
    }
  }

  /**
   * Checks if a directory exists.
   */
  private directoryExists(dirPath: string): boolean {
    try {
      const stats = statSync(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Checks if a file exists.
   */
  private fileExists(filePath: string): boolean {
    try {
      const stats = statSync(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Emits a deprecation warning for legacy prompt paths.
   */
  private emitDeprecationWarning(source: string, path: string): void {
    if (!this.emitDeprecationWarnings) return;

    // Only emit once per source
    if (this.deprecationWarningsEmitted.has(source)) return;
    this.deprecationWarningsEmitted.add(source);

    const sourceDisplay = source.charAt(0).toUpperCase() + source.slice(1);
    console.error(
      `[DEPRECATED] ${sourceDisplay} prompts path (${path}) is deprecated. ` +
        `Please migrate to .vellum/prompts/ using: vellum migrate prompts`
    );
  }
}
