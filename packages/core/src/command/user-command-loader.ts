// ============================================
// User Command Loader (Phase 16 Extension)
// ============================================

/**
 * Loads user-defined slash commands from `.vellum/commands/` directory.
 *
 * Supports two command formats:
 * - YAML files (.yaml, .yml): Simple shell/prompt commands
 * - TypeScript files (.ts, .mts): Advanced commands with full context access
 *
 * TypeScript commands require explicit trust verification for security.
 *
 * @module @vellum/core/command/user-command-loader
 * @see Phase 16: Slash Command System
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import yaml from "js-yaml";
import { z } from "zod";

import { createLogger } from "../logger/index.js";

// =============================================================================
// Constants
// =============================================================================

/** Logger instance */
const logger = createLogger({ name: "user-command-loader" });

/** Project commands directory (relative to cwd) */
const PROJECT_COMMANDS_DIR = ".vellum/commands";

/** User commands directory (relative to home) */
const USER_COMMANDS_DIR = ".vellum/commands";

/** Supported YAML extensions */
const YAML_EXTENSIONS = [".yaml", ".yml"] as const;

/** Supported TypeScript extensions */
const TS_EXTENSIONS = [".ts", ".mts"] as const;

/** All supported extensions */
const SUPPORTED_EXTENSIONS = [...YAML_EXTENSIONS, ...TS_EXTENSIONS] as const;

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Schema for YAML-based user command
 */
export const YamlUserCommandSchema = z
  .object({
    /** Command name (without leading /) */
    name: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[a-z][a-z0-9-]*$/, "Name must be lowercase alphanumeric with hyphens"),

    /** Human-readable description */
    description: z.string().min(1).max(500),

    /** Optional aliases */
    alias: z.array(z.string()).optional(),

    /** Shell command to execute (mutually exclusive with prompt) */
    shell: z.string().optional(),

    /** Prompt to inject into conversation (mutually exclusive with shell) */
    prompt: z.string().optional(),

    /** Command category */
    category: z
      .enum(["system", "workflow", "auth", "session", "navigation", "tools", "config", "debug"])
      .default("tools"),
  })
  .refine((data) => data.shell !== undefined || data.prompt !== undefined, {
    message: "Either 'shell' or 'prompt' must be specified",
  })
  .refine((data) => !(data.shell !== undefined && data.prompt !== undefined), {
    message: "Only one of 'shell' or 'prompt' can be specified",
  });

/**
 * Parsed YAML command type
 */
export type YamlUserCommand = z.infer<typeof YamlUserCommandSchema>;

// =============================================================================
// Types
// =============================================================================

/**
 * Command source origin
 */
export type UserCommandSource = "project" | "user";

/**
 * Command type based on file format
 */
export type UserCommandType = "yaml" | "typescript";

/**
 * Base interface for user commands
 */
export interface UserCommandBase {
  /** Command name (without leading /) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Optional aliases */
  aliases?: string[];
  /** Command category */
  category: string;
  /** Command type */
  type: UserCommandType;
  /** Source (project or user) */
  source: UserCommandSource;
  /** Absolute file path */
  filePath: string;
  /** Content hash for integrity verification */
  contentHash: string;
}

/**
 * YAML-based shell command
 */
export interface YamlShellCommand extends UserCommandBase {
  type: "yaml";
  commandType: "shell";
  shell: string;
}

/**
 * YAML-based prompt command
 */
export interface YamlPromptCommand extends UserCommandBase {
  type: "yaml";
  commandType: "prompt";
  prompt: string;
}

/**
 * TypeScript-based advanced command
 */
export interface TypeScriptCommand extends UserCommandBase {
  type: "typescript";
  /** Whether the command has been trust-verified */
  trusted: boolean;
  /** Execute function (loaded dynamically) */
  execute?: UserCommandExecuteFn;
}

/**
 * Union type for all user commands
 */
export type UserCommand = YamlShellCommand | YamlPromptCommand | TypeScriptCommand;

/**
 * Context passed to TypeScript command execute functions
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
  /** Environment variables (filtered for security) */
  env: Record<string, string>;
}

/**
 * Arguments passed to TypeScript command execute functions
 */
export interface UserCommandArgs {
  /** Raw input after command name */
  raw: string;
  /** Parsed positional arguments */
  positional: string[];
  /** Parsed named arguments */
  named: Record<string, string | boolean>;
}

/**
 * Result from TypeScript command execution
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
  /** Prompt to inject (if command returns prompt) */
  prompt?: string;
  /** Shell command to run (if command returns shell) */
  shell?: string;
}

/**
 * Execute function signature for TypeScript commands
 */
export type UserCommandExecuteFn = (
  args: UserCommandArgs,
  context: UserCommandContext
) => Promise<UserCommandResult> | UserCommandResult;

