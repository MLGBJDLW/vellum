/**
 * User Command Loader
 *
 * Loads user-defined commands from ~/.vellum/commands/ directory.
 * Supports .js and .ts command files with validation.
 *
 * @module cli/commands/user-commands
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { CommandRegistry } from "./registry.js";
import type { CommandCategory, CommandContext, CommandResult, SlashCommand } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * User command definition format
 *
 * This is the structure users export from their command files.
 */
export interface UserCommandDefinition {
  /** Command name (should start with /) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Optional aliases for the command */
  aliases?: string[];
  /** Optional category (defaults to 'tools') */
  category?: CommandCategory;
  /** Command execution handler */
  execute: (
    args: UserCommandArgs,
    context: UserCommandContext
  ) => Promise<UserCommandResult> | UserCommandResult;
}

/**
 * Simplified args passed to user commands
 */
export interface UserCommandArgs {
  /** Raw input string after command name */
  raw: string;
  /** Parsed positional arguments */
  positional: string[];
  /** Parsed named arguments */
  named: Record<string, string | boolean>;
}

/**
 * Simplified context passed to user commands
 */
export interface UserCommandContext {
  /** Current working directory */
  cwd: string;
  /** Session ID */
  sessionId: string;
  /** Provider name */
  provider: string;
  /** Home directory */
  homeDir: string;
}

/**
 * Result from user command execution
 */
export interface UserCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Message to display */
  message?: string;
  /** Data to return */
  data?: unknown;
  /** Error message if failed */
  error?: string;
}

/**
 * Validation error for user commands
 */
export interface UserCommandValidationError {
  /** File path that failed validation */
  file: string;
  /** Error message */
  error: string;
}

/**
 * Result of loading user commands
 */
export interface UserCommandLoadResult {
  /** Successfully loaded commands */
  commands: SlashCommand[];
  /** Validation errors encountered */
  errors: UserCommandValidationError[];
  /** Total files scanned */
  scanned: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default commands directory under user home */
const COMMANDS_DIR = "commands";

/** Supported file extensions */
const SUPPORTED_EXTENSIONS = [".js", ".mjs", ".ts", ".mts"];

// =============================================================================
// UserCommandLoader Class
// =============================================================================

/**
 * Loads and validates user-defined commands
 *
 * Scans ~/.vellum/commands/ for command files and converts them
 * to SlashCommand format for registration.
 *
 * @example
 * ```typescript
 * const loader = new UserCommandLoader();
 * const result = await loader.load();
 *
 * if (result.errors.length > 0) {
 *   console.warn('Some commands failed to load:', result.errors);
 * }
 *
 * for (const cmd of result.commands) {
 *   registry.register(cmd);
 * }
 * ```
 */
export class UserCommandLoader {
  /** Base directory for user commands */
  private readonly commandsDir: string;

  /**
   * Create a new UserCommandLoader
   *
   * @param baseDir - Optional base directory (defaults to ~/.vellum)
   */
  constructor(baseDir?: string) {
    const vellumDir = baseDir ?? path.join(os.homedir(), ".vellum");
    this.commandsDir = path.join(vellumDir, COMMANDS_DIR);
  }

  /**
   * Get the commands directory path
   */
  getCommandsDir(): string {
    return this.commandsDir;
  }

