/**
 * Prompt Priority Slash Commands
 *
 * Provides slash commands for managing prompt source priority:
 * - /prompt-priority - Show current priority order
 * - /prompt-priority list - List all prompt sources
 * - /prompt-priority set <source> <priority> - Set priority for a source
 * - /prompt-priority reset - Reset to default priority
 *
 * @module cli/commands/prompt-priority
 */

import { saveUserSetting } from "../tui/i18n/index.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Prompt source types.
 */
export type PromptSource =
  | "config" // vellum.json/yaml config file
  | "project" // .vellum/prompts/ directory
  | "agents-md" // AGENTS.md file
  | "skills" // .github/skills/ directory
  | "user" // User-defined prompts
  | "system"; // Built-in system prompts

/**
 * Priority configuration for prompt sources.
 */
export interface PromptPriorityConfig {
  /** Ordered list of sources (first = highest priority) */
  readonly order: readonly PromptSource[];
  /** Disabled sources */
  readonly disabled: readonly PromptSource[];
}

/**
 * Default prompt priority order.
 */
const DEFAULT_PRIORITY_ORDER: readonly PromptSource[] = [
  "config",
  "project",
  "agents-md",
  "skills",
  "user",
  "system",
] as const;

/**
 * Source descriptions.
 */
const SOURCE_INFO: Record<PromptSource, { name: string; description: string; paths: string[] }> = {
  config: {
    name: "Config File",
    description: "Prompts defined in vellum.json/yaml",
    paths: ["vellum.json", "vellum.yaml", ".vellumrc"],
  },
  project: {
    name: "Project Prompts",
    description: "Project-local prompt templates",
    paths: [".vellum/prompts/"],
  },
  "agents-md": {
    name: "AGENTS.md",
    description: "Agent instructions from AGENTS.md files",
    paths: ["AGENTS.md", ".github/AGENTS.md"],
  },
  skills: {
    name: "Skills",
    description: "Skill-specific instructions",
    paths: [".github/skills/", "~/.config/vellum/skills/"],
  },
  user: {
    name: "User Prompts",
    description: "User-defined global prompts",
    paths: ["~/.config/vellum/prompts/"],
  },
  system: {
    name: "System Prompts",
    description: "Built-in system prompts",
    paths: ["(built-in)"],
  },
};

// =============================================================================
// Module State
// =============================================================================

/**
 * Current priority configuration.
 */
let currentConfig: PromptPriorityConfig = {
  order: [...DEFAULT_PRIORITY_ORDER],
  disabled: [],
};

/**
 * Listeners for priority changes.
 */
type PriorityChangeListener = (config: PromptPriorityConfig) => void;
const listeners: Set<PriorityChangeListener> = new Set();

// =============================================================================
// Public API
// =============================================================================

/**
 * Get current prompt priority configuration.
 */
export function getPromptPriorityConfig(): PromptPriorityConfig {
  return {
    ...currentConfig,
    order: [...currentConfig.order],
    disabled: [...currentConfig.disabled],
  };
}

/**
 * Set prompt priority order.
 */
export function setPromptPriorityOrder(order: readonly PromptSource[]): void {
  currentConfig = { ...currentConfig, order: [...order] };
  notifyListeners();
  persistConfig();
}

/**
 * Set priority for a specific source.
 */
export function setSourcePriority(source: PromptSource, priority: number): void {
  const newOrder = currentConfig.order.filter((s) => s !== source);
  const insertIndex = Math.max(0, Math.min(priority - 1, newOrder.length));
  newOrder.splice(insertIndex, 0, source);
  currentConfig = { ...currentConfig, order: newOrder };
  notifyListeners();
  persistConfig();
}

/**
 * Enable or disable a prompt source.
 */
export function setSourceEnabled(source: PromptSource, enabled: boolean): void {
  const disabled = new Set(currentConfig.disabled);
  if (enabled) {
    disabled.delete(source);
  } else {
    disabled.add(source);
  }
  currentConfig = { ...currentConfig, disabled: [...disabled] };
  notifyListeners();
  persistConfig();
}

/**
 * Reset to default priority configuration.
 */
export function resetPromptPriority(): void {
  currentConfig = {
    order: [...DEFAULT_PRIORITY_ORDER],
    disabled: [],
  };
  notifyListeners();
  persistConfig();
}

/**
 * Subscribe to priority changes.
 */