/**
 * TypeScript command definition format (what users export)
 */
export interface UserCommandDefinition {
  name: string;
  description: string;
  aliases?: string[];
  category?: string;
  execute: UserCommandExecuteFn;
}

/**
 * Validation error for user commands
 */
export interface UserCommandValidationError {
  /** File path that failed validation */
  file: string;
  /** Error message */
  error: string;
  /** Error code */
  code: "PARSE_ERROR" | "VALIDATION_ERROR" | "TRUST_ERROR" | "IO_ERROR";
}

/**
 * Result of loading user commands
 */
export interface UserCommandLoadResult {
  /** Successfully loaded commands */
  commands: UserCommand[];
  /** Validation errors encountered */
  errors: UserCommandValidationError[];
  /** Total files scanned */
  scanned: number;
  /** Commands pending trust approval (TypeScript only) */
  pendingTrust: TypeScriptCommand[];
}

/**
 * Trust store interface for command trust verification
 */
export interface CommandTrustStore {
  /** Check if a command is trusted by path and hash */
  isTrusted(filePath: string, contentHash: string): boolean;
  /** Trust a command */
  trust(filePath: string, contentHash: string): Promise<void>;
  /** Revoke trust for a command */
  revoke(filePath: string): Promise<void>;
  /** Get all trusted commands */
  getTrusted(): Map<string, string>;
}

/**
 * Options for UserCommandLoader
 */
export interface UserCommandLoaderOptions {
  /** Current working directory for project commands */
  cwd: string;
  /** Whether to load user commands from ~/.vellum/commands/ */
  loadUserCommands?: boolean;
  /** Trust store for TypeScript command verification */
  trustStore?: CommandTrustStore;
  /** Auto-trust TypeScript commands (UNSAFE - for testing only) */
  autoTrust?: boolean;
  /** Override user home directory (for testing) */
  userHomeDir?: string;
}

// =============================================================================
// Default Trust Store (File-based)
// =============================================================================

/**
 * Default file-based trust store for command verification.
 *
 * Stores trust decisions in ~/.vellum/command-trust.json
 */
export class DefaultCommandTrustStore implements CommandTrustStore {
  private readonly filePath: string;
  private trusted: Map<string, string> = new Map();
  private loaded = false;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(os.homedir(), ".vellum", "command-trust.json");
  }

  /**
   * Load trust store from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      if (existsSync(this.filePath)) {
        const content = await fs.readFile(this.filePath, "utf-8");
        const data = JSON.parse(content) as Record<string, string>;
        this.trusted = new Map(Object.entries(data));
      }
    } catch (err) {
      logger.warn(`Failed to load command trust store: ${err}`);
    }

    this.loaded = true;
  }

  /**
   * Save trust store to disk
   */
  private async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const data = Object.fromEntries(this.trusted);
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  isTrusted(filePath: string, contentHash: string): boolean {
    const normalized = this.normalizePath(filePath);
    const storedHash = this.trusted.get(normalized);
    return storedHash === contentHash;
  }

  async trust(filePath: string, contentHash: string): Promise<void> {
    await this.load();
    const normalized = this.normalizePath(filePath);
    this.trusted.set(normalized, contentHash);
    await this.save();
    logger.info(`Trusted command: ${filePath}`);
  }

  async revoke(filePath: string): Promise<void> {
    await this.load();
    const normalized = this.normalizePath(filePath);
    this.trusted.delete(normalized);
    await this.save();
    logger.info(`Revoked trust: ${filePath}`);
  }

  getTrusted(): Map<string, string> {
    return new Map(this.trusted);
  }

  private normalizePath(p: string): string {
    const resolved = path.resolve(p);
    if (process.platform === "win32") {
      return resolved.toLowerCase().replace(/\//g, "\\");
    }
    return resolved;
  }
}

// =============================================================================
// UserCommandLoader Class
// =============================================================================

/**
 * Loads and validates user-defined commands from .vellum/commands/ directories.
 *
 * Supports two command formats:
 * - YAML (.yaml, .yml): Simple shell or prompt injection commands
 * - TypeScript (.ts, .mts): Advanced commands with full context access
 *
 * TypeScript commands require explicit trust verification to prevent
 * arbitrary code execution from untrusted sources.
 *
 * @example
 * ```typescript
 * const loader = new UserCommandLoader({ cwd: process.cwd() });
 * const result = await loader.load();
 *
 * // Handle trusted YAML commands immediately
 * for (const cmd of result.commands) {
 *   if (cmd.type === 'yaml') {
 *     registry.register(convertToSlashCommand(cmd));
 *   }
 * }
 *
 * // Prompt user for pending TypeScript commands
 * for (const cmd of result.pendingTrust) {
 *   if (await promptUserTrust(cmd)) {
 *     await loader.trustCommand(cmd.filePath);
 *   }
 * }
 * ```
 */
