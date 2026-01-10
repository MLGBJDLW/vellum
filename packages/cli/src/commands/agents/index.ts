/**
 * Agents Command Group
 *
 * Command group for AGENTS.md management operations.
 *
 * Subcommands:
 * - `vellum agents show` - Display merged configuration
 * - `vellum agents validate` - Validate syntax and structure
 * - `vellum agents generate` - Generate optimized AGENTS.md
 *
 * @module cli/commands/agents
 */

import type { CommandContext, CommandResult, SlashCommand } from "../types.js";
import { success } from "../types.js";
import { handleAgentsGenerate } from "./generate.js";
// Import subcommand handlers
import { handleAgentsShow } from "./show.js";
import { handleAgentsValidate } from "./validate.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Agents subcommand names
 */
export type AgentsSubcommand = "show" | "validate" | "generate" | "help";

/**
 * Options for agents subcommands
 */
export interface AgentsShowOptions {
  /** Output as JSON */
  json?: boolean;
  /** Show all details including sources */
  verbose?: boolean;
  /** Show config for specific file/directory */
  scope?: string;
}

export interface AgentsValidateOptions {
  /** Path to AGENTS.md file */
  file?: string;
  /** Show verbose output */
  verbose?: boolean;
  /** Output as JSON */
  json?: boolean;
}

export interface AgentsGenerateOptions {
  /** Output file path */
  output?: string;
  /** Merge with existing file */
  merge?: boolean;
  /** Dry run - show what would be generated */
  dryRun?: boolean;
}

// =============================================================================
// Help Text
// =============================================================================

/**
 * Generate help text for agents command group
 */
function getAgentsHelp(): string {
  return `📋 Agents Commands

Manage AGENTS.md configuration files.

Subcommands:
  show      Display merged AGENTS.md configuration
  validate  Validate syntax and structure
  generate  Generate optimized AGENTS.md from codebase

Usage:
  /agents                  Show this help
  /agents show             Display current config
  /agents show --json      Output as JSON
  /agents show --verbose   Show all details
  /agents validate         Validate current config
  /agents validate <file>  Validate specific file
  /agents generate         Generate new config

Examples:
  /agents show --scope ./src    Show config for src directory
  /agents validate --verbose    Validate with detailed output
  /agents generate --dry-run    Preview generated config

See also:
  /init    Create new AGENTS.md file`;
}

// =============================================================================
// Subcommand Handlers
// =============================================================================

/**
 * Handle agents show subcommand
 */
async function handleShow(options: AgentsShowOptions): Promise<CommandResult> {
  return handleAgentsShow(options);
}

/**
 * Handle agents validate subcommand
 */
async function handleValidate(options: AgentsValidateOptions): Promise<CommandResult> {
  return handleAgentsValidate(options);
}

/**
 * Handle agents generate subcommand
 */
async function handleGenerate(options: AgentsGenerateOptions): Promise<CommandResult> {
  return handleAgentsGenerate(options);
}

// =============================================================================
// Command Execution
// =============================================================================

/**
 * Parse agents subcommand from positional args
 */
function parseSubcommand(positional: readonly unknown[]): AgentsSubcommand {
  const first = positional[0];
  if (typeof first === "string") {
    const sub = first.toLowerCase();
    if (sub === "show" || sub === "validate" || sub === "generate") {
      return sub;
    }
  }
  return "help";
}

/**
 * Execute agents command group
 *
 * @param ctx - Command context
 * @returns Command result
 */
export async function executeAgents(ctx: CommandContext): Promise<CommandResult> {
  const subcommand = parseSubcommand(ctx.parsedArgs.positional);
  const named = ctx.parsedArgs.named;

  switch (subcommand) {
    case "show":
      return handleShow({
        json: named.json as boolean | undefined,
        verbose: named.verbose as boolean | undefined,
        scope: named.scope as string | undefined,
      });

    case "validate":
      return handleValidate({
        file: ctx.parsedArgs.positional[1] as string | undefined,
        verbose: named.verbose as boolean | undefined,
      });

    case "generate":
      return handleGenerate({
        output: named.output as string | undefined,
        merge: named.merge as boolean | undefined,
        dryRun: named["dry-run"] as boolean | undefined,
      });

    default:
      return success(getAgentsHelp());
  }
}

// =============================================================================
// Slash Command Definition
// =============================================================================

/**
 * Agents command group for TUI
 *
 * Provides access to AGENTS.md management operations.
 */
export const agentsCommand: SlashCommand = {
  name: "agents",
  description: "Manage AGENTS.md configuration",
  kind: "builtin",
  category: "config",
  aliases: ["agent"],
  positionalArgs: [
    {
      name: "subcommand",
      type: "string",
      description: "Subcommand: show, validate, generate",
      required: false,
    },
    {
      name: "file",
      type: "path",
      description: "Target file (for validate subcommand)",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "json",
      shorthand: "j",
      type: "boolean",
      description: "Output as JSON (for show)",
      required: false,
      default: false,
    },
    {
      name: "verbose",
      shorthand: "v",
      type: "boolean",
      description: "Show verbose output",
      required: false,
      default: false,
    },
    {
      name: "scope",
      shorthand: "s",
      type: "path",
      description: "Scope to specific file/directory (for show)",
      required: false,
    },
    {
      name: "output",
      shorthand: "o",
      type: "path",
      description: "Output file path (for generate)",
      required: false,
    },
    {
      name: "merge",
      shorthand: "m",
      type: "boolean",
      description: "Merge with existing file (for generate)",
      required: false,
      default: false,
    },
    {
      name: "dry-run",
      type: "boolean",
      description: "Preview without writing (for generate)",
      required: false,
      default: false,
    },
  ],
  examples: [
    "/agents                     - Show help",
    "/agents show                - Display current config",
    "/agents show --json         - Output as JSON",
    "/agents show --verbose      - Show all details",
    "/agents validate            - Validate current config",
    "/agents validate ./AGENTS.md - Validate specific file",
    "/agents generate --dry-run  - Preview generated config",
  ],
  subcommands: [
    { name: "show", description: "Show agent details" },
    { name: "validate", description: "Validate agents" },
    { name: "generate", description: "Generate agent" },
  ],

  execute: executeAgents,
};

// =============================================================================
// Re-exports
// =============================================================================

export { getAgentsHelp };
