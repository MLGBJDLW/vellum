// ============================================
// Skill Loader
// ============================================
// Implements progressive skill loading with L1→L2→L3 caching.
// Manages skill lifecycle and resource access.
// @see REQ-003

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { Logger } from "../logger/logger.js";
import { SkillDiscovery, type SkillDiscoveryOptions } from "./discovery.js";
import { SkillParser } from "./parser.js";
import type {
  Skill,
  SkillAccessed,
  SkillLoaded,
  SkillLocation,
  SkillResource,
  SkillScan,
} from "./types.js";

// ============================================
// Cache Types
// ============================================

/**
 * Cache entry for a skill with its current loading level.
 */
export interface SkillCacheEntry {
  /** Current loading level (1, 2, or 3) */
  level: 1 | 2 | 3;
  /** The skill data at current level */
  data: Skill;
  /** Location where skill was discovered */
  location: SkillLocation;
  /** Timestamp when first cached */
  cachedAt: Date;
  /** Timestamp of last access */
  lastAccessedAt: Date;
}

/**
 * Options for skill loader.
 */
export interface SkillLoaderOptions {
  /** Discovery options */
  discovery?: SkillDiscoveryOptions;
  /** Optional logger for debugging */
  logger?: Logger;
  /** Custom parser instance */
  parser?: SkillParser;
}

/**
 * Result of L1 skill scanning operation.
 */
export interface ScanResult {
  /** Number of successfully scanned skills */
  scanned: number;
  /** Skills that failed to scan */
  failed: Array<{ path: string; error: string }>;
}

/**
 * Result of L2 skill loading operation.
 * Discriminated union to distinguish between success, not-found, and error cases.
 */
export type LoadL2Result =
  | { status: "success"; skill: SkillLoaded }
  | { status: "not-found"; skillId: string }
  | { status: "error"; skillId: string; error: string };

// ============================================
// SkillLoader Class
// ============================================

/**
 * Progressive skill loader with multi-level caching.
 *
 * Loading Levels:
 * - L1 (Scan): Frontmatter only (~50-100 tokens)
 * - L2 (Loaded): Full SKILL.md content (~500-2000 tokens)
 * - L3 (Accessed): Resource metadata (scripts/, references/, assets/)
 *
 * Cache automatically upgrades from L1→L2→L3 as needed.
 * Use invalidate() to clear cache for a specific skill.
 *
 * @example
 * ```typescript
 * const loader = new SkillLoader({
 *   discovery: { workspacePath: '/path/to/project' },
 *   logger: logger
 * });
 *
 * await loader.initialize();
 *
 * // L1: Quick scan of all skills
 * const scans = loader.getAllScans();
 *
 * // L2: Load full content when needed
 * const loaded = await loader.loadL2('skill-name');
 *
 * // L3: Access resources
 * const accessed = await loader.accessL3('skill-name');
 * ```
 */
export class SkillLoader {
  private discovery: SkillDiscovery;
  private parser: SkillParser;
  private logger?: Logger;

  /** Cache: skill name → cache entry */
  private cache = new Map<string, SkillCacheEntry>();

  /** Whether loader has been initialized */
  private initialized = false;

  constructor(options: SkillLoaderOptions = {}) {
    this.discovery = new SkillDiscovery(options.discovery);
    this.parser = options.parser ?? new SkillParser();
    this.logger = options.logger;
  }

  /**
   * Initialize the loader by discovering and scanning all skills.
   * Must be called before using other methods.
   *
   * @returns Number of skills discovered
   */
  async initialize(): Promise<number> {
    this.logger?.debug("Initializing skill loader");

    // Discover all skill locations
    const result = await this.discovery.discoverAll();

    // L1 scan each discovered skill
    const scanResult = await this.scanL1(result.deduplicated);

    // Log any scan failures
    if (scanResult.failed.length > 0) {
      this.logger?.warn("Some skills failed to scan", {
        failedCount: scanResult.failed.length,
        failures: scanResult.failed,
      });
    }

    this.initialized = true;

    this.logger?.info("Skill loader initialized", {
      skillCount: this.cache.size,
      scanned: scanResult.scanned,
      failed: scanResult.failed.length,
    });

    return this.cache.size;
  }

