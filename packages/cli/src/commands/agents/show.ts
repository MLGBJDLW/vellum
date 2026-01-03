/**
 * Agents Show Command
 *
 * Displays merged AGENTS.md configuration with all contributing sources.
 * Supports JSON output for programmatic usage and verbose mode for debugging.
 *
 * @module cli/commands/agents/show
 */

import * as path from "node:path";
import {
  type AgentsConfig,
  AgentsLoader,
  type AgentsLoadResult,
  type AgentsWarning,
  type ToolPermission,
} from "@vellum/core";
import chalk from "chalk";

import type { CommandContext, CommandResult } from "../types.js";
import { error, success } from "../types.js";
import type { AgentsShowOptions } from "./index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * JSON output format for agents show
 */
export interface AgentsShowJsonOutput {
  /** Whether the configuration was loaded successfully */
  success: boolean;
  /** Merged configuration (null if failed) */
  config: AgentsConfig | null;
  /** Source files that contributed to configuration */
  sources: string[];
  /** Warnings during loading */
  warnings: Array<{
    file: string;
    message: string;
    severity: string;
    line?: number;
  }>;
  /** Whether result came from cache */
  fromCache: boolean;
}

// =============================================================================
// Formatters
// =============================================================================

/**
 * Format tool permissions for display
 */
function formatToolPermissions(config: AgentsConfig): string {
  if (config.allowedTools.length === 0) {
    return chalk.gray("  No explicit tool permissions set");
  }

  return config.allowedTools
    .map((tool: ToolPermission) => {
      const icon = tool.negated ? chalk.red("❌") : chalk.green("✅");
      const pattern = tool.negated ? tool.pattern.replace(/^!/, "") : tool.pattern;
      const args = tool.args?.length ? chalk.gray(` (args: ${tool.args.join(", ")})`) : "";
      return `  ${icon} ${tool.negated ? chalk.red(pattern) : chalk.cyan(pattern)}${args}`;
    })
    .join("\n");
}

/**
 * Format sources list for display
 */
function formatSources(sources: string[], cwd: string): string {
  if (sources.length === 0) {
    return chalk.gray("  No sources found");
  }

  return sources
    .map((source, index) => {
      // Make paths relative to cwd for readability
      const relativePath = path.relative(cwd, source) || source;
      return `  ${chalk.gray(`${index + 1}.`)} ${chalk.blue(relativePath)}`;
    })
    .join("\n");
}

/**
 * Format warnings list for display
 */
function formatWarnings(result: AgentsLoadResult): string {
  if (result.warnings.length === 0) {
    return "";
  }

  const warningLines = result.warnings.map((w: AgentsWarning) => {
    const loc = w.line ? `:${w.line}` : "";
    const file = chalk.gray(`${path.basename(w.file)}${loc}`);
    const icon = w.severity === "warn" ? chalk.yellow("⚠") : chalk.blue("ℹ");
    return `  ${icon} ${file}: ${w.message}`;
  });

  return `\n${chalk.yellow("⚠️ Warnings:")}\n${warningLines.join("\n")}`;
}

/**
 * Format configuration for human-readable display
 */
