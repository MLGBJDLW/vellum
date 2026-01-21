/**
 * User Command Loader (CLI Adapter)
 *
 * Adapts @vellum/core's UserCommandLoader for CLI's CommandRegistry.
 * This provides the same public API while leveraging Core's comprehensive
 * implementation including:
 * - YAML command support (.yaml, .yml)
 * - TypeScript command support (.ts, .mts)
 * - Trust verification for security
 * - Project and user directory support
 *
 * Also maintains backward compatibility with JavaScript command files (.js, .mjs)
 * for CLI-only usage.
 *
 * @module cli/commands/user-commands
 * @see @vellum/core/command/user-command-loader
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import {
  type UserCommand as CoreUserCommand,
  type UserCommandArgs as CoreUserCommandArgs,
  type UserCommandContext as CoreUserCommandContext,
  type UserCommandDefinition as CoreUserCommandDefinition,
  type UserCommandLoadResult as CoreUserCommandLoadResult,
  type UserCommandResult as CoreUserCommandResult,
  createUserCommandLoader,
  getTypeScriptCommandTemplate,
  type UserCommandLoaderOptions,
  type YamlPromptCommand,
  type YamlShellCommand,
} from "@vellum/core";

import type { CommandRegistry } from "./registry.js";
import type { CommandCategory, CommandContext, CommandResult, SlashCommand } from "./types.js";

// =============================================================================
// Re-export Core Types (for backward compatibility)
// =============================================================================

/**
 * User command definition format
 *
 * This is the structure users export from their command files.
 * Re-exported from @vellum/core for backward compatibility.
 */
export type UserCommandDefinition = CoreUserCommandDefinition;

/**
 * Simplified args passed to user commands
 * Re-exported from @vellum/core for backward compatibility.
 */
export type UserCommandArgs = CoreUserCommandArgs;

/**
 * Simplified context passed to user commands
 * Re-exported from @vellum/core for backward compatibility.
 */
export type UserCommandContext = CoreUserCommandContext;

/**
 * Result from user command execution
 * Re-exported from @vellum/core for backward compatibility.
 */
export type UserCommandResult = CoreUserCommandResult;

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

/** JavaScript extensions (CLI backward compatibility) */
const JS_EXTENSIONS = [".js", ".mjs"] as const;

/** Valid command categories */
const VALID_CATEGORIES: CommandCategory[] = [
  "system",
  "workflow",
  "auth",
  "session",
  "navigation",
  "tools",
  "config",
  "debug",
];

// =============================================================================
// Adapter Functions
// =============================================================================

/**
 * Convert Core's UserCommand to CLI's SlashCommand
 *
 * Handles all command types:
 * - YAML shell commands: Execute shell and return result
 * - YAML prompt commands: Return prompt for injection
 * - TypeScript commands: Execute with full context
 */
function adaptToSlashCommand(command: CoreUserCommand): SlashCommand {
  const baseCommand: Omit<SlashCommand, "execute"> = {
    name: command.name,
    description: command.description,
    kind: "user",
    category: (command.category as CommandCategory) ?? "tools",
    aliases: command.aliases,
  };

  return {
    ...baseCommand,
    execute: createExecuteHandler(command),
  };
}

/**
 * Create execution handler based on command type
 */
