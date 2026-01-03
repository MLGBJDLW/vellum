/**
 * Plugin Loader - Two-stage progressive loading system
 *
 * Implements L1 (manifest-only) and L2 (full) loading for efficient plugin management.
 * L1 loading is fast and suitable for discovery, while L2 loading is on-demand.
 *
 * @module plugin/loader
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { PluginAgentDefinition } from "./agents/types.js";
import type { DiscoveredPlugin, PluginSource } from "./discovery.js";
import { type HooksConfig, HooksConfigSchema } from "./hooks/types.js";
import { type PluginManifest, safeParsePluginManifest } from "./manifest.js";
import {
  createLoadedPlugin,
  type LoadedPlugin,
  type PluginCommand,
  type PluginSkill,
} from "./types.js";
import { expandPaths, type PathContext } from "./utils/path-expansion.js";

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when plugin loading fails.
 *
 * Contains detailed information about what went wrong during loading,
 * including the plugin name, root path, and specific error details.
 *
 * @example
 * ```typescript
 * try {
 *   await loadPlugin(discovered);
 * } catch (error) {
 *   if (error instanceof PluginLoadError) {
 *     console.error(`Failed to load ${error.pluginName}: ${error.message}`);
 *     console.error(`Details:`, error.details);
 *   }
 * }
 * ```
 */
export class PluginLoadError extends Error {
  /** Name of the plugin that failed to load */
  public readonly pluginName: string;

  /** Root path of the plugin */
  public readonly pluginRoot: string;

  /** Additional error details (validation errors, file paths, etc.) */
  public readonly details: unknown;

  /** Original error that caused this error, if any */
  public readonly cause?: Error;

  constructor(
    message: string,
    pluginName: string,
    pluginRoot: string,
    details?: unknown,
    cause?: Error
  ) {
    super(message);
    this.name = "PluginLoadError";
    this.pluginName = pluginName;
    this.pluginRoot = pluginRoot;
    this.details = details;
    this.cause = cause;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginLoadError);
    }
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a plugin that has only had its manifest loaded (L1).
 *
 * This is a lightweight representation suitable for discovery and listing,
 * before the full component loading (L2) is performed.
 *
 * @example
 * ```typescript
 * const partial = await loadManifestOnly(discovered);
 * console.log(partial.manifest.name); // Access manifest data
 * console.log(partial.fullyLoaded);   // false
 * ```
 */
export interface PartiallyLoadedPlugin {
  /** The validated plugin manifest */
  manifest: PluginManifest;

  /** Absolute path to the plugin root directory */
  root: string;

  /** Source location where the plugin was discovered */
  source: PluginSource;

  /** Indicates this is not fully loaded (L1 state) */
  fullyLoaded: false;
}

/**
 * Options for plugin loading.
 */
export interface LoadOptions {
  /**
   * Whether to perform full L2 loading immediately.
   * @default false
   */
  fullLoad?: boolean;

  /**
   * Whether to validate plugin hash/integrity.
   * @default false
   */
  validateHash?: boolean;
}

/**
 * Warnings collected during component loading.
 */
interface LoadWarnings {
  commands: string[];
  agents: string[];
  skills: string[];
  hooks: string[];
}

// =============================================================================
// L1 Loading - Manifest Only
// =============================================================================

/**
 * Performs L1 (light) loading of a plugin - manifest only.
 *
 * This is a fast operation that:
 * - Reads and parses the plugin.json manifest
 * - Validates the manifest against the schema
 * - Does NOT load any components (commands, agents, skills, hooks)
 *
 * Use this for initial discovery and plugin listing where full loading
 * is not yet required.
 *
 * @param discovered - The discovered plugin information from the scanner
 * @returns A partially loaded plugin with manifest data
 * @throws {PluginLoadError} If manifest cannot be read or is invalid
 *
 * @example
 * ```typescript
 * const partial = await loadManifestOnly(discovered);
 * console.log(`Found plugin: ${partial.manifest.displayName}`);
 * console.log(`Version: ${partial.manifest.version}`);
 * ```
 */
