import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as TOML from "@iarna/toml";
import { Err, Ok, type Result } from "../types/result.js";
import { type Config, ConfigSchema, type PartialConfig } from "./schema.js";

// ============================================
// T034-T038: Configuration Loader Module
// ============================================

/**
 * Error types for configuration loading operations
 */
export type ConfigErrorCode = "FILE_NOT_FOUND" | "PARSE_ERROR" | "VALIDATION_ERROR" | "READ_ERROR";

/**
 * Configuration error with code and context
 */
export interface ConfigError {
  code: ConfigErrorCode;
  message: string;
  path?: string;
  cause?: unknown;
}

/**
 * Options for loadConfig function
 */
export interface LoadConfigOptions {
  /** Working directory to search for config files (default: process.cwd()) */
  cwd?: string;
  /** Config overrides (highest priority) */
  overrides?: PartialConfig;
  /** Skip loading environment variables */
  skipEnv?: boolean;
  /** Skip loading project config file */
  skipProjectFile?: boolean;
}

// ============================================
// T035: findProjectConfig
// ============================================

/** Config file names to search for in order */
const CONFIG_FILE_NAMES = ["vellum.toml", ".vellum.toml", ".config/vellum.toml"];

/**
 * Find project configuration file by searching up from startDir to root.
 *
 * @param startDir - Directory to start search from (default: process.cwd())
 * @returns Path to found config file, or undefined if not found
 *
 * @example
 * ```typescript
 * const configPath = findProjectConfig();
 * if (configPath) {
 *   console.log(`Found config at: ${configPath}`);
 * }
 * ```
 */
export function findProjectConfig(startDir?: string): string | undefined {
  let currentDir = path.resolve(startDir ?? process.cwd());
  const root = path.parse(currentDir).root;

  while (true) {
    // Check each config file name in order
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = path.join(currentDir, fileName);
      if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
        return configPath;
      }
    }

    // Move to parent directory
    const parentDir = path.dirname(currentDir);

    // Stop if we've reached the root
    if (parentDir === currentDir || currentDir === root) {
      break;
    }

    currentDir = parentDir;
  }

  return undefined;
}

// ============================================
// T036: parseEnvConfig
// ============================================

/**
 * Environment variable to config path mappings
 */
const ENV_MAPPINGS: Record<string, string[]> = {
  VELLUM_LLM_PROVIDER: ["llm", "provider"],
  VELLUM_LLM_MODEL: ["llm", "model"],
  VELLUM_LLM_API_KEY: ["llm", "apiKey"],
  VELLUM_DEBUG: ["debug"],
  VELLUM_LOG_LEVEL: ["logLevel"],
};

/**
 * Coerce string value to appropriate type
 */
function coerceValue(value: string, path: string[]): unknown {
  // Boolean coercion for debug flag
  if (path[0] === "debug") {
    return value === "true" || value === "1";
  }
  return value;
}

/**
 * Set a nested value in an object using a path array
 */
function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): void {
  if (path.length === 0) return;

  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1];
  if (lastKey !== undefined) {
    current[lastKey] = value;
  }
}

/**
 * Parse VELLUM_* environment variables into a partial config object.
 *
 * @returns Partial config with only values from environment variables
 *
 * @example
 * ```typescript
 * // With VELLUM_LLM_PROVIDER=anthropic set:
 * const config = parseEnvConfig();
 * // { llm: { provider: "anthropic" } }
 * ```
 */
export function parseEnvConfig(): Partial<PartialConfig> {
  const result: Record<string, unknown> = {};

  for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
    const value = process.env[envVar];
    if (value !== undefined && value !== "") {
      setNestedValue(result, configPath, coerceValue(value, configPath));
    }
  }

  return result as Partial<PartialConfig>;
}

// ============================================
// T037: deepMerge
// ============================================

/**
 * Check if value is a plain object (not array, null, or other type)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * Deep merge multiple objects. Later sources override earlier ones.
 * Arrays are replaced (not concatenated).
 * undefined values don't overwrite existing values.
 *
 * @param sources - Objects to merge
 * @returns Merged object
 *
 * @example
 * ```typescript
 * const result = deepMerge(
 *   { a: 1, b: { c: 2 } },
 *   { b: { d: 3 } }
 * );
 * // { a: 1, b: { c: 2, d: 3 } }
 * ```
 */
