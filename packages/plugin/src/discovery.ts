/**
 * Plugin Discovery Scanner
 *
 * Scans filesystem paths to discover plugins. A valid plugin directory
 * contains a `.vellum-plugin/plugin.json` manifest file.
 *
 * Priority order (first wins for duplicates):
 * 1. project - Project-local plugins
 * 2. user - User-specific plugins
 * 3. global - System-wide plugins
 * 4. builtin - Shipped with package
 *
 * @module plugin/discovery
 */

import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// =============================================================================
// Constants
// =============================================================================

/** Name of the plugin metadata directory */
const PLUGIN_DIR_NAME = ".vellum-plugin";

/** Name of the plugin manifest file */
const MANIFEST_FILE_NAME = "plugin.json";

// =============================================================================
// Types
// =============================================================================

/**
 * Source location of a discovered plugin.
 *
 * Determines priority when duplicate plugin names are found:
 * - `project`: Local to the current project (highest priority)
 * - `user`: User-specific plugins (~/.vellum/plugins/)
 * - `global`: System-wide plugins
 * - `builtin`: Shipped with the package (lowest priority)
 */
export type PluginSource = "project" | "user" | "global" | "builtin";

/**
 * Represents a discovered plugin on the filesystem.
 *
 * This is a lightweight structure containing only location information.
 * The actual manifest parsing happens in the loader phase.
 *
 * @example
 * ```typescript
 * const plugin: DiscoveredPlugin = {
 *   name: "my-plugin",
 *   root: "/home/user/.vellum/plugins/my-plugin",
 *   manifestPath: "/home/user/.vellum/plugins/my-plugin/.vellum-plugin/plugin.json",
 *   source: "user"
 * };
 * ```
 */
export interface DiscoveredPlugin {
  /** Plugin name derived from the directory name */
  name: string;

  /** Absolute path to the plugin root directory */
  root: string;

  /** Absolute path to the plugin.json manifest file */
  manifestPath: string;

  /** Source location indicating where the plugin was found */
  source: PluginSource;
}

// =============================================================================
// Priority Mapping
// =============================================================================

/**
 * Priority values for plugin sources.
 * Lower number = higher priority.
 */
const SOURCE_PRIORITY: Record<PluginSource, number> = {
  project: 0,
  user: 1,
  global: 2,
  builtin: 3,
};

// =============================================================================
// Directory Scanning
// =============================================================================

/**
 * Scans a directory for valid plugin subdirectories.
 *
 * A valid plugin directory contains a `.vellum-plugin/plugin.json` file.
 * Symlinks are followed to resolve actual directory contents.
 *
 * @param dir - Directory path to scan for plugins
 * @param source - Source type for discovered plugins
 * @returns Array of discovered plugins found in the directory
 *
 * @example
 * ```typescript
 * // Scan user plugins directory
 * const plugins = await scanDirectory(
 *   "/home/user/.vellum/plugins",
 *   "user"
 * );
 * // [
 * //   { name: "my-plugin", root: "...", manifestPath: "...", source: "user" },
 * //   { name: "other-plugin", root: "...", manifestPath: "...", source: "user" }
 * // ]
 * ```
 */
export async function scanDirectory(
  dir: string,
  source: PluginSource
): Promise<DiscoveredPlugin[]> {
  const discovered: DiscoveredPlugin[] = [];

  // Read directory contents
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    // Handle permission errors or non-existent directories
    if (isNodeError(error)) {
      if (error.code === "ENOENT") {
        // Directory doesn't exist, return empty
        return [];
      }
      if (error.code === "EACCES" || error.code === "EPERM") {
        // Permission denied, log warning and skip
        console.warn(`[plugin:discovery] Permission denied scanning ${dir}`);
        return [];
      }
    }
    // Re-throw unexpected errors
    throw error;
  }

  // Process each entry in parallel
  const checks = entries.map(async (entry) => {
    // Determine if entry is a directory (follow symlinks)
    let isDirectory = entry.isDirectory();
    const entryName = String(entry.name);
    const entryPath = path.join(dir, entryName);

    // Handle symlinks by checking the target
    if (entry.isSymbolicLink()) {
      try {
        const stats = await fs.stat(entryPath);
        isDirectory = stats.isDirectory();
      } catch {
        // Broken symlink or inaccessible target, skip
        return null;
      }
    }

    if (!isDirectory) {
      return null;
    }

    // Check for plugin manifest
    const manifestPath = path.join(entryPath, PLUGIN_DIR_NAME, MANIFEST_FILE_NAME);
    try {
      await fs.access(manifestPath, fs.constants.R_OK);
      return {
        name: entryName,
        root: entryPath,
        manifestPath,
        source,
      } satisfies DiscoveredPlugin;
    } catch {
      // No manifest or not readable, not a valid plugin
      return null;
    }
  });

  const results = await Promise.all(checks);
  for (const result of results) {
    if (result !== null) {
      discovered.push(result);
    }
  }

  return discovered;
}

