/**
 * Environment Command (Phase 37)
 * @module cli/commands/env
 */

import type { CommandContext, CommandResult, SlashCommand } from "./types.js";
import { success } from "./types.js";

export interface EnvCommandOptions {
  json?: boolean;
  export?: boolean;
  filter?: string;
}

export interface EnvValues {
  [key: string]: string | undefined;
}

export interface EnvCommandResult {
  success: boolean;
  values: EnvValues;
}

// =============================================================================
// Sensitive Variable Detection
// =============================================================================

/**
 * Patterns that indicate sensitive environment variables.
 * Variables matching these will have their values masked.
 */
const SENSITIVE_PATTERNS = [
  /KEY/i,
  /SECRET/i,
  /TOKEN/i,
  /PASSWORD/i,
  /PASSWD/i,
  /CREDENTIAL/i,
  /AUTH/i,
  /PRIVATE/i,
  /API_KEY/i,
  /ACCESS_KEY/i,
  /SESSION/i,
];

/**
 * Check if a variable name indicates sensitive data
 */
function isSensitiveVariable(name: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Mask a sensitive value
 */
function maskValue(value: string): string {
  if (value.length <= 4) {
    return "***";
  }
  // Show first 2 and last 2 characters for longer values
  return `${value.slice(0, 2)}${"*".repeat(Math.min(value.length - 4, 8))}${value.slice(-2)}`;
}

// =============================================================================
// Environment Processing
// =============================================================================

/**
 * Get environment variables with optional filtering
 */
function getEnvironmentVariables(options?: EnvCommandOptions): EnvValues {
  const env = process.env;
  const result: EnvValues = {};
  const filterPattern = options?.filter ? new RegExp(options.filter, "i") : null;

  for (const [key, value] of Object.entries(env)) {
    // Skip if filter is provided and doesn't match
    if (filterPattern && !filterPattern.test(key)) {
      continue;
    }

    // Mask sensitive values
    if (value !== undefined && isSensitiveVariable(key)) {
      result[key] = maskValue(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Format environment variables for display
 */
function formatEnvDisplay(values: EnvValues, exportFormat: boolean): string {
  const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return "No environment variables found.";
  }

  if (exportFormat) {
    // Shell export format
    return entries
      .map(([key, value]) => {
        const escapedValue = (value ?? "").replace(/'/g, "'\\''");
        return `export ${key}='${escapedValue}'`;
      })
      .join("\n");
  }

  // Table format
  const lines: string[] = [
    "🔧 Environment Variables",
    "",
    `Total: ${entries.length} variables`,
    "",
  ];

  for (const [key, value] of entries) {
    const displayValue = value ?? "(undefined)";
    // Truncate long values
    const truncated = displayValue.length > 60 ? `${displayValue.slice(0, 57)}...` : displayValue;
    lines.push(`  ${key}=${truncated}`);
  }

  lines.push("");
  lines.push("Note: Sensitive values (KEY, SECRET, TOKEN, PASSWORD) are masked.");

  return lines.join("\n");
}

// =============================================================================
// Command Definition
// =============================================================================

/**
 * Env command for displaying environment variables
 */
export const envCommand: SlashCommand = {
  name: "env",
  description: "Display environment variables (sensitive values masked)",
  kind: "builtin",
  category: "system",
  positionalArgs: [
    {
      name: "filter",
      type: "string",
      description: "Filter pattern (regex) to match variable names",
      required: false,
    },
  ],
  namedArgs: [
    {
      name: "json",
      type: "boolean",
      description: "Output as JSON",
      required: false,
    },
    {
      name: "export",
      type: "boolean",
      description: "Output in shell export format",
      required: false,
    },
  ],
  examples: [
    "/env                  - Show all environment variables",
    "/env NODE             - Filter variables containing NODE",
    "/env --json           - Output as JSON",
    "/env --export         - Output in shell export format",
  ],
  execute: async (ctx: CommandContext): Promise<CommandResult> => {
    const filter = ctx.parsedArgs.positional[0] as string | undefined;
    const json = ctx.parsedArgs.named?.json as boolean | undefined;
    const exportFormat = ctx.parsedArgs.named?.export as boolean | undefined;

    const values = getEnvironmentVariables({ filter, json, export: exportFormat });

    if (json) {
      return success(JSON.stringify(values, null, 2));
    }

    return success(formatEnvDisplay(values, exportFormat ?? false));
  },
};

/**
 * Execute env command
 */
export async function executeEnv(options?: EnvCommandOptions): Promise<EnvCommandResult> {
  const values = getEnvironmentVariables(options);
  return { success: true, values };
}

/**
 * Handle env command
 */
export async function handleEnv(options?: EnvCommandOptions): Promise<CommandResult> {
  const values = getEnvironmentVariables(options);

  if (options?.json) {
    return success(JSON.stringify(values, null, 2));
  }

  return success(formatEnvDisplay(values, options?.export ?? false));
}

/**
 * Print env result
 */
export function printEnvResult(result: EnvCommandResult): void {
  if (result.success) {
    console.log(formatEnvDisplay(result.values, false));
  }
}