function createExecuteHandler(
  command: CoreUserCommand
): (ctx: CommandContext) => Promise<CommandResult> {
  return async (ctx: CommandContext): Promise<CommandResult> => {
    // Build args for user command
    const args: CoreUserCommandArgs = {
      raw: ctx.parsedArgs.raw,
      positional: ctx.parsedArgs.positional.map((p) => String(p)),
      named: ctx.parsedArgs.named as Record<string, string | boolean>,
    };

    // Build context for user command
    const userCtx: CoreUserCommandContext = {
      cwd: ctx.session.cwd,
      sessionId: ctx.session.id,
      provider: ctx.session.provider,
      homeDir: os.homedir(),
      env: {}, // Security: Don't expose full env
    };

    try {
      // Handle YAML shell commands
      if (command.type === "yaml" && command.commandType === "shell") {
        const shellCmd = command as YamlShellCommand;
        return {
          kind: "success",
          message: `Shell command: ${shellCmd.shell}`,
          data: { shell: shellCmd.shell, args },
        };
      }

      // Handle YAML prompt commands
      if (command.type === "yaml" && command.commandType === "prompt") {
        const promptCmd = command as YamlPromptCommand;
        return {
          kind: "success",
          message: promptCmd.prompt,
          data: { prompt: promptCmd.prompt },
        };
      }

      // Handle TypeScript commands
      if (command.type === "typescript" && command.execute) {
        const result = await command.execute(args, userCtx);

        if (result.success) {
          // Handle prompt injection
          if (result.prompt) {
            return {
              kind: "success",
              message: result.prompt,
              data: { prompt: result.prompt, ...((result.data as object) ?? {}) },
            };
          }

          // Handle shell command
          if (result.shell) {
            return {
              kind: "success",
              message: `Shell command: ${result.shell}`,
              data: { shell: result.shell, ...((result.data as object) ?? {}) },
            };
          }

          return {
            kind: "success",
            message: result.message,
            data: result.data,
          };
        }

        return {
          kind: "error",
          code: "INTERNAL_ERROR",
          message: result.error ?? "Command failed",
        };
      }

      // Untrusted TypeScript command
      if (command.type === "typescript" && !command.trusted) {
        return {
          kind: "error",
          code: "PERMISSION_DENIED",
          message: `Command '${command.name}' requires trust verification. Run /trust to approve.`,
        };
      }

      return {
        kind: "error",
        code: "INTERNAL_ERROR",
        message: `Unknown command type: ${command.type}`,
      };
    } catch (err) {
      return {
        kind: "error",
        code: "INTERNAL_ERROR",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

/**
 * Convert Core's load result to CLI's format
 */
function adaptLoadResult(coreResult: CoreUserCommandLoadResult): UserCommandLoadResult {
  // Convert trusted commands to SlashCommands
  const commands = coreResult.commands.map(adaptToSlashCommand);

  // Also include pending trust commands (they'll show permission error when executed)
  const pendingCommands = coreResult.pendingTrust.map(adaptToSlashCommand);

  // Convert error format
  const errors: UserCommandValidationError[] = coreResult.errors.map((e) => ({
    file: e.file,
    error: e.error,
  }));

  return {
    commands: [...commands, ...pendingCommands],
    errors,
    scanned: coreResult.scanned,
  };
}

// =============================================================================
// JavaScript Command Loader (Backward Compatibility)
// =============================================================================

/**
 * Load a JavaScript command file directly (backward compatibility).
 * Core loader only supports .ts/.yaml, so we handle .js files here.
 */
async function loadJsCommandFile(filePath: string): Promise<CoreUserCommandDefinition> {
  const fileUrl = pathToFileURL(filePath).href;
  const module = await import(fileUrl);
  const definition = module.default;

  if (!definition) {
    throw new Error("No default export found");
  }

  return definition as CoreUserCommandDefinition;
}

/**
 * Validate a JavaScript command definition
 */
function validateJsDefinition(
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
    if (!VALID_CATEGORIES.includes(def.category as CommandCategory)) {
      return {
        valid: false,
        error: `Invalid category '${def.category}'. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Convert a JavaScript command definition to SlashCommand
 */
function convertJsToSlashCommand(definition: CoreUserCommandDefinition): SlashCommand {
  // Strip leading / from name for internal use
  const name = definition.name.startsWith("/") ? definition.name.slice(1) : definition.name;

  return {
    name,
    description: definition.description,
    kind: "user",
    category: (definition.category as CommandCategory) ?? "tools",
    aliases: definition.aliases,
    execute: async (ctx: CommandContext): Promise<CommandResult> => {
      // Build simplified args for user command
      const args: CoreUserCommandArgs = {
        raw: ctx.parsedArgs.raw,
        positional: ctx.parsedArgs.positional.map((p) => String(p)),
        named: ctx.parsedArgs.named as Record<string, string | boolean>,
      };

      // Build simplified context for user command
      const userCtx: CoreUserCommandContext = {
        cwd: ctx.session.cwd,
        sessionId: ctx.session.id,
        provider: ctx.session.provider,
        homeDir: os.homedir(),
        env: {},
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

// =============================================================================
// UserCommandLoader Class
// =============================================================================

/**
 * Loads and validates user-defined commands
 *
 * Adapts @vellum/core's UserCommandLoader for CLI's CommandRegistry.
 * Scans both project (.vellum/commands/) and user (~/.vellum/commands/)
 * directories for command files.
 *
 * Supports:
 * - JavaScript files (.js, .mjs) - loaded directly for backward compatibility
 * - TypeScript files (.ts, .mts) - via Core loader with trust verification
 * - YAML files (.yaml, .yml) - via Core loader
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
  /** Core loader options */
  private readonly coreOptions: UserCommandLoaderOptions;

  /**
   * Create a new UserCommandLoader
   *
   * @param baseDir - Optional base directory (defaults to ~/.vellum)
   */
  constructor(baseDir?: string) {
    const vellumDir = baseDir ?? path.join(os.homedir(), ".vellum");
    this.commandsDir = path.join(vellumDir, COMMANDS_DIR);

    // Configure core loader
    this.coreOptions = {
      cwd: process.cwd(),
      loadUserCommands: true,
      userHomeDir: baseDir ? path.dirname(baseDir) : os.homedir(),
      autoTrust: false, // Require explicit trust for TypeScript commands
    };

    // If baseDir is specified, we're in test mode
    if (baseDir) {
      this.coreOptions.cwd = baseDir;
    }
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
    // Check if directory exists first (backward compatibility)
    const dirExists = await this.directoryExists();
    if (!dirExists) {
      return {
        commands: [],
        errors: [],
        scanned: 0,
      };
    }

    // Load JavaScript files directly (backward compatibility)
    const jsResult = await this.loadJavaScriptCommands();

    // Use Core's loader for TypeScript and YAML
    const coreLoader = createUserCommandLoader(this.coreOptions);
    const coreResult = await coreLoader.load();
    const coreAdapted = adaptLoadResult(coreResult);

    // Merge results (JS commands + Core commands)
    return {
      commands: [...jsResult.commands, ...coreAdapted.commands],
      errors: [...jsResult.errors, ...coreAdapted.errors],
      scanned: jsResult.scanned + coreAdapted.scanned,
    };
  }

  /**
   * Load JavaScript command files directly (backward compatibility)
   */
  private async loadJavaScriptCommands(): Promise<UserCommandLoadResult> {
    const result: UserCommandLoadResult = {
      commands: [],
      errors: [],
      scanned: 0,
    };

    try {
      const entries = await fs.readdir(this.commandsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (!JS_EXTENSIONS.includes(ext as (typeof JS_EXTENSIONS)[number])) {
          continue;
        }

        result.scanned++;
        const filePath = path.join(this.commandsDir, entry.name);

        try {
          const definition = await loadJsCommandFile(filePath);
          const validation = validateJsDefinition(definition, filePath);

          if (validation.valid) {
            const command = convertJsToSlashCommand(definition);
            result.commands.push(command);
          } else {
            result.errors.push({
              file: filePath,
              error: validation.error,
            });
          }
        } catch (err) {
          result.errors.push({
            file: filePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
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
 * Returns TypeScript command template from @vellum/core
 *
 * @returns Example command file content
 */
export function getCommandTemplate(): string {
  return getTypeScriptCommandTemplate();
}
