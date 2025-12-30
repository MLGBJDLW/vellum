/**
 * Command Registry
 *
 * Central registry for slash commands with support for:
 * - Priority-based conflict resolution
 * - Alias resolution
 * - Category indexing
 * - Fuzzy search
 *
 * @module cli/commands/registry
 */

import type { CommandCategory, CommandKind, SlashCommand } from "./types.js";

// =============================================================================
// T008: CommandConflictError
// =============================================================================

/**
 * Error thrown when two commands with the same priority conflict
 *
 * @example
 * ```typescript
 * try {
 *   registry.register(commandA);
 *   registry.register(commandB); // Same name and priority as A
 * } catch (e) {
 *   if (e instanceof CommandConflictError) {
 *     console.error(`Conflict: ${e.existingCommand} vs ${e.incomingCommand}`);
 *   }
 * }
 * ```
 */
export class CommandConflictError extends Error {
  /** Name of the command that already exists */
  readonly existingCommand: string;
  /** Name of the command attempting to register */
  readonly incomingCommand: string;
  /** Priority level of the conflicting commands */
  readonly priority: CommandKind;

  constructor(existingCommand: string, incomingCommand: string, priority: CommandKind) {
    super(
      `Command conflict: "${incomingCommand}" cannot be registered. ` +
        `"${existingCommand}" already exists with same priority (${priority}).`
    );
    this.name = "CommandConflictError";
    this.existingCommand = existingCommand;
    this.incomingCommand = incomingCommand;
    this.priority = priority;
  }
}

// =============================================================================
// Priority Constants
// =============================================================================

/**
 * Priority values for command kinds
 *
 * Lower number = higher priority.
 * Builtin commands always win over plugin commands, etc.
 */
const KIND_PRIORITY: Record<CommandKind, number> = {
  builtin: 0,
  plugin: 1,
  mcp: 2,
  user: 3,
};

// =============================================================================
// T008: CommandRegistry Class
// =============================================================================

/**
 * Central registry for slash commands
 *
 * Manages command registration, lookup, and search with:
 * - Priority-based conflict resolution (lower priority number wins)
 * - Alias resolution for alternative command names
 * - Category indexing for grouped retrieval
 * - Fuzzy search by command name
 *
 * @example
 * ```typescript
 * const registry = new CommandRegistry();
 *
 * // Register a builtin command
 * registry.register(helpCommand);
 *
 * // Get by name or alias
 * const cmd = registry.get('help'); // or registry.get('h')
 *
 * // Search commands
 * const matches = registry.search('hel'); // returns [helpCommand]
 *
 * // Get by category
 * const systemCmds = registry.getByCategory('system');
 * ```
 */
export class CommandRegistry {
  /** Primary command storage: name → command */
  private readonly commands: Map<string, SlashCommand> = new Map();

  /** Category index: category → set of command names */
  private readonly categoryIndex: Map<CommandCategory, Set<string>> = new Map();

  /** Alias index: alias → command name */
  private readonly aliasIndex: Map<string, string> = new Map();

  /**
   * Create a new CommandRegistry
   */
  constructor() {
    // Initialize category index with empty sets for all categories
    const categories: CommandCategory[] = [
      "system",
      "auth",
      "session",
      "navigation",
      "tools",
      "config",
      "debug",
    ];
    for (const category of categories) {
      this.categoryIndex.set(category, new Set());
    }
  }

  /**
   * Number of registered commands
   */
  get size(): number {
    return this.commands.size;
  }

  // ===========================================================================
  // T009: Registration with Priority Conflict Resolution
  // ===========================================================================