// =============================================================================
// Plugin Discovery
// =============================================================================

/**
 * Source mappings for search paths in priority order.
 *
 * When calling discoverPlugins with getSearchPaths(), the paths are ordered:
 * 0 = project, 1 = user, 2 = global, 3 = builtin
 */
const INDEX_TO_SOURCE: PluginSource[] = ["project", "user", "global", "builtin"];

/**
 * Discovers plugins across multiple search paths.
 *
 * Scans each provided path for plugin directories. When duplicate plugin
 * names are found, the first occurrence (by path order) wins. This ensures
 * project plugins can override user/global/builtin plugins.
 *
 * @param searchPaths - Array of directory paths to search for plugins
 * @returns Array of discovered plugins, deduplicated by name
 *
 * @example
 * ```typescript
 * import { getSearchPaths } from "./paths.js";
 *
 * // Discover all plugins with automatic path resolution
 * const paths = getSearchPaths({ projectRoot: "/my/project" });
 * const plugins = await discoverPlugins(paths);
 *
 * // plugins are deduplicated - project plugins override others
 * console.log(plugins.map(p => `${p.name} (${p.source})`));
 * // ["my-plugin (project)", "shared-plugin (user)", "core-plugin (builtin)"]
 * ```
 *
 * @example
 * ```typescript
 * // Manual path specification
 * const plugins = await discoverPlugins([
 *   "/project/.vellum/plugins",
 *   "/home/user/.vellum/plugins"
 * ]);
 * ```
 */
export async function discoverPlugins(searchPaths: string[]): Promise<DiscoveredPlugin[]> {
  const seenNames = new Set<string>();
  const allPlugins: DiscoveredPlugin[] = [];

  // Process paths in order (priority order)
  for (const [index, searchPath] of searchPaths.entries()) {
    // Determine source based on position
    // Default to 'user' if index exceeds known sources
    const source = INDEX_TO_SOURCE[index] ?? "user";

    const plugins = await scanDirectory(searchPath, source);

    for (const plugin of plugins) {
      // First occurrence wins (higher priority paths come first)
      if (!seenNames.has(plugin.name)) {
        seenNames.add(plugin.name);
        allPlugins.push(plugin);
      }
      // Duplicate found from lower priority source - skip silently
    }
  }

  return allPlugins;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Type guard for Node.js filesystem errors.
 *
 * @param error - Unknown error to check
 * @returns True if error is a Node.js error with a code property
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Gets the priority value for a plugin source.
 *
 * Lower values indicate higher priority.
 *
 * @param source - Plugin source type
 * @returns Priority number (0 = highest)
 *
 * @example
 * ```typescript
 * getSourcePriority("project"); // 0
 * getSourcePriority("builtin"); // 3
 * ```
 */
export function getSourcePriority(source: PluginSource): number {
  return SOURCE_PRIORITY[source];
}

/**
 * Compares two plugins by their source priority.
 *
 * Useful for sorting plugins where higher priority should come first.
 *
 * @param a - First plugin to compare
 * @param b - Second plugin to compare
 * @returns Negative if a has higher priority, positive if b has higher priority
 *
 * @example
 * ```typescript
 * const sorted = plugins.sort(compareByPriority);
 * // Project plugins first, builtin last
 * ```
 */
export function compareByPriority(a: DiscoveredPlugin, b: DiscoveredPlugin): number {
  return getSourcePriority(a.source) - getSourcePriority(b.source);
}
