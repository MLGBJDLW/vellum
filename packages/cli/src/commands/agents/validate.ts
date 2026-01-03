/**
 * Agents Validate Command
 *
 * Validates all AGENTS.md files in the project hierarchy.
 * Reports syntax errors with line numbers and helpful suggestions.
 *
 * @module cli/commands/agents/validate
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  AgentsFileDiscovery,
  type AgentsFileLocation,
  type AgentsParseResult,
  AgentsParser,
  type AgentsWarning,
} from "@vellum/core";
import chalk from "chalk";

import type { CommandContext, CommandResult } from "../types.js";
import { error, success } from "../types.js";
import type { AgentsValidateOptions } from "./index.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Validation result for a single file
 */
interface FileValidationResult {
  /** File path */
  path: string;
  /** Whether the file is valid */
  valid: boolean;
  /** Parse result (null if file doesn't exist or can't be read) */
  parseResult: AgentsParseResult | null;
  /** Errors found during validation */
  errors: ValidationError[];
  /** Warnings (non-fatal issues) */
  warnings: AgentsWarning[];
}

/**
 * Structured validation error
 */
interface ValidationError {
  /** Error message */
  message: string;
  /** Line number (1-indexed) */
  line?: number;
  /** Column number (1-indexed) */
  column?: number;
  /** Suggested fix (optional) */
  suggestion?: string;
}

/**
 * Overall validation result
 */
interface ValidationSummary {
  /** Total files checked */
  total: number;
  /** Number of valid files */
  valid: number;
  /** Number of invalid files */
  invalid: number;
  /** Per-file results */
  results: FileValidationResult[];
}

// =============================================================================
// Validation Logic
// =============================================================================

/**
 * Map known field name mistakes to correct names
 */
const FIELD_CORRECTIONS: Record<string, string> = {
  allowed_tools: "allowed-tools",
  allowedtools: "allowed-tools",
  allowedTools: "allowed-tools",
  tool_permissions: "allowed-tools",
  "merge-strategy": "merge.strategy",
  mergestrategy: "merge.strategy",
  merge_strategy: "merge.strategy",
  arraymerge: "merge.arrays",
  array_merge: "merge.arrays",
};

/**
 * Extract validation errors from parse result
 */
function extractValidationErrors(result: AgentsParseResult): ValidationError[] {
  const errors: ValidationError[] = [];

  // Convert parse errors to validation errors
  for (const err of result.errors) {
    const message = err.message;

    // Check for known field name mistakes
    for (const [wrong, correct] of Object.entries(FIELD_CORRECTIONS)) {
      if (message.toLowerCase().includes(wrong.toLowerCase())) {
        errors.push({
          message: `Unknown field '${wrong}'`,
          suggestion: `Did you mean '${correct}'?`,
        });
        break;
      }
    }

    // Add the original error
    errors.push({
      message,
    });
  }

  // Convert warnings to errors for strict validation
  for (const warning of result.warnings) {
    if (warning.severity === "warn") {
      errors.push({
        message: warning.message,
        line: warning.line,
      });
    }
  }

  return errors;
}

/**
 * Validate a single AGENTS.md file
 */
async function validateFile(filePath: string, parser: AgentsParser): Promise<FileValidationResult> {
  try {
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return {
        path: filePath,
        valid: false,
        parseResult: null,
        errors: [{ message: "File not found" }],
        warnings: [],
      };
    }

    // Parse the file
    const parseResult = await parser.parse(filePath);

    // Extract errors
    const errors = extractValidationErrors(parseResult);
    const valid = errors.length === 0 && parseResult.errors.length === 0;

    return {
      path: filePath,
      valid,
      parseResult,
      errors,
      warnings: parseResult.warnings.filter((w: AgentsWarning) => w.severity === "info"),
    };
  } catch (err) {
    return {
      path: filePath,
      valid: false,
      parseResult: null,
      errors: [
        {
          message: err instanceof Error ? err.message : String(err),
        },
      ],
      warnings: [],
    };
  }
}

/**
 * Discover and validate all AGENTS.md files
 */
async function validateAllFiles(cwd: string): Promise<ValidationSummary> {
  const discovery = new AgentsFileDiscovery();
  const parser = new AgentsParser();
  const results: FileValidationResult[] = [];

  // Discover all files in hierarchy
  let locations: AgentsFileLocation[];
  try {
    locations = await discovery.discoverWithInheritance(cwd);
  } catch {
    // Discovery failed - try current directory only
    locations = await discovery.discoverInDirectory(cwd);
  }

  // Validate each file
  for (const location of locations) {
    const result = await validateFile(location.path, parser);
    results.push(result);
  }

  // Calculate summary
  const valid = results.filter((r) => r.valid).length;
  const invalid = results.filter((r) => !r.valid).length;

  return {
    total: results.length,
    valid,
    invalid,
    results,
  };
}

