// ============================================
// Mode Loader for YAML-defined Agent Modes
// ============================================

import type { Stats } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { AgentLevelSchema } from "./level.js";
import type { ExtendedModeConfig, ToolPermissions } from "./modes.js";
import { FileRestrictionSchema, ToolGroupEntrySchema } from "./restrictions.js";

// ============================================
// YAML Schema for Mode Configuration
// ============================================

/**
 * String union for agent levels in YAML files.
 *
 * Allows human-readable level names instead of numeric values.
 */
const YamlAgentLevelSchema = z.union([
  z.literal("orchestrator"),
  z.literal("workflow"),
  z.literal("worker"),
  AgentLevelSchema,
]);

// Note: parseAgentLevel was removed as level is now in AgentConfig,
// not ExtendedModeConfig. Agent levels are managed by AgentRegistry.

/**
 * Zod schema for YAML mode configuration files.
 *
 * This schema maps YAML field names to ExtendedModeConfig properties:
 * - `slug` -> `name` (required in YAML, maps to mode identifier)
 * - `roleDefinition` -> `prompt` (the system prompt)
 * - `customInstructions` -> additional prompt text (appended to roleDefinition)
 *
 * @example YAML file:
 * ```yaml
 * name: "Coder Agent"
 * slug: "coder"
 * level: "worker"
 * roleDefinition: "You are a coding expert..."
 * customInstructions: "Follow these patterns..."
 * tools:
 *   edit: true
 *   bash: true
 * fileRestrictions:
 *   - pattern: "src/**\/*.ts"
 *     access: "write"
 * ```
 */
export const YamlModeConfigSchema = z.object({
  /** Human-readable name for the mode */
  name: z.string(),
  /** Unique identifier (slug) for the mode */
  slug: z.string(),
  /** Agent level in hierarchy (can be string or number) */
  level: YamlAgentLevelSchema,
  /** Role definition / system prompt */
  roleDefinition: z.string(),
  /** Optional custom instructions (appended to roleDefinition) */
  customInstructions: z.string().optional(),
  /** Optional human-readable description */
  description: z.string().optional(),
  /** Tool permissions configuration */
  tools: z
    .object({
      edit: z.boolean().default(false),
      bash: z.union([z.boolean(), z.literal("readonly")]).default(false),
      web: z.boolean().optional(),
      mcp: z.boolean().optional(),
    })
    .optional(),
  /** Temperature for LLM (0.0 - 1.0) */
  temperature: z.number().min(0).max(1).optional(),
  /** Maximum tokens for response */
  maxTokens: z.number().positive().optional(),
  /** Enable extended thinking mode */
  extendedThinking: z.boolean().optional(),
  /** List of agent slugs this mode can spawn */
  canSpawnAgents: z.array(z.string()).optional(),
  /** File access restrictions */
  fileRestrictions: z.array(FileRestrictionSchema).optional(),
  /** Tool group access rules */
  toolGroups: z.array(ToolGroupEntrySchema).optional(),
  /** Parent mode slug for inheritance */
  parentMode: z.string().optional(),
  /** Maximum concurrent subagents */
  maxConcurrentSubagents: z.number().int().positive().optional(),
});

/**
 * Type for YAML mode configuration input.
 */
export type YamlModeConfig = z.infer<typeof YamlModeConfigSchema>;

// ============================================
// Error Types
// ============================================

/**
 * Error thrown when a mode file cannot be found.
 */
export class ModeFileNotFoundError extends Error {
  constructor(
    public readonly path: string,
    cause?: Error
  ) {
    super(`Mode file not found: ${path}`);
    this.name = "ModeFileNotFoundError";
    this.cause = cause;
  }
}

/**
 * Error thrown when a mode file contains invalid YAML or schema violations.
 */
export class ModeValidationError extends Error {
  constructor(
    public readonly path: string,
    public readonly details: string
  ) {
    super(`Invalid mode configuration in ${path}: ${details}`);
    this.name = "ModeValidationError";
  }
}

