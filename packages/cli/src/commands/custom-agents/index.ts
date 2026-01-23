/**
 * Custom Agents Command Group (T020-T024)
 *
 * CLI commands for managing custom agent definitions.
 *
 * Subcommands:
 * - `vellum custom-agents list` - List agents grouped by scope
 * - `vellum custom-agents create` - Create new agent from template
 * - `vellum custom-agents validate` - Validate agent files
 * - `vellum custom-agents info` - Show full agent details
 * - `vellum custom-agents export` - Export agent to file
 * - `vellum custom-agents import` - Import agent from file
 *
 * @module cli/commands/custom-agents
 */

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { success } from "../types.js";
import { handleCreate } from "./create.js";
import { handleExport } from "./export.js";
import { handleImport } from "./import.js";
import { handleInfo } from "./info.js";
import { handleList } from "./list.js";
import { handleValidate } from "./validate.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Custom agents subcommand names
 */
export type CustomAgentsSubcommand =
  | "list"
  | "create"
  | "validate"
  | "info"
  | "export"
  | "import"
  | "help";

/**
 * Options for list subcommand (T020)
 */
export interface ListOptions {
  /** Output as JSON */
  json?: boolean;
  /** Show only global (user-level) agents */
  global?: boolean;
  /** Show only local (project-level) agents */
  local?: boolean;
}

/**
 * Options for create subcommand (T021)
 */
export interface CreateOptions {
  /** Template to use (basic, advanced, orchestrator) */
  template?: string;
  /** Create in global location (~/.vellum/agents) */
  global?: boolean;
  /** Skip interactive prompts */
  noInteractive?: boolean;
}

/**
 * Options for validate subcommand (T022)
 */
export interface ValidateOptions {
  /** Strict mode - treat warnings as errors */
  strict?: boolean;
  /** Agent slug or file path to validate */
  target?: string;
}

/**
 * Options for info subcommand (T023)
 */
export interface InfoOptions {
  /** Output as JSON */
  json?: boolean;
  /** Show full system prompt */
  showPrompt?: boolean;
}

/**
 * Options for export subcommand (T020a)
 */
export interface ExportOptions {
  /** Output file path */
  output?: string;
  /** Output format (yaml or json) */
  format?: "yaml" | "json";
}

/**
 * Options for import subcommand (T020b)
 */
export interface ImportOptions {
  /** Import file path */
  file: string;
  /** Import to global location */
  global?: boolean;
}

// =============================================================================
// Help Text
// =============================================================================

/**
 * Generate help text for custom-agents command group
 */
function getCustomAgentsHelp(): string {
  return `🤖 Custom Agents Commands

Manage custom agent definitions.

Subcommands:
  list      List agents grouped by scope (project/user/system)
  create    Create a new agent from template
  validate  Validate agent definition files
  info      Show full agent details (resolved config)
  export    Export agent definition to file
  import    Import agent definition from file

Usage:
  /custom-agents                     Show this help
  /custom-agents list                List all agents
  /custom-agents list --json         Output as JSON
  /custom-agents list --global       Show only user-level agents
  /custom-agents list --local        Show only project-level agents
  /custom-agents create <slug>       Create new agent
  /custom-agents create <slug> --template=advanced
  /custom-agents validate            Validate all agents
  /custom-agents validate <slug>     Validate specific agent
  /custom-agents validate --strict   Treat warnings as errors
  /custom-agents info <slug>         Show agent details
  /custom-agents info <slug> --json  Output as JSON
  /custom-agents info <slug> --show-prompt
  /custom-agents export <slug>       Export agent
  /custom-agents export <slug> --output=./agent.yaml
  /custom-agents export <slug> --format=json
  /custom-agents import <file>       Import agent from file

Examples:
  /custom-agents create test-runner --template=basic
  /custom-agents validate --strict
  /custom-agents info my-agent --show-prompt
  /custom-agents export my-agent --format=yaml

See also:
  /agents - AGENTS.md configuration management`;
}

// =============================================================================
// Subcommand Routing
// =============================================================================

/**
 * Parse custom-agents subcommand from positional args
 */
function parseSubcommand(positional: readonly unknown[]): CustomAgentsSubcommand {
  const first = positional[0];
  if (typeof first === "string") {
    const sub = first.toLowerCase();
    if (
      sub === "list" ||
      sub === "create" ||
      sub === "validate" ||
      sub === "info" ||
      sub === "export" ||
      sub === "import"
    ) {
      return sub;
    }
  }
  return "help";
}