function formatConfigDisplay(result: AgentsLoadResult, cwd: string, verbose: boolean): string {
  const config = result.config;

  if (!config) {
    return chalk.yellow(
      "No AGENTS.md configuration found.\n\n" +
        "Run " +
        chalk.cyan("/init") +
        " to create one, or create AGENTS.md manually."
    );
  }

  const lines: string[] = [
    chalk.bold("📋 AGENTS.md Configuration"),
    chalk.gray("━".repeat(40)),
    "",
  ];

  // Name and description
  if (config.name) {
    lines.push(`${chalk.gray("Name:")} ${chalk.white(config.name)}`);
  }
  if (config.description) {
    lines.push(`${chalk.gray("Description:")} ${config.description}`);
  }
  lines.push(`${chalk.gray("Priority:")} ${config.priority}`);
  lines.push("");

  // Instructions
  if (config.instructions) {
    lines.push(chalk.bold("📝 Instructions:"));
    const instructionPreview =
      config.instructions.length > 200
        ? config.instructions.slice(0, 200) + chalk.gray("...")
        : config.instructions;
    lines.push(chalk.gray(`  ${instructionPreview.split("\n").join("\n  ")}`));
    lines.push("");
  }

  // Tools
  lines.push(chalk.bold("🔧 Allowed Tools:"));
  lines.push(formatToolPermissions(config));
  lines.push("");

  // Merge config (verbose only)
  if (verbose) {
    lines.push(chalk.bold("🔀 Merge Configuration:"));
    lines.push(`  Strategy: ${chalk.cyan(config.merge.strategy)}`);
    lines.push(`  Arrays: ${chalk.cyan(config.merge.arrays)}`);
    lines.push("");

    // Scope (verbose only)
    if (config.scope.include.length > 0 || config.scope.exclude.length > 0) {
      lines.push(chalk.bold("📂 Scope:"));
      if (config.scope.include.length > 0) {
        lines.push(`  Include: ${chalk.green(config.scope.include.join(", "))}`);
      }
      if (config.scope.exclude.length > 0) {
        lines.push(`  Exclude: ${chalk.red(config.scope.exclude.join(", "))}`);
      }
      lines.push("");
    }
  }

  // Sources
  lines.push(chalk.bold("📁 Sources:"));
  lines.push(formatSources(config.sources, cwd));

  // Warnings (if any)
  lines.push(formatWarnings(result));

  // Cache info (verbose only)
  if (verbose && result.fromCache) {
    lines.push("");
    lines.push(chalk.gray("(Loaded from cache)"));
  }

  return lines.join("\n");
}

/**
 * Convert load result to JSON output format
 */
function toJsonOutput(result: AgentsLoadResult): AgentsShowJsonOutput {
  return {
    success: result.config !== null,
    config: result.config,
    sources: result.config?.sources ?? [],
    warnings: result.warnings.map((w: AgentsWarning) => ({
      file: w.file,
      message: w.message,
      severity: w.severity,
      line: w.line,
    })),
    fromCache: result.fromCache,
  };
}

// =============================================================================
// Command Handler
// =============================================================================

/**
 * Execute agents show command
 *
 * @param options - Command options
 * @returns Command result
 */
export async function handleAgentsShow(options: AgentsShowOptions): Promise<CommandResult> {
  const cwd = options.scope ? path.resolve(options.scope) : process.cwd();

  try {
    // Create loader with cache disabled for fresh results
    const loader = new AgentsLoader({
      enableCache: !options.verbose, // Disable cache in verbose mode
    });

    // Load configuration
    const result = await loader.load(cwd);

    // JSON output
    if (options.json) {
      const jsonOutput = toJsonOutput(result);
      return success(JSON.stringify(jsonOutput, null, 2), {
        format: "json",
        data: jsonOutput,
      });
    }

    // Human-readable output
    const display = formatConfigDisplay(result, cwd, options.verbose ?? false);
    return success(display);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (options.json) {
      const jsonError = {
        success: false,
        config: null,
        sources: [],
        warnings: [],
        fromCache: false,
        error: message,
      };
      return error("INTERNAL_ERROR", JSON.stringify(jsonError, null, 2));
    }

    return error("INTERNAL_ERROR", `Failed to load AGENTS.md configuration: ${message}`);
  }
}

/**
 * Execute handler for command context
 */
export async function executeShow(ctx: CommandContext): Promise<CommandResult> {
  const options: AgentsShowOptions = {
    json: ctx.parsedArgs.named.json as boolean | undefined,
    verbose: ctx.parsedArgs.named.verbose as boolean | undefined,
    scope: ctx.parsedArgs.named.scope as string | undefined,
  };

  return handleAgentsShow(options);
}
