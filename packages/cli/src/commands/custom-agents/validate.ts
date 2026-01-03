/**
 * Custom Agents Validate Command (T022)
 *
 * Validates custom agent definition files.
 *
 * @module cli/commands/custom-agents/validate
 * @see REQ-020
 */

import * as path from "node:path";
import {
  AgentDiscovery,
  AgentLoader,
  type CustomAgentDefinition,
  isValidSlug,
  validateAgentDefinition,
} from "@vellum/core";
import chalk from "chalk";

import type { CommandResult } from "../types.js";
import { error, success } from "../types.js";
import type { ValidateOptions } from "./index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Validation result for a single agent
 */
interface AgentValidationResult {
  slug: string;
  sourcePath: string;
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Validation issue (error or warning)
 */
interface ValidationIssue {
  message: string;
  field?: string;
  severity: "error" | "warning";
}

/**
 * Overall validation summary
 */
interface ValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  warnings: number;
  results: AgentValidationResult[];
}

/**
 * JSON output format
 */
export interface ValidateJsonOutput {
  success: boolean;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    warnings: number;
  };
  results: AgentValidationResult[];
}

// =============================================================================
// Validation Logic
// =============================================================================

/**
 * Validate a single agent definition
 */
function validateAgent(agent: CustomAgentDefinition, sourcePath: string): AgentValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Validate using Zod schema
  const schemaResult = validateAgentDefinition(agent);

  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push({
        message: issue.message,
        field: issue.path.join("."),
        severity: "error",
      });
    }
  }

  // Additional validation checks

  // Slug validation
  if (!isValidSlug(agent.slug)) {
    errors.push({
      message: "Invalid slug format",
      field: "slug",
      severity: "error",
    });
  }

  // Warn about missing description
  if (!agent.description) {
    warnings.push({
      message: "Missing description - recommended for discoverability",
      field: "description",
      severity: "warning",
    });
  }

  // Warn about missing icon
  if (!agent.icon) {
    warnings.push({
      message: "Missing icon - will use default",
      field: "icon",
      severity: "warning",
    });
  }

  // Warn about missing whenToUse
  if (!agent.whenToUse) {
    warnings.push({
      message: "Missing whenToUse - agent won't be auto-suggested",
      field: "whenToUse",
      severity: "warning",
    });
  }

  // Warn about extends pointing to unknown agent (would need registry check)
  if (agent.extends) {
    // This is a soft warning - can't validate without full registry
    warnings.push({
      message: `Extends "${agent.extends}" - ensure parent agent exists`,
      field: "extends",
      severity: "warning",
    });
  }

  // Warn about circular references in canSpawnAgents
  if (agent.coordination?.canSpawnAgents?.includes(agent.slug)) {
    errors.push({
      message: "Agent cannot spawn itself",
      field: "coordination.canSpawnAgents",
      severity: "error",
    });
  }

  // Validate temperature range
  if (agent.settings?.temperature !== undefined) {
    if (agent.settings.temperature < 0 || agent.settings.temperature > 1) {
      errors.push({
        message: "Temperature must be between 0 and 1",
        field: "settings.temperature",
        severity: "error",
      });
    }
  }

  return {
    slug: agent.slug,
    sourcePath,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate agent from file path
 */
async function validateAgentFile(filePath: string): Promise<AgentValidationResult | null> {
  const loader = new AgentLoader();
  const result = await loader.loadFile(filePath);

  if (!result.ok) {
    const loadError = result.error;
    return {
      slug: path.basename(filePath, path.extname(filePath)),
      sourcePath: filePath,
      valid: false,
      errors: [
        {
          message: loadError.message,
          severity: "error",
        },
      ],
      warnings: [],
    };
  }

  return validateAgent(result.value, filePath);
}

// =============================================================================
// Formatters
// =============================================================================

/**
 * Format validation issue for display
 */
function formatIssue(issue: ValidationIssue): string {
  const icon = issue.severity === "error" ? chalk.red("✗") : chalk.yellow("⚠");
  const field = issue.field ? chalk.gray(`[${issue.field}]`) : "";
  return `    ${icon} ${issue.message} ${field}`;
}

/**
 * Format agent validation result for display
 */
function formatAgentResult(result: AgentValidationResult): string {
  const lines: string[] = [];

  const statusIcon = result.valid ? chalk.green("✓") : chalk.red("✗");

  const statusText = result.valid ? chalk.green("valid") : chalk.red("invalid");

  lines.push(`${statusIcon} ${chalk.cyan(result.slug)} - ${statusText}`);
  lines.push(chalk.gray(`  ${result.sourcePath}`));

  // Show errors
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      lines.push(formatIssue(err));
    }
  }

  // Show warnings
  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      lines.push(formatIssue(warn));
    }
  }

  return lines.join("\n");
}