  /**
   * Register a command
   *
   * Priority rules:
   * - builtin (0) > plugin (1) > mcp (2) > user (3)
   * - Higher priority (lower number) wins silently
   * - Same priority throws CommandConflictError
   *
   * @param command - Command to register
   * @throws CommandConflictError if same-priority conflict occurs
   *
   * @example
   * ```typescript
   * registry.register({
   *   name: 'help',
   *   kind: 'builtin',
   *   category: 'system',
   *   description: 'Show help',
   *   execute: async () => ({ kind: 'success' }),
   * });
   * ```
   */
  register(command: SlashCommand): void {
    const existing = this.commands.get(command.name);

    if (existing) {
      const existingPriority = KIND_PRIORITY[existing.kind];
      const incomingPriority = KIND_PRIORITY[command.kind];

      // Same priority = conflict error
      if (existingPriority === incomingPriority) {
        throw new CommandConflictError(existing.name, command.name, command.kind);
      }

      // Incoming has lower priority (higher number) = ignore silently
      if (incomingPriority > existingPriority) {
        return;
      }

      // Incoming has higher priority (lower number) = replace
      // First, clean up old command's indexes
      this.removeFromIndexes(existing);
    }

    // Register the command
    this.commands.set(command.name, command);

    // Update category index
    const categorySet = this.categoryIndex.get(command.category);
    if (categorySet) {
      categorySet.add(command.name);
    }

    // Update alias index
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliasIndex.set(alias, command.name);
      }
    }
  }

  // ===========================================================================
  // T010: Get and Unregister
  // ===========================================================================

  /**
   * Get a command by name or alias
   *
   * @param name - Command name or alias
   * @returns Command if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const cmd = registry.get('help'); // by name
   * const cmd2 = registry.get('h');   // by alias
   * ```
   */
  get(name: string): SlashCommand | undefined {
    // Direct lookup first
    const direct = this.commands.get(name);
    if (direct) {
      return direct;
    }

    // Try alias lookup
    const resolvedName = this.aliasIndex.get(name);
    if (resolvedName) {
      return this.commands.get(resolvedName);
    }

    return undefined;
  }

  /**
   * Unregister a command
   *
   * Removes the command from all indexes (commands, category, aliases).
   *
   * @param name - Command name to unregister
   * @returns true if command was removed, false if not found
   *
   * @example
   * ```typescript
   * registry.unregister('help'); // removes help command and its aliases
   * ```
   */
  unregister(name: string): boolean {
    const command = this.commands.get(name);
    if (!command) {
      return false;
    }

    this.removeFromIndexes(command);
    this.commands.delete(name);

    return true;
  }

  /**
   * Remove a command from category and alias indexes
   */
  private removeFromIndexes(command: SlashCommand): void {
    // Remove from category index
    const categorySet = this.categoryIndex.get(command.category);
    if (categorySet) {
      categorySet.delete(command.name);
    }

    // Remove from alias index
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliasIndex.delete(alias);
      }
    }
  }

  // ===========================================================================
  // T011: Search, GetByCategory, List
  // ===========================================================================

  /**
   * Search commands by name (fuzzy match)
   *
   * Returns commands where the name includes the query string.
   *
   * @param query - Search query
   * @returns Array of matching commands
   *
   * @example
   * ```typescript
   * const matches = registry.search('log'); // returns login, logout
   * ```
   */
  search(query: string): SlashCommand[] {
    const normalizedQuery = query.toLowerCase();
    const results: SlashCommand[] = [];

    for (const command of this.commands.values()) {
      if (command.name.toLowerCase().includes(normalizedQuery)) {
        results.push(command);
      }
    }

    return results;
  }

  /**
   * Get all commands in a category
   *
   * @param category - Category to filter by
   * @returns Set of commands in the category
   *
   * @example
   * ```typescript
   * const authCmds = registry.getByCategory('auth');
   * for (const cmd of authCmds) {
   *   console.log(cmd.name);
   * }
   * ```
   */
  getByCategory(category: CommandCategory): Set<SlashCommand> {
    const names = this.categoryIndex.get(category);
    const result = new Set<SlashCommand>();

    if (names) {
      for (const name of names) {
        const command = this.commands.get(name);
        if (command) {
          result.add(command);
        }
      }
    }

    return result;
  }

  /**
   * List all registered commands
   *
   * @returns Array of all commands
   *
   * @example
   * ```typescript
   * const allCommands = registry.list();
   * console.log(`${allCommands.length} commands registered`);
   * ```
   */
  list(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Check if a command or alias exists
   *
   * @param name - Command name or alias
   * @returns true if command exists
   */
  has(name: string): boolean {
    return this.commands.has(name) || this.aliasIndex.has(name);
  }

  /**
   * Clear all registered commands
   *
   * Useful for testing or resetting state.
   */
  clear(): void {
    this.commands.clear();
    this.aliasIndex.clear();
    for (const categorySet of this.categoryIndex.values()) {
      categorySet.clear();
    }
  }
}