// ============================================
// ModeLoader Interface
// ============================================

/**
 * Loader for YAML-defined agent mode configurations.
 *
 * Provides methods to load mode configurations from individual files,
 * directories, or by discovering them across multiple search paths.
 *
 * @example
 * ```typescript
 * const loader = createModeLoader();
 *
 * // Load a single mode
 * const mode = await loader.loadFromFile("./modes/coder.yaml");
 *
 * // Load all modes from a directory
 * const modes = await loader.loadFromDirectory("./modes");
 *
 * // Discover modes from multiple paths
 * const allModes = await loader.discoverModes([
 *   "./project/.vellum/modes",
 *   "~/.config/vellum/modes",
 * ]);
 * ```
 */
export interface ModeLoader {
  /**
   * Load a mode configuration from a YAML file.
   *
   * @param path - Path to the YAML file
   * @returns The parsed and validated ExtendedModeConfig
   * @throws ModeFileNotFoundError if the file doesn't exist
   * @throws ModeValidationError if the file contains invalid YAML or fails validation
   */
  loadFromFile(path: string): Promise<ExtendedModeConfig>;

  /**
   * Load all mode configurations from a directory.
   *
   * Scans the directory for `.yaml` and `.yml` files and loads each one.
   * Non-YAML files are ignored. Invalid files cause errors.
   *
   * @param dir - Path to the directory
   * @returns Array of parsed ExtendedModeConfig objects
   * @throws ModeFileNotFoundError if the directory doesn't exist
   */
  loadFromDirectory(dir: string): Promise<ExtendedModeConfig[]>;

  /**
   * Discover and load modes from multiple search paths.
   *
   * Searches all provided paths (files or directories), loads all found
   * modes, and deduplicates by slug (later paths override earlier ones).
   *
   * @param searchPaths - Array of file or directory paths to search
   * @returns Array of unique ExtendedModeConfig objects (deduplicated by slug)
   */
  discoverModes(searchPaths: string[]): Promise<ExtendedModeConfig[]>;
}

// ============================================
// ModeLoader Implementation
// ============================================

/**
 * Convert a YAML mode configuration to ExtendedModeConfig.
 *
 * Note: Agent hierarchy fields (level, canSpawnAgents, fileRestrictions,
 * maxConcurrentSubagents) are now in AgentConfig, not ExtendedModeConfig.
 * YAML files should reference agents by name instead.
 *
 * @param yamlConfig - The parsed YAML configuration
 * @returns A valid ExtendedModeConfig
 */
function yamlToExtendedMode(yamlConfig: YamlModeConfig): ExtendedModeConfig {
  // Build the prompt from roleDefinition + customInstructions
  const prompt = yamlConfig.customInstructions
    ? `${yamlConfig.roleDefinition}\n\n${yamlConfig.customInstructions}`
    : yamlConfig.roleDefinition;

  // Build tool permissions with defaults
  const tools: ToolPermissions = {
    edit: yamlConfig.tools?.edit ?? false,
    bash: yamlConfig.tools?.bash ?? false,
    web: yamlConfig.tools?.web,
    mcp: yamlConfig.tools?.mcp,
  };

  // Build the ExtendedModeConfig
  // Note: Agent fields (level, canSpawnAgents, fileRestrictions, maxConcurrentSubagents)
  // are no longer part of ExtendedModeConfig - they belong in AgentConfig
  const config: ExtendedModeConfig = {
    // Use slug as the name (mode identifier)
    name: yamlConfig.slug as ExtendedModeConfig["name"],
    description: yamlConfig.description ?? yamlConfig.name,
    tools,
    prompt,
    temperature: yamlConfig.temperature,
    maxTokens: yamlConfig.maxTokens,
    extendedThinking: yamlConfig.extendedThinking,
    toolGroups: yamlConfig.toolGroups,
    parentMode: yamlConfig.parentMode,
  };

  return config;
}

