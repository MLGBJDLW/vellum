/**
 * Markdown Command Loader (T033)
 *
 * Bridge between CommandLoader (core) and CommandRegistry (cli).
 * Loads custom markdown commands from .vellum/commands/*.md and
 * converts them to SlashCommand format for TUI integration.
 *
 * @module cli/commands/markdown-commands
 * @see REQ-013
 */

import { type CommandLoader, type CustomCommand, createCommandLoader } from "@vellum/core";
import type { CommandRegistry } from "./registry.js";
import type { CommandCategory, CommandContext, CommandResult, SlashCommand } from "./types.js";
import { pending, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of loading markdown commands.
 */
export interface MarkdownCommandLoadResult {
  /** Successfully loaded commands */
  commands: SlashCommand[];
  /** Commands that conflict with built-ins */
  conflicts: string[];
  /** Errors encountered during loading */
  errors: Array<{ file: string; error: string }>;
  /** Total markdown files scanned */
  scanned: number;
}

/**
 * Options for loading markdown commands.
 */
export interface MarkdownCommandLoaderOptions {
  /** Current working directory (workspace root) */
  cwd: string;
  /** Whether to load user commands from ~/.vellum/commands/ */
  loadUserCommands?: boolean;
}

// =============================================================================
// Module State
// =============================================================================

/**
 * Cached CommandLoader instance.
 */
let cachedLoader: CommandLoader | null = null;

/**
 * Last workspace path used.
 */
let lastWorkspacePath: string | null = null;

/**
 * Get or create CommandLoader for the workspace.
 */
function getLoader(cwd: string, loadUserCommands = true): CommandLoader {
  if (cachedLoader === null || lastWorkspacePath !== cwd) {
    cachedLoader = createCommandLoader({ cwd, loadUserCommands });
    lastWorkspacePath = cwd;
  }
  return cachedLoader;
}

/**
 * Clear the cached loader (for testing).
 */
export function clearMarkdownCommandCache(): void {
  cachedLoader = null;
  lastWorkspacePath = null;
}

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert a CustomCommand from core to SlashCommand for CLI.
 *
 * @param cmd - The custom command from CommandLoader
 * @returns SlashCommand ready for registry
 */
function convertToSlashCommand(cmd: CustomCommand): SlashCommand {
  return {
    name: cmd.name,
    description: `${cmd.description} ${cmd.badge ?? "[custom]"}`,
    kind: "user",
    category: "tools" as CommandCategory,
    aliases: [],
    positionalArgs: [
      {
        name: "args",
        type: "string",
        description: "Additional arguments",
        required: false,
      },
    ],
    execute: createCommandExecutor(cmd),
  };
}

/**
 * Create an executor function for a custom command.
 *
 * Custom commands inject their markdown content as context
 * for the agent to process.
 *
 * @param cmd - The custom command
 * @returns Command executor function
 */
function createCommandExecutor(
  cmd: CustomCommand
): (ctx: CommandContext) => Promise<CommandResult> {
  return async (ctx: CommandContext): Promise<CommandResult> => {
    // The command content is the prompt to inject
    const content = cmd.content.trim();

    if (!content) {
      return success(`📝 Command "${cmd.name}" loaded (no content to inject)`);
    }

    // Check if there are additional args to append
    const args = ctx.parsedArgs.raw.trim();
    const fullContent = args ? `${content}\n\nUser input: ${args}` : content;

    // Return pending to inject content as context
    return pending({
      message: `📝 Running custom command: /${cmd.name}`,
      promise: Promise.resolve(success(fullContent)),
    });
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Load all markdown commands from .vellum/commands/ directories.
 *
 * Scans project and user command directories, parses markdown files,
 * and converts them to SlashCommand format.
 *
 * @param options - Loader options
 * @returns Load result with commands, conflicts, and errors
 *
 * @example
 * ```typescript
 * const result = await loadMarkdownCommands({ cwd: '/path/to/project' });
 *
 * console.log(`Loaded ${result.commands.length} markdown commands`);
 * if (result.conflicts.length > 0) {
 *   console.warn('Conflicts with built-ins:', result.conflicts);
 * }
 * ```
 */
export async function loadMarkdownCommands(
  options: MarkdownCommandLoaderOptions
): Promise<MarkdownCommandLoadResult> {
  const loader = getLoader(options.cwd, options.loadUserCommands ?? true);

  // Load all commands from markdown files
  const customCommands = await loader.loadAll();
  const conflicts = loader.getConflicts();

  // Convert to SlashCommand format
  const commands = customCommands.map(convertToSlashCommand);

  return {
    commands,
    conflicts,
    errors: [], // Errors are logged by CommandLoader, not returned
    scanned: customCommands.length,
  };
}

/**
 * Load and register all markdown commands into a registry.
 *
 * This is the main integration point for TUI. It loads commands
 * from markdown files and registers them with the command registry.
 *
 * @param registry - Command registry to register commands in
 * @param options - Loader options
 * @returns Load result with registration status
 *
 * @example
 * ```typescript
 * const registry = new CommandRegistry();
 *
 * // Register built-in commands first
 * registry.register(helpCommand);
 * registry.register(clearCommand);
 *
 * // Then load and register markdown commands
 * const result = await registerMarkdownCommands(registry, {
 *   cwd: process.cwd()
 * });
 *
 * if (result.conflicts.length > 0) {
 *   console.warn('Custom commands override built-ins:', result.conflicts);
 * }
 * ```
 */
export async function registerMarkdownCommands(
  registry: CommandRegistry,
  options: MarkdownCommandLoaderOptions
): Promise<MarkdownCommandLoadResult> {
  const result = await loadMarkdownCommands(options);

  // Register each command
  for (const command of result.commands) {
    try {
      registry.register(command);
    } catch (err) {
      // If registration fails (e.g., conflict), add to errors
      result.errors.push({
        file: command.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Get the list of loaded custom command names.
 *
 * @param cwd - Workspace path
 * @returns Array of command names
 */
export async function getMarkdownCommandNames(cwd: string): Promise<string[]> {
  const result = await loadMarkdownCommands({ cwd });
  return result.commands.map((c) => c.name);
}

/**
 * Check if a command name is a custom markdown command.
 *
 * @param name - Command name to check
 * @param cwd - Workspace path
 * @returns True if this is a custom markdown command
 */
export async function isMarkdownCommand(name: string, cwd: string): Promise<boolean> {
  const names = await getMarkdownCommandNames(cwd);
  return names.includes(name);
}