// =============================================================================
// Formatters
// =============================================================================

/**
 * Format a single file validation result
 */
function formatFileResult(result: FileValidationResult, cwd: string, verbose: boolean): string {
  const relativePath = path.relative(cwd, result.path) || result.path;

  if (result.valid) {
    const line = `${chalk.green("✅")} ${chalk.blue(relativePath)} - ${chalk.green("Valid")}`;

    if (verbose && result.warnings.length > 0) {
      const warnings = result.warnings.map((w) => `   ${chalk.blue("ℹ")} ${w.message}`).join("\n");
      return `${line}\n${warnings}`;
    }

    return line;
  }

  // Invalid file
  const lines = [`${chalk.red("❌")} ${chalk.blue(relativePath)} - ${chalk.red("Invalid")}`];

  for (const error of result.errors) {
    const loc = error.line ? chalk.gray(` Line ${error.line}:`) : "";
    lines.push(`  ${loc} ${error.message}`);
    if (error.suggestion) {
      lines.push(`     ${chalk.cyan("→")} ${chalk.cyan(error.suggestion)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format the validation summary
 */
function formatSummary(summary: ValidationSummary, cwd: string, verbose: boolean): string {
  const lines: string[] = ["Validating AGENTS.md files...", ""];

  // No files found
  if (summary.total === 0) {
    lines.push(chalk.yellow("No AGENTS.md files found in the project hierarchy."));
    lines.push("");
    lines.push(chalk.gray(`Run ${chalk.cyan("/init")} to create one.`));
    return lines.join("\n");
  }

  // Individual file results
  for (const result of summary.results) {
    lines.push(formatFileResult(result, cwd, verbose));
  }

  // Summary line
  lines.push("");
  if (summary.invalid === 0) {
    lines.push(chalk.green(`✅ All ${summary.total} file${summary.total !== 1 ? "s" : ""} valid.`));
  } else {
    lines.push(
      `Found ${chalk.green(`${summary.valid} valid`)}, ${chalk.red(`${summary.invalid} invalid`)} file${summary.total !== 1 ? "s" : ""}.`
    );
  }

  return lines.join("\n");
}

/**
 * Convert summary to JSON output
 */
function toJsonOutput(summary: ValidationSummary): object {
  return {
    success: summary.invalid === 0,
    total: summary.total,
    valid: summary.valid,
    invalid: summary.invalid,
    files: summary.results.map((r) => ({
      path: r.path,
      valid: r.valid,
      errors: r.errors,
      warnings: r.warnings.map((w) => ({
        message: w.message,
        line: w.line,
        severity: w.severity,
      })),
    })),
  };
}

// =============================================================================
// Command Handler
// =============================================================================

/**
 * Execute agents validate command
 *
 * @param options - Command options
 * @returns Command result with exit code 0 on success, 1 on validation failure
 */
export async function handleAgentsValidate(options: AgentsValidateOptions): Promise<CommandResult> {
  const cwd = process.cwd();

  try {
    let summary: ValidationSummary;

    if (options.file) {
      // Validate a specific file
      const parser = new AgentsParser();
      const filePath = path.resolve(options.file);
      const result = await validateFile(filePath, parser);
      summary = {
        total: 1,
        valid: result.valid ? 1 : 0,
        invalid: result.valid ? 0 : 1,
        results: [result],
      };
    } else {
      // Validate all files in hierarchy
      summary = await validateAllFiles(cwd);
    }

    // JSON output
    if (options.json) {
      const jsonOutput = toJsonOutput(summary);
      // Return error result if validation failed (for exit code)
      if (summary.invalid > 0) {
        return error("INTERNAL_ERROR", JSON.stringify(jsonOutput, null, 2));
      }
      return success(JSON.stringify(jsonOutput, null, 2), {
        format: "json",
        data: jsonOutput,
      });
    }

    // Human-readable output
    const display = formatSummary(summary, cwd, options.verbose ?? false);

    // Return error result if validation failed (for exit code 1)
    if (summary.invalid > 0) {
      return error("INTERNAL_ERROR", display);
    }

    return success(display);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (options.json) {
      const jsonError = {
        success: false,
        error: message,
        total: 0,
        valid: 0,
        invalid: 0,
        files: [],
      };
      return error("INTERNAL_ERROR", JSON.stringify(jsonError, null, 2));
    }

    return error("INTERNAL_ERROR", `Validation failed: ${message}`);
  }
}

/**
 * Execute handler for command context
 */
export async function executeValidate(ctx: CommandContext): Promise<CommandResult> {
  const options: AgentsValidateOptions = {
    file: ctx.parsedArgs.positional[1] as string | undefined,
    verbose: ctx.parsedArgs.named.verbose as boolean | undefined,
    json: ctx.parsedArgs.named.json as boolean | undefined,
  };

  return handleAgentsValidate(options);
}
