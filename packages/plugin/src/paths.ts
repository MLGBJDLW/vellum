/**
 * Plugin Path Resolution Utilities
 *
 * Provides utilities for resolving plugin search paths across different
 * platforms and contexts. Handles:
 * - Project-local plugins (.vellum/plugins/)
 * - User plugins (~/.vellum/plugins/)
 * - Global plugins (platform-specific system directories)
 * - Builtin plugins (shipped with the package)
 *
 * @module plugin/paths
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// =============================================================================
// Constants
// =============================================================================

/** Plugin directory name within .vellum or system directories */
const PLUGINS_DIR_NAME = "plugins";

/** Vellum configuration directory name */
const VELLUM_DIR_NAME = ".vellum";

/** Application name for system directories */
const APP_NAME = "vellum";

// =============================================================================
// Path Expansion Utilities
// =============================================================================

/**
 * Expands a path string, resolving:
 * - Home directory shorthand (~)
 * - Environment variables ($VAR, ${VAR}, %VAR%)
 *
 * @param inputPath - Path string that may contain ~ or environment variables
 * @returns Expanded absolute path
 *
 * @example
 * ```typescript
 * // Expand home directory
 * expandPath("~/plugins"); // "/home/user/plugins"
 *
 * // Expand environment variables
 * expandPath("$HOME/plugins"); // "/home/user/plugins"
 * expandPath("%APPDATA%/plugins"); // "C:\Users\...\AppData\Roaming\plugins"
 * ```
 */
export function expandPath(inputPath: string): string {
  let expanded = inputPath;

  // Expand ~ to home directory (must be at start or after path separator)
  if (expanded.startsWith("~")) {
    const home = os.homedir();
    expanded = expanded.replace(/^~(?=[/\\]|$)/, home);
  }

  // Expand Unix-style environment variables: $VAR and ${VAR}
  expanded = expanded.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, braced, plain) => {
    const varName = braced || plain;
    return process.env[varName] ?? "";
  });

  // Expand Windows-style environment variables: %VAR%
  expanded = expanded.replace(/%([^%]+)%/g, (_, varName) => {
    return process.env[varName] ?? "";
  });

  return path.normalize(expanded);
}

// =============================================================================
// Path Existence Checks
// =============================================================================

/**
 * Checks if a directory exists at the given path.
 *
 * @param dirPath - Path to check
 * @returns True if the path exists and is a directory, false otherwise
 *
 * @example
 * ```typescript
 * if (pathExists("/usr/local/share/vellum/plugins")) {
 *   // Directory exists, safe to scan
 * }
 * ```
 */
export function pathExists(dirPath: string): boolean {
  try {
    const stats = fs.statSync(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

// =============================================================================
// Directory Getters
// =============================================================================

/**
 * Gets the root directory of the plugin package.
 *
 * This is used to locate builtin plugins shipped with the package.
 * Resolves relative to this module's location in the filesystem.
 *
 * @returns Absolute path to the plugin package root
 *
 * @example
 * ```typescript
 * const root = getPluginRoot();
 * // "/path/to/node_modules/@vellum/plugin"
 * ```
 */
export function getPluginRoot(): string {
  // Get the directory containing this file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Navigate up from src/ to package root
  // In development: packages/plugin/src/paths.ts -> packages/plugin/
  // In production: dist/paths.js -> dist -> package root (same level)
  // We look for package.json to find the actual root
  let currentDir = __dirname;
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const content = fs.readFileSync(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content) as { name?: string };
        if (pkg.name === "@vellum/plugin") {
          return currentDir;
        }
      } catch {
        // Continue searching
      }
    }
    currentDir = path.dirname(currentDir);
  }

  // Fallback: assume we're two levels deep (src/paths.ts or dist/paths.js)
  return path.resolve(__dirname, "..");
}

/**
 * Gets the user-specific plugins directory.
 *
 * Location: `~/.vellum/plugins/`
 *
 * This directory is for user-installed plugins that should be
 * available across all projects for the current user.
 *
 * @returns Absolute path to user plugins directory
 *
 * @example
 * ```typescript
 * const userDir = getUserPluginsDir();
 * // Linux/macOS: "/home/user/.vellum/plugins"
 * // Windows: "C:\Users\user\.vellum\plugins"
 * ```
 */
export function getUserPluginsDir(): string {
  return path.join(os.homedir(), VELLUM_DIR_NAME, PLUGINS_DIR_NAME);
}

/**
 * Gets the project-specific plugins directory.
 *
 * Location: `${projectRoot}/.vellum/plugins/`
 *
 * This directory is for plugins specific to a project,
 * typically committed to version control.
 *
 * @param projectRoot - Root directory of the project
 * @returns Absolute path to project plugins directory
 *
 * @example
 * ```typescript
 * const projectDir = getProjectPluginsDir("/home/user/my-project");
 * // "/home/user/my-project/.vellum/plugins"
 * ```
 */
export function getProjectPluginsDir(projectRoot: string): string {
  return path.join(projectRoot, VELLUM_DIR_NAME, PLUGINS_DIR_NAME);
}

/**
 * Gets the global/system plugins directory.
 *
 * Platform-specific locations:
 * - Windows: `%APPDATA%/vellum/plugins/`
 * - macOS: `/usr/local/share/vellum/plugins/`
 * - Linux: `/usr/local/share/vellum/plugins/`
 *
 * This directory is for system-wide plugins available to all users.
 *
 * @returns Absolute path to global plugins directory
 *
 * @example
 * ```typescript
 * const globalDir = getGlobalPluginsDir();
 * // Windows: "C:\Users\...\AppData\Roaming\vellum\plugins"
 * // Unix: "/usr/local/share/vellum/plugins"
 * ```
 */
