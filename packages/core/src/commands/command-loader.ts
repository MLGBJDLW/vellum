// ============================================
// Command Loader
// ============================================

/**
 * Loads custom slash commands from `.vellum/commands/*.md` files.
 *
 * Custom commands are markdown files with YAML frontmatter that define
 * prompt-injecting commands for the agent system.
 *
 * @module @vellum/core/commands/command-loader
 * @see REQ-013
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { commandFrontmatterSchema, FrontmatterParser } from "@vellum/shared";

import { createLogger } from "../logger/index.js";

// =============================================================================
// Constants
// =============================================================================

/**
 * Logger instance for CommandLoader.
 */
const logger = createLogger({ name: "command-loader" });

/**
 * Standard command directories.
 */
const PROJECT_COMMANDS_DIR = ".vellum/commands";
const USER_COMMANDS_DIR = ".vellum/commands";

/**
 * Built-in command names that can be overridden.
 */
const BUILTIN_COMMANDS = new Set([
  "help",
  "clear",
  "exit",
  "mode",
  "vibe",
  "plan",
  "spec",
  "history",
  "session",
  "config",
  "theme",
  "tools",
  "model",
  "credentials",
  "language",
  "cost",
  "metrics",
  "debug",
  "lsp",
  "skill",
  "tutorial",
  "update",
]);

// =============================================================================
// Types
// =============================================================================

/**
 * Source of a custom command file.
 */
export type CommandSource = "project" | "user";

/**
 * Trigger pattern for command activation.
 */
export interface CommandTrigger {
  /** Pattern to match. */
  pattern: string;
  /** Type of pattern matching. */
  type: "keyword" | "regex" | "prefix";
}

/**
 * A loaded custom command.
 */
export interface CustomCommand {
  /** Command name (without leading /). */
  name: string;
  /** Description of what the command does. */
  description: string;
  /** Badge to display in command list (e.g., "[custom]"). */
  badge?: string;
  /** The prompt content to inject. */
  content: string;
  /** Where the command was loaded from. */
  source: CommandSource;
  /** Trigger patterns for automatic activation. */
  triggers?: CommandTrigger[];
  /** Absolute path to the source file. */
  path: string;
}

/**
 * Options for CommandLoader.
 */
export interface CommandLoaderOptions {
  /** Current working directory (workspace root). */
  cwd: string;
  /** Whether to load user commands from ~/.vellum/commands/. @default true */
  loadUserCommands?: boolean;
}

/**
 * Result from loading commands.
 */
export interface CommandLoadResult {
  /** Successfully loaded commands. */
  commands: CustomCommand[];
  /** Commands that conflict with built-ins. */
  conflicts: string[];
  /** Errors encountered during loading. */
  errors: Array<{ file: string; error: string }>;
}

// =============================================================================
// CommandLoader Class
// =============================================================================

/**
 * Loads custom slash commands from markdown files.
 *
 * Scans `.vellum/commands/` directories for markdown files with
 * YAML frontmatter, parses them, and returns CustomCommand objects.
 *
 * @example
 * ```typescript
 * const loader = new CommandLoader({ cwd: '/path/to/project' });
 *
 * // Load all commands
 * const commands = await loader.loadAll();
 *
 * // Load a specific command
 * const reviewCmd = await loader.load('review');
 *
 * // Check for conflicts with built-ins
 * const conflicts = loader.getConflicts();
 * if (conflicts.length > 0) {
 *   console.warn('Custom commands override built-ins:', conflicts);
 * }
 * ```
 */
export class CommandLoader {
  private readonly cwd: string;
  private readonly loadUserCommands: boolean;
  private readonly frontmatterParser: FrontmatterParser<typeof commandFrontmatterSchema>;
  private conflicts: string[] = [];
  private loaded: Map<string, CustomCommand> = new Map();