  /**
   * Load all user commands from the commands directory
   *
   * @returns Load result with commands and any errors
   */
  async load(): Promise<UserCommandLoadResult> {
    const result: UserCommandLoadResult = {
      commands: [],
      errors: [],
      scanned: 0,
    };

    // Check if directory exists
    const dirExists = await this.directoryExists();
    if (!dirExists) {
      return result;
    }

    // Scan for command files
    const files = await this.scanDirectory();
    result.scanned = files.length;

    // Load each command file
    for (const file of files) {
      try {
        const definition = await this.loadCommandFile(file);
        const validation = this.validateDefinition(definition, file);

        if (validation.valid) {
          const command = this.convertToSlashCommand(definition);
          result.commands.push(command);
        } else {
          result.errors.push({
            file,
            error: validation.error ?? "Unknown validation error",
          });
        }
      } catch (err) {
        result.errors.push({
          file,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  /**
   * Check if the commands directory exists
   */
  async directoryExists(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.commandsDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Scan the commands directory for command files
   */
  private async scanDirectory(): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(this.commandsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
            files.push(path.join(this.commandsDir, entry.name));
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return files;
  }

  /**
   * Load a command definition from a file
   */
  private async loadCommandFile(filePath: string): Promise<UserCommandDefinition> {
    // Convert to file URL for dynamic import
    const fileUrl = pathToFileURL(filePath).href;

    // Dynamic import the module
    const module = await import(fileUrl);

    // Get the default export
    const definition = module.default;

    if (!definition) {
      throw new Error("No default export found");
    }

    return definition as UserCommandDefinition;
  }

  /**
   * Validate a command definition
   */
  private validateDefinition(
    definition: unknown,
    _filePath: string
  ): { valid: true } | { valid: false; error: string } {
    if (!definition || typeof definition !== "object") {
      return { valid: false, error: "Invalid command definition: not an object" };
    }

    const def = definition as Record<string, unknown>;

    // Check required fields
    if (typeof def.name !== "string" || def.name.trim() === "") {
      return { valid: false, error: "Missing or invalid 'name' field" };
    }

    if (typeof def.description !== "string" || def.description.trim() === "") {
      return { valid: false, error: "Missing or invalid 'description' field" };
    }

    if (typeof def.execute !== "function") {
      return { valid: false, error: "Missing or invalid 'execute' function" };
    }

    // Validate name format (should start with /)
    const name = def.name as string;
    if (!name.startsWith("/")) {
      return {
        valid: false,
        error: `Command name must start with '/': got '${name}'`,
      };
    }

    // Validate aliases if present
    if (def.aliases !== undefined) {
      if (!Array.isArray(def.aliases)) {
        return { valid: false, error: "'aliases' must be an array" };
      }
      for (const alias of def.aliases) {
        if (typeof alias !== "string") {
          return { valid: false, error: "All aliases must be strings" };
        }
      }
    }

    // Validate category if present
    if (def.category !== undefined) {
      const validCategories: CommandCategory[] = [
        "system",
        "auth",
        "session",
        "navigation",
        "tools",
        "config",
        "debug",
      ];
      if (!validCategories.includes(def.category as CommandCategory)) {
        return {
          valid: false,
          error: `Invalid category '${def.category}'. Must be one of: ${validCategories.join(", ")}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Convert a user command definition to a SlashCommand
   */
  private convertToSlashCommand(definition: UserCommandDefinition): SlashCommand {
    // Strip leading / from name for internal use
    const name = definition.name.startsWith("/") ? definition.name.slice(1) : definition.name;

    return {
      name,
      description: definition.description,
      kind: "user",
      category: definition.category ?? "tools",
      aliases: definition.aliases,
      execute: async (ctx: CommandContext): Promise<CommandResult> => {
        // Build simplified args for user command
        const args: UserCommandArgs = {
          raw: ctx.parsedArgs.raw,
          positional: ctx.parsedArgs.positional.map((p) => String(p)),
          named: ctx.parsedArgs.named as Record<string, string | boolean>,
        };

        // Build simplified context for user command
        const userCtx: UserCommandContext = {
          cwd: ctx.session.cwd,
          sessionId: ctx.session.id,
          provider: ctx.session.provider,
          homeDir: os.homedir(),
        };

        try {
          const result = await definition.execute(args, userCtx);

          if (result.success) {
            return {
              kind: "success",
              message: result.message,
              data: result.data,
            };
          } else {
            return {
              kind: "error",
              code: "INTERNAL_ERROR",
              message: result.error ?? "Command failed",
            };
          }
        } catch (err) {
          return {
            kind: "error",
            code: "INTERNAL_ERROR",
            message: err instanceof Error ? err.message : String(err),
          };
        }
      },
    };
  }
}

// =============================================================================
// Registry Integration
// =============================================================================

/**
 * Load and register all user commands
 *
 * @param registry - Command registry to register commands in
 * @param options - Optional configuration
 * @returns Load result with commands and errors
 *
 * @example
 * ```typescript
 * const registry = new CommandRegistry();
 * const result = await registerUserCommands(registry);
 *
 * console.log(`Loaded ${result.commands.length} user commands`);
 * if (result.errors.length > 0) {
 *   console.warn('Failed to load:', result.errors);
 * }
 * ```
 */
export async function registerUserCommands(
  registry: CommandRegistry,
  options?: { baseDir?: string }
): Promise<UserCommandLoadResult> {
  const loader = new UserCommandLoader(options?.baseDir);
  const result = await loader.load();

  // Register all successfully loaded commands
  for (const command of result.commands) {
    registry.register(command);
  }

  return result;
}

/**
 * Create the commands directory if it doesn't exist
 *
 * @param baseDir - Optional base directory (defaults to ~/.vellum)
 * @returns Path to the commands directory
 */
export async function ensureCommandsDirectory(baseDir?: string): Promise<string> {
  const vellumDir = baseDir ?? path.join(os.homedir(), ".vellum");
  const commandsDir = path.join(vellumDir, COMMANDS_DIR);

  await fs.mkdir(commandsDir, { recursive: true });

  return commandsDir;
}

/**
 * Get example command template
 *
 * @returns Example command file content
 */
export function getCommandTemplate(): string {
  return `/**
 * Example User Command
 *
 * User commands are loaded from ~/.vellum/commands/
 * They must export a default object with:
 * - name: string (must start with /)
 * - description: string
 * - execute: async function(args, context) => result
 */

export default {
  name: '/my-command',
  description: 'My custom command',
  // Optional: aliases for the command
  // aliases: ['mc'],
  // Optional: category (defaults to 'tools')
  // category: 'tools',

  /**
   * Execute the command
   *
   * @param args - Command arguments
   * @param args.raw - Raw input after command name
   * @param args.positional - Positional arguments
   * @param args.named - Named arguments (--flag=value)
   * @param context - Execution context
   * @param context.cwd - Current working directory
   * @param context.sessionId - Current session ID
   * @param context.provider - AI provider name
   * @param context.homeDir - User home directory
   * @returns Result object
   */
  execute: async (args, context) => {
    // Your command implementation here
    return {
      success: true,
      message: \`Hello from my-command! Args: \${args.raw}\`,
      // Optional: data to return
      // data: { ... },
    };
  },
};
`;
}
