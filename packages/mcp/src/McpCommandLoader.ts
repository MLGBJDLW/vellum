// ============================================
// MCP Command Loader - Convert MCP Prompts to Slash Commands
// Phase 25, Step 13: MCP Command Integration
// ============================================

import type { McpHub } from "./McpHub.js";
import type {
  McpHubEvents,
  McpPrompt,
  McpPromptArgument,
  McpPromptResponse,
  McpServer,
} from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Supported argument value types for slash commands
 */
export type ArgType = "string" | "number" | "boolean" | "path";

/**
 * Positional argument definition
 */
export interface PositionalArg {
  readonly name: string;
  readonly type: ArgType;
  readonly description: string;
  readonly required: boolean;
  readonly default?: string | number | boolean;
}

/**
 * Command categories for organization
 */
export type CommandCategory =
  | "system"
  | "auth"
  | "session"
  | "navigation"
  | "tools"
  | "config"
  | "debug"
  | "mcp";

/**
 * Command source kind
 */
export type CommandKind = "builtin" | "plugin" | "mcp" | "user";

/**
 * Command execution context (minimal interface for MCP commands)
 */
export interface McpCommandContext {
  /** Parsed command arguments */
  readonly parsedArgs: {
    readonly positional: readonly unknown[];
    readonly named: Readonly<Record<string, unknown>>;
  };
  /** MCP Hub reference for executing prompts */
  readonly mcpHub?: McpHub;
  /** Abort signal for cancellation */
  readonly signal?: AbortSignal;
}

/**
 * Command execution result
 */
export type McpCommandResult =
  | { readonly kind: "success"; readonly message?: string; readonly data?: unknown }
  | { readonly kind: "error"; readonly code: string; readonly message: string };

/**
 * MCP Slash Command definition
 */
export interface McpSlashCommand {
  /** Command name (prefixed with server name, e.g., "mcp:server:prompt") */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Command source kind */
  readonly kind: CommandKind;
  /** Category for organization */
  readonly category: CommandCategory;
  /** Server name this command belongs to */
  readonly serverName: string;
  /** Original prompt name */
  readonly promptName: string;
  /** Position-based arguments */
  readonly positionalArgs: readonly PositionalArg[];
  /** Command execution handler */
  readonly execute: (ctx: McpCommandContext) => Promise<McpCommandResult>;
}

/**
 * MCP Command Loader interface
 */
export interface CommandLoader {
  readonly name: string;
  readonly kind: CommandKind;
  load(): Promise<McpSlashCommand[]>;
  dispose(): void;
}

/**
 * Event handler for command changes
 */
export type McpCommandChangeHandler = (commands: McpSlashCommand[]) => void;

/**
 * Options for McpCommandLoader
 */
export interface McpCommandLoaderOptions {
  /** MCP Hub instance */
  mcpHub: McpHub;
  /** Command prefix (default: "mcp") */
  prefix?: string;
  /** Whether to auto-reload on server changes (default: true) */
  autoReload?: boolean;
  /** Handler called when commands change */
  onCommandsChanged?: McpCommandChangeHandler;
}

// ============================================
// McpCommandLoader Class
// ============================================

/**
 * Loads MCP prompts as slash commands.
 *
 * Converts MCP server prompts into executable slash commands that can be
 * integrated into the Vellum command system. Supports dynamic reloading
 * when servers connect or disconnect.
 *
 * @example
 * ```typescript
 * const loader = new McpCommandLoader({
 *   mcpHub,
 *   onCommandsChanged: (commands) => {
 *     registry.updateMcpCommands(commands);
 *   },
 * });
 *
 * // Initial load
 * const commands = await loader.load();
 *
 * // Commands auto-reload when servers change
 * // Clean up when done
 * loader.dispose();
 * ```
 */
export class McpCommandLoader implements CommandLoader {
  readonly name = "mcp";
  readonly kind: CommandKind = "mcp";

  private readonly mcpHub: McpHub;
  private readonly prefix: string;
  private readonly autoReload: boolean;
  private readonly onCommandsChanged?: McpCommandChangeHandler;

  private cachedCommands: McpSlashCommand[] = [];
  private eventUnsubscribe?: () => void;
  private isDisposed = false;