export function subscribePromptPriority(listener: PriorityChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Notify all listeners.
 */
function notifyListeners(): void {
  for (const listener of listeners) {
    listener(currentConfig);
  }
}

/**
 * Persist configuration to settings file.
 */
function persistConfig(): void {
  saveUserSetting("promptPriority", {
    order: [...currentConfig.order],
    disabled: [...currentConfig.disabled],
  });
}

// =============================================================================
// Display Helpers
// =============================================================================

/**
 * Format priority list for display.
 */
function formatPriorityList(): string {
  const lines: string[] = [];
  lines.push("📋 Prompt Source Priority");
  lines.push("═".repeat(40));
  lines.push("");
  lines.push("Priority Order (highest to lowest):");
  lines.push("");

  currentConfig.order.forEach((source, index) => {
    const info = SOURCE_INFO[source];
    const disabled = currentConfig.disabled.includes(source);
    const status = disabled ? "❌" : "✅";
    const disabledText = disabled ? " [DISABLED]" : "";
    lines.push(`  ${index + 1}. ${status} ${info.name}${disabledText}`);
    lines.push(`      ${info.description}`);
    lines.push(`      Paths: ${info.paths.join(", ")}`);
    lines.push("");
  });

  lines.push("─".repeat(40));
  lines.push("Commands:");
  lines.push("  /prompt-priority list                - List all sources");
  lines.push("  /prompt-priority set <source> <n>    - Set priority");
  lines.push("  /prompt-priority enable <source>     - Enable source");
  lines.push("  /prompt-priority disable <source>    - Disable source");
  lines.push("  /prompt-priority reset               - Reset to defaults");

  return lines.join("\n");
}

/**
 * Format source list for display.
 */
function formatSourceList(): string {
  const lines: string[] = [];
  lines.push("📂 Available Prompt Sources");
  lines.push("═".repeat(40));
  lines.push("");

  for (const [source, info] of Object.entries(SOURCE_INFO)) {
    const currentPriority = currentConfig.order.indexOf(source as PromptSource) + 1;
    const disabled = currentConfig.disabled.includes(source as PromptSource);
    const status = disabled ? "❌ Disabled" : `✅ Priority ${currentPriority}`;

    lines.push(`${info.name} (${source})`);
    lines.push(`  ${info.description}`);
    lines.push(`  Status: ${status}`);
    lines.push(`  Paths: ${info.paths.join(", ")}`);
    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// /prompt-priority Command
// =============================================================================

/**
 * /prompt-priority command - Manage prompt source priority.
 *
 * Usage:
 * - /prompt-priority - Show current priority
 * - /prompt-priority list - List all sources
 * - /prompt-priority set <source> <priority> - Set priority
 * - /prompt-priority enable <source> - Enable a source
 * - /prompt-priority disable <source> - Disable a source
 * - /prompt-priority reset - Reset to defaults
 */
export const promptPriorityCommand: SlashCommand = {
  name: "prompt-priority",
  description: "Manage prompt source priority order",
  kind: "builtin",
  category: "config",
  aliases: ["priority", "prompt-order"],
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand: list, set, enable, disable, reset",
      required: false,
    },
    {
      name: "source",
      type: "string",
      description: "Prompt source name",
      required: false,
    },
    {
      name: "priority",
      type: "number",
      description: "Priority number (1 = highest)",
      required: false,
    },
  ],
  examples: [
    "/prompt-priority                    - Show current priority",
    "/prompt-priority list               - List all sources",
    "/prompt-priority set skills 1       - Make skills highest priority",
    "/prompt-priority enable user        - Enable user prompts",
    "/prompt-priority disable system     - Disable system prompts",
    "/prompt-priority reset              - Reset to defaults",
  ],
  subcommands: [
    { name: "list", description: "List all prompt sources" },
    { name: "set", description: "Set priority for a source" },
    { name: "enable", description: "Enable a prompt source" },
    { name: "disable", description: "Disable a prompt source" },
    { name: "reset", description: "Reset to default priority" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const subcommand = ctx.parsedArgs.positional[0] as string | undefined;
    const source = ctx.parsedArgs.positional[1] as string | undefined;
    const priorityArg = ctx.parsedArgs.positional[2] as string | number | undefined;

    // Validate source if provided
    const validSources = Object.keys(SOURCE_INFO) as PromptSource[];
    if (source && !validSources.includes(source as PromptSource)) {
      return error(
        "INVALID_ARGUMENT",
        `Unknown source: ${source}\n\nValid sources: ${validSources.join(", ")}`
      );
    }

    switch (subcommand) {
      case undefined:
      case "":
        return success(formatPriorityList());

      case "list":
        return success(formatSourceList());

      case "set": {
        if (!source) {
          return error(
            "MISSING_ARGUMENT",
            "Source name required.\n\nUsage: /prompt-priority set <source> <priority>"
          );
        }
        const priority =
          typeof priorityArg === "number" ? priorityArg : parseInt(String(priorityArg), 10);
        if (Number.isNaN(priority) || priority < 1 || priority > validSources.length) {
          return error(
            "INVALID_ARGUMENT",
            `Priority must be a number between 1 and ${validSources.length}`
          );
        }
        setSourcePriority(source as PromptSource, priority);
        return success(`Set ${source} to priority ${priority}`);
      }

      case "enable": {
        if (!source) {
          return error(
            "MISSING_ARGUMENT",
            "Source name required.\n\nUsage: /prompt-priority enable <source>"
          );
        }
        setSourceEnabled(source as PromptSource, true);
        return success(`Enabled prompt source: ${source}`);
      }

      case "disable": {
        if (!source) {
          return error(
            "MISSING_ARGUMENT",
            "Source name required.\n\nUsage: /prompt-priority disable <source>"
          );
        }
        setSourceEnabled(source as PromptSource, false);
        return success(`Disabled prompt source: ${source}`);
      }

      case "reset":
        resetPromptPriority();
        return success("Prompt priority reset to defaults.");

      default:
        return error(
          "INVALID_ARGUMENT",
          `Unknown subcommand: ${subcommand}\n\nValid subcommands: list, set, enable, disable, reset`
        );
    }
  },
};

// =============================================================================
// Export Collection
// =============================================================================

/**
 * All prompt-priority related slash commands.
 */
export const promptPrioritySlashCommands: readonly SlashCommand[] = [
  promptPriorityCommand,
] as const;
