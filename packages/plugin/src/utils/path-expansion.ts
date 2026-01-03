/**
 * Path variable expansion utility for Vellum plugin system.
 * Handles expansion of path templates with context-aware variables.
 */

import * as os from "node:os";
import * as path from "node:path";

// Variable pattern constants (escaped to avoid lint warnings)
const VAR_PREFIX = "$" + "{";
const VAR_SUFFIX = "}";
const VELLUM_VAR_PREFIX = `${VAR_PREFIX}VELLUM_`;
const HOME_VAR = `${VAR_PREFIX}HOME${VAR_SUFFIX}`;
const USERPROFILE_VAR = `${VAR_PREFIX}USERPROFILE${VAR_SUFFIX}`;
const PLUGIN_ROOT_VAR = `${VAR_PREFIX}VELLUM_PLUGIN_ROOT${VAR_SUFFIX}`;
const USER_DIR_VAR = `${VAR_PREFIX}VELLUM_USER_DIR${VAR_SUFFIX}`;
const PROJECT_DIR_VAR = `${VAR_PREFIX}VELLUM_PROJECT_DIR${VAR_SUFFIX}`;

/**
 * Context for path variable expansion.
 */
export interface PathContext {
  /** Root directory of the plugin */
  pluginRoot: string;
  /** User's Vellum directory (~/.vellum/) */
  userDir: string;
  /** Project root directory (optional) */
  projectDir?: string;
}

/**
 * Result of path validation.
 */
export interface PathValidationResult {
  /** Whether the path is valid */
  valid: boolean;
  /** Warnings about the path */
  warnings: string[];
}

/**
 * Expands path variables in a template string.
 *
 * Supported variables:
 * - `${VELLUM_PLUGIN_ROOT}` - Plugin root directory
 * - `${VELLUM_USER_DIR}` - User's Vellum directory (~/.vellum/)
 * - `${VELLUM_PROJECT_DIR}` - Project root directory
 * - `~` - User's home directory
 * - `${ENV_VAR}` - Any environment variable
 *
 * @param template - The path template to expand
 * @param context - The context containing path values
 * @returns The expanded path with all variables replaced
 *
 * @example
 * ```ts
 * const expanded = expandPaths('${VELLUM_PLUGIN_ROOT}/config.json', {
 *   pluginRoot: '/home/user/.vellum/plugins/my-plugin',
 *   userDir: '/home/user/.vellum'
 * });
 * // Returns: '/home/user/.vellum/plugins/my-plugin/config.json'
 * ```
 */
export function expandPaths(template: string, context: PathContext): string {
  let result = template;

  // Replace Vellum-specific variables
  result = result.replace(/\$\{VELLUM_PLUGIN_ROOT\}/g, context.pluginRoot);
  result = result.replace(/\$\{VELLUM_USER_DIR\}/g, context.userDir);

  if (context.projectDir !== undefined) {
    result = result.replace(/\$\{VELLUM_PROJECT_DIR\}/g, context.projectDir);
  }

  // Replace ~ with home directory (only at start of path or after path separator)
  const homeDir = os.homedir();
  result = result.replace(/^~(?=\/|\\|$)/, homeDir);

  // Replace remaining environment variables ${VAR_NAME}
  result = result.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, varName) => {
    const envValue = process.env[varName];
    return envValue !== undefined ? envValue : "";
  });

  return result;
}

/**
 * Validates a path and returns warnings for potential issues.
 *
 * Checks for:
 * - Hardcoded absolute paths (platform-specific paths that should use variables)
 *
 * @param pathToValidate - The path to validate
 * @returns Validation result with validity status and warnings
 *
 * @example
 * ```ts
 * const result = validatePath('/home/user/.vellum/plugins');
 * // Returns: { valid: true, warnings: ['Path appears to be a hardcoded absolute path...'] }
 * ```
 */
export function validatePath(pathToValidate: string): PathValidationResult {
  const warnings: string[] = [];

  // Check for hardcoded absolute paths
  const isAbsoluteUnix = pathToValidate.startsWith("/");
  const isAbsoluteWindows = /^[A-Za-z]:[/\\]/.test(pathToValidate);

  if (isAbsoluteUnix || isAbsoluteWindows) {
    // Check if it's not using Vellum variables (which would be expanded already)
    const hasVellumVariable =
      pathToValidate.includes(VELLUM_VAR_PREFIX) ||
      pathToValidate.includes(HOME_VAR) ||
      pathToValidate.includes(USERPROFILE_VAR);

    if (!hasVellumVariable) {
      warnings.push(
        `Path "${pathToValidate}" appears to be a hardcoded absolute path. ` +
          `Consider using path variables like ${PLUGIN_ROOT_VAR}, ${USER_DIR_VAR}, ` +
          `or ${PROJECT_DIR_VAR} for better portability.`
      );
    }
  }

  // Check for home directory patterns that should use ~
  const homeDir = os.homedir();
  if (pathToValidate.startsWith(homeDir) && !pathToValidate.startsWith("~")) {
    warnings.push(
      `Path "${pathToValidate}" contains the home directory. ` +
        `Consider using ~ or ${USER_DIR_VAR} for better portability.`
    );
  }

  return {
    valid: true,
    warnings,
  };
}

/**
 * Normalizes path separators to the OS-native separator.
 *
 * Converts all forward slashes and backslashes to the appropriate
 * separator for the current operating system.
 *
 * @param inputPath - The path to normalize
 * @returns The path with OS-native separators
 *
 * @example
 * ```ts
 * // On Windows:
 * normalizePathSeparators('foo/bar\\baz');
 * // Returns: 'foo\\bar\\baz'
 *
 * // On Unix:
 * normalizePathSeparators('foo/bar\\baz');
 * // Returns: 'foo/bar/baz'
 * ```
 */
export function normalizePathSeparators(inputPath: string): string {
  // First normalize to forward slashes, then use path.normalize
  // which will convert to OS-native separators
  const normalized = inputPath.replace(/[\\/]+/g, path.sep);
  return path.normalize(normalized);
}