  /**
   * Re-initialize the loader (clears cache and rediscovers).
   */
  async reinitialize(): Promise<number> {
    this.cache.clear();
    this.initialized = false;
    return this.initialize();
  }

  /**
   * Scan skills at L1 level (frontmatter only).
   *
   * @param locations - Skill locations to scan
   * @returns Scan result with count of scanned skills and any failures
   */
  async scanL1(locations: SkillLocation[]): Promise<ScanResult> {
    const failed: Array<{ path: string; error: string }> = [];
    let scanned = 0;

    const promises = locations.map(async (location) => {
      try {
        const scan = await this.parser.parseMetadata(location.manifestPath, location.source);

        if (!scan) {
          this.logger?.warn(`Failed to parse skill at ${location.path}`);
          failed.push({ path: location.path, error: "Failed to parse skill metadata" });
          return;
        }

        const entry: SkillCacheEntry = {
          level: 1,
          data: { scan },
          location,
          cachedAt: new Date(),
          lastAccessedAt: new Date(),
        };

        this.cache.set(scan.name, entry);
        scanned++;
        this.logger?.debug(`L1 scanned: ${scan.name}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger?.warn(`Error scanning skill at ${location.path}`, { error });
        failed.push({ path: location.path, error: errorMessage });
      }
    });

    await Promise.all(promises);
    return { scanned, failed };
  }

  /**
   * Load a skill at L2 level (full SKILL.md content).
   *
   * @param name - Skill name
   * @returns LoadL2Result discriminated union with status
   */
  async loadL2(name: string): Promise<LoadL2Result> {
    const entry = this.cache.get(name);

    if (!entry) {
      this.logger?.debug(`Skill not found in cache: ${name}`);
      return { status: "not-found", skillId: name };
    }

    // Already at L2 or L3
    if (entry.level >= 2 && entry.data.loaded) {
      entry.lastAccessedAt = new Date();
      return { status: "success", skill: entry.data.loaded };
    }

    // Upgrade from L1 to L2
    try {
      const loaded = await this.parser.parseFull(
        entry.location.manifestPath,
        entry.location.source
      );

      if (!loaded) {
        this.logger?.warn(`Failed to parse L2 for skill: ${name}`);
        return { status: "error", skillId: name, error: "Failed to parse skill content" };
      }

      // Update cache
      entry.level = 2;
      entry.data = {
        scan: entry.data.scan,
        loaded,
      };
      entry.lastAccessedAt = new Date();

      this.logger?.debug(`L2 loaded: ${name}`);
      return { status: "success", skill: loaded };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger?.error(`Error loading L2 for skill: ${name}`, { error });
      return { status: "error", skillId: name, error: errorMessage };
    }
  }

  /**
   * Access a skill at L3 level (include resource metadata).
   *
   * @param name - Skill name
   * @returns Accessed skill data or null if not found
   */
  async accessL3(name: string): Promise<SkillAccessed | null> {
    const entry = this.cache.get(name);

    if (!entry) {
      this.logger?.debug(`Skill not found: ${name}`);
      return null;
    }

    // Already at L3
    if (entry.level === 3 && entry.data.accessed) {
      entry.lastAccessedAt = new Date();
      return entry.data.accessed;
    }

    // Ensure L2 is loaded first
    if (entry.level < 2 || !entry.data.loaded) {
      const result = await this.loadL2(name);
      if (result.status !== "success") {
        return null;
      }
    }

    // Upgrade to L3: scan resource directories
    try {
      const skillPath = entry.location.path;

      const [scripts, references, assets] = await Promise.all([
        this.scanResources(path.join(skillPath, "scripts"), "script"),
        this.scanResources(path.join(skillPath, "references"), "reference"),
        this.scanResources(path.join(skillPath, "assets"), "asset"),
      ]);

      // entry.data.loaded is guaranteed to exist after the L2 check above
      const loadedData = entry.data.loaded;
      if (!loadedData) {
        this.logger?.error(`L2 data missing for skill: ${name}`);
        return null;
      }

      const accessed: SkillAccessed = {
        ...loadedData,
        scripts,
        references,
        assets,
        accessedAt: new Date(),
      };

      // Update cache
      entry.level = 3;
      entry.data = {
        scan: entry.data.scan,
        loaded: entry.data.loaded,
        accessed,
      };
      entry.lastAccessedAt = new Date();

      this.logger?.debug(`L3 accessed: ${name}`, {
        scripts: scripts.length,
        references: references.length,
        assets: assets.length,
      });

      return accessed;
    } catch (error) {
      this.logger?.error(`Error accessing L3 for skill: ${name}`, { error });
      return null;
    }
  }

  /**
   * Get a skill at its current cache level.
   *
   * @param name - Skill name
   * @returns Skill data or null if not found
   */
  getSkill(name: string): Skill | null {
    const entry = this.cache.get(name);

    if (!entry) {
      return null;
    }

    entry.lastAccessedAt = new Date();
    return entry.data;
  }

  /**
   * Get all L1 scans.
   *
   * @returns Array of all skill scans
   */
  getAllScans(): SkillScan[] {
    return Array.from(this.cache.values()).map((entry) => entry.data.scan);
  }

  /**
   * Get all skill names.
   *
   * @returns Array of skill names
   */
  getSkillNames(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if a skill exists.
   *
   * @param name - Skill name
   */
  hasSkill(name: string): boolean {
    return this.cache.has(name);
  }

  /**
   * Get cache entry for a skill.
   *
   * @param name - Skill name
   * @returns Cache entry or undefined
   */
  getCacheEntry(name: string): SkillCacheEntry | undefined {
    return this.cache.get(name);
  }

  /**
   * Invalidate cache for a specific skill.
   * Removes all cached levels (L1, L2, L3).
   *
   * @param name - Skill name to invalidate
   * @returns true if skill was in cache, false otherwise
   */
  invalidate(name: string): boolean {
    const existed = this.cache.has(name);

    if (existed) {
      this.cache.delete(name);
      this.logger?.debug(`Cache invalidated: ${name}`);
    }

    return existed;
  }

  /**
   * Invalidate all cached skills.
   */
  invalidateAll(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.initialized = false;
    this.logger?.debug(`All cache invalidated: ${count} skills`);
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): {
    total: number;
    l1: number;
    l2: number;
    l3: number;
  } {
    let l1 = 0;
    let l2 = 0;
    let l3 = 0;

    for (const entry of this.cache.values()) {
      switch (entry.level) {
        case 1:
          l1++;
          break;
        case 2:
          l2++;
          break;
        case 3:
          l3++;
          break;
      }
    }

    return { total: this.cache.size, l1, l2, l3 };
  }

  /**
   * Check if loader is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Update workspace path and reinitialize.
   */
  async setWorkspacePath(workspacePath: string): Promise<number> {
    this.discovery.setWorkspacePath(workspacePath);
    return this.reinitialize();
  }

  // ============================================
  // Dependency Resolution (T029)
  // ============================================

  /**
   * Resolve dependencies for a skill in topological order.
   * Returns dependencies deepest-first (leaf dependencies first).
   * Gracefully handles circular dependencies by skipping problematic skills.
   *
   * @param skillName - Name of the skill to resolve dependencies for
   * @returns Ordered list of dependency names (deepest first)
   */
  async resolveDependencies(skillName: string): Promise<string[]> {
    const resolved: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const skipped: Array<{ skill: string; reason: string }> = [];

    await this.resolveDependenciesRecursive(skillName, resolved, visiting, visited, skipped);

    // Log summary of skipped skills
    if (skipped.length > 0) {
      this.logger?.warn(`Dependency resolution completed with ${skipped.length} skipped skill(s)`, {
        skipped: skipped.map((s) => s.skill),
      });
    }

    // Remove the original skill from the result (we only want dependencies)
    const index = resolved.indexOf(skillName);
    if (index !== -1) {
      resolved.splice(index, 1);
    }

    return resolved;
  }

  /**
   * Recursive helper for dependency resolution.
   * Gracefully skips circular dependencies instead of throwing.
   *
   * @param skillName - Current skill being resolved
   * @param resolved - Accumulator for resolved dependencies
   * @param visiting - Set of skills currently being visited (for cycle detection)
   * @param visited - Set of fully resolved skills
   * @param skipped - Accumulator for skipped skills due to circular dependencies
   */
  private async resolveDependenciesRecursive(
    skillName: string,
    resolved: string[],
    visiting: Set<string>,
    visited: Set<string>,
    skipped: Array<{ skill: string; reason: string }>
  ): Promise<void> {
    // Already fully resolved
    if (visited.has(skillName)) {
      return;
    }

    // Cycle detection - gracefully skip instead of throwing
    if (visiting.has(skillName)) {
      const cycle = `${Array.from(visiting).join(" -> ")} -> ${skillName}`;
      this.logger?.warn("Circular dependency detected, skipping skill", {
        skill: skillName,
        cycle,
      });
      skipped.push({ skill: skillName, reason: `Circular dependency: ${cycle}` });
      return;
    }

    // Mark as currently visiting
    visiting.add(skillName);

    // Get skill scan data
    const entry = this.cache.get(skillName);

    if (!entry) {
      this.logger?.warn(`Dependency not found: ${skillName}`);
      visiting.delete(skillName);
      return;
    }

    const dependencies = entry.data.scan.dependencies;

    // Recursively resolve dependencies
    for (const dep of dependencies) {
      await this.resolveDependenciesRecursive(dep, resolved, visiting, visited, skipped);
    }

    // Mark as visited and add to resolved list
    visiting.delete(skillName);
    visited.add(skillName);
    resolved.push(skillName);

    this.logger?.debug(`Resolved dependency: ${skillName}`, {
      dependencies: dependencies.length,
    });
  }

  /**
   * Load a skill and all its dependencies.
   * Returns loaded skills in dependency order (dependencies first).
   * Gracefully handles circular dependencies by skipping problematic skills.
   *
   * @param skillName - Name of the skill to load
   * @returns Array of loaded skills in dependency order
   */
  async loadWithDependencies(skillName: string): Promise<SkillLoaded[]> {
    // Resolve dependency order
    const dependencyOrder = await this.resolveDependencies(skillName);

    // Add the main skill at the end
    dependencyOrder.push(skillName);

    // Load all skills in order
    const loaded: SkillLoaded[] = [];

    for (const name of dependencyOrder) {
      const result = await this.loadL2(name);
      if (result.status === "success") {
        loaded.push(result.skill);
      } else if (result.status === "error") {
        this.logger?.warn(`Failed to load dependency: ${name}`, { error: result.error });
      } else {
        this.logger?.warn(`Dependency not found: ${name}`);
      }
    }

    return loaded;
  }

  /**
   * Scan a resource directory for files.
   *
   * @param dirPath - Path to resource directory
   * @param type - Resource type
   * @returns Array of resource metadata
   */
  private async scanResources(
    dirPath: string,
    type: SkillResource["type"]
  ): Promise<SkillResource[]> {
    const resources: SkillResource[] = [];

    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return resources;
      }
    } catch {
      // Directory doesn't exist
      return resources;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        // Skip hidden files
        if (entry.name.startsWith(".")) {
          continue;
        }

        const filePath = path.join(dirPath, entry.name);
        const stat = await fs.stat(filePath);

        resources.push({
          path: filePath,
          relativePath: entry.name,
          type,
          size: stat.size,
        });
      }
    } catch (error) {
      this.logger?.warn(`Error scanning resources at ${dirPath}`, { error });
    }

    return resources;
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Default SkillLoader instance for convenience.
 */
export const skillLoader = new SkillLoader();