export class UserCommandLoader {
  private readonly cwd: string;
  private readonly loadUserCommands: boolean;
  private readonly trustStore: CommandTrustStore;
  private readonly autoTrust: boolean;
  private readonly userHomeDir: string;

  constructor(options: UserCommandLoaderOptions) {
    this.cwd = options.cwd;
    this.loadUserCommands = options.loadUserCommands ?? true;
    this.trustStore = options.trustStore ?? new DefaultCommandTrustStore();
    this.autoTrust = options.autoTrust ?? false;
    this.userHomeDir = options.userHomeDir ?? os.homedir();

    if (this.autoTrust) {
      logger.warn("Auto-trust enabled - TypeScript commands will execute without verification!");
    }
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Load all user commands from project and user directories.
   *
   * @returns Load result with commands, errors, and pending trust
   */
  async load(): Promise<UserCommandLoadResult> {
    const result: UserCommandLoadResult = {
      commands: [],
      errors: [],
      scanned: 0,
      pendingTrust: [],
    };

    // Ensure trust store is loaded
    if (this.trustStore instanceof DefaultCommandTrustStore) {
      await this.trustStore.load();
    }

    // Load from project directory (higher priority)
    const projectDir = path.join(this.cwd, PROJECT_COMMANDS_DIR);
    await this.loadFromDirectory(projectDir, "project", result);

    // Load from user directory (lower priority)
    if (this.loadUserCommands) {
      const userDir = path.join(this.userHomeDir, USER_COMMANDS_DIR);
      await this.loadFromDirectory(userDir, "user", result);
    }

    // Log summary
    logger.debug(
      `Loaded ${result.commands.length} commands, ` +
        `${result.pendingTrust.length} pending trust, ` +
        `${result.errors.length} errors from ${result.scanned} files`
    );

    return result;
  }

  /**
   * Trust a TypeScript command by file path.
   *
   * @param filePath - Path to the TypeScript command file
   */
  async trustCommand(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, "utf-8");
    const hash = this.computeHash(content);
    await this.trustStore.trust(filePath, hash);
  }

  /**
   * Revoke trust for a command.
   *
   * @param filePath - Path to the command file
   */
  async revokeCommand(filePath: string): Promise<void> {
    await this.trustStore.revoke(filePath);
  }

  /**
   * Get the project commands directory path.
   */
  getProjectCommandsDir(): string {
    return path.join(this.cwd, PROJECT_COMMANDS_DIR);
  }

  /**
   * Get the user commands directory path.
   */
  getUserCommandsDir(): string {
    return path.join(this.userHomeDir, USER_COMMANDS_DIR);
  }