/**
 * Execute custom-agents command group
 *
 * @param ctx - Command context
 * @returns Command result
 */
export async function executeCustomAgents(ctx: CommandContext): Promise<CommandResult> {
  const subcommand = parseSubcommand(ctx.parsedArgs.positional);
  const named = ctx.parsedArgs.named;
  const positional = ctx.parsedArgs.positional;

  switch (subcommand) {
    case "list":
      return handleList({
        json: named.json as boolean | undefined,
        global: named.global as boolean | undefined,
        local: named.local as boolean | undefined,
      });

    case "create":
      return handleCreate(
        positional[1] as string | undefined, // slug
        {
          template: named.template as string | undefined,
          global: named.global as boolean | undefined,
          noInteractive: named["no-interactive"] as boolean | undefined,
        }
      );

    case "validate":
      return handleValidate({
        target: positional[1] as string | undefined,
        strict: named.strict as boolean | undefined,
      });

    case "info":
      return handleInfo(positional[1] as string | undefined, {
        json: named.json as boolean | undefined,
        showPrompt: named["show-prompt"] as boolean | undefined,
      });

    case "export":
      return handleExport(positional[1] as string | undefined, {
        output: named.output as string | undefined,
        format: named.format as "yaml" | "json" | undefined,
      });

    case "import":
      return handleImport({
        file: positional[1] as string,
        global: named.global as boolean | undefined,
      });

    default:
      return success(getCustomAgentsHelp());
  }
}

// =============================================================================
// Slash Command Definition
// =============================================================================

/**
 * Custom agents command group for TUI
 *
 * Provides access to custom agent management operations.
 */
export const customAgentsCommand: SlashCommand = {
  name: "custom-agents",
  description: "Manage custom agent definitions",
  kind: "builtin",
  category: "config",
  aliases: ["ca", "custom-agent"],
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand: list, create, validate, info, export, import",
      required: false,
    },
    {
      name: "target",
      type: "string",
      description: "Agent slug, file path, or other target",
      required: false,
    },
  ],
  namedArgs: [
    // Common flags
    {
      name: "json",
      shorthand: "j",
      type: "boolean",
      description: "Output as JSON",
      required: false,
      default: false,
    },
    // List flags
    {
      name: "global",
      shorthand: "g",
      type: "boolean",
      description: "Global (user-level) scope",
      required: false,
      default: false,
    },
    {
      name: "local",
      shorthand: "l",
      type: "boolean",
      description: "Local (project-level) scope",
      required: false,
      default: false,
    },
    // Create flags
    {
      name: "template",
      shorthand: "t",
      type: "string",
      description: "Template for new agent (basic, advanced, orchestrator)",
      required: false,
    },
    {
      name: "no-interactive",
      type: "boolean",
      description: "Skip interactive prompts",
      required: false,
      default: false,
    },
    // Validate flags
    {
      name: "strict",
      shorthand: "s",
      type: "boolean",
      description: "Treat warnings as errors",
      required: false,
      default: false,
    },
    // Info flags
    {
      name: "show-prompt",
      type: "boolean",
      description: "Show full system prompt",
      required: false,
      default: false,
    },
    // Export flags
    {
      name: "output",
      shorthand: "o",
      type: "path",
      description: "Output file path",
      required: false,
    },
    {
      name: "format",
      shorthand: "f",
      type: "string",
      description: "Output format (yaml or json)",
      required: false,
    },
  ],
  examples: [
    "/custom-agents                           - Show help",
    "/custom-agents list                      - List all agents",
    "/custom-agents list --json               - Output as JSON",
    "/custom-agents list --global             - Show user-level agents only",
    "/custom-agents create my-agent           - Create new agent",
    "/custom-agents create my-agent -t basic  - Use basic template",
    "/custom-agents validate                  - Validate all agents",
    "/custom-agents validate --strict         - Strict validation",
    "/custom-agents info my-agent             - Show agent details",
    "/custom-agents info my-agent --show-prompt",
    "/custom-agents export my-agent -o ./out.yaml",
    "/custom-agents import ./agent.yaml       - Import agent",
  ],
  subcommands: [
    { name: "list", description: "List custom agents", aliases: ["ls"] },
    { name: "create", description: "Create custom agent" },
    { name: "validate", description: "Validate agent" },
    { name: "info", description: "Show agent details" },
    { name: "export", description: "Export agent" },
    { name: "import", description: "Import agent" },
  ],

  execute: executeCustomAgents,
};

// =============================================================================
// Re-exports
// =============================================================================

export { getCustomAgentsHelp };