export function deepMerge<T extends object>(...sources: Partial<T>[]): T {
  const result: Record<string, unknown> = {};

  for (const source of sources) {
    if (!isPlainObject(source)) continue;

    for (const key of Object.keys(source)) {
      const sourceValue = (source as Record<string, unknown>)[key];

      // Skip undefined values - they don't overwrite
      if (sourceValue === undefined) continue;

      const targetValue = result[key];

      // Deep merge plain objects
      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        // Arrays and other values are replaced
        result[key] = sourceValue;
      }
    }
  }

  return result as T;
}

// ============================================
// T038: loadConfig
// ============================================

/**
 * Get path to global config file (~/.config/vellum/config.toml)
 */
function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".config", "vellum", "config.toml");
}

/**
 * Read and parse a TOML config file
 */
function readTomlFile(filePath: string): Result<Record<string, unknown>, ConfigError> {
  try {
    if (!fs.existsSync(filePath)) {
      return Err({
        code: "FILE_NOT_FOUND",
        message: `Config file not found: ${filePath}`,
        path: filePath,
      });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = TOML.parse(content);
    return Ok(parsed as Record<string, unknown>);
  } catch (error) {
    if (error instanceof Error && error.name === "TomlError") {
      return Err({
        code: "PARSE_ERROR",
        message: `Failed to parse TOML: ${error.message}`,
        path: filePath,
        cause: error,
      });
    }
    return Err({
      code: "READ_ERROR",
      message: `Failed to read config file: ${error instanceof Error ? error.message : String(error)}`,
      path: filePath,
      cause: error,
    });
  }
}

/**
 * Load configuration from multiple sources with cascading priority.
 *
 * Load order (later overrides earlier):
 * 1. Schema defaults
 * 2. Global config: ~/.config/vellum/config.toml
 * 3. Project config: findProjectConfig()
 * 4. Environment variables (unless skipEnv)
 * 5. CLI overrides (options.overrides)
 *
 * @param options - Loading options
 * @returns Result with validated Config or ConfigError
 *
 * @example
 * ```typescript
 * const result = loadConfig({ cwd: "/my/project" });
 * if (result.ok) {
 *   console.log(result.value.llm.provider);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export function loadConfig(options: LoadConfigOptions = {}): Result<Config, ConfigError> {
  const { cwd, overrides, skipEnv = false, skipProjectFile = false } = options;

  // Start with empty object (schema defaults applied during validation)
  const configs: Partial<PartialConfig>[] = [];

  // 1. Global config (~/.config/vellum/config.toml)
  const globalPath = getGlobalConfigPath();
  const globalResult = readTomlFile(globalPath);
  if (globalResult.ok) {
    configs.push(globalResult.value as Partial<PartialConfig>);
  }
  // Ignore FILE_NOT_FOUND for global config - it's optional

  // 2. Project config (unless skipProjectFile)
  if (!skipProjectFile) {
    const projectPath = findProjectConfig(cwd);
    if (projectPath) {
      const projectResult = readTomlFile(projectPath);
      if (!projectResult.ok) {
        // Only fail on parse errors, not missing file
        if (projectResult.error.code !== "FILE_NOT_FOUND") {
          return projectResult as Result<Config, ConfigError>;
        }
      } else {
        configs.push(projectResult.value as Partial<PartialConfig>);
      }
    }
  }

  // 3. Environment variables (unless skipEnv)
  if (!skipEnv) {
    const envConfig = parseEnvConfig();
    if (Object.keys(envConfig).length > 0) {
      configs.push(envConfig);
    }
  }

  // 4. CLI overrides (highest priority)
  if (overrides) {
    configs.push(overrides);
  }

  // Merge all configs
  const merged = deepMerge<PartialConfig>(...configs);

  // Validate and apply defaults via schema
  const parseResult = ConfigSchema.safeParse(merged);

  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return Err({
      code: "VALIDATION_ERROR",
      message: `Invalid configuration: ${issues}`,
      cause: parseResult.error,
    });
  }

  return Ok(parseResult.data);
}