export function getGlobalPluginsDir(): string {
  const platform = process.platform;

  if (platform === "win32") {
    // Windows: Use APPDATA environment variable
    const appData = process.env.APPDATA;
    if (appData) {
      return path.join(appData, APP_NAME, PLUGINS_DIR_NAME);
    }
    // Fallback to constructed path if APPDATA is not set
    return path.join(os.homedir(), "AppData", "Roaming", APP_NAME, PLUGINS_DIR_NAME);
  }

  // Unix-like systems (macOS, Linux, etc.)
  return path.join("/usr", "local", "share", APP_NAME, PLUGINS_DIR_NAME);
}

/**
 * Gets the builtin plugins directory shipped with the package.
 *
 * Location: `${packageRoot}/plugins/`
 *
 * This directory contains plugins bundled with the @vellum/plugin package.
 *
 * @returns Absolute path to builtin plugins directory
 *
 * @example
 * ```typescript
 * const builtinDir = getBuiltinPluginsDir();
 * // "/path/to/node_modules/@vellum/plugin/plugins"
 * ```
 */
export function getBuiltinPluginsDir(): string {
  return path.join(getPluginRoot(), PLUGINS_DIR_NAME);
}

// =============================================================================
// Search Path Resolution
// =============================================================================

/**
 * Options for getSearchPaths function.
 */
export interface SearchPathsOptions {
  /**
   * Project root directory. If provided, project plugins will be included.
   * @default undefined (no project plugins)
   */
  projectRoot?: string;

  /**
   * Whether to filter out non-existent directories.
   * @default true
   */
  filterNonExistent?: boolean;

  /**
   * Whether to include builtin plugins directory.
   * @default true
   */
  includeBuiltin?: boolean;

  /**
   * Whether to include global plugins directory.
   * @default true
   */
  includeGlobal?: boolean;

  /**
   * Whether to include user plugins directory.
   * @default true
   */
  includeUser?: boolean;
}

/**
 * Gets plugin search paths in priority order.
 *
 * Returns an array of directories to search for plugins, ordered by priority:
 * 1. Project plugins: `${projectRoot}/.vellum/plugins/` (if projectRoot provided)
 * 2. User plugins: `~/.vellum/plugins/`
 * 3. Global plugins: Platform-specific system directory
 * 4. Builtin plugins: `${packageRoot}/plugins/`
 *
 * By default, non-existent directories are filtered out silently.
 *
 * @param options - Configuration options
 * @returns Array of existing plugin directory paths in priority order
 *
 * @example
 * ```typescript
 * // Get all search paths for a project
 * const paths = getSearchPaths({ projectRoot: "/home/user/my-project" });
 * // [
 * //   "/home/user/my-project/.vellum/plugins",
 * //   "/home/user/.vellum/plugins",
 * //   "/usr/local/share/vellum/plugins",
 * //   "/path/to/package/plugins"
 * // ]
 *
 * // Get paths without project context
 * const globalPaths = getSearchPaths();
 * // [
 * //   "/home/user/.vellum/plugins",
 * //   "/usr/local/share/vellum/plugins",
 * //   "/path/to/package/plugins"
 * // ]
 *
 * // Get all candidate paths (including non-existent)
 * const allPaths = getSearchPaths({
 *   projectRoot: "/my-project",
 *   filterNonExistent: false
 * });
 * ```
 */
export function getSearchPaths(options: SearchPathsOptions = {}): string[] {
  const {
    projectRoot,
    filterNonExistent = true,
    includeBuiltin = true,
    includeGlobal = true,
    includeUser = true,
  } = options;

  const candidates: string[] = [];

  // 1. Project plugins (highest priority)
  if (projectRoot) {
    candidates.push(getProjectPluginsDir(projectRoot));
  }

  // 2. User plugins
  if (includeUser) {
    candidates.push(getUserPluginsDir());
  }

  // 3. Global plugins
  if (includeGlobal) {
    candidates.push(getGlobalPluginsDir());
  }

  // 4. Builtin plugins (lowest priority)
  if (includeBuiltin) {
    candidates.push(getBuiltinPluginsDir());
  }

  // Filter to only existing directories if requested
  if (filterNonExistent) {
    return candidates.filter(pathExists);
  }

  return candidates;
}

/**
 * Resolves a plugin path that may be relative, absolute, or use shortcuts.
 *
 * Supports:
 * - Absolute paths: `/path/to/plugin`
 * - Relative paths: `./my-plugin` (resolved against cwd or provided base)
 * - Home-relative: `~/plugins/my-plugin`
 * - Environment variables: `$PLUGINS_DIR/my-plugin`
 *
 * @param pluginPath - Path to resolve
 * @param basePath - Base path for relative resolution (defaults to cwd)
 * @returns Resolved absolute path
 *
 * @example
 * ```typescript
 * // Absolute path (unchanged)
 * resolvePluginPath("/absolute/path"); // "/absolute/path"
 *
 * // Relative path
 * resolvePluginPath("./local-plugin", "/project"); // "/project/local-plugin"
 *
 * // Home shortcut
 * resolvePluginPath("~/.vellum/plugins/my-plugin"); // "/home/user/.vellum/plugins/my-plugin"
 * ```
 */
export function resolvePluginPath(pluginPath: string, basePath: string = process.cwd()): string {
  // First expand any environment variables and home directory
  const expanded = expandPath(pluginPath);

  // If already absolute, return as-is
  if (path.isAbsolute(expanded)) {
    return path.normalize(expanded);
  }

  // Resolve relative to base path
  return path.resolve(basePath, expanded);
}