  /**
   * Creates a new CommandLoader instance.
   *
   * @param options - Loader configuration options
   */
  constructor(options: CommandLoaderOptions) {
    this.cwd = options.cwd;
    this.loadUserCommands = options.loadUserCommands ?? true;
    this.frontmatterParser = new FrontmatterParser(commandFrontmatterSchema);
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Loads all custom commands from all sources.
   *
   * Scans project and user command directories, parses markdown files,
   * and returns deduplicated commands (project takes precedence).
   *
   * @returns Array of loaded custom commands
   */
  async loadAll(): Promise<CustomCommand[]> {
    this.conflicts = [];
    this.loaded.clear();

    const result: CommandLoadResult = {
      commands: [],
      conflicts: [],
      errors: [],
    };

    // Load from project directory (higher priority)
    const projectDir = join(this.cwd, PROJECT_COMMANDS_DIR);
    await this.loadFromDirectory(projectDir, "project", result);

    // Load from user directory (lower priority)
    if (this.loadUserCommands) {
      const userDir = join(homedir(), USER_COMMANDS_DIR);
      await this.loadFromDirectory(userDir, "user", result);
    }

    // Store conflicts for later retrieval
    this.conflicts = result.conflicts;

    // Log any errors
    for (const err of result.errors) {
      logger.warn(`Failed to load command from ${err.file}: ${err.error}`);
    }

    return result.commands;
  }

  /**
   * Loads a specific command by name.
   *
   * Searches project directory first, then user directory.
   *
   * @param name - Command name to load
   * @returns The loaded command, or null if not found
   */
  async load(name: string): Promise<CustomCommand | null> {
    // Check cache first
    if (this.loaded.has(name)) {
      // biome-ignore lint/style/noNonNullAssertion: Value guaranteed by has() check above
      return this.loaded.get(name)!;
    }

    // Try project directory first
    const projectPath = join(this.cwd, PROJECT_COMMANDS_DIR, `${name}.md`);
    if (existsSync(projectPath)) {
      const cmd = await this.loadFile(projectPath, "project");
      if (cmd) {
        this.loaded.set(name, cmd);
        return cmd;
      }
    }

    // Try user directory
    if (this.loadUserCommands) {
      const userPath = join(homedir(), USER_COMMANDS_DIR, `${name}.md`);
      if (existsSync(userPath)) {
        const cmd = await this.loadFile(userPath, "user");
        if (cmd) {
          this.loaded.set(name, cmd);
          return cmd;
        }
      }
    }

    return null;
  }

  /**
   * Gets the list of custom commands that override built-ins.
   *
   * Call after `loadAll()` to see which built-in commands are
   * being overridden by custom commands.
   *
   * @returns Array of command names that conflict with built-ins
   */
  getConflicts(): string[] {
    return [...this.conflicts];
  }

  /**
   * Clears the loaded command cache.
   */
  clearCache(): void {
    this.loaded.clear();
    this.conflicts = [];
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Loads commands from a directory.
   */
  private async loadFromDirectory(
    dirPath: string,
    source: CommandSource,
    result: CommandLoadResult
  ): Promise<void> {
    if (!existsSync(dirPath)) {
      return;
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const mdFiles = entries
        .filter((e) => e.isFile() && extname(e.name) === ".md")
        .map((e) => join(dirPath, e.name));

      for (const filePath of mdFiles) {
        const command = await this.loadFile(filePath, source);
        if (command) {
          // Check for duplicates (project overrides user)
          const existing = result.commands.find((c) => c.name === command.name);
          if (existing) {
            if (source === "project") {
              // Project overrides user
              result.commands = result.commands.filter((c) => c.name !== command.name);
              result.commands.push(command);
            }
            // else: user command ignored, project already loaded
          } else {
            // Check for built-in conflicts
            if (BUILTIN_COMMANDS.has(command.name)) {
              result.conflicts.push(command.name);
              logger.warn(
                `Custom command "${command.name}" overrides built-in command [${source}]`
              );
            }
            result.commands.push(command);
            this.loaded.set(command.name, command);
          }
        }
      }
    } catch (err) {
      result.errors.push({
        file: dirPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Loads a single command file.
   */
  private async loadFile(filePath: string, source: CommandSource): Promise<CustomCommand | null> {
    try {
      const content = await readFile(filePath, "utf-8");
      const parseResult = this.frontmatterParser.parse(content);

      if (!parseResult.success) {
        logger.warn(`Failed to parse command file ${filePath}: Invalid frontmatter`);
        return null;
      }

      const fm = parseResult.data;
      const name = fm.name || basename(filePath, ".md");

      return {
        name,
        description: fm.description,
        badge: fm.badge || "[custom]",
        content: parseResult.body.trim(),
        source,
        triggers: fm.triggers?.map((t) => ({
          pattern: t.pattern,
          type: t.type,
        })),
        path: filePath,
      };
    } catch (err) {
      logger.warn(`Failed to read command file ${filePath}: ${err}`);
      return null;
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a CommandLoader instance.
 *
 * @param options - Loader configuration options
 * @returns A new CommandLoader instance
 */
export function createCommandLoader(options: CommandLoaderOptions): CommandLoader {
  return new CommandLoader(options);
}