/**
 * Format validation summary for display
 */
function formatSummary(summary: ValidationSummary, strict: boolean): string {
  const lines: string[] = [];

  lines.push(chalk.bold("\n📋 Validation Summary"));
  lines.push("");

  for (const result of summary.results) {
    lines.push(formatAgentResult(result));
    lines.push("");
  }

  // Summary stats
  const validText = chalk.green(`${summary.valid} valid`);
  const invalidText =
    summary.invalid > 0
      ? chalk.red(`${summary.invalid} invalid`)
      : chalk.gray(`${summary.invalid} invalid`);
  const warningText =
    summary.warnings > 0
      ? chalk.yellow(`${summary.warnings} warnings`)
      : chalk.gray(`${summary.warnings} warnings`);

  lines.push(`Total: ${summary.total} agents`);
  lines.push(`${validText} | ${invalidText} | ${warningText}`);

  // Overall status
  const hasErrors = summary.invalid > 0;
  const hasWarnings = summary.warnings > 0;

  if (hasErrors) {
    lines.push("");
    lines.push(chalk.red("❌ Validation failed - fix errors above"));
  } else if (strict && hasWarnings) {
    lines.push("");
    lines.push(chalk.yellow("⚠️ Validation failed (strict mode) - fix warnings above"));
  } else {
    lines.push("");
    lines.push(chalk.green("✅ All agents valid"));
  }

  return lines.join("\n");
}

// =============================================================================
// Command Handler
// =============================================================================

/**
 * Validate a single target (file path or slug)
 */
async function validateTarget(target: string): Promise<AgentValidationResult | null> {
  // Check if it's a file path
  const isFilePath =
    target.includes(path.sep) ||
    target.endsWith(".md") ||
    target.endsWith(".yaml") ||
    target.endsWith(".yml");

  if (isFilePath) {
    return validateAgentFile(target);
  }

  // It's a slug - find the agent
  const discovery = new AgentDiscovery({ watchEnabled: false });
  await discovery.discover();
  const agent = discovery.get(target);

  if (!agent) {
    return null;
  }

  return validateAgent(agent.definition, agent.sourcePath);
}

/**
 * Validate all discovered agents
 */
async function validateAllAgents(): Promise<AgentValidationResult[]> {
  const discovery = new AgentDiscovery({ watchEnabled: false });
  await discovery.discover();
  const allAgents = discovery.getAll();

  const results: AgentValidationResult[] = [];
  for (const [, discovered] of allAgents) {
    results.push(validateAgent(discovered.definition, discovered.sourcePath));
  }
  return results;
}

/**
 * Handle validate subcommand
 *
 * Validates all or specific custom agent definition files.
 *
 * @param options - Validate options
 * @returns Command result with exit code 0 (success) or 1 (failure)
 */
export async function handleValidate(options: ValidateOptions = {}): Promise<CommandResult> {
  try {
    let results: AgentValidationResult[];

    if (options.target) {
      const result = await validateTarget(options.target);
      if (!result) {
        return error("RESOURCE_NOT_FOUND", `Agent not found: ${options.target}`, [
          "Use /custom-agents list to see available agents",
        ]);
      }
      results = [result];
    } else {
      results = await validateAllAgents();
      if (results.length === 0) {
        return success(chalk.yellow("No custom agents found to validate"));
      }
    }

    // Build summary
    const summary: ValidationSummary = {
      total: results.length,
      valid: results.filter((r) => r.valid).length,
      invalid: results.filter((r) => !r.valid).length,
      warnings: results.reduce((acc, r) => acc + r.warnings.length, 0),
      results,
    };

    // Determine success/failure
    const hasErrors = summary.invalid > 0;
    const hasWarnings = summary.warnings > 0;
    const failed = hasErrors || (options.strict && hasWarnings);

    // Return result
    const output = formatSummary(summary, options.strict ?? false);

    if (failed) {
      return { kind: "error", code: "INTERNAL_ERROR", message: output };
    }

    return success(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error("INTERNAL_ERROR", `Validation failed: ${message}`);
  }
}