export async function loadManifestOnly(
  discovered: DiscoveredPlugin
): Promise<PartiallyLoadedPlugin> {
  const { name, root, manifestPath, source } = discovered;

  // Read manifest file
  let manifestContent: string;
  try {
    manifestContent = await fs.readFile(manifestPath, "utf-8");
  } catch (error) {
    throw new PluginLoadError(
      `Failed to read manifest file: ${manifestPath}`,
      name,
      root,
      { path: manifestPath },
      error instanceof Error ? error : undefined
    );
  }

  // Parse JSON
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(manifestContent);
  } catch (error) {
    throw new PluginLoadError(
      "Invalid JSON in manifest file",
      name,
      root,
      { path: manifestPath, parseError: error instanceof Error ? error.message : String(error) },
      error instanceof Error ? error : undefined
    );
  }

  // Validate against schema
  const parseResult = safeParsePluginManifest(manifestJson);
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new PluginLoadError(
      `Invalid manifest schema: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      name,
      root,
      { validationErrors: issues }
    );
  }

  return {
    manifest: parseResult.data,
    root,
    source,
    fullyLoaded: false,
  };
}

// =============================================================================
// L2 Loading - Full Component Loading
// =============================================================================

/**
 * Performs L2 (full) loading of a plugin - all components.
 *
 * This loads all plugin components on-demand:
 * - Commands (from markdown files)
 * - Agents (from markdown files)
 * - Skills (from markdown files)
 * - Hooks (from hooks.json)
 *
 * Errors in individual components are logged as warnings but don't block
 * loading of other components.
 *
 * @param partial - A partially loaded plugin from L1 loading
 * @returns A fully loaded plugin with all components
 * @throws {PluginLoadError} If critical loading fails
 *
 * @example
 * ```typescript
 * const partial = await loadManifestOnly(discovered);
 * // Later, when the plugin is actually needed:
 * const full = await loadFull(partial);
 * console.log(`Commands: ${full.commands.size}`);
 * ```
 */
export async function loadFull(partial: PartiallyLoadedPlugin): Promise<LoadedPlugin> {
  const { manifest, root } = partial;
  const warnings: LoadWarnings = {
    commands: [],
    agents: [],
    skills: [],
    hooks: [],
  };

  // Create path context for variable expansion
  const pathContext: PathContext = {
    pluginRoot: root,
    userDir: getDefaultUserDir(),
    projectDir: process.cwd(),
  };

  // Load components in parallel
  const [commands, agents, skills, hooks] = await Promise.all([
    loadCommands(manifest, root, pathContext, warnings),
    loadAgents(manifest, root, pathContext, warnings),
    loadSkills(manifest, root, pathContext, warnings),
    loadHooks(manifest, root, pathContext, warnings),
  ]);

  // Log warnings if any
  logWarnings(manifest.name, warnings);

  return createLoadedPlugin({
    manifest,
    root,
    commands,
    agents,
    skills,
    hooks,
    state: "enabled",
  });
}

// =============================================================================
// Main Load Function
// =============================================================================

/**
 * Loads a plugin from a discovered plugin location.
 *
 * By default, performs only L1 (manifest) loading for efficiency.
 * Set `options.fullLoad` to true to immediately perform L2 loading.
 *
 * @param discovered - The discovered plugin information
 * @param options - Loading options
 * @returns A loaded plugin (partially or fully, depending on options)
 * @throws {PluginLoadError} If loading fails
 *
 * @example
 * ```typescript
 * // L1 only (fast, for discovery)
 * const plugin = await loadPlugin(discovered);
 *
 * // L2 immediately (when plugin will be used)
 * const fullPlugin = await loadPlugin(discovered, { fullLoad: true });
 * ```
 */
export async function loadPlugin(
  discovered: DiscoveredPlugin,
  options: LoadOptions = {}
): Promise<LoadedPlugin | PartiallyLoadedPlugin> {
  const { fullLoad = false, validateHash = false } = options;

  // Always perform L1 loading first
  const partial = await loadManifestOnly(discovered);

  // TODO: Implement hash validation if validateHash is true
  if (validateHash) {
    // Reserved for future integrity validation
  }

  // Return early if full loading not requested
  if (!fullLoad) {
    return partial;
  }

  // Perform L2 loading
  return loadFull(partial);
}

/**
 * Type guard to check if a plugin is fully loaded.
 *
 * @param plugin - The plugin to check
 * @returns True if the plugin is fully loaded (L2)
 *
 * @example
 * ```typescript
 * const plugin = await loadPlugin(discovered);
 * if (isFullyLoaded(plugin)) {
 *   console.log(`Commands: ${plugin.commands.size}`);
 * }
 * ```
 */
export function isFullyLoaded(
  plugin: LoadedPlugin | PartiallyLoadedPlugin
): plugin is LoadedPlugin {
  return !("fullyLoaded" in plugin && plugin.fullyLoaded === false);
}

// =============================================================================
// Component Loaders
// =============================================================================

/**
 * Loads command definitions from the manifest.
 */
async function loadCommands(
  manifest: PluginManifest,
  root: string,
  pathContext: PathContext,
  warnings: LoadWarnings
): Promise<Map<string, PluginCommand>> {
  const commands = new Map<string, PluginCommand>();
  const commandPaths = manifest.commands ?? [];

  for (const commandPath of commandPaths) {
    try {
      const expandedPath = expandPaths(commandPath, pathContext);
      const absolutePath = path.isAbsolute(expandedPath)
        ? expandedPath
        : path.resolve(root, expandedPath);

      const content = await fs.readFile(absolutePath, "utf-8");
      const command = parseCommandFile(content, absolutePath);

      if (command) {
        commands.set(command.name, command);
      }
    } catch (error) {
      warnings.commands.push(
        `Failed to load command from ${commandPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return commands;
}

/**
 * Loads agent definitions from the manifest.
 */
async function loadAgents(
  manifest: PluginManifest,
  root: string,
  pathContext: PathContext,
  warnings: LoadWarnings
): Promise<Map<string, PluginAgentDefinition>> {
  const agents = new Map<string, PluginAgentDefinition>();
  const agentPaths = manifest.agents ?? [];

  for (const agentPath of agentPaths) {
    try {
      const expandedPath = expandPaths(agentPath, pathContext);
      const absolutePath = path.isAbsolute(expandedPath)
        ? expandedPath
        : path.resolve(root, expandedPath);

      const content = await fs.readFile(absolutePath, "utf-8");
      const agent = parseAgentFile(content, absolutePath, manifest.name);

      if (agent) {
        agents.set(agent.slug, agent);
      }
    } catch (error) {
      warnings.agents.push(
        `Failed to load agent from ${agentPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return agents;
}

/**
 * Loads skill definitions from the manifest.
 */
async function loadSkills(
  manifest: PluginManifest,
  root: string,
  pathContext: PathContext,
  warnings: LoadWarnings
): Promise<Map<string, PluginSkill>> {
  const skills = new Map<string, PluginSkill>();
  const skillPaths = manifest.skills ?? [];

  for (const skillPath of skillPaths) {
    try {
      const expandedPath = expandPaths(skillPath, pathContext);
      const absolutePath = path.isAbsolute(expandedPath)
        ? expandedPath
        : path.resolve(root, expandedPath);

      const content = await fs.readFile(absolutePath, "utf-8");
      const skill = parseSkillFile(content, absolutePath);

      if (skill) {
        skills.set(skill.name, skill);
      }
    } catch (error) {
      warnings.skills.push(
        `Failed to load skill from ${skillPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return skills;
}

/**
 * Loads hooks configuration from the manifest.
 */
async function loadHooks(
  manifest: PluginManifest,
  root: string,
  pathContext: PathContext,
  warnings: LoadWarnings
): Promise<HooksConfig | null> {
  const hooksPath = manifest.hooks;

  if (!hooksPath) {
    return null;
  }

  try {
    const expandedPath = expandPaths(hooksPath, pathContext);
    const absolutePath = path.isAbsolute(expandedPath)
      ? expandedPath
      : path.resolve(root, expandedPath);

    const content = await fs.readFile(absolutePath, "utf-8");
    const hooksJson = JSON.parse(content);

    const parseResult = HooksConfigSchema.safeParse(hooksJson);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      warnings.hooks.push(`Invalid hooks configuration: ${issues}`);
      return null;
    }

    return parseResult.data;
  } catch (error) {
    warnings.hooks.push(
      `Failed to load hooks from ${hooksPath}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

// =============================================================================
// File Parsers
// =============================================================================

/**
 * Parses a command markdown file.
 *
 * Expected format:
 * ```markdown
 * ---
 * name: command-name
 * description: Command description
 * argumentHint: <optional hint>
 * allowedTools:
 *   - tool1
 *   - tool2
 * ---
 *
 * Command content here...
 * ```
 */
function parseCommandFile(content: string, filePath: string): PluginCommand | null {
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter.name || !frontmatter.description) {
    return null;
  }

  return {
    name: String(frontmatter.name),
    description: String(frontmatter.description),
    argumentHint: frontmatter.argumentHint ? String(frontmatter.argumentHint) : undefined,
    allowedTools: Array.isArray(frontmatter.allowedTools)
      ? frontmatter.allowedTools.map(String)
      : undefined,
    content: body.trim(),
    filePath,
  };
}

/**
 * Parses an agent markdown file.
 *
 * Expected format:
 * ```markdown
 * ---
 * slug: agent-slug
 * name: Agent Name
 * mode: code
 * ...other fields
 * ---
 *
 * Agent instructions here...
 * ```
 */
function parseAgentFile(
  content: string,
  filePath: string,
  pluginName: string
): PluginAgentDefinition | null {
  const { frontmatter, body } = parseFrontmatter(content);

  if (!frontmatter.slug || !frontmatter.name) {
    return null;
  }

  // Build agent definition with required fields
  const agent: PluginAgentDefinition = {
    slug: String(frontmatter.slug),
    name: String(frontmatter.name),
    pluginName,
    filePath,
    scope: "plugin",
    mode: frontmatter.mode ? String(frontmatter.mode) : "code",
    toolGroups: Array.isArray(frontmatter.toolGroups) ? frontmatter.toolGroups : [],
    // Use systemPrompt for the markdown body content
    systemPrompt: body.trim() || undefined,
  };

  // Add optional fields if present
  if (frontmatter.description) {
    agent.description = String(frontmatter.description);
  }
  // whenToUse requires a description field
  if (frontmatter.whenToUse && typeof frontmatter.whenToUse === "object") {
    const wtu = frontmatter.whenToUse as Record<string, unknown>;
    if (wtu.description) {
      agent.whenToUse = {
        description: String(wtu.description),
        priority: typeof wtu.priority === "number" ? wtu.priority : undefined,
        triggers: Array.isArray(wtu.triggers) ? wtu.triggers : undefined,
      };
    }
  }
  if (frontmatter.settings) {
    agent.settings = frontmatter.settings as PluginAgentDefinition["settings"];
  }
  if (frontmatter.restrictions) {
    agent.restrictions = frontmatter.restrictions as PluginAgentDefinition["restrictions"];
  }
  if (frontmatter.hooks) {
    agent.hooks = frontmatter.hooks as PluginAgentDefinition["hooks"];
  }

  return agent;
}

/**
 * Parses a skill markdown file.
 *
 * Expected format:
 * ```markdown
 * ---
 * name: skill-name
 * description: Skill description
 * scripts:
 *   - ./scripts/script1.py
 * references:
 *   - ./references/guide.md
 * examples:
 *   - ./examples/example.py
 * ---
 *
 * Skill instructions here...
 * ```
 */
function parseSkillFile(content: string, filePath: string): PluginSkill | null {
  const { frontmatter } = parseFrontmatter(content);

  if (!frontmatter.name || !frontmatter.description) {
    return null;
  }

  return {
    name: String(frontmatter.name),
    description: String(frontmatter.description),
    filePath,
    scripts: Array.isArray(frontmatter.scripts) ? frontmatter.scripts.map(String) : undefined,
    references: Array.isArray(frontmatter.references)
      ? frontmatter.references.map(String)
      : undefined,
    examples: Array.isArray(frontmatter.examples) ? frontmatter.examples.map(String) : undefined,
  };
}

/**
 * Parses YAML frontmatter from a markdown file.
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1] ?? "";
  const body = match[2] ?? "";

  return { frontmatter: parseYamlSimple(frontmatterStr), body };
}

/**
 * Simple YAML parser for frontmatter fields.
 * Handles basic key-value pairs and arrays.
 */
function parseYamlSimple(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of yaml.split(/\r?\n/)) {
    const arrayItem = parseArrayItem(line);
    if (arrayItem !== null && currentKey && currentArray) {
      currentArray.push(arrayItem);
      continue;
    }

    const keyValue = parseKeyValue(line);
    if (keyValue) {
      // Save previous array if any
      if (currentKey && currentArray) {
        result[currentKey] = currentArray;
        currentArray = null;
      }

      currentKey = keyValue.key;
      if (keyValue.value === null) {
        currentArray = [];
      } else {
        result[keyValue.key] = keyValue.value;
      }
    }
  }

  // Save last array if any
  if (currentKey && currentArray) {
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * Parses an array item line (e.g., "  - value").
 */
function parseArrayItem(line: string): string | null {
  const match = line.match(/^\s+-\s+(.+)$/);
  return match?.[1]?.trim() ?? null;
}

/**
 * Parses a key-value line (e.g., "key: value" or "key:").
 */
function parseKeyValue(line: string): { key: string; value: string | null } | null {
  const match = line.match(/^(\w+):\s*(.*)$/);
  if (!match?.[1]) {
    return null;
  }

  const key = match[1];
  const value = match[2]?.trim();

  return {
    key,
    value: value && value.length > 0 ? value : null,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Gets the default user directory for Vellum.
 */
function getDefaultUserDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(homeDir, ".vellum");
}

/**
 * Logs warnings from component loading.
 */
function logWarnings(pluginName: string, warnings: LoadWarnings): void {
  const allWarnings = [
    ...warnings.commands,
    ...warnings.agents,
    ...warnings.skills,
    ...warnings.hooks,
  ];

  for (const warning of allWarnings) {
    console.warn(`[plugin:loader] ${pluginName}: ${warning}`);
  }
}
