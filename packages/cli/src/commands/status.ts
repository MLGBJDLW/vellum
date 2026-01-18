/**
 * Status Command
 *
 * CLI command for displaying system status with various formats:
 * - brief: Quick summary (default)
 * - full: Detailed system information
 * - json: Machine-readable JSON output
 *
 * Usage:
 * - `/status` - Show brief status
 * - `/status brief` - Show brief status
 * - `/status full` - Show detailed status
 * - `/status json` - Show JSON output
 *
 * @module cli/commands/status
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";

import { ICONS } from "../utils/icons.js";
import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { error, success } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Status format types
 */
export type StatusFormat = "brief" | "full" | "json";

/**
 * System status information
 */
export interface SystemStatus {
  /** Current working directory */
  cwd: string;
  /** Whether in a git repository */
  isGitRepo: boolean;
  /** Whether spec workflow exists */
  hasSpec: boolean;
  /** Spec workflow status (if exists) */
  specStatus?: {
    name: string;
    currentPhase: string;
    progress: {
      completed: number;
      total: number;
      percentage: number;
    };
  };
  /** Current mode (if available) */
  currentMode?: string;
  /** Session info (if available) */
  session?: {
    id: string;
    startTime: string;
  };
}

// =============================================================================
// Constants
// =============================================================================

const SPEC_DIR = ".ouroboros/specs";
const VALID_FORMATS: readonly StatusFormat[] = ["brief", "full", "json"] as const;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a format string is valid
 */
function isValidFormat(format: string): format is StatusFormat {
  return VALID_FORMATS.includes(format as StatusFormat);
}

/**
 * Get system status information
 */
function getSystemStatus(): SystemStatus {
  const cwd = process.cwd();
  const isGitRepo = existsSync(join(cwd, ".git"));
  const specDir = resolve(join(cwd, SPEC_DIR));
  const hasSpec = existsSync(specDir);

  const status: SystemStatus = {
    cwd,
    isGitRepo,
    hasSpec,
  };

  return status;
}

/**
 * Format brief status output
 */
function formatBriefStatus(status: SystemStatus): string {
  const lines: string[] = [];

  lines.push(chalk.bold.blue("Status Summary"));
  lines.push("");
  lines.push(`${ICONS.cwd} ${chalk.dim("CWD:")} ${status.cwd}`);
  lines.push(`${status.isGitRepo ? ICONS.success : ICONS.error} Git Repository`);
  lines.push(`${status.hasSpec ? ICONS.success : ICONS.error} Spec Workflow`);

  if (status.currentMode) {
    lines.push(`Mode: ${status.currentMode}`);
  }

  return lines.join("\n");
}

/**
 * Format full status output
 */
function formatFullStatus(status: SystemStatus): string {
  const lines: string[] = [];

  lines.push(chalk.bold.blue("System Status (Full)"));
  lines.push("");

  // Environment
  lines.push(chalk.bold("Environment:"));
  lines.push(`  ${ICONS.cwd} Working Directory: ${status.cwd}`);
  lines.push(
    `  ${ICONS.git} Git Repository: ${status.isGitRepo ? chalk.green("Yes") : chalk.yellow("No")}`
  );
  lines.push(
    `  ${ICONS.mode.spec} Spec Workflow: ${status.hasSpec ? chalk.green("Yes") : chalk.yellow("No")}`
  );
  lines.push("");

  // Spec details if exists
  if (status.hasSpec && status.specStatus) {
    lines.push(chalk.bold("Spec Workflow:"));
    lines.push(`  Name: ${status.specStatus.name}`);
    lines.push(`  Phase: ${status.specStatus.currentPhase}`);
    lines.push(
      `  Progress: ${status.specStatus.progress.completed}/${status.specStatus.progress.total} (${status.specStatus.progress.percentage}%)`
    );
    lines.push("");
  }

  // Session info if available
  if (status.session) {
    lines.push(chalk.bold("Session:"));
    lines.push(`  ID: ${status.session.id}`);
    lines.push(`  Started: ${status.session.startTime}`);
    lines.push("");
  }

  // Mode info if available
  if (status.currentMode) {
    lines.push(chalk.bold("Mode:"));
    lines.push(`  Current: ${status.currentMode}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format JSON status output
 */
function formatJsonStatus(status: SystemStatus): string {
  return JSON.stringify(status, null, 2);
}

// =============================================================================
// Command Executor
// =============================================================================

/**
 * Execute status command
 */
export function executeStatus(format: StatusFormat = "brief"): CommandResult {
  const status = getSystemStatus();

  switch (format) {
    case "brief":
      return success(formatBriefStatus(status), { status });
    case "full":
      return success(formatFullStatus(status), { status });
    case "json":
      return success(formatJsonStatus(status), { status, format: "json" });
    default:
      return error("INVALID_ARGUMENT", `Invalid format: ${format}`);
  }
}

// =============================================================================
// Slash Command Definition
// =============================================================================

/**
 * /status slash command for TUI
 *
 * Displays system status in various formats.
 */
export const statusCommand: SlashCommand = {
  name: "status",
  description: "Show system status",
  kind: "builtin",
  category: "system",
  aliases: ["st"],
  positionalArgs: [
    {
      name: "format",
      type: "string",
      description: "Output format: brief (default), full, json",
      required: false,
      default: "brief",
    },
  ],
  examples: [
    "/status          - Show brief status summary",
    "/status brief    - Show brief status (default)",
    "/status full     - Show detailed system status",
    "/status json     - Show machine-readable JSON output",
  ],
  subcommands: [
    { name: "brief", description: "Quick status summary (default)" },
    { name: "full", description: "Detailed system status" },
    { name: "json", description: "Machine-readable JSON output" },
  ],

  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const formatArg = ctx.parsedArgs.positional[0] as string | undefined;
    const format: StatusFormat = formatArg && isValidFormat(formatArg) ? formatArg : "brief";

    // Validate format if provided
    if (formatArg && !isValidFormat(formatArg)) {
      return error("INVALID_ARGUMENT", `Invalid format: ${formatArg}`, [
        `Valid formats: ${VALID_FORMATS.join(", ")}`,
      ]);
    }

    return executeStatus(format);
  },
};