  /**
   * Check if a directory exists.
   */
  async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Load commands from a directory.
   */
  private async loadFromDirectory(
    dirPath: string,
    source: UserCommandSource,
    result: UserCommandLoadResult
  ): Promise<void> {
    if (!existsSync(dirPath)) {
      logger.debug(`Commands directory not found: ${dirPath}`);
      return;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const ext = path.extname(entry.name).toLowerCase();
        if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
          continue;
        }

        result.scanned++;
        const filePath = path.join(dirPath, entry.name);

        try {
          const command = await this.loadCommandFile(filePath, source);

          // Check for duplicates (project overrides user)
          const existing = result.commands.find((c) => c.name === command.name);
          if (existing) {
            if (source === "project") {
              result.commands = result.commands.filter((c) => c.name !== command.name);
              this.addCommand(command, result);
            }
            // User command ignored if project command exists
          } else {
            this.addCommand(command, result);
          }
        } catch (err) {
          result.errors.push({
            file: filePath,
            error: err instanceof Error ? err.message : String(err),
            code: "PARSE_ERROR",
          });
        }
      }
    } catch (err) {
      result.errors.push({
        file: dirPath,
        error: err instanceof Error ? err.message : String(err),
        code: "IO_ERROR",
      });
    }
  }

  /**
   * Add a command to the result, handling pending trust.
   */
  private addCommand(command: UserCommand, result: UserCommandLoadResult): void {
    if (command.type === "typescript" && !command.trusted) {
      result.pendingTrust.push(command);
    } else {
      result.commands.push(command);
    }
  }

  /**
   * Load a single command file.
   */
  private async loadCommandFile(filePath: string, source: UserCommandSource): Promise<UserCommand> {
    const ext = path.extname(filePath).toLowerCase();
    const content = await fs.readFile(filePath, "utf-8");
    const contentHash = this.computeHash(content);

    if (YAML_EXTENSIONS.includes(ext as (typeof YAML_EXTENSIONS)[number])) {
      return this.parseYamlCommand(content, filePath, source, contentHash);
    }

    return this.parseTypeScriptCommand(filePath, source, contentHash);
  }

  /**
   * Parse a YAML command file.
   */
  private parseYamlCommand(
    content: string,
    filePath: string,
    source: UserCommandSource,
    contentHash: string
  ): YamlShellCommand | YamlPromptCommand {
    // Parse YAML
    let parsed: unknown;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      throw new Error(`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Validate schema
    const validation = YamlUserCommandSchema.safeParse(parsed);
    if (!validation.success) {
      const issues = validation.error.issues.map((i) => i.message).join(", ");
      throw new Error(`Validation failed: ${issues}`);
    }

    const cmd = validation.data;
    const base: Omit<UserCommandBase, "type"> = {
      name: cmd.name,
      description: cmd.description,
      aliases: cmd.alias,
      category: cmd.category,
      source,
      filePath,
      contentHash,
    };

    if (cmd.shell !== undefined) {
      return {
        ...base,
        type: "yaml",
        commandType: "shell",
        shell: cmd.shell,
      };
    }

    return {
      ...base,
      type: "yaml",
      commandType: "prompt",
      prompt: cmd.prompt ?? "",
    };
  }

  /**
   * Parse a TypeScript command file.
   */
  private async parseTypeScriptCommand(
    filePath: string,
    source: UserCommandSource,
    contentHash: string
  ): Promise<TypeScriptCommand> {
    // Check trust status
    const isTrusted = this.autoTrust || this.trustStore.isTrusted(filePath, contentHash);

    // Create base command
    const command: TypeScriptCommand = {
      name: this.getCommandNameFromPath(filePath),
      description: "TypeScript command (pending trust verification)",
      type: "typescript",
      category: "tools",
      source,
      filePath,
      contentHash,
      trusted: isTrusted,
    };

    // Only load if trusted
    if (isTrusted) {
      try {
        const definition = await this.loadTypeScriptDefinition(filePath);
        command.name = definition.name;
        command.description = definition.description;
        command.aliases = definition.aliases;
        command.category = definition.category ?? "tools";
        command.execute = definition.execute;
      } catch (err) {
        throw new Error(
          `Failed to load TypeScript command: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return command;
  }

  /**
   * Load TypeScript command definition via dynamic import.
   */
  private async loadTypeScriptDefinition(filePath: string): Promise<UserCommandDefinition> {
    const fileUrl = pathToFileURL(filePath).href;
    const module = await import(fileUrl);

    const definition = module.default;
    if (!definition) {
      throw new Error("No default export found");
    }

    // Validate definition structure
    if (typeof definition.name !== "string" || !definition.name) {
      throw new Error("Missing or invalid 'name' field");
    }
    if (typeof definition.description !== "string" || !definition.description) {
      throw new Error("Missing or invalid 'description' field");
    }
    if (typeof definition.execute !== "function") {
      throw new Error("Missing or invalid 'execute' function");
    }

    return definition as UserCommandDefinition;
  }

  /**
   * Get command name from file path (fallback for untrusted commands).
   */
  private getCommandNameFromPath(filePath: string): string {
    const basename = path.basename(filePath);
    const name = basename.replace(/\.(ts|mts)$/, "");
    return name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  }

  /**
   * Compute SHA-256 hash of content.
   */
  private computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a UserCommandLoader instance.
 *
 * @param options - Loader configuration options
 * @returns A new UserCommandLoader instance
 */
export function createUserCommandLoader(options: UserCommandLoaderOptions): UserCommandLoader {
  return new UserCommandLoader(options);
}

/**
 * Ensure the commands directory exists.
 *
 * @param dirPath - Directory path to create
 */
export async function ensureCommandsDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

// =============================================================================
// Template Helpers
// =============================================================================

/**
 * Get YAML command template.
 */
export function getYamlCommandTemplate(): string {
  return `# Example YAML User Command
# Place in .vellum/commands/my-command.yaml

name: my-command
description: My custom command that does something useful
alias:
  - mc
category: tools

# Use ONE of the following:

# Option 1: Shell command
shell: echo "Hello from my-command!"

# Option 2: Prompt injection (comment out shell above)
# prompt: |
#   Please help me with the following task:
#   [Your prompt content here]
`;
}

/**
 * Get TypeScript command template.
 */
export function getTypeScriptCommandTemplate(): string {
  return `/**
 * Example TypeScript User Command
 *
 * TypeScript commands have full access to the command context
 * but require explicit trust verification before execution.
 *
 * Place in .vellum/commands/my-command.ts
 */

import type { UserCommandDefinition } from '@vellum/core';

const command: UserCommandDefinition = {
  name: 'my-command',
  description: 'My advanced TypeScript command',
  aliases: ['mc'],
  category: 'tools',

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
      // Optional: Return a prompt to inject
      // prompt: 'Please help me with...',
      // Optional: Return a shell command to run
      // shell: 'npm run build',
    };
  },
};

export default command;
`;
}