/**
 * Check if a file path has a YAML extension.
 */
function isYamlFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === ".yaml" || ext === ".yml";
}

/**
 * Internal implementation of ModeLoader.
 */
class ModeLoaderImpl implements ModeLoader {
  async loadFromFile(path: string): Promise<ExtendedModeConfig> {
    const resolvedPath = resolve(path);

    // Read the file
    let content: string;
    try {
      content = await readFile(resolvedPath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ModeFileNotFoundError(resolvedPath, error as Error);
      }
      throw error;
    }

    // Parse YAML
    let rawData: unknown;
    try {
      rawData = yaml.load(content);
    } catch (error) {
      throw new ModeValidationError(
        resolvedPath,
        `Invalid YAML syntax: ${(error as Error).message}`
      );
    }

    // Validate against YAML schema
    const yamlResult = YamlModeConfigSchema.safeParse(rawData);
    if (!yamlResult.success) {
      const issues = yamlResult.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new ModeValidationError(resolvedPath, issues);
    }

    // Convert to ExtendedModeConfig
    const config = yamlToExtendedMode(yamlResult.data);

    // Validate final config against ExtendedModeConfigSchema
    // Note: Some fields may be optional in YAML but required in ExtendedModeConfig
    // The yamlToExtendedMode function handles defaults
    return config;
  }

  async loadFromDirectory(dir: string): Promise<ExtendedModeConfig[]> {
    const resolvedDir = resolve(dir);

    // Check if directory exists
    let dirStat: Stats;
    try {
      dirStat = await stat(resolvedDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ModeFileNotFoundError(resolvedDir, error as Error);
      }
      throw error;
    }

    if (!dirStat.isDirectory()) {
      throw new ModeFileNotFoundError(resolvedDir);
    }

    // List directory contents
    const entries = await readdir(resolvedDir);

    // Filter for YAML files
    const yamlFiles = entries.filter(isYamlFile);

    // Load each file
    const modes: ExtendedModeConfig[] = [];
    for (const file of yamlFiles) {
      const filePath = join(resolvedDir, file);
      const mode = await this.loadFromFile(filePath);
      modes.push(mode);
    }

    return modes;
  }

  async discoverModes(searchPaths: string[]): Promise<ExtendedModeConfig[]> {
    // Map to track modes by slug (later paths override earlier)
    const modesBySlug = new Map<string, ExtendedModeConfig>();

    for (const searchPath of searchPaths) {
      const resolvedPath = resolve(searchPath);

      // Check if path exists and its type
      let pathStat: Stats;
      try {
        pathStat = await stat(resolvedPath);
      } catch (error) {
        // Skip non-existent paths silently during discovery
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          continue;
        }
        throw error;
      }

      let modes: ExtendedModeConfig[];

      if (pathStat.isDirectory()) {
        // Load all modes from directory
        modes = await this.loadFromDirectory(resolvedPath);
      } else if (pathStat.isFile() && isYamlFile(resolvedPath)) {
        // Load single file
        const mode = await this.loadFromFile(resolvedPath);
        modes = [mode];
      } else {
        // Skip non-YAML files
        continue;
      }

      // Add to map (later paths override earlier)
      for (const mode of modes) {
        modesBySlug.set(mode.name, mode);
      }
    }

    // Return unique modes as array
    return Array.from(modesBySlug.values());
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new ModeLoader instance.
 *
 * @returns A ModeLoader for loading YAML mode configurations
 *
 * @example
 * ```typescript
 * const loader = createModeLoader();
 *
 * // Load modes from project and user directories
 * const modes = await loader.discoverModes([
 *   "./.vellum/modes",
 *   "~/.config/vellum/modes",
 * ]);
 *
 * // Register with ModeRegistry
 * for (const mode of modes) {
 *   registry.register(mode);
 * }
 * ```
 */
export function createModeLoader(): ModeLoader {
  return new ModeLoaderImpl();
}