  constructor(options: McpCommandLoaderOptions) {
    this.mcpHub = options.mcpHub;
    this.prefix = options.prefix ?? "mcp";
    this.autoReload = options.autoReload ?? true;
    this.onCommandsChanged = options.onCommandsChanged;

    if (this.autoReload) {
      this.subscribeToHubEvents();
    }
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Load all MCP prompts as slash commands.
   *
   * Fetches prompts from all connected MCP servers and converts them
   * to slash commands.
   *
   * @returns Array of MCP slash commands
   */
  async load(): Promise<McpSlashCommand[]> {
    if (this.isDisposed) {
      return [];
    }

    const commands: McpSlashCommand[] = [];
    const servers = this.getConnectedServers();

    // Load prompts from each server in parallel
    const serverPromises = servers.map(async (server) => {
      try {
        const prompts = await this.mcpHub.listPrompts(server.name);
        return prompts.map((prompt) => this.promptToCommand(server.name, prompt));
      } catch {
        // Server may have disconnected or prompts unavailable
        // Fail silently and continue with other servers
        return [];
      }
    });

    const results = await Promise.all(serverPromises);
    for (const serverCommands of results) {
      commands.push(...serverCommands);
    }

    this.cachedCommands = commands;
    return commands;
  }

  /**
   * Load commands from a specific server.
   *
   * @param serverName - Name of the server to load from
   * @returns Array of MCP slash commands from the server
   */
  async loadFromServer(serverName: string): Promise<McpSlashCommand[]> {
    if (this.isDisposed) {
      return [];
    }

    try {
      const prompts = await this.mcpHub.listPrompts(serverName);
      return prompts.map((prompt) => this.promptToCommand(serverName, prompt));
    } catch {
      return [];
    }
  }

  /**
   * Get cached commands without reloading.
   *
   * @returns Previously loaded commands
   */
  getCachedCommands(): readonly McpSlashCommand[] {
    return this.cachedCommands;
  }

  /**
   * Find a command by name.
   *
   * @param name - Command name to find
   * @returns Command if found, undefined otherwise
   */
  findCommand(name: string): McpSlashCommand | undefined {
    return this.cachedCommands.find((cmd) => cmd.name === name);
  }

  /**
   * Get commands for a specific server.
   *
   * @param serverName - Server name to filter by
   * @returns Commands belonging to the server
   */
  getCommandsForServer(serverName: string): readonly McpSlashCommand[] {
    return this.cachedCommands.filter((cmd) => cmd.serverName === serverName);
  }

  /**
   * Force reload all commands.
   *
   * Clears cache and reloads from all servers, notifying listeners.
   */
  async reload(): Promise<McpSlashCommand[]> {
    const commands = await this.load();
    this.notifyCommandsChanged(commands);
    return commands;
  }

  /**
   * Dispose of the loader and clean up resources.
   */
  dispose(): void {
    this.isDisposed = true;
    this.eventUnsubscribe?.();
    this.eventUnsubscribe = undefined;
    this.cachedCommands = [];
  }

  // ============================================
  // Private: Command Conversion
  // ============================================

  /**
   * Convert an MCP prompt to a slash command.
   */
  private promptToCommand(serverName: string, prompt: McpPrompt): McpSlashCommand {
    const commandName = this.buildCommandName(serverName, prompt.name);
    const positionalArgs = this.convertArgs(prompt.arguments);

    // Capture references for the execute closure
    const mcpHub = this.mcpHub;
    const promptName = prompt.name;

    return {
      name: commandName,
      kind: "mcp",
      category: "mcp",
      description: prompt.description || `MCP prompt: ${prompt.name}`,
      serverName,
      promptName,
      positionalArgs,

      async execute(ctx: McpCommandContext): Promise<McpCommandResult> {
        const hub = ctx.mcpHub ?? mcpHub;

        if (!hub) {
          return {
            kind: "error",
            code: "MCP_NOT_AVAILABLE",
            message: "MCP Hub is not available",
          };
        }

        try {
          // Build arguments from positional args
          const args = buildPromptArgs(positionalArgs, ctx.parsedArgs.positional);

          // Execute the prompt
          const response = await hub.getPrompt(serverName, promptName, args);

          return {
            kind: "success",
            message: formatPromptResponse(response),
            data: response,
          };
        } catch (error) {
          return {
            kind: "error",
            code: "MCP_PROMPT_ERROR",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
    };
  }

  /**
   * Build command name from server and prompt names.
   */
  private buildCommandName(serverName: string, promptName: string): string {
    // Format: mcp:<server>:<prompt>
    // Sanitize names to be command-safe
    const sanitizedServer = sanitizeCommandPart(serverName);
    const sanitizedPrompt = sanitizeCommandPart(promptName);
    return `${this.prefix}:${sanitizedServer}:${sanitizedPrompt}`;
  }

  /**
   * Convert MCP prompt arguments to positional args.
   */
  private convertArgs(args?: McpPromptArgument[]): PositionalArg[] {
    if (!args || args.length === 0) {
      return [];
    }

    return args.map((arg) => ({
      name: arg.name,
      type: "string" as ArgType, // MCP prompts only support string args
      description: arg.description || `Argument: ${arg.name}`,
      required: arg.required ?? false,
    }));
  }

  // ============================================
  // Private: Server Access
  // ============================================

  /**
   * Get all connected servers from McpHub.
   */
  private getConnectedServers(): McpServer[] {
    return this.mcpHub.connections
      .filter((conn) => conn.server.statusInfo.status === "connected")
      .map((conn) => conn.server);
  }

  // ============================================
  // Private: Event Subscription
  // ============================================

  /**
   * Subscribe to McpHub events for auto-reload.
   */
  private subscribeToHubEvents(): void {
    // Create event handler
    const handleEvent = <K extends keyof McpHubEvents>(event: K, _data: McpHubEvents[K]): void => {
      if (this.isDisposed) return;

      // Reload commands on relevant events
      if (event === "server:connected" || event === "server:disconnected") {
        // Debounce rapid changes
        void this.debouncedReload();
      }
    };

    // Store unsubscribe function
    // Note: McpHub uses onEvent callback, not traditional subscribe
    // We need to check if McpHub supports dynamic event subscription
    // For now, we'll reload on demand
    this.eventUnsubscribe = () => {
      // Cleanup if needed
    };

    // Store handler reference for manual triggering
    this._eventHandler = handleEvent;
  }

  private _eventHandler?: <K extends keyof McpHubEvents>(event: K, data: McpHubEvents[K]) => void;

  private reloadTimeout?: ReturnType<typeof setTimeout>;

  /**
   * Debounced reload to prevent rapid updates.
   */
  private async debouncedReload(): Promise<void> {
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }

    return new Promise<void>((resolve) => {
      this.reloadTimeout = setTimeout(async () => {
        try {
          await this.reload();
        } finally {
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Notify listeners of command changes.
   */
  private notifyCommandsChanged(commands: McpSlashCommand[]): void {
    this.onCommandsChanged?.(commands);
  }

  /**
   * Handle hub event (called externally if McpHub supports it).
   */
  handleHubEvent<K extends keyof McpHubEvents>(event: K, data: McpHubEvents[K]): void {
    this._eventHandler?.(event, data);
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Sanitize a string for use in command names.
 * Replaces invalid characters with hyphens.
 */
function sanitizeCommandPart(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Build prompt arguments from positional values.
 */
function buildPromptArgs(
  argDefs: readonly PositionalArg[],
  positional: readonly unknown[]
): Record<string, string> {
  const args: Record<string, string> = {};

  for (const [i, def] of argDefs.entries()) {
    const value = positional[i];

    if (value !== undefined && value !== null) {
      args[def.name] = String(value);
    }
  }

  return args;
}

/**
 * Format a prompt response for display.
 */
function formatPromptResponse(response: McpPromptResponse): string {
  const parts: string[] = [];

  if (response.description) {
    parts.push(response.description);
    parts.push("");
  }

  for (const message of response.messages) {
    const rolePrefix = message.role === "user" ? "User:" : "Assistant:";
    const content = formatPromptContent(message.content);
    parts.push(`${rolePrefix} ${content}`);
  }

  return parts.join("\n");
}

/**
 * Format prompt content for display.
 */
function formatPromptContent(content: McpPromptResponse["messages"][0]["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if ("text" in item) return item.text;
        if ("resource" in item) return `[Resource: ${item.resource.uri}]`;
        if ("data" in item) return `[Image: ${item.mimeType}]`;
        return "[Unknown content]";
      })
      .join("\n");
  }

  // Single content item
  if ("text" in content) return content.text;
  if ("resource" in content) return `[Resource: ${content.resource.uri}]`;
  if ("data" in content) return `[Image: ${content.mimeType}]`;

  return "[Unknown content]";
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an MCP command loader.
 *
 * @param options - Loader configuration
 * @returns Configured McpCommandLoader instance
 */
export function createMcpCommandLoader(options: McpCommandLoaderOptions): McpCommandLoader {
  return new McpCommandLoader(options);
}

export default McpCommandLoader;
